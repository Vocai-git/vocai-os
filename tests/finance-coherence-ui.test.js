'use strict';
// Synthetic amounts and counterparties: no production financial records.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const FinanceReport=require('../public/js/finance-report');
const euro=cents=>(cents/100).toFixed(2)+' €';
const text=html=>String(html).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
function fixture(){
 const doc=(id,data)=>({id,version:1,included_in_opening:true,data:{kind:'expense',title:id,date:'2026-10-05',amount:0,payments:[],...data}});
 const payment=(amount,date,account)=>({id:`payment-${amount}-${account}`,amount,date,account});
 return [
  doc('assigned',{kind:'income',title:'Servicio asignado',party:'Cliente ficticio A',amount:125000,history:{status:'assigned',account:'santi'}}),
  doc('income',{kind:'income',title:'Servicio cobrado',party:'Cliente ficticio B',amount:50000,payments:[payment(50000,'2026-10-03','bank')]}),
  doc('draft-a',{kind:'income',title:'Borrador ficticio A',amount:64000,history:{status:'draft'}}),
  doc('draft-b',{kind:'income',title:'Borrador ficticio B',amount:64000,history:{status:'draft'}}),
  doc('software',{title:'Software de prueba',amount:4200,category:'software',payments:[payment(4200,'2026-10-04','bank')]}),
  doc('payroll-a',{title:'Nómina equipo uno',amount:72000,category:'personal',period_start:'2026-09-01',period_end:'2026-09-30',payments:[payment(72000,'2026-10-05','santi')]}),
  doc('payroll-b',{title:'Nómina equipo dos',amount:108000,category:'personal',period_start:'2026-09-01',period_end:'2026-09-30',payments:[payment(108000,'2026-10-05','santi')]}),
  doc('rent',{title:'Alquiler de prueba',amount:90000,date:'2026-09-01',category:'oficina',period_start:'2026-09-01',period_end:'2026-09-30',payments:[payment(50000,'2026-10-01','bank'),payment(40000,'2026-10-03','santi')]}),
  doc('forecast',{title:'Previsión ficticia',amount:35000,stage:'forecast'}),
 ];
}
function harness(){
 const records=fixture(),nodes={},modals=[];
 const node=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:'',value:'',querySelectorAll:()=>[]});
 const ctx={window:{},document:{getElementById:node},Intl,Date,JSON,Number,FinanceReport,formatMoney:n=>n.toFixed(2)+' €',escHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),createModal:(...args)=>modals.push(args),toast:()=>{}};
 vm.createContext(ctx);
 for(const path of ['../public/js/finance-tax.js','../public/js/modules/money-tax.js','../public/js/modules/money-dashboard.js','../public/js/modules/money.js'])vm.runInContext(fs.readFileSync(require.resolve(path),'utf8'),ctx);
 ctx.moneyState=ctx.window.moneyState;
 ctx.moneyState.month='2026-10';ctx.moneyState.data={review:false,records,files:[],baseline:{cutoff:'2026-10-05',history_import:{count:records.length}},summary:{cash:{bank:400000,cash:15000},operating:{santi:0,agus:0},groups:{}}};
 ctx.moneyToday=()=> '2026-10-06';
 return {ctx,nodes,records,node,modals};
}
function click(ctx,html,label){
 const button=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(m=>text(m[2]).startsWith(label));
 assert.ok(button,`Missing rendered button: ${label}`);
 const handler=button[1].match(/onclick="([^"]+)"/);
 assert.ok(handler,`Missing action on button: ${label}`);
 vm.runInContext(handler[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'),ctx);
}
function kpi(html,kind){
 const article=[...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)].find(m=>m[1].includes('fin-'+kind));
 assert.ok(article,`Missing KPI: ${kind}`);
 return text(article[2].match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/)[1]);
}
function duesCard(html){return [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)].find(m=>m[1].includes('fin-dues'))[2];}
function rows(html){return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>m[1]).filter(row=>row.includes('<td'));}
function ledgerAmount(html,title){
 const row=rows(html).find(row=>text(row).includes(title));
 assert.ok(row,`Missing ledger row: ${title}`);
 return text(row.match(/<td\b[^>]*class="num"[^>]*>[\s\S]*?<strong\b[^>]*>([\s\S]*?)<\/strong>/)[1]);
}
function assertOctoberDate(content,day){assert.match(content,new RegExp(`(?:2026-10-${String(day).padStart(2,'0')}|0?${day}/10|0?${day} oct)`,'i'));}

test('business summary drilldown and normal movements use the same records and totals',()=>{
 const h=harness(),expected=FinanceReport.monthly(h.records,'2026-10'),summary=h.ctx.moneyDashboardHTML();
 assert.equal(kpi(summary,'income'),euro(expected.revenue));
 assert.equal(kpi(summary,'expense'),euro(expected.expense));
 assert.equal(kpi(summary,'result'),euro(expected.result));
 click(h.ctx,summary,'Ver cálculo');
 const ledger=h.node('moneyRows').innerHTML;
 assert.equal(h.ctx.moneyState.reportMode,'business');
 const totals=text(ledger.match(/class="money-totals-line"[^>]*>([\s\S]*?)<\/div>/)[1]);
 assert.ok(totals.includes(euro(expected.revenue)));
 assert.ok(totals.includes(euro(expected.expense)));
 assert.ok(totals.includes(euro(expected.result)));
 assert.doesNotMatch(ledger,/Borrador ficticio|Previsión ficticia|Nómina equipo|Alquiler de prueba/);
 assert.equal(ledgerAmount(ledger,'Servicio asignado'),euro(125000));
 assert.equal(ledgerAmount(ledger,'Servicio cobrado'),euro(50000));
 h.ctx.moneyInspect();
 assert.equal(h.ctx.moneyState.reportMode,'business');
 assert.doesNotMatch(h.node('moneyRows').innerHTML,/Borrador ficticio/);
});

test('income drilldown labels a compensation without inventing a company bank receipt',()=>{
 const h=harness();click(h.ctx,h.ctx.moneyDashboardHTML(),'Ver ingresos');
 const ledger=h.node('moneyRows').innerHTML,assigned=rows(ledger).find(row=>text(row).includes('Servicio asignado'));
 assert.equal(h.ctx.moneyState.filter,'income');
 assert.match(text(assigned),/Compensado con Santiago/);
 assert.match(text(assigned),/No es un cobro/i);
 assert.doesNotMatch(text(assigned),/Banco VOCAI/);
 assert.doesNotMatch(ledger,/Software de prueba|Borrador ficticio/);
 const detail=text(h.ctx.moneyRecordDetailHTML(h.records.find(r=>r.id==='assigned')));
 assert.match(detail,/Santiago/);assert.match(detail,/compens/i);
 assert.match(detail,/No es (?:un |otro )?cobro/i);
});

test('cash and business modes survive normal navigation while archive remains an explicit choice',()=>{
 const h=harness();h.ctx.moneyState.reportMode='cash';
 h.ctx.moneyOpenRecords();assert.equal(h.ctx.moneyState.reportMode,'cash');
 h.ctx.moneyView('summary');assert.equal(h.ctx.moneyState.reportMode,'cash');
 h.ctx.moneySetReport('business');h.ctx.moneyOpenRecords();assert.equal(h.ctx.moneyState.reportMode,'business');
 h.ctx.moneySetReport('all');
 assert.match(text(h.node('moneyBody').innerHTML),/Archivo completo/);
 assert.match(h.node('moneyRows').innerHTML,/Borrador ficticio A/);
 assert.match(h.node('moneyRows').innerHTML,/Borrador ficticio B/);
 h.ctx.moneyView('summary');assert.equal(h.ctx.moneyState.reportMode,'business');
 h.ctx.moneyState.reportMode='forecast';h.ctx.moneyOpenRecords();assert.equal(h.ctx.moneyState.reportMode,'business');
});

test('switching report or type removes a category drilldown so unrelated records are not hidden',()=>{
 const h=harness();h.ctx.moneyDashboardCategory('software');
 assert.ok(h.ctx.moneyState.focusIds.includes('software'));
 assert.equal(h.ctx.moneyState.focusLabel,'Software');
 h.ctx.moneySetReport('cash');
 assert.equal(h.ctx.moneyState.focusIds,null);assert.equal(h.ctx.moneyState.focusLabel,'');
 assert.match(h.node('moneyRows').innerHTML,/Nómina equipo uno/);
 h.ctx.moneyDashboardCategory('software');h.ctx.moneyFilter('income');
 assert.equal(h.ctx.moneyState.focusIds,null);assert.equal(h.ctx.moneyState.focusLabel,'');
 assert.equal(h.ctx.moneyState.filter,'income');
 assert.match(h.node('moneyRows').innerHTML,/Servicio asignado/);
 assert.match(h.node('moneyRows').innerHTML,/Servicio cobrado/);
});

test('ledger totals follow a search filter rather than repeating the unfiltered dashboard amount',()=>{
 const h=harness();h.ctx.moneyInspect('business','income');
 h.ctx.moneyState.search='Servicio cobrado';h.ctx.moneyRows(false);
 const ledger=h.node('moneyRows').innerHTML,totals=text(ledger.match(/class="money-totals-line"[^>]*>([\s\S]*?)<\/div>/)[1]);
 assert.equal(rows(ledger).length,1);
 assert.equal(ledgerAmount(ledger,'Servicio cobrado'),euro(50000));
 assert.ok(totals.includes(euro(50000)));
 assert.ok(!totals.includes(euro(FinanceReport.monthly(h.records,'2026-10').revenue)));
 assert.doesNotMatch(ledger,/Servicio asignado|Borrador ficticio/);
});

test('salary service month and actual cash month remain explicit in ledger and detail',()=>{
 const h=harness(),salary=h.records.find(r=>r.id==='payroll-a');
 h.ctx.moneyState.month='2026-09';h.ctx.moneyInspect('business','expense');
 let ledger=h.node('moneyRows').innerHTML;
 assert.equal(ledgerAmount(ledger,'Nómina equipo uno'),euro(salary.data.amount));
 const businessRow=text(rows(ledger).find(row=>text(row).includes('Nómina equipo uno')));
 assert.match(businessRow,/septiembre de 2026/i);
 assertOctoberDate(businessRow,5);
 assert.match(businessRow,/Santiago/);
 h.ctx.moneyState.month='2026-10';h.ctx.moneyInspect('business','expense');
 assert.doesNotMatch(h.node('moneyRows').innerHTML,/Nómina equipo uno/);
 h.ctx.moneyInspect('cash','expense');ledger=h.node('moneyRows').innerHTML;
 const cashRow=text(rows(ledger).find(row=>text(row).includes('Nómina equipo uno')));
 assert.equal(ledgerAmount(ledger,'Nómina equipo uno'),euro(salary.data.amount));
 assert.match(cashRow,/Corresponde a: septiembre de 2026/i);
 assertOctoberDate(cashRow,5);
 const detail=text(h.ctx.moneyRecordDetailHTML(salary));
 assert.match(detail,/septiembre de 2026/i);
 assertOctoberDate(detail,5);
 assert.match(detail,/Santiago/);
 assert.match(detail,/720\.00 €/);
});

test('cash drilldown keeps two payment dates and accounts visible instead of merging their origin',()=>{
 const h=harness();h.ctx.moneyState.reportMode='cash';
 const expected=FinanceReport.monthly(h.records,'2026-10'),summary=h.ctx.moneyDashboardHTML();
 assert.equal(kpi(summary,'income'),euro(expected.collected));
 assert.equal(kpi(summary,'expense'),euro(expected.paid));
 click(h.ctx,summary,'Ver pagos');
 const ledger=h.node('moneyRows').innerHTML,rentRow=text(rows(ledger).find(row=>text(row).includes('Alquiler de prueba')));
 assert.equal(ledgerAmount(ledger,'Alquiler de prueba'),euro(90000));
 assert.match(rentRow,/Banco VOCAI/);assert.match(rentRow,/Santiago/);
 assert.match(rentRow,/500\.00 €/);assert.match(rentRow,/400\.00 €/);
 assertOctoberDate(rentRow,1);assertOctoberDate(rentRow,3);
 assert.doesNotMatch(ledger,/Servicio asignado|Borrador ficticio/);
 const detail=text(h.ctx.moneyRecordDetailHTML(h.records.find(r=>r.id==='rent')));
 assertOctoberDate(detail,1);assertOctoberDate(detail,3);
 assert.match(detail,/500\.00 €/);assert.match(detail,/400\.00 €/);
});

test('payables queue combines confirmed balances and selected-month forecasts without changing the ledger',()=>{
 const h=harness(),doc=(id,data)=>({id,version:1,included_in_opening:false,data:{kind:'expense',title:id,date:'2026-10-05',amount:0,payments:[],...data}}),payment=amount=>({id:'payment-'+amount,amount,date:'2026-10-05',account:'bank'});
 h.ctx.moneyState.data.records=[
  doc('confirmed-test',{title:'Factura confirmada de prueba',amount:48000,payments:[payment(12000)],due:'2026-10-07'}),
  doc('forecast-test',{title:'Gasto previsto de prueba',stage:'forecast',amount:92000,payments:[payment(12000)],due:'2026-10-02'}),
  doc('other-month',{title:'Previsión del mes siguiente',stage:'forecast',amount:50000,date:'2026-11-01'}),
  doc('forecast-paid',{title:'Previsión ya pagada',stage:'forecast',amount:9000,payments:[payment(9000)]}),
  doc('forecast-income',{kind:'income',title:'Ingreso previsto de prueba',stage:'forecast',amount:8000}),
  doc('confirmed-income',{kind:'income',title:'Cliente pendiente de prueba',amount:30000,payments:[payment(5000)]}),
 ];
 const before=JSON.stringify(h.ctx.moneyState.data.records),modelBefore=h.ctx.moneyDashboardModel();
 click(h.ctx,h.ctx.moneyDashboardHTML(),'Por pagar');
 const card=duesCard(h.node('moneyMonthSummary').innerHTML),visible=text(card),total=text(card.match(/class="fin-due-total">([\s\S]*?)<\/div>/)[1]);
 assert.match(visible,/Por pagar 2/);
 assert.match(total,/1160\.00 € Confirmado \+ previsto/);
 assert.match(total,/Confirmado: 360\.00 €/);
 assert.match(total,/Previsto en octubre de 2026: 800\.00 €/);
 assert.match(visible,/Factura confirmada de prueba/);
 assert.match(visible,/Gasto previsto de prueba/);
 assert.match(visible,/Previsto · por confirmar/);
 assert.doesNotMatch(visible,/Sin facturas confirmadas|Sin pagos confirmados|Previsión del mes siguiente|Previsión ya pagada/);
 const forecastButton=[...card.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(m=>text(m[0]).includes('Gasto previsto de prueba'))[0];
 assert.doesNotMatch(text(forecastButton),/Vencido|Venció/i);
 click(h.ctx,card,'Ver detalle');
 const modal=h.modals.at(-1);
 assert.equal(modal[0],'moneyDues');
 assert.match(text(modal[2]),/Factura confirmada de prueba/);
 assert.match(text(modal[2]),/Gasto previsto de prueba/);
 assert.doesNotMatch(text(modal[2]),/Previsión del mes siguiente|Previsión ya pagada/);
 click(h.ctx,modal[2],'G Gasto previsto de prueba');
 assert.equal(h.modals.at(-1)[0],'moneyModal');
 assert.equal(h.ctx.moneyState.form.record.id,'forecast-test');
 assert.equal(h.ctx.moneyState.form.record.data.stage,'forecast');
 assert.equal(h.ctx.moneyDashboardModel().pending.expenseTotal,36000);
 assert.equal(h.ctx.moneyDashboardModel().current.expense,69000);
 assert.equal(h.ctx.moneyDashboardModel().current.paid,33000);
 assert.deepEqual(h.ctx.moneyDashboardModel(),modelBefore);
 assert.equal(JSON.stringify(h.ctx.moneyState.data.records),before);
 h.ctx.moneyDashboardDues('income');
 const income=text(duesCard(h.node('moneyMonthSummary').innerHTML));
 assert.match(income,/Por cobrar 1/);assert.match(income,/250\.00 € Pendiente de clientes/);
 assert.doesNotMatch(income,/Ingreso previsto de prueba|Confirmado \+ previsto/);
});

test('forecast-only months show work to review instead of a zero payable empty state',()=>{
 const h=harness();h.ctx.moneyState.data.records=[{id:'forecast-only',version:1,included_in_opening:false,data:{kind:'expense',title:'Revisión de consumo ficticia',date:'2026-10-01',amount:18500,stage:'forecast',payments:[]}}];
 h.ctx.moneyDashboardDues('expense');
 const card=duesCard(h.node('moneyMonthSummary').innerHTML),visible=text(card);
 assert.match(visible,/Por pagar 1/);
 assert.match(visible,/185\.00 € Confirmado \+ previsto/);
 assert.match(visible,/Confirmado: 0\.00 €/);
 assert.match(visible,/Previsto en octubre de 2026: 185\.00 €/);
 assert.match(visible,/Revisión de consumo ficticia/);
 assert.doesNotMatch(card,/class="fin-empty"/);
 const model=h.ctx.moneyDashboardModel();
 assert.equal(model.pending.expenseTotal,0);
 assert.equal(model.current.expense,0);
 assert.equal(model.current.paid,0);
 assert.equal(model.current.revenue,0);
 assert.equal(model.forecastExpense.amount,18500);
});
