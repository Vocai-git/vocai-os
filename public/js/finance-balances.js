/* Evidence for the operating balance owed by the company to Santiago.
 * Historical evidence explains the opening balance; it never posts it again.
 * Amounts are integer cents and all returned rows are display-only copies.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FinanceBalances=factory();})(typeof window==='undefined'?this:window,function(){
 'use strict';
 const EXCLUDED=['review','draft','duplicate'];
 const STEP_DEFS=[['expenses','Gastos pagados por Santiago',1],['receipts','Cobros recibidos por Santiago',-1],['assigned','Ingresos asignados a Santiago',-1],['advances','Adelantos a VOCAI',1],['refunds','Devoluciones de VOCAI',-1]];
 const bucket=()=>({items:[],total:0});
 function groups(assigned){const value={expenses:bucket(),receipts:bucket(),advances:bucket(),refunds:bucket()};if(assigned)value.assigned=bucket();return value;}
 function period(data){
  if(data.history?.accounting_month)return data.history.accounting_month.slice(0,7);
  if(data.period_start&&data.period_end&&data.period_start.slice(0,7)===data.period_end.slice(0,7))return data.period_start.slice(0,7);
  return null;
 }
 function add(target,row,amount,date,estimated,basis,paymentId){
  if(!amount)return;
  const d=row.data;
  target.items.push({id:row.id,title:d.title||'',amount,date:date?(estimated?date.slice(0,7):date):null,estimated,basis,period:period(d),period_start:d.period_start||null,period_end:d.period_end||null,paymentId:paymentId||null});
  target.total+=amount;
 }
 function net(value){return value.expenses.total-value.receipts.total-(value.assigned?.total||0)+value.advances.total-value.refunds.total;}
 function reconcile(actual,expected){return {reconstructed:actual,expected:Number.isFinite(expected)?expected:null,gap:Number.isFinite(expected)?expected-actual:null,verified:Number.isFinite(expected)&&expected===actual};}
 function evidence(records,baseline,summary){
  baseline=baseline||{};summary=summary||{};
  const opening=groups(true),changes=groups(false),gaps=[];
  for(const row of records){
   if(row.voided)continue;
   const d=row.data,h=d.history||{},isOpening=!!row.included_in_opening,target=isOpening?opening:changes;
   if(EXCLUDED.includes(h.status)||h.classification==='startup')continue;
   if(d.kind==='transfer'){
    if(d.source==='santi'&&['bank','cash'].includes(d.target))add(target.advances,row,d.amount,d.date,false,'transfer');
    if(d.target==='santi'&&['bank','cash'].includes(d.source))add(target.refunds,row,d.amount,d.date,false,'transfer');
    continue;
   }
   if(!['expense','income'].includes(d.kind))continue;
   if(isOpening&&d.kind==='income'&&h.status==='assigned'){
    if(h.account==='santi')add(opening.assigned,row,d.amount,period(d)||d.date,true,'assignment_period');
    // Personal collection of an already assigned invoice is not a second
    // repayment of the same operating advance.
    continue;
   }
   const destination=d.kind==='expense'?target.expenses:target.receipts;
   const payments=d.payments||[];
   const registeredPaymentDate=isOpening&&h.payment_date_basis==='registered_month';
   for(const p of payments)if(p.account==='santi')add(destination,row,p.amount,p.date,registeredPaymentDate,registeredPaymentDate?'registered_month':'payment',p.id);
   if(isOpening&&h.status==='paid'&&h.account==='santi'&&!payments.length)add(destination,row,d.amount,d.date,true,'registered_month');
  }
  for(const group of [opening,changes])for(const value of Object.values(group))value.items.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||String(a.id).localeCompare(String(b.id)));
  const openingCheck=reconcile(net(opening),baseline.operating?.santi);
  Object.assign(opening,openingCheck);
  changes.total=net(changes);
  const totals=groups(true);
  for(const [key] of STEP_DEFS){
   totals[key].items=[...opening[key].items,...(changes[key]?.items||[])];
   totals[key].total=opening[key].total+(changes[key]?.total||0);
  }
  const current=reconcile(opening.reconstructed+changes.total,summary.operating?.santi);
  current.fromBaseline=opening.expected===null?null:opening.expected+changes.total;
  current.ledgerGap=current.expected===null||current.fromBaseline===null?null:current.expected-current.fromBaseline;
  if(!opening.verified)gaps.push({scope:'opening',amount:opening.gap,message:opening.expected===null?'Falta el saldo guardado de la apertura.':'La apertura guardada no coincide con los movimientos disponibles.'});
  if(Number.isFinite(baseline.ana_assigned)&&baseline.ana_assigned!==opening.assigned.total)gaps.push({scope:'assigned',amount:baseline.ana_assigned-opening.assigned.total,message:'Los ingresos asignados disponibles no explican toda la compensación guardada.'});
  if(!current.verified)gaps.push({scope:'current',amount:current.gap,message:current.expected===null?'Falta el saldo actual guardado.':'El saldo actual no coincide con la evidencia disponible.'});
  let after=0;
  const steps=STEP_DEFS.map(([key,label,sign])=>{after+=sign*totals[key].total;return {key,label,sign,amount:totals[key].total,items:totals[key].items,after};});
  return {opening,changes,totals,current,gaps,steps};
 }
 return {evidence};
});
