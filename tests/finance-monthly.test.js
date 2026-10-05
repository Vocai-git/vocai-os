'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function view(records,month='2026-11'){
 const nodes={moneyMonthSummary:{innerHTML:''}};
 const ctx={window:{},document:{getElementById:id=>nodes[id]},formatMoney:n=>n.toFixed(2),escHtml:String,Intl,Date};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/js/modules/money.js'),'utf8'),ctx);
 ctx.moneyState=ctx.window.moneyState;ctx.moneyState.month=month;ctx.moneyState.data={baseline:{cutoff:'2026-10-05'},records};ctx.moneyMonthlySummary();return nodes.moneyMonthSummary.innerHTML;
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
