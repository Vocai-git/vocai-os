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
  const d=row.data,h=d.history||{},payments=(d.payments||[]).map(p=>({...p,estimated:false}));
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
 return {monthly,entry,accountingDate};
});
