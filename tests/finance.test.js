'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { validate, summarize, preservePayments, nextDocument } = require('../lib/finance');
const { baseline, records } = require('./fixtures/finance');
const cutoff=baseline.cutoff;
function doc(overrides={}) { return {kind:'expense',title:'Test',amount:3580,date:cutoff,repeat:'none',payments:[],...overrides}; }
function valid(x) {return validate(x,cutoff,cutoff);}
function payment(amount,account,date=cutoff) {return {id:randomUUID(),amount,account,date};}
function summary(...data){return summarize(baseline,data.map(d=>({data:valid(d),voided:false})));}
test('opening position keeps operating debts, bank and each contribution block separate',()=>{
 const s=summarize(baseline,records);
 assert.deepEqual(s.cash,{bank:500000,cash:100000});assert.equal(s.operating.santi,200000);
 assert.equal(s.groups.startup.agus_to_santi,200000);assert.equal(s.groups.capital.agus_to_santi,100000);
 assert.equal(s.pending_income,120000);assert.equal(s.pending_expense,3000);
 for(const r of records)valid(r.data);
});
test('pending expense does not reduce cash or increase personal reimbursement',()=>{
 const s=summary(doc());assert.deepEqual(s.cash,baseline.cash);assert.deepEqual(s.operating,baseline.operating);assert.equal(s.pending_expense,3580);
});
test('personal and company payments can split one purchase without double counting',()=>{
 const s=summary(doc({payments:[payment(1000,'santi'),payment(2000,'bank')]}));
 assert.equal(s.operating.santi,201000);assert.equal(s.cash.bank,498000);assert.equal(s.pending_expense,580);
});
test('client cash belongs to company; income received personally compensates advances',()=>{
 const s=summary(doc({kind:'income',amount:80000,payments:[payment(40000,'cash'),payment(40000,'santi')]}));
 assert.equal(s.cash.cash,140000);assert.equal(s.operating.santi,160000);assert.equal(s.pending_income,0);
});
test('reimbursement is a transfer, not a second expense',()=>{
 const s=summary(doc({kind:'transfer',amount:10000,source:'bank',target:'agus'}));
 assert.equal(s.cash.bank,490000);assert.equal(s.operating.agus,0);assert.equal(s.pending_expense,0);
});
test('capital receipt changes bank and contributions, never operating debt',()=>{
 const s=summary(doc({kind:'contribution',amount:300000,source:'santi',target:'bank',group:'capital'}));
 assert.equal(s.cash.bank,800000);assert.deepEqual(s.operating,baseline.operating);assert.equal(s.groups.capital.agus_to_santi,250000);
});
test('personal contribution compensation does not move company money',()=>{
 const s=summary(doc({kind:'settlement',amount:100000,source:'agus',target:'santi',group:'capital'}));
 assert.equal(s.groups.capital.agus_to_santi,0);assert.deepEqual(s.cash,baseline.cash);assert.deepEqual(s.operating,baseline.operating);
});
test('future and pre-close payments, unsafe amounts and overpayment are rejected',()=>{
 assert.throws(()=>valid(doc({payments:[payment(100,'santi','2026-10-06')]})),/futuro/);
 assert.throws(()=>valid(doc({payments:[payment(100,'santi','2026-10-04')]})),/histórico/);
 assert.throws(()=>valid(doc({amount:10.1})),/importe/);
 assert.throws(()=>valid(doc({payments:[payment(4000,'cash')]})),/superan/);
 assert.throws(()=>valid(doc({date:'2026-02-30'})),/fecha/);
 assert.throws(()=>valid(doc({period_start:'2026-10-05',period_end:'2026-10-01'})),/período/);
});
test('recurrence creates an unpaid forecast and handles end of month',()=>{
 const d=valid(doc({repeat:'monthly',date:'2026-01-31',number:'A-123',payments:[payment(3580,'santi')]}));
 const next=nextDocument(d);assert.equal(next.date,'2026-02-28');assert.deepEqual(next.payments,[]);assert.equal(next.number,'');
});
test('voiding preserves record but reverses its effect; caller data is never mutated',()=>{
 const copy=JSON.stringify(baseline);const s=summarize(baseline,[{data:valid(doc({payments:[payment(3580,'santi')]})),voided:true}]);
 assert.equal(s.operating.santi,200000);assert.equal(JSON.stringify(baseline),copy);
});
test('duplicate payment ids and ambiguous personal transfers are rejected',()=>{
 const p=payment(100,'santi');assert.throws(()=>valid(doc({payments:[p,p]})),/duplicado/);
 assert.throws(()=>valid(doc({kind:'transfer',source:'santi',target:'agus'})),/cuenta de VOCAI/);
});
test('closed references can keep their receipt and recurrence without counting twice',()=>{
 const data=valid(doc({repeat:'monthly',payments:[payment(3580,'bank')]}));
 const s=summarize(baseline,[{data,included_in_opening:true}]);
 assert.deepEqual(s.cash,baseline.cash);assert.deepEqual(s.operating,baseline.operating);assert.equal(s.pending_expense,0);
 assert.deepEqual(nextDocument(data).payments,[]);
});
test('a full monthly salary period remains a full month when months change length',()=>{
 const next=nextDocument(valid(doc({repeat:'monthly',period_start:'2026-09-01',period_end:'2026-09-30'})));
 assert.equal(next.period_start,'2026-10-01');assert.equal(next.period_end,'2026-10-31');
});

test('editing a document can append payments but cannot erase or rewrite confirmed money movements',()=>{
 const original=valid(doc({payments:[payment(1000,'santi')]}));
 const changed=valid({...original,title:'Invoice details confirmed',payments:[...original.payments,payment(500,'bank')]});
 assert.doesNotThrow(()=>preservePayments(original,changed));
 assert.throws(()=>preservePayments(original,{...changed,payments:[]}),/confirmado/);
 for(const edit of [{amount:900},{date:'2026-10-06'},{account:'bank'}]){
  assert.throws(()=>preservePayments(original,{...changed,payments:[{...original.payments[0],...edit}]}),/confirmado/);
 }
});

test('recurrence clears historical assignments and void metadata without mutating the source',()=>{
 const original={...valid(doc({kind:'income',repeat:'monthly'})),history:{status:'assigned',account:'santi',sources:[{id:'old'}]},void_reason:'old metadata'};
 const snapshot=JSON.stringify(original),next=nextDocument(original);
 assert.equal(next.history,undefined);assert.equal(next.void_reason,undefined);
 assert.equal(next.stage,'forecast');assert.deepEqual(next.payments,[]);
 assert.equal(JSON.stringify(original),snapshot);
 for(const history of [{status:'duplicate'},{status:'review'},{classification:'startup'}]){
  assert.throws(()=>nextDocument({...original,history}),/revisión/);
 }
});
