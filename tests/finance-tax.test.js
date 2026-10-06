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
 }
});
