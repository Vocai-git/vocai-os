'use strict';
// Parent finance router authenticates requests before mounting this router.
const express=require('express'),multer=require('multer');
const {supabase}=require('../config/supabase');
const docs=require('../lib/finance-documents'),telegram=require('../lib/telegram-documents');
const finance=require('../lib/finance');
const router=express.Router(),store=docs.createStore(supabase),fail=docs.fail;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:docs.MAX_BYTES,files:1,fields:1,fieldSize:8000}});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const actor=req=>req.user.email||req.user.id;
router.use((req,res,next)=>{
 if(!req.user)return res.status(401).json({error:'Sesión requerida'});
 if(process.env.FINANCE_V2!=='true'||!process.env.SUPABASE_SERVICE_KEY)return res.status(503).json({error:'La bandeja de documentos está pendiente de activar'});
 if(!['GET','HEAD'].includes(req.method)&&process.env.FINANCE_V2_LIVE!=='true')return res.status(409).json({error:'Finanzas está en revisión. La recepción está desactivada.'});
 next();
});
router.get('/telegram',wrap(async(req,res)=>{
 const settings=telegram.configuration();
 if(!settings.botId)return res.json({configured:false,botUsername:null,pairing:null});
 const {data,error}=await supabase.from('finance_telegram_pairs').select('chat_id,created_at,updated_at').eq('bot_id',settings.botId).eq('user_id',req.user.id).eq('active',true).maybeSingle();
 if(error)fail('La conexión con Telegram está pendiente de activar',503);
 res.json({configured:settings.configured,botUsername:settings.configured?settings.username:null,pairing:data?{chatId:Number(data.chat_id),connectedAt:data.updated_at||data.created_at}:null});
}));
router.post('/telegram/code',wrap(async(req,res)=>{
 const settings=telegram.configuration();if(!settings.configured)fail('El bot de documentos está pendiente de configurar',503);
 const generated=telegram.newCode(),{data,error}=await supabase.rpc('finance_issue_telegram_code',{p_bot_id:settings.botId,p_hash:generated.hash,p_user_id:docs.uuid(req.user.id),p_actor:actor(req)});
 if(error||!data)fail('No se pudo generar el código de conexión',503);
 res.json({code:generated.code,expiresAt:data,url:'https://t.me/'+settings.username+'?start='+generated.code});
}));
router.delete('/telegram',wrap(async(req,res)=>{
 const settings=telegram.configuration();if(!settings.botId)fail('No hay un bot configurado para desconectar',503);
 const {error}=await supabase.rpc('finance_disconnect_telegram',{p_bot_id:settings.botId,p_user_id:docs.uuid(req.user.id),p_actor:actor(req)});
 if(error)fail('No se pudo desconectar Telegram',503);res.json({disconnected:true});
}));
router.get('/',wrap(async(req,res)=>{
 const status=req.query.status||'pending',source=req.query.source||'all';
 if(!['pending','linked','archived','all'].includes(status)||!['manual','telegram','all'].includes(source))fail('Filtro de documentos no válido');
 const integer=(v,defaultValue,max)=>{if(v==null)return defaultValue;if(typeof v!=='string'||!/^\d+$/.test(v)||Number(v)>max)fail('Paginación no válida');return Number(v);};
 const offset=integer(req.query.offset,0,100000),limit=integer(req.query.limit,50,100);if(limit<1)fail('Paginación no válida');
 let query=supabase.from(docs.TABLE).select(docs.PUBLIC_FIELDS.join(','),{count:'exact'}).order('created_at',{ascending:false}).order('id').range(offset,offset+limit-1);
 if(status!=='all')query=query.eq('status',status);if(source!=='all')query=query.eq('source',source);
 const {data,error,count}=await query;if(error)fail('La bandeja de documentos no está disponible',503);
 res.json({documents:(data||[]).map(docs.publicDocument),total:count??(data||[]).length});
}));
router.post('/',upload.single('file'),wrap(async(req,res)=>{
 if(!req.file)fail('Selecciona un PDF, JPG o PNG');
 if(Object.keys(req.body||{}).some(key=>key!=='caption'))fail('Campos de recepción no válidos');
 const result=await store.ingest({buffer:req.file.buffer,name:req.file.originalname,notes:req.body.caption,actor:actor(req)});
 res.status(result.duplicate?200:201).json(result);
}));
router.get('/:id/file',wrap(async(req,res)=>{
 const document=await store.get(req.params.id),{data,error}=await supabase.storage.from(docs.BUCKET).createSignedUrl(document.path,60,{download:true});
 if(error||!data?.signedUrl)fail('No se pudo abrir el documento privado',503);res.json({url:data.signedUrl});
}));
router.get('/:id/audit',wrap(async(req,res)=>{
 const document=await store.get(req.params.id),{data,error}=await supabase.from('finance_documents_audit').select('actor,before_row,after_row,at').eq('document_id',document.id).order('id',{ascending:false}).limit(100);
 if(error)fail('No se pudo consultar el historial del documento',503);
 res.json({audit:(data||[]).map(item=>({actor:item.actor,at:item.at,before:item.before_row?docs.publicDocument(item.before_row):null,after:docs.publicDocument(item.after_row)}))});
}));
router.get('/:id',wrap(async(req,res)=>res.json({document:docs.publicDocument(await store.get(req.params.id))})));
router.post('/:id/link',wrap(async(req,res)=>{
 const body=req.body;if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['version','recordId'].includes(key)))fail('Datos de enlace no válidos');
 res.json(await store.link(req.params.id,body.recordId,body.version,actor(req)));
}));
router.post('/:id/record',wrap(async(req,res)=>{
 const body=req.body;if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['version','data'].includes(key)))fail('Datos de creación no válidos');
 const id=docs.uuid(req.params.id);if(!Number.isInteger(body.version)||body.version<1)fail('Versión no válida');
 const baseline=await supabase.from('finance_settings').select('baseline').eq('id',true).single();
 if(baseline.error||!baseline.data?.baseline?.cutoff)fail('No se pudo consultar el cierre de Finanzas',503);
 const validated=finance.validate(body.data,baseline.data.baseline.cutoff);
 if(!['expense','income'].includes(validated.kind))fail('Solo se puede crear un ingreso o gasto desde un documento');
 const {data,error}=await supabase.rpc('finance_create_document_record',{p_document_id:id,p_version:body.version,p_data:validated,p_actor:actor(req)});
 if(error){if(error.code==='P0001')fail(error.message,409);if(error.code==='23505')fail('Ya existe una factura con ese número. Vincula el documento al movimiento existente.',409);fail('No se pudo confirmar la creación. Reintenta el mismo documento sin cambiar los campos.',503);}
 if(!data?.document||!data?.record||!data?.file)fail('No se pudo confirmar la creación. Reintenta.',503);
 res.json({document:docs.publicDocument(data.document),record:data.record,file:Object.fromEntries(['id','record_id','name','mime','bytes','created_at'].map(key=>[key,data.file[key]]))});
}));
router.put('/:id',wrap(async(req,res)=>{
 const body=req.body;if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['version','status','caption'].includes(key)))fail('Solo se puede cambiar el estado o la nota del documento');
 const existing=await store.get(req.params.id);
 if(!Number.isInteger(body.version)||body.version!==existing.version)fail('El documento cambió. Recarga antes de continuar.',409);
 const status=body.status??existing.status;
 if(body.status!==undefined&&(!['pending','archived'].includes(status)||existing.status==='linked'))fail('Un documento vinculado se conserva con su movimiento; no puede volver a la bandeja',409);
 const note=body.caption===undefined?existing.caption:docs.caption(body.caption);
 const {data,error}=await supabase.from(docs.TABLE).update({status,caption:note,version:existing.version+1,actor:actor(req),updated_at:new Date().toISOString()}).eq('id',existing.id).eq('version',existing.version).select('*').maybeSingle();
 if(error)fail('No se pudo actualizar el documento',503);if(!data)fail('Otra persona modificó el documento. Recarga antes de continuar.',409);
 res.json({document:docs.publicDocument(data)});
}));
router.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 res.status(error instanceof multer.MulterError?400:error.status||500).json({error:error instanceof multer.MulterError?'Adjunta un solo PDF, JPG o PNG de hasta 10 MB':error.status?error.message:'No se pudo procesar el documento'});
});
module.exports=router;
