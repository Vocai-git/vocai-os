'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Tax=require('../public/js/finance-tax');
const {validate,preservePayments,nextDocument,summarize}=require('../lib/finance');
const {baseline}=require('./fixtures/finance');
const cutoff=baseline.cutoff;
const document=(extra={})=>({kind:'income',title:'Servicio de prueba',amount:120000,date:cutoff,repeat:'none',payments:[],...extra});
const valid=value=>validate(value,cutoff,cutoff);
const payment=amount=>({id:'12345678-1234-4234-8234-123456789abc',amount,date:cutoff,account:'bank'});

test('added mode treats the input as base and returns the complete total',()=>{
 assert.deepEqual(Tax.calculate(120000,'added',2100),{mode:'added',input:120000,rate:2100,base:120000,tax:25200,total:145200});
});

test('included mode extracts tax without adding anything to the supplied total',()=>{
 assert.deepEqual(Tax.calculate(120000,'included',2100),{mode:'included',input:120000,rate:2100,base:99174,tax:20826,total:120000});
});

test('none requires a zero rate and preserves every cent',()=>{
 assert.deepEqual(Tax.calculate(120001,'none',0),{mode:'none',input:120001,rate:0,base:120001,tax:0,total:120001});
 assert.throws(()=>Tax.calculate(120000,'none',2100),/cero/);
 for(const mode of ['added','included'])assert.deepEqual(Tax.calculate(120001,mode,0),{mode,input:120001,rate:0,base:120001,tax:0,total:120001});
});

test('cent rounding uses exact integer arithmetic and keeps base plus tax equal to total',()=>{
 assert.deepEqual(Tax.calculate(1,'added',2100),{mode:'added',input:1,rate:2100,base:1,tax:0,total:1});
 assert.deepEqual(Tax.calculate(3,'added',2100),{mode:'added',input:3,rate:2100,base:3,tax:1,total:4});
 assert.deepEqual(Tax.calculate(1,'included',2100),{mode:'included',input:1,rate:2100,base:1,tax:0,total:1});
 assert.deepEqual(Tax.calculate(3,'included',2100),{mode:'included',input:3,rate:2100,base:2,tax:1,total:3});
 assert.equal(Tax.calculate(1,'added',5000).tax,1);
 assert.equal(Tax.calculate(1,'included',10000).base,1);
 for(const mode of ['added','included'])for(const amount of [1,3,99,10001,1234567])for(const rate of [0,1,1234,2100,10000]){
  const result=Tax.calculate(amount,mode,rate);
  assert.equal(result.base+result.tax,result.total);assert.ok(Number.isSafeInteger(result.tax));
 }
});

test('invalid inputs, unsafe numbers, rates and oversized totals are rejected',()=>{
 for(const value of [0,-1,1.5,NaN,Infinity,'120000',null,undefined,1000000001,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>Tax.calculate(value,'added',2100),error=>error.status===400&&error.code==='INVALID_VAT');
 }
 for(const rate of [-1,1.5,10001,NaN,Infinity,'2100',null,undefined])assert.throws(()=>Tax.calculate(100,'added',rate),/porcentaje/);
 for(const mode of ['base','total','',null,undefined])assert.throws(()=>Tax.calculate(100,mode,2100),/aplica/);
 assert.throws(()=>Tax.calculate(1000000000,'added',1),/máximo/);
 assert.equal(Tax.calculate(500000000,'added',10000).total,1000000000);
 assert.equal(Tax.calculate(1000000000,'included',10000).total,1000000000);
});

test('validation canonicalizes VAT from its input and requires the document total to match',()=>{
 const input=document({amount:145200,vat:{mode:'added',input:120000,rate:2100,base:1,tax:1,total:1}}),before=JSON.stringify(input);
 const result=valid(input);
 assert.deepEqual(result.vat,Tax.calculate(120000,'added',2100));assert.equal(JSON.stringify(input),before);
 assert.throws(()=>valid({...input,amount:120000}),/no coincide/);
 for(const vat of [null,[],true,{},'included',{mode:'added',input:120000}])assert.throws(()=>valid(document({vat})),error=>error.status===400);
});

test('older documents remain without VAT metadata and keep their original totals and payments',()=>{
 const input=document({payments:[payment(120000)]}),snapshot=JSON.stringify(input),result=valid(input);
 assert.equal(Object.hasOwn(result,'vat'),false);assert.equal(result.amount,120000);assert.deepEqual(result.payments,input.payments);assert.equal(JSON.stringify(input),snapshot);
 const explicit=valid({...input,vat:{mode:'included',input:120000,rate:2100}});
 assert.deepEqual(explicit.payments,input.payments);assert.doesNotThrow(()=>preservePayments(result,explicit));
 assert.throws(()=>preservePayments(result,{...explicit,payments:[]}),/confirmado/);
 assert.throws(()=>valid({...input,amount:100000,vat:{mode:'included',input:100000,rate:2100}}),/superan/);
});

test('VAT metadata is accepted for income and expense, never for transfers or partner contributions',()=>{
 const vat={mode:'none',input:120000,rate:0};
 for(const kind of ['income','expense'])assert.equal(valid(document({kind,vat})).vat.total,120000);
 for(const kind of ['transfer','contribution','settlement']){
  const source=kind==='settlement'?'agus':'santi',target=kind==='settlement'?'santi':'bank',group=kind==='transfer'?null:'capital';
  assert.throws(()=>valid(document({kind,source,target,group,vat})),/solo se aplica/);
 }
});

test('monthly forecasts keep the explicit calculator setup but do not repeat payments',()=>{
 const source=valid(document({repeat:'monthly',vat:{mode:'included',input:120000,rate:2100},payments:[payment(120000)]})),snapshot=JSON.stringify(source),next=nextDocument(source);
 assert.deepEqual(next.vat,source.vat);assert.equal(next.amount,120000);assert.deepEqual(next.payments,[]);assert.equal(next.stage,'forecast');assert.equal(JSON.stringify(source),snapshot);
 assert.equal(Object.hasOwn(nextDocument(valid(document({repeat:'monthly'}))),'vat'),false);
});

test('cash, debt and pending totals continue using the complete document amount',()=>{
 for(const kind of ['income','expense']){
  const original=valid(document({kind,amount:145200,payments:[payment(100000)]}));
  const withVat=valid({...original,vat:{mode:'added',input:120000,rate:2100}});
  assert.deepEqual(summarize(baseline,[{data:withVat}]),summarize(baseline,[{data:original}]));
 }
});

test('browser and server calculate identical values without Node or DOM dependencies',()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../public/js/finance-tax'),'utf8'),context);
 for(const mode of ['none','added','included']){
  const rate=mode==='none'?0:2100;
  assert.equal(JSON.stringify(context.window.FinanceTax.calculate(120000,mode,rate)),JSON.stringify(Tax.calculate(120000,mode,rate)));
  const vat=Tax.calculate(120000,mode,rate),irpf=Tax.withholding(vat,1500);
  assert.equal(JSON.stringify(context.window.FinanceTax.withholding(vat,1500)),JSON.stringify(irpf));
  assert.equal(context.window.FinanceTax.payable({amount:vat.total,irpf}),Tax.payable({amount:vat.total,irpf}));
 }
});

test('IRPF is calculated on the base while gross amount remains base plus VAT',()=>{
 const vat=Tax.calculate(100000,'added',2100),irpf=Tax.withholding(vat,1500);
 assert.deepEqual(irpf,{rate:1500,base:100000,tax:15000});
 assert.equal(vat.total,121000);assert.equal(Tax.payable({amount:vat.total,irpf}),106000);
 const included=Tax.calculate(121000,'included',2100);
 assert.deepEqual(Tax.withholding(included,1500),irpf);
 const withoutVat=Tax.calculate(100000,'none',0),noVatIrpf=Tax.withholding(withoutVat,1500);
 assert.equal(noVatIrpf.tax,15000);assert.equal(Tax.payable({amount:100000,irpf:noVatIrpf}),85000);
});

test('withholding uses exact cent rounding, canonical base and leaves inputs unchanged',()=>{
 assert.equal(Tax.withholding(Tax.calculate(1,'none',0),1500).tax,0);
 assert.equal(Tax.withholding(Tax.calculate(3,'none',0),1500).tax,0);
 assert.equal(Tax.withholding(Tax.calculate(3,'none',0),5000).tax,2);
 const vat={...Tax.calculate(121000,'included',2100),base:99,tax:99,total:99},before=JSON.stringify(vat);
 assert.deepEqual(Tax.withholding(vat,1500),{rate:1500,base:100000,tax:15000});assert.equal(JSON.stringify(vat),before);
 const large=Tax.calculate(500000000,'added',10000);
 assert.deepEqual(Tax.withholding(large,10000),{rate:10000,base:500000000,tax:500000000});
 assert.equal(Tax.payable({amount:large.total,irpf:Tax.withholding(large,10000)}),500000000);
});

test('IRPF requires an explicit VAT calculation, a valid positive rate and a positive payable total',()=>{
 const vat=Tax.calculate(100000,'none',0);
 for(const rate of [0,-1,1.5,10001,NaN,Infinity,'1500',null,undefined,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>Tax.withholding(vat,rate),error=>error.status===400&&error.code==='INVALID_IRPF');
 }
 for(const value of [null,undefined,[],true,'vat',{}, {base:100000,total:121000}])assert.throws(()=>Tax.withholding(value,1500),error=>error.status===400);
 assert.throws(()=>Tax.withholding(vat,10000),/neto/);
 assert.throws(()=>Tax.withholding(Tax.calculate(1,'none',0),5000),/neto/);
 assert.equal(Tax.withholding(Tax.calculate(100000,'added',2100),10000).tax,100000);
});

test('model recalculates IRPF from rate and ignores supplied derived base and tax',()=>{
 const vat=Tax.calculate(100000,'added',2100),input=document({amount:vat.total,vat,irpf:{rate:1500,base:1,tax:1}}),before=JSON.stringify(input);
 const result=valid(input);
 assert.equal(result.amount,121000);assert.equal(result.vat.total,121000);assert.deepEqual(result.irpf,{rate:1500,base:100000,tax:15000});
 assert.equal(Tax.payable(result),106000);assert.equal(JSON.stringify(input),before);
 assert.throws(()=>valid(document({irpf:{rate:1500}})),/desglose de IVA/);
 for(const irpf of [null,[],true,'irpf',{}])assert.throws(()=>valid(document({vat:Tax.calculate(120000,'none',0),irpf})),error=>error.status===400);
 for(const kind of ['transfer','contribution','settlement'])assert.throws(()=>valid(document({kind,irpf:{rate:1500}})),/solo se aplica/);
});

test('payments can settle exactly the net, cannot exceed it and are never reduced by enabling IRPF',()=>{
 for(const kind of ['income','expense']){
  const vat=Tax.calculate(100000,'added',2100),d=document({kind,amount:vat.total,vat,irpf:{rate:1500}});
  const full=valid({...d,payments:[payment(106000)]});assert.equal(Tax.payable(full),106000);assert.equal(full.payments[0].amount,106000);
  assert.throws(()=>valid({...d,payments:[payment(106001)]}),/superan/);
  const alreadyPaid=valid({...d,irpf:undefined,payments:[payment(121000)]});
  assert.throws(()=>valid({...alreadyPaid,irpf:{rate:1500}}),/superan/);
  const partial=valid({...d,payments:[payment(50000)]}),paidBefore=JSON.stringify(partial.payments);
  const changed=valid({...partial,title:'Detalle actualizado'});preservePayments(partial,changed);assert.equal(JSON.stringify(changed.payments),paidBefore);
  assert.throws(()=>preservePayments(partial,{...changed,payments:[]}),/confirmado/);
 }
});

test('pending summary uses net payable and only actual payments change cash or partner balances',()=>{
 for(const kind of ['income','expense'])for(const account of ['bank','santi']){
  const vat=Tax.calculate(100000,'added',2100),d=valid(document({kind,amount:vat.total,vat,irpf:{rate:1500},payments:[{...payment(50000),account}]}));
  const result=summarize(baseline,[{data:d}]);assert.equal(result['pending_'+kind],56000);
  const withoutIrpf=summarize(baseline,[{data:{...d,irpf:undefined}}]);assert.deepEqual(result.cash,withoutIrpf.cash);assert.deepEqual(result.operating,withoutIrpf.operating);
  const settled=summarize(baseline,[{data:{...d,payments:[{...payment(106000),account}]}}]);assert.equal(settled['pending_'+kind],0);
  const unpaid=summarize(baseline,[{data:{...d,stage:'forecast',payments:[]}}]);assert.equal(unpaid['pending_'+kind],106000);assert.deepEqual(unpaid.cash,baseline.cash);assert.deepEqual(unpaid.operating,baseline.operating);
 }
});

test('recurrence keeps explicit IRPF and gross amounts but clears payments; legacy has no inferred IRPF',()=>{
 const vat=Tax.calculate(100000,'added',2100),d=valid(document({amount:vat.total,vat,irpf:{rate:1500},repeat:'monthly',payments:[payment(106000)]}));
 const before=JSON.stringify(d),next=nextDocument(d);
 assert.deepEqual(next.irpf,d.irpf);assert.deepEqual(next.vat,d.vat);assert.equal(next.amount,121000);assert.equal(Tax.payable(next),106000);assert.deepEqual(next.payments,[]);assert.equal(next.stage,'forecast');assert.equal(JSON.stringify(d),before);
 assert.deepEqual(valid(next).irpf,d.irpf);
 for(const older of [document({repeat:'monthly'}),document({repeat:'monthly',vat:Tax.calculate(120000,'none',0)})]){
  const legacy=valid(older);assert.equal(Object.hasOwn(legacy,'irpf'),false);assert.equal(Tax.payable(legacy),120000);assert.equal(Object.hasOwn(nextDocument(legacy),'irpf'),false);
 }
});
