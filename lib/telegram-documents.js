'use strict';
const {createHash,randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const documents=require('./finance-documents');
const fail=documents.fail;
function configuration(env=process.env){
 const token=env.TELEGRAM_DOCUMENTS_BOT_TOKEN||'',secret=env.TELEGRAM_DOCUMENTS_WEBHOOK_SECRET||'',username=env.TELEGRAM_DOCUMENTS_BOT_USERNAME||'';
 const botId=Number(token.split(':')[0]);
 const configured=positiveId(botId)&&/^\d{5,16}:[A-Za-z0-9_-]{20,100}$/.test(token)&&/^[A-Za-z0-9_-]{32,256}$/.test(secret)&&/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username);
 return {token,secret,username,botId:positiveId(botId)?botId:null,configured};
}
function verifySecret(received,expected){
 if(typeof received!=='string'||typeof expected!=='string'||expected.length<32||received.length>256)return false;
 const hash=value=>createHash('sha256').update(value).digest();
 return timingSafeEqual(hash(received),hash(expected));
}
function enabled(env=process.env){return env.FINANCE_V2==='true'&&env.FINANCE_V2_LIVE==='true'&&!!env.SUPABASE_SERVICE_KEY;}
function positiveId(value){return Number.isSafeInteger(value)&&value>0;}
function privateMessage(update){const m=update?.message;return m&&m.chat?.type==='private'&&positiveId(m.chat.id)&&positiveId(m.from?.id)&&m.chat.id===m.from.id&&!m.from.is_bot&&positiveId(m.message_id)?m:null;}
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';}
function hash(value){return createHash('sha256').update(value).digest('hex');}
function attachment(message){
 let file=message.document;
 if(!file&&Array.isArray(message.photo)&&message.photo.length&&message.photo.length<=20){file=[...message.photo].sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))[0];file={...file,file_name:'foto-telegram.jpg'};}
 if(!file)return null;
 if(typeof file.file_id!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(file.file_id))fail('Archivo de Telegram no válido');
 if(file.file_size!=null&&(!Number.isSafeInteger(file.file_size)||file.file_size<1||file.file_size>documents.MAX_BYTES))fail('El documento supera 10 MB o tiene un tamaño no válido');
 if(message.document&&(!/\.(pdf|jpe?g|png)$/i.test(file.file_name||'')||file.mime_type&&!['application/pdf','image/jpeg','image/png'].includes(file.mime_type)))fail('Envía una factura PDF, JPG o PNG de hasta 10 MB');
 return {id:file.file_id,name:file.file_name||'documento',size:file.file_size};
}
async function bounded(response,max){
 const declared=response.headers?.get('content-length');if(declared!==null&&declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>max))fail('La respuesta supera el tamaño permitido');
 const reader=response.body?.getReader();if(!reader)fail('No se pudo leer el archivo de Telegram',503);
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)fail('La respuesta supera el tamaño permitido');chunks.push(Buffer.from(value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
function createClient(config,fetcher=globalThis.fetch){
 async function request(url,options,max){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);timer.unref?.();
  try{const response=await fetcher(url,{...options,redirect:'error',signal:controller.signal});if(!response.ok)fail('Telegram no está disponible. Reintentaremos la recepción.',503);return await bounded(response,max);}
  catch(error){if(error.status)throw error;fail('No se pudo contactar con Telegram. Reintentaremos la recepción.',503);}finally{clearTimeout(timer);}
 }
 async function api(method,payload){
  if(!['getFile','sendMessage'].includes(method))fail('Operación de Telegram no válida');
  const raw=await request('https://api.telegram.org/bot'+config.token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},65536);
  let result;try{result=JSON.parse(raw.toString('utf8'));}catch(_){fail('Telegram devolvió una respuesta no válida',503);}
  if(!result.ok)fail('Telegram no pudo procesar la solicitud',503);return result.result;
 }
 async function download(file){
  const metadata=await api('getFile',{file_id:file.id});
  const path=metadata?.file_path;
  if(typeof path!=='string'||path.length>512||!/^[A-Za-z0-9_./-]+$/.test(path)||path.startsWith('/')||path.split('/').some(part=>!part||part==='.'||part==='..'))fail('Ruta de archivo de Telegram no válida');
  if(metadata.file_size!=null&&(!Number.isSafeInteger(metadata.file_size)||metadata.file_size<1||metadata.file_size>documents.MAX_BYTES))fail('El documento supera 10 MB');
  const buffer=await request('https://api.telegram.org/file/bot'+config.token+'/'+path,{method:'GET'},documents.MAX_BYTES);
  if(!buffer.length||(metadata.file_size!=null&&metadata.file_size!==buffer.length)||(file.size!=null&&file.size!==buffer.length))fail('El archivo recibido no coincide con su tamaño. Vuelve a enviarlo.');
  documents.inspect(buffer,file.name);return buffer;
 }
 return {download,reply:(chatId,text)=>api('sendMessage',{chat_id:chatId,text,disable_web_page_preview:true})};
}
function createReceiver({db,env=process.env,fetcher=globalThis.fetch,store=documents.createStore(db),client}){
 async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)fail('La recepción de Telegram no está disponible. Reintenta.',503);return data;}
 async function pair(botId,chatId){const {data,error}=await db.from('finance_telegram_pairs').select('*').eq('bot_id',botId).eq('chat_id',chatId).eq('active',true).maybeSingle();if(error)fail('No se pudo comprobar la vinculación de Telegram',503);return data;}
 async function activeUser(userId){
  let result;try{result=await db.auth.admin.getUserById(userId);}catch(_){fail('No se pudo comprobar la cuenta de VOCAI. Reintentaremos la recepción.',503);}
  if(result.error){if(result.error.status===404||result.error.code==='user_not_found')return false;fail('No se pudo comprobar la cuenta de VOCAI. Reintentaremos la recepción.',503);}
  const user=result.data?.user;return !!user&&!user.deleted_at&&!(user.banned_until&&Date.parse(user.banned_until)>Date.now());
 }
 async function receive(update){
  if(!enabled(env)||!configuration(env).configured)fail('La recepción de Telegram está desactivada',503);
  if(!update||typeof update!=='object'||Array.isArray(update)||!Number.isSafeInteger(update.update_id)||update.update_id<0)fail('Actualización de Telegram no válida');
  const message=privateMessage(update);if(!message)return {ok:true,ignored:true};
  const botId=configuration(env).botId,lease=randomUUID(),id=update.update_id,fingerprint=hash(canonical(update)),claimed=await rpc('finance_claim_telegram_update',{p_bot_id:botId,p_update_id:id,p_fingerprint:fingerprint,p_lease:lease});
  if(claimed?.state==='done')return {ok:true,duplicate:true};
  if(claimed?.state==='conflict')return {ok:true,ignored:true};
  if(claimed?.state!=='claimed')fail('Esta recepción se está procesando. Reintenta.',503);
  const telegram=client||createClient(configuration(env),fetcher);let outcome='ignored',documentId=null,reply='';
  try{
   const start=typeof message.text==='string'&&message.text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{32})$/);
   if(start){
    const linked=await rpc('finance_consume_telegram_code',{p_bot_id:botId,p_hash:hash(start[1]),p_chat_id:message.chat.id,p_user_id:message.from.id,p_update_id:id});
    const allowed=linked&&await activeUser(linked.user_id);
    outcome=allowed?'paired':'invalid_code';reply=allowed?'Telegram conectado con VOCAI. Envía tus facturas PDF, JPG o PNG. Se guardan para revisar; no se registra ningún pago.':'Ese código no es válido o ha caducado. Genera otro desde Documentos en VOCAI.';
   }else{
    const owner=await pair(botId,message.chat.id);
    if(!owner||Number(owner.telegram_user_id)!==message.from.id||!await activeUser(owner.user_id)){outcome='unpaired';reply='Conecta este chat desde Documentos en VOCAI antes de enviar facturas.';}
    else{
     const file=attachment(message);
     if(!file){outcome='unsupported';reply='Envía una factura PDF, JPG o PNG de hasta 10 MB. Después podrás revisarla en Documentos de VOCAI.';}
     else{
      const buffer=await telegram.download(file),current=await pair(botId,message.chat.id);
      if(!current||current.user_id!==owner.user_id||Number(current.telegram_user_id)!==message.from.id){outcome='unpaired';reply='Este chat ya no está conectado. Vuelve a vincularlo desde VOCAI.';}
      else{
       const saved=await store.ingest({buffer,name:file.name,source:'telegram',sourceKey:'telegram:'+botId+':'+id,notes:documents.caption(message.caption||''),actor:owner.actor});
       outcome=saved.duplicate?'duplicate':'received';documentId=saved.document.id;
       reply=saved.duplicate?'Este archivo ya está en Documentos de VOCAI. No se ha duplicado.':'Documento recibido en VOCAI. Revísalo en Documentos para crear el gasto o vincularlo a uno existente. No se ha registrado ningún pago.';
      }
     }
    }
   }
  }catch(error){
   if(error.status===400||error.status===409){outcome='rejected';reply=error.message;}
   else{try{await rpc('finance_release_telegram_update',{p_bot_id:botId,p_update_id:id,p_lease:lease});}catch(_){}throw error;}
  }
  const finished=await rpc('finance_finish_telegram_update',{p_bot_id:botId,p_update_id:id,p_lease:lease,p_outcome:outcome,p_document_id:documentId});
  if(!finished)fail('La recepción sigue en revisión. Reintenta.',503);
  // A notification failure must never undo an archived document or duplicate it.
  if(reply)try{await telegram.reply(message.chat.id,reply);}catch(_){}
  return {ok:true};
 }
 return {receive};
}
function newCode(){const code=randomBytes(24).toString('base64url');return {code,hash:hash(code)};}
module.exports={configuration,verifySecret,enabled,privateMessage,attachment,bounded,createClient,createReceiver,newCode};
