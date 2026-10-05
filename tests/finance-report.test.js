'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const report=require('../public/js/finance-report');
const row=(data,extra={})=>({id:'test',data:{kind:'expense',date:'2026-10-05',amount:10000,payments:[],...data},...extra});
const payment=(amount,date,account='bank')=>({amount,date,account});

test('business rows use the service period while cash rows use payments',()=>{
 const payroll=row({period_start:'2026-09-01',period_end:'2026-09-30',payments:[payment(10000,'2026-10-05','santi')]});
 assert.equal(report.entry(payroll,'2026-09','business').amount,10000);
 assert.equal(report.entry(payroll,'2026-09','business').basis,'period');
 assert.equal(report.entry(payroll,'2026-10','business').included,false);
 assert.equal(report.entry(payroll,'2026-10','cash').amount,10000);
 assert.equal(report.entry(payroll,'2026-09','cash').included,false);
 assert.equal(report.entry(payroll,'2026-10','all').included,true);
});

test('cash rows show only partial payments in the selected month',()=>{
 const expense=row({date:'2026-09-01',payments:[payment(2000,'2026-09-02'),payment(3000,'2026-10-02'),payment(1000,'2026-10-04')]});
 assert.equal(report.entry(expense,'2026-10','cash').amount,4000);
 assert.equal(report.entry(expense,'2026-10','cash').date,'2026-10-02');
 assert.equal(report.monthly([expense],'2026-10').paid,4000);
 assert.equal(report.entry(expense,'2026-10','all').amount,10000);
});

test('unconfirmed income forecasts are not business revenue or cash',()=>{
 const forecast=row({kind:'income',stage:'forecast'});
 const selected=report.entry(forecast,'2026-10','business');
 assert.equal(selected.included,false);
 assert.equal(selected.forecastAmount,10000);
 const summary=report.monthly([forecast],'2026-10');
 assert.equal(summary.revenue,0);
 assert.equal(summary.collected,0);
 assert.equal(summary.forecast_income,10000);
});

test('partly paid forecasts recognize the paid portion and separate the rest',()=>{
 for(const kind of ['expense','income']){
  const forecast=row({kind,stage:'forecast',payments:[payment(3000,'2026-10-05')]});
  const selected=report.entry(forecast,'2026-10','business');
  assert.equal(selected.amount,3000);
  assert.equal(selected.forecastAmount,7000);
  const summary=report.monthly([forecast],'2026-10');
  assert.equal(summary[kind==='income'?'revenue':'expense'],3000);
  assert.equal(summary[kind==='income'?'forecast_income':'forecast'],7000);
 }
});

test('assigned customer revenue has no invented cash collection',()=>{
 const assigned=row({kind:'income',history:{status:'assigned'}});
 assert.equal(report.entry(assigned,'2026-10','business').amount,10000);
 assert.equal(report.entry(assigned,'2026-10','cash').included,false);
 const summary=report.monthly([assigned],'2026-10');
 assert.equal(summary.revenue,10000);
 assert.equal(summary.assigned,10000);
 assert.equal(summary.collected,0);
});

test('historical unknown payment dates retain the original month and flag that basis',()=>{
 const historical=row({date:'2026-09-01',history:{status:'paid',account:'santi',accounting_month:'2026-08'}});
 assert.equal(report.accountingDate(historical),'2026-08-01');
 assert.equal(report.entry(historical,'2026-08','business').amount,10000);
 assert.equal(report.entry(historical,'2026-09','cash').amount,10000);
 assert.equal(report.entry(historical,'2026-09','cash').basis,'registered_month');
 assert.equal(report.entry(historical,'2026-08','cash').included,false);
 assert.equal(report.monthly([historical],'2026-09').registered_dates,1);
 assert.deepEqual(historical.data.payments,[]);
});

test('excluded documents and financing remain consultable without inflating results',()=>{
 const records=[
  ...['draft','duplicate','review'].map(status=>row({history:{status}})),
  row({history:{status:'paid',classification:'startup'}}),
  row({kind:'contribution'}),row({kind:'transfer'}),row({kind:'settlement'}),
 ];
 for(const record of records){
  assert.equal(report.entry(record,'2026-10','all').included,true);
  assert.equal(report.entry(record,'2026-10','business').included,false);
  assert.equal(report.entry(record,'2026-10','cash').included,false);
 }
 const summary=report.monthly(records,'2026-10');
 assert.equal(summary.revenue,0);
 assert.equal(summary.expense,0);
 assert.equal(summary.collected,0);
 assert.equal(summary.paid,0);
 assert.equal(summary.investment,10000);
});

test('the included row amounts sum exactly to each report total',()=>{
 const records=[
  row({kind:'income',amount:10000,history:{status:'assigned'}}),
  row({kind:'income',amount:20000,payments:[payment(5000,'2026-10-03','santi')]}),
  row({amount:8000,stage:'forecast',payments:[payment(1000,'2026-10-02')]}),
  row({amount:9000,period_start:'2026-09-01',period_end:'2026-09-30',payments:[payment(9000,'2026-10-05')]}),
  row({amount:4000,history:{status:'paid',account:'bank'}}),
 ];
 for(const month of ['2026-09','2026-10'])for(const mode of ['business','cash']){
  const summary=report.monthly(records,month);
  for(const kind of ['income','expense']){
   const total=records.filter(r=>r.data.kind===kind).map(r=>report.entry(r,month,mode)).filter(e=>e.included).reduce((sum,e)=>sum+e.amount,0);
   assert.equal(total,summary[mode==='business'?(kind==='income'?'revenue':'expense'):(kind==='income'?'collected':'paid')]);
  }
 }
});

test('voided records never appear and blank month reports the full history',()=>{
 const expense=row({payments:[payment(10000,'2026-10-05')]});
 assert.equal(report.entry(expense,'','cash').amount,10000);
 assert.equal(report.entry({...expense,voided:true},'','all').included,false);
 assert.equal(report.monthly([{...expense,voided:true}],'').paid,0);
});
