'use strict';
const {createHash,randomUUID}=require('node:crypto');
const MAX_BYTES=10*1024*1024,BUCKET='finance-private',TABLE='finance_documents';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_FIELDS=['id','draft_record_id','version','name','mime','bytes','source','status','caption','record_id','file_id','created_at','updated_at'];
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function uuid(value){if(typeof value!=='string'||!UUID.test(value))fail('Identificador no válido');return value;}
function caption(value){if(value==null)return '';if(typeof value!=='string'||value.length>2000)fail('La nota debe tener como máximo 2000 caracteres');return value.trim();}
function publicDocument(row){return Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,row[key]??null]));}
function inspect(buffer,name='documento'){
 if(!Buffer.isBuffer(buffer)||!buffer.length)fail('Selecciona un documento con contenido');
 if(buffer.length>MAX_BYTES)fail('El documento supera 10 MB');
 const mime=buffer.subarray(0,5).toString()==='%PDF-'?'application/pdf':buffer.length>3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255?'image/jpeg':buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':null;
 if(!mime)fail('Solo se admiten archivos PDF, JPG o PNG reales');
 const extension=mime==='application/pdf'?'pdf':mime==='image/jpeg'?'jpg':'png';
 const clean=String(name).split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,180)||'documento.'+extension;
 return {name:clean,mime,extension,bytes:buffer.length,hash:createHash('sha256').update(buffer).digest('hex')};
}
function createStore(db){
 async function find(field,value){const {data,error}=await db.from(TABLE).select('*').eq(field,value).maybeSingle();if(error)fail('La bandeja de documentos no está disponible',503);return data;}
 async function get(id){const row=await find('id',uuid(id));if(!row)fail('Documento no encontrado',404);return row;}
 async function removePrivate(path){try{await db.storage.from(BUCKET).remove([path]);}catch(_){/* Retain a private orphan if storage cleanup is temporarily unavailable. */}}
 async function ingest({buffer,name,source='manual',sourceKey=null,notes='',actor}){
  if(!['manual','telegram'].includes(source)||typeof actor!=='string'||!actor.trim())fail('Origen del documento no válido');
  if(sourceKey!==null&&(source!=='telegram'||!/^telegram:\d{1,16}:\d{1,16}$/.test(sourceKey)))fail('Referencia de recepción no válida');
  const file=inspect(buffer,name),note=caption(notes);
  const prior=(sourceKey?await find('source_key',sourceKey):null)||await find('hash',file.hash);
  if(prior){if(sourceKey&&prior.source_key===sourceKey&&prior.hash!==file.hash)fail('La recepción ya corresponde a otro archivo',409);return {document:publicDocument(prior),duplicate:true};}
  const id=randomUUID(),path='inbox/'+id+'.'+file.extension,row={id,draft_record_id:randomUUID(),hash:file.hash,path,name:file.name,mime:file.mime,bytes:file.bytes,source,source_key:sourceKey,caption:note,status:'pending',actor};
  let stored;try{stored=await db.storage.from(BUCKET).upload(path,buffer,{upsert:false,contentType:file.mime});}catch(_){fail('No se pudo guardar el documento privado. Reintenta.',503);}
  if(stored.error)fail('No se pudo guardar el documento privado. Reintenta.',503);
  let inserted;try{inserted=await db.from(TABLE).insert(row).select('*').single();}catch(_){inserted={error:{}};}
  if(!inserted.error&&inserted.data)return {document:publicDocument(inserted.data),duplicate:false};
  // A lost HTTP response may hide a committed insert. Query first; never delete
  // an object that a successful transaction could already reference.
  let recovered;try{recovered=(sourceKey?await find('source_key',sourceKey):null)||await find('hash',file.hash);}catch(_){fail('No se pudo confirmar la recepción. Reintenta el mismo archivo.',503);}
  if(recovered){
   if(recovered.path!==path)await removePrivate(path);
   if(recovered.hash!==file.hash)fail('La recepción ya corresponde a otro archivo',409);
   return {document:publicDocument(recovered),duplicate:recovered.id!==id};
  }
  if(inserted.error?.code&&/^\d{5}$/.test(inserted.error.code))await removePrivate(path);
  fail('No se pudo confirmar la recepción. Reintenta el mismo archivo.',503);
 }
 async function link(id,recordId,version,actor){
  uuid(id);uuid(recordId);if(!Number.isInteger(version)||version<1)fail('Versión no válida');
  const {data,error}=await db.rpc('finance_link_document',{p_document_id:id,p_record_id:recordId,p_version:version,p_actor:actor});
  if(error){if(error.code==='P0001')fail(error.message,409);fail('No se pudo vincular el documento. Puedes reintentar sin crear otro movimiento.',503);}
  if(!data?.document||!data?.file)fail('No se pudo confirmar el enlace. Reintenta.',503);
  return {document:publicDocument(data.document),file:Object.fromEntries(['id','record_id','name','mime','bytes','created_at'].map(key=>[key,data.file[key]]))};
 }
 return {find,get,ingest,link};
}
module.exports={MAX_BYTES,BUCKET,TABLE,PUBLIC_FIELDS,uuid,caption,publicDocument,inspect,createStore,fail};
