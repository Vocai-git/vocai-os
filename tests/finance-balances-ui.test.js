'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {summarize}=require('../lib/finance');
const record=(id,data,included_in_opening=true)=>({id,included_in_opening,data:{title:'Compra de prueba',kind:'expense',date:'2026-09-04',amount:10000,payments:[],...data}});
function setup(){
 const records=[record('expense',{history:{status:'paid',account:'santi',reason:'Confirmado por Santiago.'}}),record('receipt',{kind:'income',amount:1000,history:{status:'paid',account:'santi'}}),record('assignment',{kind:'income',title:'Servicio asignado',amount:2000,history:{status:'assigned',account:'santi'}})];
 const baseline={cutoff:'2026-10-05',operating:{santi:7000,agus:300},cash:{bank:5000,cash:0},groups:{startup:{santi:8000,agus:2000,settled:0},capital:{santi:2000,agus:0,settled:0}},ana_assigned:2000,explanation:[]};
 const nodes={balanceDetail:{innerHTML:'',hidden:true,scrollIntoView(){}},balanceDetailRows:{innerHTML:''}};
 const state={data:{review:true,baseline,records,files:[],summary:summarize(baseline,records)}};
 const ctx={FinanceBalances:require('../public/js/finance-balances'),moneyState:state,document:{getElementById:id=>nodes[id]},moneyEuro:n=>(n/100).toFixed(2)+' €',moneyEsc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),moneyRecord:id=>records.find(r=>r.id===id),MONEY_GROUPS:{startup:'Inversión inicial',capital:'Aporte societario'},createModal:(id,title,body)=>{ctx.modal={id,title,body};},Intl,Date};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/js/modules/money-balances.js'),'utf8'),ctx);
 return {ctx,state,nodes,records};
}
test('balance screen separates company debt, assignment without receipt, and personal contributions',()=>{
 const {ctx,state}=setup(),html=ctx.moneyBalancesHTML(state.data.summary);
 assert.match(html,/VOCAI debe a Santiago/);assert.match(html,/70\.00 €/);
 assert.match(html,/Agustín debe a Santiago/);assert.match(html,/40\.00 €/);
 assert.match(html,/Ana todavía no pagó/);assert.match(html,/este saldo no se vuelve a descontar/);
 assert.match(html,/VOCAI debe a Agustín/);assert.match(html,/3\.00 €/);
 assert.match(html,/La suma de los movimientos coincide/);assert.doesNotMatch(html,/Registrar devolución/);
});
test('expense drill groups all historic months and preserves lack of exact day and receipt',()=>{
 const {ctx,nodes}=setup();ctx.moneyBalanceDetail('expenses');
 assert.equal(nodes.balanceDetail.hidden,false);
 assert.match(nodes.balanceDetailRows.innerHTML,/100\.00 €/);assert.match(nodes.balanceDetailRows.innerHTML,/septiembre de 2026/);
 assert.match(nodes.balanceDetailRows.innerHTML,/Mes registrado · día real sin documentar/);
 assert.match(nodes.balanceDetailRows.innerHTML,/Sin comprobante adjunto en V2/);
 ctx.moneyBalanceRecord('expense');assert.match(ctx.modal.body,/Confirmado por Santiago/);
 assert.match(ctx.modal.body,/no es un justificante bancario/);assert.doesNotMatch(ctx.modal.body,/04 sept/);
});
test('assigned income detail is not labelled as a paid expense',()=>{
 const {ctx}=setup();ctx.moneyBalanceDetail('assigned');ctx.moneyBalanceRecord('assignment');
 assert.match(ctx.modal.body,/Reduce lo que VOCAI debe/);assert.match(ctx.modal.body,/No se ha registrado un pago de Ana/);
 assert.doesNotMatch(ctx.modal.body,/El pago se confirmó/);
});
test('gaps stay visible and future forecasts cannot advance the balance snapshot date',()=>{
 const {ctx,state,records}=setup();state.data.baseline.ana_assigned=3000;
 records.push(record('forecast',{date:'2026-12-04',stage:'forecast'},false));
 const html=ctx.moneyBalancesHTML(state.data.summary);
 assert.match(html,/compensación guardada/);assert.doesNotMatch(html,/La suma de los movimientos coincide/);
 assert.match(html,/Acumulado al 05 oct 2026/);assert.doesNotMatch(html,/Acumulado al 04 dic/);
});
test('search totals include only matching payments and escape document titles',()=>{
 const {ctx,state,nodes,records}=setup();records[0].data.title='<img onerror=alert(1)>';
 ctx.moneyBalanceDetail('expenses');assert.match(nodes.balanceDetailRows.innerHTML,/&lt;img/);
 ctx.moneyBalanceRecord('expense');assert.equal(ctx.modal.title,'Detalle del saldo');assert.doesNotMatch(ctx.modal.body,/<img/);
 state.balanceSearch='absent';ctx.moneyBalanceRows();assert.match(nodes.balanceDetailRows.innerHTML,/0 movimientos encontrados · 0\.00 €/);
});
test('a company refund explains the current Agustin balance separately from the opening balance',()=>{
 const {ctx,state,records}=setup();
 records.push(record('refund',{kind:'transfer',amount:200,source:'bank',target:'agus',date:'2026-10-06'},false));
 state.data.summary=summarize(state.data.baseline,records);ctx.moneyBalanceOther();
 assert.match(ctx.modal.body,/<strong>1\.00 €<\/strong>/);assert.match(ctx.modal.body,/3\.00 €/);
 assert.match(ctx.modal.body,/Movimientos posteriores/);assert.match(ctx.modal.body,/− 2\.00 €/);
});
test('over-reimbursement reverses the debt direction without displaying a negative amount due',()=>{
 const {ctx,state,records}=setup();
 records.push(record('refund',{kind:'transfer',amount:8000,source:'bank',target:'santi',date:'2026-10-06'},false));
 state.data.summary=summarize(state.data.baseline,records);
 const html=ctx.moneyBalancesHTML(state.data.summary);assert.match(html,/Santiago debe a VOCAI/);
 assert.match(html,/10\.00 €/);assert.match(html,/Devoluciones de VOCAI/);assert.doesNotMatch(html,/>-10\.00/);
});
