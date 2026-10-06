'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function view(records,month='2026-11',integrated=false,mode='cash'){
 const nodes={moneyMonthSummary:{innerHTML:''}};
 const ctx={FinanceReport:require('../public/js/finance-report'),window:{},document:{getElementById:id=>nodes[id]},formatMoney:n=>n.toFixed(2),escHtml:String,Intl,Date};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/js/modules/money-dashboard.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/js/modules/money.js'),'utf8'),ctx);
 ctx.moneyState=ctx.window.moneyState;ctx.moneyState.month=month;ctx.moneyState.reportMode=mode;ctx.moneyState.data={baseline:{cutoff:'2026-10-05',history_import:integrated?{count:5}:null},records};ctx.moneyMonthlySummary();return nodes.moneyMonthSummary.innerHTML;
}
test('monthly cash view counts actual dates and partial payments, excludes capital and voids',()=>{
 const html=view([
 {data:{kind:'expense',date:'2026-10-01',amount:5000,payments:[{date:'2026-10-15',amount:1000},{date:'2026-11-01',amount:2000}]}},
 {data:{kind:'expense',amount:9000,payments:[]}},
 {data:{kind:'income',payments:[{date:'2026-11-02',amount:7000}]}},
 {data:{kind:'contribution',amount:300000,date:'2026-11-01'}},
 {voided:true,data:{kind:'expense',payments:[{date:'2026-11-03',amount:15000}]}}
 ]);
 assert.match(html,/70\.00/);assert.match(html,/20\.00/);assert.match(html,/50\.00/);assert.doesNotMatch(html,/3000\.00|150\.00/);
});
test('opening references appear in historical month but incomplete net is not presented as final',()=>{
 const html=view([{included_in_opening:true,data:{kind:'expense',payments:[{date:'2026-09-29',amount:2600}]}}],'2026-09');
 assert.match(html,/26\.00/);assert.match(html,/Por conciliar/);assert.match(html,/Mes pendiente de revisión/);
});

test('integrated historical totals include confirmed recorded-month payments, but not drafts, duplicate or assigned income',()=>{
 const record=(kind,amount,status,classification='operating')=>({included_in_opening:true,data:{kind,title:'Fixture',amount,date:'2026-08-01',payments:[],history:{status,classification}}});
 const html=view([record('income',10000,'paid'),record('expense',3000,'paid'),record('income',20000,'assigned'),record('income',10000,'duplicate'),record('income',50000,'draft'),record('expense',4000,'paid','startup')],'2026-08',true);
 assert.match(html,/100\.00/);assert.match(html,/30\.00/);assert.match(html,/70\.00/);assert.match(html,/200\.00/);assert.match(html,/Diferencia de cobros y pagos/);assert.doesNotMatch(html,/Por conciliar/);assert.doesNotMatch(html,/500\.00/);
});
const {monthly}=require('../public/js/finance-report');
test('business revenue includes a client assigned to a partner even before personal collection',()=>{
 const rows=[{included_in_opening:true,data:{kind:'income',amount:20000,date:'2026-09-01',payments:[],history:{status:'assigned',account:'santi'}}}];
 const r=monthly(rows,'2026-09');assert.equal(r.revenue,20000);assert.equal(r.result,20000);assert.equal(r.collected,0);assert.equal(r.company_collected,0);assert.equal(r.assigned,20000);
});
test('client receipt retained personally is revenue, cash received by a partner, and never company bank cash',()=>{
 const r=monthly([{data:{kind:'income',amount:50000,date:'2026-09-01',payments:[{date:'2026-09-05',amount:50000,account:'santi'}]}}],'2026-09');
 assert.equal(r.revenue,50000);assert.equal(r.collected,50000);assert.equal(r.personal_collected,50000);assert.equal(r.company_collected,0);
});
test('salary service month differs from cash month; forecast is not a confirmed expense',()=>{
 const salary={data:{kind:'expense',amount:70000,date:'2026-10-05',period_start:'2026-09-01',period_end:'2026-09-30',payments:[{date:'2026-10-05',amount:70000,account:'santi'}]}};
 const forecast={data:{kind:'expense',amount:10000,date:'2026-10-01',stage:'forecast',payments:[]}};
 assert.equal(monthly([salary],'2026-09').expense,70000);assert.equal(monthly([salary],'2026-09').paid,0);
 const october=monthly([salary,forecast],'2026-10');assert.equal(october.expense,0);assert.equal(october.paid,70000);assert.equal(october.forecast,10000);
});
