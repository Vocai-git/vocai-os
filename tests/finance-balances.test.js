'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evidence}=require('../public/js/finance-balances');
const {summarize}=require('../lib/finance');
let serial=0;
const row=(data,extra={})=>({id:'fixture-'+(++serial),included_in_opening:true,data:{kind:'expense',title:'Fixture',date:'2026-09-06',amount:10000,payments:[],...data},...extra});
const payment=(amount,account='santi',date='2026-10-05')=>({id:'payment-'+(++serial),amount,account,date});
const baseline=()=>({operating:{santi:12000,agus:0},cash:{bank:5000,cash:0},groups:{startup:{santi:0,agus:0,settled:0},capital:{santi:0,agus:0,settled:0}},ana_assigned:2000});
const history=()=>[
 row({amount:10000,history:{status:'paid',account:'santi'}}),
 row({amount:5000,payments:[payment(5000)],period_start:'2026-09-01',period_end:'2026-09-30'}),
 row({kind:'income',amount:1000,history:{status:'paid',account:'santi'}}),
 row({kind:'income',amount:2000,history:{status:'assigned',account:'santi'}}),
];

test('opening evidence explains the saved balance without posting opening records again',()=>{
 const b=baseline(),records=history(),original=JSON.stringify(records),result=evidence(records,b,summarize(b,records));
 assert.equal(result.opening.expenses.total,15000);
 assert.equal(result.opening.receipts.total,1000);
 assert.equal(result.opening.assigned.total,2000);
 assert.equal(result.opening.reconstructed,12000);
 assert.equal(result.opening.verified,true);
 assert.equal(result.current.reconstructed,12000);
 assert.equal(result.current.fromBaseline,12000);
 assert.equal(result.changes.total,0);
 assert.deepEqual(result.gaps,[]);
 assert.equal(JSON.stringify(records),original);
});

test('new personal payments, receipts and bank transfers explain the current engine balance',()=>{
 const b=baseline(),records=[...history(),
  row({amount:800,payments:[payment(600),payment(200,'bank')]},{included_in_opening:false}),
  row({kind:'income',amount:100,payments:[payment(100)]},{included_in_opening:false}),
  row({kind:'transfer',source:'santi',target:'bank',amount:200},{included_in_opening:false}),
  row({kind:'transfer',source:'cash',target:'santi',amount:50},{included_in_opening:false}),
  row({kind:'contribution',source:'santi',target:'bank',amount:900,group:'capital'},{included_in_opening:false}),
  row({kind:'settlement',source:'agus',target:'santi',amount:700,group:'capital'},{included_in_opening:false}),
 ];
 const result=evidence(records,b,summarize(b,records));
 assert.equal(result.changes.expenses.total,600);
 assert.equal(result.changes.receipts.total,100);
 assert.equal(result.changes.advances.total,200);
 assert.equal(result.changes.refunds.total,50);
 assert.equal(result.changes.total,650);
 assert.equal(result.current.reconstructed,12650);
 assert.equal(result.current.verified,true);
 assert.equal(result.current.ledgerGap,0);
 assert.equal(result.totals.expenses.total,15600);
 assert.deepEqual(result.steps.map(s=>s.key),['expenses','receipts','assigned','advances','refunds']);
 assert.equal(result.steps.at(-1).after,12650);
});

test('investment, other accounts and excluded source states do not explain Santiago operating debt',()=>{
 const records=[...history(),
  row({amount:4000,history:{classification:'startup',status:'paid',account:'santi'}}),
  ...['review','draft','duplicate'].map(status=>row({history:{status,account:'santi'},payments:[payment(10000)]})),
  row({history:{status:'paid',account:'agus'}}),
  row({payments:[payment(10000,'bank')]}),
  row({payments:[payment(10000)]},{voided:true}),
  row({kind:'contribution',source:'santi',target:'bank',amount:99900}),
 ];
 const b=baseline(),result=evidence(records,b,summarize(b,records));
 assert.equal(result.opening.expenses.total,15000);
 assert.equal(result.current.verified,true);
 assert.equal(result.totals.expenses.items.length,2);
});

test('historical dates show only their registered month while actual payment dates and service periods stay distinct',()=>{
 const records=history(),b=baseline(),result=evidence(records,b,summarize(b,records));
 const old=result.opening.expenses.items.find(i=>i.estimated),paid=result.opening.expenses.items.find(i=>!i.estimated);
 assert.equal(old.date,'2026-09');
 assert.equal(old.basis,'registered_month');
 assert.equal(paid.date,'2026-10-05');
 assert.equal(paid.basis,'payment');
 assert.equal(paid.period,'2026-09');
 assert.equal(paid.period_start,'2026-09-01');
 assert.equal(paid.period_end,'2026-09-30');
 assert.equal(result.opening.assigned.items[0].basis,'assignment_period');
});

test('available payment evidence takes priority over historical paid status and assigned income is not deducted twice',()=>{
 const b=baseline(),records=[
  row({amount:10000,history:{status:'paid',account:'santi'},payments:[payment(2000)]}),
  row({kind:'income',amount:2000,history:{status:'assigned',account:'santi'},payments:[payment(2000)]}),
 ];
 const result=evidence(records,b,summarize(b,records));
 assert.equal(result.opening.expenses.total,2000);
 assert.equal(result.opening.receipts.total,0);
 assert.equal(result.opening.assigned.total,2000);
 assert.equal(result.opening.reconstructed,0);
 assert.equal(result.opening.gap,12000);
 assert.equal(result.opening.verified,false);
 assert.ok(result.gaps.some(g=>g.scope==='opening'));
});

test('missing sources and missing balances are explicit gaps instead of invented adjustments',()=>{
 const b=baseline(),result=evidence([],b,summarize(b,[]));
 assert.equal(result.current.reconstructed,0);
 assert.equal(result.current.expected,12000);
 assert.equal(result.current.fromBaseline,12000);
 assert.equal(result.current.ledgerGap,0);
 assert.equal(result.current.verified,false);
 assert.deepEqual(result.gaps.map(g=>[g.scope,g.amount]),[['opening',12000],['assigned',2000],['current',12000]]);
 assert.ok(result.steps.every(s=>s.amount===0&&s.items.length===0));
 const absent=evidence([],{},{});
 assert.equal(absent.opening.expected,null);
 assert.equal(absent.current.expected,null);
 assert.equal(absent.current.verified,false);
 assert.deepEqual(absent.gaps.map(g=>[g.scope,g.amount]),[['opening',null],['current',null]]);
});

test('opening bank advances and refunds are explained separately from expense documents',()=>{
 const b=baseline();b.operating.santi+=400;
 const records=[...history(),row({kind:'transfer',source:'santi',target:'bank',amount:500}),row({kind:'transfer',source:'bank',target:'santi',amount:100})];
 const result=evidence(records,b,summarize(b,records));
 assert.equal(result.opening.advances.total,500);
 assert.equal(result.opening.refunds.total,100);
 assert.equal(result.opening.reconstructed,12400);
 assert.equal(result.current.verified,true);
});

test('opening payments explicitly marked as a registered month do not claim an exact payment day',()=>{
 const b=baseline(),records=[...history(),row({amount:1800,history:{payment_date_basis:'registered_month'},payments:[payment(1800,'santi','2026-10-01')]})];
 b.operating.santi+=1800;
 const result=evidence(records,b,summarize(b,records)),item=result.opening.expenses.items.find(i=>i.amount===1800);
 assert.equal(item.date,'2026-10');
 assert.equal(item.estimated,true);
 assert.equal(item.basis,'registered_month');
 assert.equal(result.opening.expenses.total,16800);
 assert.equal(result.current.verified,true);
});

test('an excluded new document is reported as a current gap if the stored balance counted it',()=>{
 const b=baseline(),records=[...history(),row({amount:700,history:{status:'review'},payments:[payment(700)]},{included_in_opening:false})];
 const result=evidence(records,b,summarize(b,records));
 assert.equal(result.opening.verified,true);
 assert.equal(result.changes.expenses.total,0);
 assert.equal(result.current.verified,false);
 assert.equal(result.current.gap,700);
 assert.equal(result.current.ledgerGap,700);
 assert.deepEqual(result.gaps.map(g=>[g.scope,g.amount]),[['current',700]]);
});
