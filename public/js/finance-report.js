/* Monthly business activity and actual cash share the same row selection.
 * entry(..., 'all') is an archive view: its document amounts are not a result.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FinanceReport=factory();})(typeof window==='undefined'?this:window,function(){
 function accountingDate(row){
  const d=row.data,h=d.history||{};
  if(h.accounting_month)return h.accounting_month.length===7?h.accounting_month+'-01':h.accounting_month;
  if(d.period_start&&d.period_end&&d.period_start.slice(0,7)===d.period_end.slice(0,7))return d.period_start;
  return d.date||'';
 }
 function matches(date,month){return !month||String(date||'').startsWith(month);}
 function paymentRows(row){
  const d=row.data,h=d.history||{},payments=(d.payments||[]).map(p=>({...p,estimated:!!row.included_in_opening&&h.payment_date_basis==='registered_month'}));
  // A historical paid record is confirmed paid, but its registered month is
  // only a fallback: do not invent a payment row or an exact payment date.
  if(h.status==='paid'&&!payments.length)payments.push({date:d.date,amount:d.amount,account:h.account,estimated:true});
  return payments;
 }
 function entry(row,month,mode='business'){
  if(!['business','cash','all'].includes(mode))throw new Error('Unknown monthly report mode');
  const d=row.data,h=d.history||{},accountDate=accountingDate(row),payments=paymentRows(row),monthPayments=payments.filter(p=>matches(p.date,month));
  const result={included:false,amount:0,date:accountDate,basis:accountDate!==d.date?'period':'document',excludedReason:null,forecastAmount:0};
  if(row.voided){result.excludedReason='voided';return result;}
  const invalidStatus=['duplicate','draft','review'].includes(h.status)?h.status:null;
  const nonOperating=h.classification==='startup'?'investment':!['expense','income'].includes(d.kind)?d.kind:null;
  if(mode==='all'){
   result.included=matches(d.date,month)||matches(accountDate,month)||monthPayments.length>0;
   result.amount=result.included?d.amount:0;
   result.date=matches(d.date,month)?d.date:matches(accountDate,month)?accountDate:monthPayments[0]?.date||d.date;
   result.basis=nonOperating?'movement':result.date===accountDate&&accountDate!==d.date?'period':result.date===d.date?'document':'payment';
   result.excludedReason=invalidStatus||nonOperating||(!result.included?'outside_month':null);
   return result;
  }
  if(invalidStatus||nonOperating){result.excludedReason=invalidStatus||nonOperating;return result;}
  if(mode==='cash'){
   result.included=monthPayments.length>0;
   result.amount=monthPayments.reduce((sum,p)=>sum+p.amount,0);
   result.date=monthPayments[0]?.date||d.date;
   result.basis=monthPayments.some(p=>p.estimated)?'registered_month':'payment';
   result.excludedReason=result.included?null:payments.length?'outside_month':h.status==='assigned'?'assigned':d.stage==='forecast'?'forecast':'unpaid';
   return result;
  }
  if(!matches(accountDate,month)){result.excludedReason='outside_month';return result;}
  result.amount=d.stage==='forecast'?Math.min(d.amount,payments.reduce((sum,p)=>sum+p.amount,0)):d.amount;
  result.forecastAmount=d.stage==='forecast'?Math.max(0,d.amount-result.amount):0;
  result.included=result.amount>0;
  result.excludedReason=result.included?null:result.forecastAmount?'forecast':null;
  return result;
 }
 function monthly(records,month){
  const r={revenue:0,expense:0,forecast:0,forecast_income:0,collected:0,paid:0,personal_collected:0,company_collected:0,unallocated_collected:0,assigned:0,investment:0,registered_dates:0,issues:[],drafts:0,duplicates:0};
  for(const row of records){
   if(row.voided)continue;
   const d=row.data,h=d.history||{},inMonth=matches(accountingDate(row),month);
   if(h.status==='duplicate'){if(inMonth)r.duplicates++;continue;}
   if(h.status==='draft'){if(inMonth)r.drafts++;continue;}
   if(h.status==='review'){if(inMonth)r.issues.push({id:row.id,title:d.title,amount:d.amount,reason:h.reason});continue;}
   if(h.classification==='startup'){if(inMonth)r.investment+=d.amount;continue;}
   if(!['expense','income'].includes(d.kind))continue;
   const business=entry(row,month,'business'),cash=entry(row,month,'cash');
   if(business.included)r[d.kind==='income'?'revenue':'expense']+=business.amount;
   r[d.kind==='income'?'forecast_income':'forecast']+=business.forecastAmount;
   if(inMonth&&h.status==='assigned')r.assigned+=business.amount;
   if(!cash.included)continue;
   r[d.kind==='income'?'collected':'paid']+=cash.amount;
   for(const p of paymentRows(row).filter(p=>matches(p.date,month))){
    if(p.estimated)r.registered_dates++;
    if(d.kind!=='income')continue;
    if(['santi','agus'].includes(p.account))r.personal_collected+=p.amount;
    else if(['bank','cash'].includes(p.account))r.company_collected+=p.amount;
    else r.unallocated_collected+=p.amount;
   }
  }
  r.result=r.revenue-r.expense;r.cash_result=r.collected-r.paid;return r;
 }
 function offsetMonth(month,offset){
  const [year,number]=month.split('-').map(Number);
  return new Date(Date.UTC(year,number-1+offset,1)).toISOString().slice(0,7);
 }
 function categoryLabel(value){
  const text=typeof value==='string'?value.trim().replace(/[_-]+/g,' ').replace(/\s+/g,' '):'';
  const key=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const labels={software:'Software',oficina:'Oficina',servicios:'Servicios',personal:'Personal',marketing:'Marketing',otros:'Otros','sin-categoria':'Sin categoría'};
  return {key:key||'sin-categoria',label:labels[key]||(text?text.charAt(0).toUpperCase()+text.slice(1).toLowerCase():'Sin categoría')};
 }
 function category(row){
  const d=row.data||{},nonempty=value=>typeof value==='string'&&value.trim().length>0;
  if(nonempty(d.category))return categoryLabel(d.category);
  // Reviewed documents retain the original source category. Reuse it only
  // when the available sources agree; never guess a category from a title.
  const originals=new Map();
  for(const source of d.history?.sources||[]){
   const value=source.original?.categoria;
   if(nonempty(value)){const c=categoryLabel(value);originals.set(c.key,c);}
  }
  return originals.size===1?[...originals.values()][0]:categoryLabel('');
 }
 function dashboard(records,baseline,summary,month,today){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('A dashboard needs a valid month');
  baseline=baseline||{};summary=summary||{};
  today=today||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const current=monthly(records,month),previousMonth=offsetMonth(month,-1),categories=new Map();
  const pending={income:[],expense:[],incomeTotal:0,expenseTotal:0},forecastExpense={amount:0,items:[]};
  const item=(row,amount)=>({id:row.id,title:row.data.title||'',party:row.data.party||'',amount,remaining:amount,due:row.data.due||null,date:row.data.date||null,overdue:!!row.data.due&&row.data.due<today});
  for(const row of records){
   if(row.voided)continue;
   const d=row.data,h=d.history||{},business=entry(row,month,'business');
   if(d.kind==='expense'&&business.included){
    const c=category(row),group=categories.get(c.key)||{...c,amount:0,count:0,ids:[]};
    group.amount+=business.amount;group.count++;group.ids.push(row.id);categories.set(c.key,group);
   }
   if(d.kind==='expense'&&business.forecastAmount>0){
    forecastExpense.amount+=business.forecastAmount;
    forecastExpense.items.push(item(row,business.forecastAmount));
   }
   // Opening documents were already settled in the agreed starting balance.
   // Assigned income is also settled for VOCAI; its personal collection stays
   // outside this company's list. Forecasts are not confirmed liabilities.
   if(row.included_in_opening||!['income','expense'].includes(d.kind)||d.stage==='forecast'||['draft','duplicate','review','assigned'].includes(h.status)||h.classification==='startup')continue;
   const remaining=Math.max(0,d.amount-paymentRows(row).reduce((sum,p)=>sum+p.amount,0));
   if(!remaining)continue;
   pending[d.kind].push(item(row,remaining));pending[d.kind+'Total']+=remaining;
  }
  const byDue=(a,b)=>(a.due||'9999-12-31').localeCompare(b.due||'9999-12-31')||(a.date||'').localeCompare(b.date||'')||String(a.id).localeCompare(String(b.id));
  pending.income.sort(byDue);pending.expense.sort(byDue);forecastExpense.items.sort(byDue);
  const cash={bank:summary.cash?.bank??0,cash:summary.cash?.cash??0,asOf:summary.as_of||baseline.cutoff||null,isMonthEnd:false};
  cash.total=cash.bank+cash.cash;
  cash.snapshotMonth=cash.asOf?cash.asOf.slice(0,7):null;
  cash.selectedMonthIsSnapshot=month===cash.snapshotMonth;
  return {month,current,previousMonth,previous:monthly(records,previousMonth),trend:Array.from({length:6},(_,i)=>{const m=offsetMonth(month,i-5);return {month:m,...monthly(records,m)};}),categories:[...categories.values()].sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label,'es')),pending,forecastExpense,cash};
 }
 return {monthly,entry,accountingDate,dashboard,category};
});
