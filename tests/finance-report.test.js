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

const dashboard=(records,month='2026-10')=>report.dashboard(records,{cutoff:'2026-10-05'},{cash:{bank:12500,cash:3400}},month,'2026-10-05');

test('dashboard separates confirmed payables from forecasts and uses outstanding amounts',()=>{
 const data=dashboard([
  row({title:'Confirmed',amount:15000,payments:[payment(2500,'2026-10-03')]}),
  row({title:'Forecast',amount:20000,stage:'forecast',payments:[payment(3000,'2026-10-04')]}),
  row({title:'Earlier forecast',amount:8000,date:'2026-09-01',stage:'forecast'}),
  row({title:'Forecast sale',kind:'income',amount:9000,stage:'forecast'}),
 ]);
 assert.equal(data.pending.expenseTotal,12500);
 assert.deepEqual(data.pending.expense.map(r=>[r.title,r.amount]),[['Confirmed',12500]]);
 assert.equal(data.pending.incomeTotal,0);
 assert.equal(data.forecastExpense.amount,17000);
 assert.equal(data.forecastExpense.payableAmount,17000);
 assert.deepEqual(data.forecastExpense.items.map(r=>[r.title,r.amount,r.date]),[['Forecast',17000,'2026-10-05']]);
 assert.equal(data.current.expense,18000);
});

test('dashboard excludes assigned, opening and invalid documents from company receivables',()=>{
 const data=dashboard([
  row({kind:'income',title:'Assigned',history:{status:'assigned'}}),
  row({kind:'income',title:'Opening'},{included_in_opening:true}),
  ...['draft','duplicate','review'].map(status=>row({kind:'income',history:{status}})),
  row({kind:'income',title:'Paid historical',history:{status:'paid'}}),
  row({kind:'income',title:'Voided'},{voided:true}),
  row({kind:'income',title:'Prior month outstanding',date:'2026-09-01',amount:18000,payments:[payment(4000,'2026-09-09')]}),
 ]);
 assert.equal(data.pending.incomeTotal,14000);
 assert.deepEqual(data.pending.income.map(r=>r.title),['Prior month outstanding']);
 assert.equal(data.current.assigned,10000);
 assert.equal(data.current.collected,10000);
});

test('dashboard expense categories sum exactly to the monthly confirmed expenses without title inference',()=>{
 const data=dashboard([
  row({amount:2500,category:'Software'}),
  row({amount:3500,category:' software '}),
  row({amount:5000,category:'oficina',stage:'forecast',payments:[payment(1200,'2026-10-05')]}),
  row({title:'Software provider without category',amount:3000,category:''}),
  row({amount:900,category:'gestión_externa'}),
  row({amount:99900,category:'oficina',history:{classification:'startup'}}),
  row({amount:8500,category:'personal',period_start:'2026-09-01',period_end:'2026-09-30'}),
 ]);
 assert.equal(data.categories.reduce((n,c)=>n+c.amount,0),data.current.expense);
 assert.deepEqual(data.categories.map(c=>[c.label,c.amount]),[['Software',6000],['Sin categoría',3000],['Oficina',1200],['Gestión externa',900]]);
 assert.equal(data.categories[0].count,2);
 assert.equal(data.categories[0].ids.length,2);
});

test('dashboard six-month trend crosses year boundaries and uses the same monthly engine',()=>{
 const records=[row({date:'2025-12-01',kind:'income',amount:6500}),row({date:'2026-01-01',amount:700})];
 const data=dashboard(records,'2026-02');
 assert.equal(data.previousMonth,'2026-01');
 assert.deepEqual(data.previous,report.monthly(records,'2026-01'));
 assert.deepEqual(data.trend.map(m=>m.month),['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02']);
 for(const {month,...monthly} of data.trend)assert.deepEqual(monthly,report.monthly(records,month));
});

test('dashboard does not invent due dates, overdue states or historical bank balances',()=>{
 const records=[
  row({title:'No due date',date:'2026-08-01'}),
  row({title:'Due today',due:'2026-10-05'}),
  row({title:'Due tomorrow',due:'2026-10-06'}),
  row({title:'Overdue',due:'2026-10-04'}),
 ];
 const before=JSON.stringify(records),data=dashboard(records,'2026-08');
 assert.deepEqual(data.pending.expense.map(r=>[r.title,r.due,r.overdue]),[['Overdue','2026-10-04',true],['Due today','2026-10-05',false],['Due tomorrow','2026-10-06',false],['No due date',null,false]]);
 assert.deepEqual(data.cash,{bank:12500,cash:3400,total:15900,asOf:'2026-10-05',snapshotMonth:'2026-10',selectedMonthIsSnapshot:false,isMonthEnd:false});
 assert.equal(dashboard(records).cash.selectedMonthIsSnapshot,true);
 assert.equal(JSON.stringify(records),before);
});

test('reviewed category takes priority and unanimous original categories are a safe fallback',()=>{
 const sources=values=>values.map(categoria=>({original:{categoria}}));
 assert.deepEqual(report.category(row({category:'Oficina',history:{sources:sources(['software','personal'])}})),{key:'oficina',label:'Oficina'});
 const reviewed=row({amount:5200,category:' ',history:{sources:sources(['Software',' software ',null])}});
 assert.deepEqual(report.category(reviewed),{key:'software',label:'Software'});
 const data=dashboard([reviewed]);
 assert.deepEqual(data.categories.map(c=>[c.label,c.amount]),[['Software',5200]]);
 assert.equal(data.categories.reduce((sum,c)=>sum+c.amount,0),data.current.expense);
 assert.deepEqual(report.category(row({history:{sources:sources(['gestión_externa','Gestión externa'])}})),{key:'gestion-externa',label:'Gestión externa'});
});

test('conflicting or missing source categories remain unclassified without inferring a title',()=>{
 const sources=values=>values.map(categoria=>({original:{categoria}}));
 for(const values of [['Software','Oficina'],[null,'',undefined],[]]){
  const record=row({title:'Software subscription',history:{sources:sources(values)}});
  assert.deepEqual(report.category(record),{key:'sin-categoria',label:'Sin categoría'});
 }
});

test('an explicit opening payment with uncertain day retains the registered-month label',()=>{
 const row={included_in_opening:true,data:{kind:'expense',amount:2000,date:'2026-10-01',payments:[{date:'2026-10-01',amount:2000,account:'santi'}],history:{payment_date_basis:'registered_month'}}};
 const report=require('../public/js/finance-report'),result=report.entry(row,'2026-10','cash');
 assert.equal(result.amount,2000);assert.equal(result.basis,'registered_month');
 assert.equal(report.monthly([row],'2026-10').registered_dates,1);
});

const withheld=(kind='expense',payments=[],extra={})=>row({kind,amount:121000,vat:{mode:'added',input:100000,rate:2100,base:100000,tax:21000,total:121000},irpf:{rate:1500,base:100000,tax:15000},payments,...extra});

test('explicit IRPF keeps business gross, pending net, and actual payments separate for sales and purchases',()=>{
 for(const kind of ['income','expense']){
  for(const paid of [0,40000,106000]){
   const record=withheld(kind,paid?[payment(paid,'2026-10-05')]:[]),before=JSON.stringify(record),data=dashboard([record]);
   assert.equal(data.current[kind==='income'?'revenue':'expense'],121000);
   assert.equal(data.current[kind==='income'?'collected':'paid'],paid);
   assert.equal(data.pending[kind+'Total'],106000-paid);
   assert.deepEqual(data.pending[kind].map(item=>item.remaining),paid===106000?[]:[106000-paid]);
   assert.equal(report.entry(record,'2026-10','all').amount,121000);
   assert.equal(JSON.stringify(record),before);
  }
 }
});

test('IRPF forecasts retain a gross result forecast and expose only the net amount still to settle',()=>{
 for(const [paid,grossConfirmed,grossForecast,netRemaining] of [[0,0,121000,106000],[53000,60500,60500,53000],[106000,121000,0,0]]){
  for(const kind of ['income','expense']){
   const record=withheld(kind,paid?[payment(paid,'2026-10-05')]:[],{stage:'forecast'}),data=dashboard([record]);
   assert.equal(data.current[kind==='income'?'revenue':'expense'],grossConfirmed);
   assert.equal(data.current[kind==='income'?'forecast_income':'forecast'],grossForecast);
   assert.equal(data.current[kind==='income'?'collected':'paid'],paid);
   assert.equal(data.pending.incomeTotal,0);assert.equal(data.pending.expenseTotal,0);
   if(kind==='expense'){
    assert.equal(data.forecastExpense.amount,grossForecast);
    assert.equal(data.forecastExpense.payableAmount,netRemaining);
    assert.deepEqual(data.forecastExpense.items.map(item=>[item.amount,item.remaining]),netRemaining?[[netRemaining,netRemaining]]:[]);
    assert.equal(data.categories.reduce((total,c)=>total+c.amount,0),grossConfirmed);
   }
  }
 }
});

test('IRPF forecast recognition rounds to cents and leaves no withholding behind after the net is settled',()=>{
 const make=paid=>withheld('expense',[payment(paid,'2026-10-05')],{stage:'forecast',amount:121,irpf:{rate:1500,base:100,tax:15},vat:{base:100,tax:21,total:121}});
 const partial=dashboard([make(53)]);
 assert.equal(partial.current.expense,61);assert.equal(partial.current.forecast,60);assert.equal(partial.forecastExpense.payableAmount,53);
 const paid=dashboard([make(106)]);
 assert.equal(paid.current.expense,121);assert.equal(paid.current.forecast,0);assert.equal(paid.current.paid,106);assert.equal(paid.forecastExpense.payableAmount,0);assert.deepEqual(paid.forecastExpense.items,[]);
});

test('reports never infer IRPF from historic labels or VAT and keep the existing paid-date basis',()=>{
 const old=row({title:'Factura profesional IRPF',amount:121000,vat:{base:100000,tax:21000,total:121000}});
 assert.equal(dashboard([old]).pending.expenseTotal,121000);
 const historic=row({...old.data,history:{status:'paid',account:'bank'}});
 assert.equal(report.entry(historic,'2026-10','cash').amount,121000);assert.equal(report.entry(historic,'2026-10','cash').basis,'registered_month');
 const explicit=withheld('expense',[],{history:{status:'paid',account:'bank'}});
 assert.equal(report.entry(explicit,'2026-10','cash').amount,106000);assert.equal(report.entry(explicit,'2026-10','cash').basis,'registered_month');
 assert.equal(dashboard([explicit]).pending.expenseTotal,0);
});
