'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {integrate}=require('../lib/finance-import');const {summarize}=require('../lib/finance');const {baseline}=require('./fixtures/finance');
const source={id:'old-expense',nombre:'Office',importe:25,fecha:'2026-08-03'};
const invoice={id:'old-invoice',concepto:'Work',total:40,fecha:'2026-08-05',numero:'sample-1'};
test('full history is mapped once, repeat imports are idempotent and opening balances stay unchanged',()=>{
 const h={expenses:[source],invoices:[invoice]},o={baseline,records:[]},rules={'expenses:old-expense':{status:'paid',account:'santi'},'invoices:old-invoice':{status:'assigned',account:'santi'}};
 const imported=integrate(h,o,rules),again=integrate(h,imported,rules);
 assert.deepEqual(again,imported);assert.equal(imported.coverage.length,2);assert.equal(imported.records[0].data.amount,2500);
 assert.deepEqual(imported.records[0].data.history.sources[0].original,source);assert.deepEqual(imported.records[0].data.payments,[]);
 assert.deepEqual(summarize(baseline,imported.records),summarize(baseline,[]));
});
test('reviewed correction replaces original monetary effect without losing source evidence',()=>{
 const existing={id:'reviewed-id',data:{kind:'income',title:'Corrected',amount:3900,date:'2026-08-06',payments:[]},included_in_opening:true};
 const result=integrate({expenses:[],invoices:[invoice]},{baseline,records:[existing]},{'invoices:old-invoice':{target:'reviewed-id'}});
 assert.equal(result.records.length,1);assert.equal(result.records[0].data.amount,3900);assert.equal(result.records[0].data.history.sources[0].original.total,40);
});
test('unreviewed source or missing target fails instead of silently omitting records',()=>{
 assert.throws(()=>integrate({expenses:[source],invoices:[]},{baseline,records:[]},{}),/Missing reviewed rule/);
 assert.throws(()=>integrate({expenses:[source],invoices:[]},{baseline,records:[]},{'expenses:old-expense':{target:'missing'}}),/Unknown reviewed target/);
});
