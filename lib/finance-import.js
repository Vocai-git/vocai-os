'use strict';
const {createHash}=require('crypto');
function stableId(key){const h=createHash('sha256').update(key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
function integrate(history,opening,rules){
 const result=structuredClone(opening);result.records=result.records.filter(r=>!r.origin_key?.startsWith('legacy:'));
 const targets=new Map(result.records.map(r=>[r.id,r]));const coverage=[];const consumed=new Set();const usedTargets=new Set();
 for(const table of ['expenses','invoices'])for(const source of history[table]){
  const key=table+':'+source.id,rule=rules[key];if(!rule)throw new Error('Missing reviewed rule: '+key);
  if(consumed.has(key))throw new Error('Duplicate source: '+key);consumed.add(key);
  const original=structuredClone(source),kind=table==='expenses'?'expense':'income';
  const provenance={table,id:source.id,original};
  if(rule.target){if(usedTargets.has(rule.target))throw new Error('Reviewed target used twice');usedTargets.add(rule.target);const target=targets.get(rule.target);if(!target)throw new Error('Unknown reviewed target');target.data.history={...(target.data.history||{}),status:'reviewed',sources:[provenance],basis:'confirmed'};coverage.push({source:key,target:target.id,status:'linked'});continue;}
  if(!['paid','assigned','duplicate','draft','review'].includes(rule.status))throw new Error('Invalid reviewed status');
  const amount=Math.round(Number(source.total??source.importe)*100);if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('Invalid source amount: '+key);
  const data={kind,title:source.nombre||source.concepto||'Sin concepto',amount,date:source.fecha,party:source.cliente_nombre||'',number:source.numero||'',category:source.categoria||'',notes:source.notas||'',repeat:'none',payments:[],...rule.data,
   history:{status:rule.status,account:rule.account||null,classification:rule.classification||'operating',basis:'registered_month',reason:rule.reason||'',sources:[provenance],duplicate_of:rule.duplicate_of||null}};
  const record={id:stableId('legacy:'+key),version:1,voided:false,included_in_opening:true,origin_key:'legacy:'+key,actor:'Importación revisada',data};
  result.records.push(record);coverage.push({source:key,target:record.id,status:rule.status});
 }
 const expected=history.expenses.length+history.invoices.length;if(coverage.length!==expected)throw new Error('Incomplete coverage');
 result.baseline.history_import={count:expected,expenses:history.expenses.length,invoices:history.invoices.length,through:result.baseline.cutoff,method:'Correcciones confirmadas y mes registrado cuando no consta la fecha efectiva del pago.'};
 result.coverage=coverage;return result;
}
module.exports={integrate,stableId};
