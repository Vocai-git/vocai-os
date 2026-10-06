'use strict';
// Synthetic services for local HTTP tests and visual QA; no production data.
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
function createDocumentsMock(){
const clone=value=>structuredClone(value),hash=value=>createHash('sha256').update(value).digest('hex');
const user={id:'24daf977-fcae-4cd8-943f-a09080de042f',email:'documents@example.invalid'};
const tables=Object.fromEntries(['finance_documents','finance_documents_audit','finance_telegram_codes','finance_telegram_pairs','finance_telegram_pair_audit','finance_telegram_updates','finance_files','finance_records','finance_settings'].map(name=>[name,[]]));
const stored=new Map(),remoteFiles=new Map(),calls=[];
const state={financialWrites:0,recordCreates:0,storageFailure:false,insertFailure:false,ownerDisabled:false,ownerAuthFailure:false};
function mutable(table){if(['finance_records','finance_settings','finance_audit'].includes(table)){state.financialWrites++;throw new Error('Document intake must never write financial data');}}
function audit(table,before,after){
 const target=table==='finance_documents'?'finance_documents_audit':table==='finance_telegram_pairs'?'finance_telegram_pair_audit':null;
 if(target)tables[target].push({id:tables[target].length+1,actor:after.actor,before_row:clone(before),after_row:clone(after),at:new Date().toISOString(),...(table==='finance_documents'?{document_id:after.id}:{chat_id:after.chat_id})});
}
function updateRow(table,row,patch){mutable(table);const before=clone(row);Object.assign(row,clone(patch));audit(table,before,row);return row;}
function insertRow(table,payload){
 mutable(table);const now=new Date().toISOString();
 const row={id:randomUUID(),created_at:now,updated_at:now,...(table==='finance_documents'?{draft_record_id:randomUUID(),version:1,status:'pending',record_id:null,file_id:null,caption:''}:{}),...clone(payload)};
 const collision=tables[table].some(r=>r.id===row.id||(table==='finance_documents'&&(r.hash===row.hash||r.path===row.path||row.source_key&&r.source_key===row.source_key))||(table==='finance_files'&&r.path===row.path));
 if(collision)return {data:null,error:{code:'23505',message:'Duplicate synthetic object'}};
 tables[table].push(row);audit(table,null,row);return {data:row,error:null};
}
function from(table){
 assert.ok(tables[table],'Unexpected table '+table);
 let action='select',payload,filters=[],sorts=[],start=0,end=Infinity,single=false,optional=false,columns='*',count=false,head=false;
 const q={
  select(value='*',options={}){columns=value;count=!!options.count;head=!!options.head;return q;},
  eq(key,value){filters.push(row=>row[key]===value);return q;},neq(key,value){filters.push(row=>row[key]!==value);return q;},
  is(key,value){filters.push(row=>(row[key]??null)===value);return q;},in(key,values){filters.push(row=>values.includes(row[key]));return q;},
  lt(key,value){filters.push(row=>row[key]<value);return q;},lte(key,value){filters.push(row=>row[key]<=value);return q;},
  gt(key,value){filters.push(row=>row[key]>value);return q;},gte(key,value){filters.push(row=>row[key]>=value);return q;},
  order(key,options={}){sorts.push([key,options.ascending!==false]);return q;},range(a,b){start=a;end=b;return q;},limit(n){end=start+n-1;return q;},
  insert(value){action='insert';payload=value;return q;},update(value){action='update';payload=value;return q;},delete(){action='delete';return q;},
  single(){single=true;return q;},maybeSingle(){single=true;optional=true;return q;},
  then(resolve,reject){return Promise.resolve().then(()=>{
   let selected;
   if(action==='insert'){
    if(state.insertFailure&&table==='finance_documents')return {data:null,error:{code:'23514',message:'Synthetic insert failure'}};
    const inserted=insertRow(table,payload);if(inserted.error)return inserted;selected=[inserted.data];
   }else{
    selected=tables[table].filter(row=>filters.every(match=>match(row)));
    if(action==='update')selected.forEach(row=>updateRow(table,row,payload));
    if(action==='delete'){mutable(table);tables[table]=tables[table].filter(row=>!selected.includes(row));}
   }
   const total=selected.length;
   if(sorts.length)selected=[...selected].sort((a,b)=>{for(const [key,asc]of sorts){const difference=String(a[key]).localeCompare(String(b[key]));if(difference)return difference*(asc?1:-1);}return 0;});
   selected=selected.slice(start,end+1).map(row=>columns==='*'?clone(row):Object.fromEntries(columns.split(',').map(key=>[key,row[key]])));
   if(single&&!optional&&!selected.length)return {data:null,error:{code:'PGRST116'}};
   return {data:head?null:single?selected[0]||null:selected,error:null,...(count?{count:total}:{})};
  }).then(resolve,reject);}
 };return q;
}
async function rpc(name,p){
 calls.push({rpc:name});const now=new Date().toISOString();
 if(name==='finance_issue_telegram_code'){
  tables.finance_telegram_codes.filter(c=>c.bot_id===p.p_bot_id&&c.user_id===p.p_user_id&&!c.used_at).forEach(c=>c.used_at=now);
  const expires_at=new Date(Date.now()+600000).toISOString();tables.finance_telegram_codes.push({bot_id:p.p_bot_id,hash:p.p_hash,user_id:p.p_user_id,actor:p.p_actor,expires_at,used_at:null});return {data:expires_at,error:null};
 }
 if(name==='finance_consume_telegram_code'){
  const c=tables.finance_telegram_codes.find(c=>c.bot_id===p.p_bot_id&&c.hash===p.p_hash),existing=tables.finance_telegram_pairs.find(pair=>pair.bot_id===p.p_bot_id&&pair.chat_id===p.p_chat_id);
  if(!c||p.p_chat_id!==p.p_user_id||p.p_chat_id<=0||c.expires_at<=now||c.used_at&&(c.consumed_update_id!==p.p_update_id||c.consumed_chat_id!==p.p_chat_id)||existing?.active&&existing.user_id!==c.user_id)return {data:null,error:null};
  tables.finance_telegram_pairs.filter(pair=>pair.bot_id===p.p_bot_id&&pair.user_id===c.user_id&&pair.active&&pair.chat_id!==p.p_chat_id).forEach(pair=>updateRow('finance_telegram_pairs',pair,{active:false,updated_at:now}));
  const value={bot_id:p.p_bot_id,chat_id:p.p_chat_id,telegram_user_id:p.p_user_id,user_id:c.user_id,actor:c.actor,active:true,updated_at:now};
  const pair=existing?updateRow('finance_telegram_pairs',existing,value):insertRow('finance_telegram_pairs',value).data;
  Object.assign(c,{used_at:now,consumed_update_id:p.p_update_id,consumed_chat_id:p.p_chat_id});return {data:clone(pair),error:null};
 }
 if(name==='finance_claim_telegram_update'){
  let row=tables.finance_telegram_updates.find(r=>r.bot_id===p.p_bot_id&&r.update_id===p.p_update_id);
  if(!row){row={bot_id:p.p_bot_id,update_id:p.p_update_id,fingerprint:p.p_fingerprint,state:'processing',lease:p.p_lease,locked_until:new Date(Date.now()+120000).toISOString()};tables.finance_telegram_updates.push(row);}
  if(row.fingerprint!==p.p_fingerprint)return {data:{state:'conflict'},error:null};
  if(row.state==='done')return {data:{state:'done',document_id:row.document_id,outcome:row.outcome},error:null};
  if(row.lease!==p.p_lease&&row.locked_until>now)return {data:{state:'busy'},error:null};
  Object.assign(row,{lease:p.p_lease,locked_until:new Date(Date.now()+120000).toISOString()});return {data:{state:'claimed'},error:null};
 }
 if(['finance_finish_telegram_update','finance_release_telegram_update'].includes(name)){
  const row=tables.finance_telegram_updates.find(r=>r.bot_id===p.p_bot_id&&r.update_id===p.p_update_id&&r.lease===p.p_lease&&r.state==='processing');
  if(row)Object.assign(row,name==='finance_finish_telegram_update'?{state:'done',outcome:p.p_outcome,document_id:p.p_document_id}:{locked_until:now});
  return {data:!!row,error:null};
 }
 if(name==='finance_disconnect_telegram'){
  tables.finance_telegram_pairs.filter(pair=>pair.bot_id===p.p_bot_id&&pair.user_id===p.p_user_id&&pair.active).forEach(pair=>updateRow('finance_telegram_pairs',pair,{active:false,actor:p.p_actor,updated_at:now}));
  tables.finance_telegram_codes.filter(code=>code.bot_id===p.p_bot_id&&code.user_id===p.p_user_id&&!code.used_at).forEach(code=>code.used_at=now);return {data:true,error:null};
 }
 if(name==='finance_create_document_record'){
  const doc=tables.finance_documents.find(doc=>doc.id===p.p_document_id),error=message=>({data:null,error:{code:'P0001',message}});
  if(!doc||!['income','expense'].includes(p.p_data.kind))return error('Documento no válido');
  let record=tables.finance_records.find(record=>record.id===doc.draft_record_id);
  if(doc.status==='linked'&&(doc.record_id!==doc.draft_record_id||!record||record.voided||JSON.stringify(record.data)!==JSON.stringify(p.p_data)))return error('El documento ya está vinculado');
  if(doc.status!=='linked'&&(doc.status!=='pending'||doc.version!==p.p_version))return error('El documento cambió');
  if(record&&(record.voided||JSON.stringify(record.data)!==JSON.stringify(p.p_data)))return error('Ya existe un movimiento para este documento');
  if(!record){record={id:doc.draft_record_id,version:1,voided:false,included_in_opening:false,data:clone(p.p_data),actor:p.p_actor,created_at:now};tables.finance_records.push(record);state.recordCreates++;}
  const linked=await rpc('finance_link_document',{p_document_id:doc.id,p_record_id:record.id,p_version:doc.version,p_actor:p.p_actor});
  return linked.error?linked:{data:{...linked.data,record:clone(record)},error:null};
 }
 if(name==='finance_link_document'){
  const doc=tables.finance_documents.find(d=>d.id===p.p_document_id),record=tables.finance_records.find(r=>r.id===p.p_record_id);
  const error=message=>({data:null,error:{code:'P0001',message}});
  if(!doc)return error('Documento no encontrado');
  if(doc.status==='linked')return doc.record_id===p.p_record_id?{data:{document:clone(doc),file:clone(tables.finance_files.find(f=>f.id===doc.file_id))},error:null}:error('El documento ya está vinculado a otro movimiento');
  if(doc.version!==p.p_version||doc.status!=='pending')return error('El documento cambió. Recarga antes de vincular');
  if(!record||record.voided||!['income','expense'].includes(record.data.kind))return error('Selecciona un ingreso o gasto existente y no anulado');
  const file=insertRow('finance_files',{id:randomUUID(),record_id:record.id,path:doc.path,name:doc.name,mime:doc.mime,bytes:doc.bytes,actor:p.p_actor}).data;
  updateRow('finance_documents',doc,{status:'linked',record_id:record.id,file_id:file.id,version:doc.version+1,actor:p.p_actor,updated_at:now});
  return {data:{document:clone(doc),file:clone(file)},error:null};
 }
 throw new Error('Unexpected RPC '+name);
}
const supabase={from,rpc,auth:{getUser:async token=>{calls.push({auth:token});return {data:{user:token==='documents-test-session'?user:null},error:null};},admin:{getUserById:async id=>{calls.push({owner:id});return state.ownerAuthFailure?{data:null,error:{status:503,message:'Synthetic auth outage'}}:{data:{user:id===user.id&&!state.ownerDisabled?user:null},error:null};}}},storage:{from:bucket=>({
 upload:async(path,buffer,options)=>{calls.push({upload:path,bucket});if(state.storageFailure)return {error:{message:'Synthetic storage outage'}};const key=bucket+'/'+path;if(stored.has(key))return {error:{message:'Object already exists'}};stored.set(key,{buffer:Buffer.from(buffer),options});return {error:null};},
 remove:async paths=>{calls.push({remove:paths,bucket});paths.forEach(path=>stored.delete(bucket+'/'+path));return {error:null};},
 createSignedUrl:async(path,seconds,options)=>{calls.push({signed:path,bucket,seconds,options});return stored.has(bucket+'/'+path)?{data:{signedUrl:'https://example.invalid/private-document?expires='+seconds},error:null}:{data:null,error:{message:'Missing'}};}
})}};
return {supabase,tables,stored,remoteFiles,calls,user,state};
}
module.exports={createDocumentsMock};
