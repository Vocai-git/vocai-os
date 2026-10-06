'use strict';
// Mounted only after the parent finance router's authentication and live flags.
const express=require('express');
const multer=require('multer');
const {createHash,randomUUID}=require('node:crypto');
const {supabase}=require('../config/supabase');
const files=require('../lib/bank-file');
const engine=require('../public/js/finance-bank');
const router=express.Router(),TABLE='finance_bank_reviews',BUCKET='finance-bank-private';
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:files.LIMITS.bytes,files:1,fields:3,fieldSize:1024*1024}});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const fail=(message,status=400,details)=>{const e=new Error(message);e.status=status;if(details)e.details=details;throw e;};
const uuid=value=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||''))fail('Identificador no válido');return value;};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const month=value=>{if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))fail('Indica un mes válido');return value;};
function text(value,max,label){if(value==null)return '';if(typeof value!=='string'||value.length>max)fail(label+' no válido');return value.trim();}
function json(value,label){if(typeof value!=='string')fail(label+' no válido');try{return JSON.parse(value);}catch(e){fail(label+' no válido');}}
function balance(value){if(value==null)return null;if(!Number.isSafeInteger(value)||Math.abs(value)>1000000000000)fail('Saldo no válido; utiliza céntimos enteros');return value;}
function config(value){
 if(!object(value))fail('Configuración no válida');
 const result={month:month(value.month)};
 for(const [key,max] of [['sheet',29],['header',4999],['date',99],['description',99],['amount',99],['debit',99],['credit',99]]){
  const v=value[key]??(key==='sheet'||key==='header'?0:null);
  if(v===null&&['amount','debit','credit'].includes(key)){result[key]=null;continue;}
  if(!Number.isInteger(v)||v<0||v>max)fail('Columna o fila de configuración no válida: '+key);result[key]=v;
 }
 if(!['comma','dot'].includes(value.decimal)||!['dmy','mdy'].includes(value.dateOrder))fail('Formato de importes o fechas no válido');
 result.decimal=value.decimal;result.dateOrder=value.dateOrder;
 result.openingBalance=balance(value.openingBalance);result.closingBalance=balance(value.closingBalance);
 if(Object.hasOwn(value,'importErrorCount')){if(!Number.isInteger(value.importErrorCount)||value.importErrorCount<0||value.importErrorCount>5000)fail('Cantidad de errores de importación no válida');result.importErrorCount=value.importErrorCount;}
 return result;
}
function decisions(value){if(!Array.isArray(value)||value.length>5000)fail('Las correspondencias no son válidas');return value;}
async function ledger(){
 const records=[];
 for(let offset=0;;offset+=1000){const {data,error}=await supabase.from('finance_records').select('*').order('id').range(offset,offset+999);if(error)fail('No se pudieron consultar los movimientos de VOCAI',503);records.push(...data);if(data.length<1000)return records;}
}
async function review(id){const {data,error}=await supabase.from(TABLE).select('*').eq('id',uuid(id)).maybeSingle();if(error)fail('La revisión bancaria no está disponible. Comprueba su activación.',503);if(!data)fail('Revisión no encontrada',404);return data;}
async function duplicate(period,hash){const {data,error}=await supabase.from(TABLE).select('*').eq('month',period).eq('source_hash',hash).maybeSingle();if(error)fail('La revisión bancaria no está disponible. Comprueba su activación.',503);return data;}
async function response(row){return {review:row,comparison:engine.compare(row.rows,await ledger(),row.config,row.decisions)};}
async function original(row){
 let downloaded;try{downloaded=await supabase.storage.from(BUCKET).download(row.path);}catch(e){fail('No se pudo recuperar el extracto privado. Reintenta.',503);}
 const blob=downloaded?.data;
 if(downloaded?.error||!blob||!Number.isSafeInteger(blob.size)||blob.size<1||blob.size>files.LIMITS.bytes||typeof blob.arrayBuffer!=='function')fail('No se pudo recuperar un extracto privado válido de hasta 5 MB',503);
 let buffer;try{buffer=Buffer.from(await blob.arrayBuffer());}catch(e){fail('No se pudo leer el extracto privado. Reintenta.',503);}
 if(buffer.length!==blob.size||createHash('sha256').update(buffer).digest('hex')!==row.source_hash)fail('El extracto guardado no coincide con el archivo original. No se modificó la revisión.',409);
 return {filename:row.name,hash:row.source_hash,sheets:await files.parse(buffer,row.name)};
}
function uploaded(req){if(!req.file?.buffer?.length)fail('Selecciona un CSV o XLSX');return {buffer:req.file.buffer,name:req.file.originalname.split(/[\\/]/).pop().replace(/[\x00-\x1f]/g,'').slice(0,180),hash:createHash('sha256').update(req.file.buffer).digest('hex')};}
router.post('/parse',upload.single('file'),wrap(async(req,res)=>{
 const source=uploaded(req),sheets=await files.parse(source.buffer,source.name);res.json({filename:source.name,hash:source.hash,sheets});
}));
router.post('/compare',wrap(async(req,res)=>{
 if(!object(req.body)||!Array.isArray(req.body.rows)||req.body.rows.length>5000)fail('Filas no válidas');
 const options=config(req.body.config),links=decisions(req.body.decisions||[]);
 res.json(engine.compare(req.body.rows,await ledger(),options,links));
}));
router.get('/',wrap(async(req,res)=>{
 let query=supabase.from(TABLE).select('id,month,source_hash,name,version,actor,created_at,updated_at').order('updated_at',{ascending:false}).limit(50);
 if(req.query.month)query=query.eq('month',month(req.query.month));
 const {data,error}=await query;if(error)fail('La revisión bancaria no está disponible. Comprueba su activación.',503);res.json(data);
}));
router.get('/:id/file',wrap(async(req,res)=>{
 const existing=await review(req.params.id),signed=await supabase.storage.from(BUCKET).createSignedUrl(existing.path,60,{download:true});
 if(signed.error||!signed.data?.signedUrl)fail('No se pudo abrir el extracto privado',503);res.json({url:signed.data.signedUrl});
}));
router.get('/:id/columns',wrap(async(req,res)=>res.json(await original(await review(req.params.id)))));
router.post('/:id/remap',wrap(async(req,res)=>{
 if(!object(req.body)||Object.keys(req.body).some(key=>!['version','config'].includes(key)))fail('Solo se pueden cambiar las columnas y formatos del extracto');
 const existing=await review(req.params.id);if(!Number.isInteger(req.body.version)||req.body.version!==existing.version)fail('Otra persona modificó esta revisión. Recarga antes de continuar.',409);
 const options=config(req.body.config);if(options.month!==existing.month)fail('El nuevo mapeo debe conservar el mes de la revisión');
 const source=await original(existing),normalized=engine.normalize(source.sheets,options);
 if(normalized.errors.length)fail('Hay filas inválidas. Corrige las columnas antes de guardar.',400,normalized.errors);
 if(!normalized.rows.length)fail('No hay movimientos del mes seleccionado para guardar');
 options.importErrorCount=0;
 const comparison=engine.compare(normalized.rows,await ledger(),options,[]);
 const {data,error}=await supabase.from(TABLE).update({config:options,rows:normalized.rows,decisions:[],version:existing.version+1,actor:req.user.email||req.user.id,updated_at:new Date().toISOString()}).eq('id',existing.id).eq('version',existing.version).select('*').maybeSingle();
 if(error)fail('No se pudo guardar el nuevo mapeo',503);if(!data)fail('La revisión cambió mientras guardabas. Recarga antes de continuar.',409);
 res.json({review:data,comparison});
}));
router.get('/:id',wrap(async(req,res)=>res.json(await response(await review(req.params.id)))));
router.post('/',upload.single('file'),wrap(async(req,res)=>{
 const source=uploaded(req),options=config(json(req.body.config,'Configuración'));
 const sheets=await files.parse(source.buffer,source.name),normalized=engine.normalize(sheets,options);
 if(normalized.errors.length)fail('Hay filas inválidas. Corrige el archivo o las columnas antes de guardar.',400,normalized.errors);
 if(!normalized.rows.length)fail('No hay movimientos del mes seleccionado para guardar');
 options.importErrorCount=0;
 const previous=await duplicate(options.month,source.hash);
 if(previous)return res.json({...await response(previous),duplicate:true});
 const records=await ledger(),links=engine.validateDecisions(normalized.rows,records,options,decisions(req.body.decisions?json(req.body.decisions,'Correspondencias'):[]));
 const comparison=engine.compare(normalized.rows,records,options,links),id=randomUUID(),extension=source.name.toLowerCase().endsWith('.xlsx')?'xlsx':'csv',path='bank-reviews/'+id+'.'+extension;
 const row={id,month:options.month,source_hash:source.hash,name:source.name,path,config:options,rows:normalized.rows,decisions:links,notes:text(req.body.notes,4000,'Notas'),actor:req.user.email||req.user.id};
 const {error:storageError}=await supabase.storage.from(BUCKET).upload(path,source.buffer,{upsert:false,contentType:extension==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv'});
 if(storageError)fail('No se pudo guardar el extracto privado. Reintenta.',503);
 const {data,error}=await supabase.from(TABLE).insert(row).select('*').single();
 if(error){
  await supabase.storage.from(BUCKET).remove([path]);
  if(error.code==='23505'){const existing=await duplicate(options.month,source.hash);if(existing)return res.json({...await response(existing),duplicate:true});}
  fail('No se pudo guardar la revisión. El extracto no se vinculó.',503);
 }
 res.status(201).json({review:data,comparison,duplicate:false});
}));
router.put('/:id',wrap(async(req,res)=>{
 if(!object(req.body)||Object.keys(req.body).some(key=>!['version','decisions','notes','openingBalance','closingBalance'].includes(key)))fail('Solo se pueden cambiar correspondencias, notas y saldos del extracto');
 const existing=await review(req.params.id);if(!Number.isInteger(req.body.version)||req.body.version!==existing.version)fail('Otra persona modificó esta revisión. Recarga antes de continuar.',409);
 const options=config({...existing.config,...Object.fromEntries(['openingBalance','closingBalance'].filter(key=>Object.hasOwn(req.body,key)).map(key=>[key,balance(req.body[key])]))});
 const records=await ledger(),links=engine.validateDecisions(existing.rows,records,options,decisions(req.body.decisions??existing.decisions));
 const comparison=engine.compare(existing.rows,records,options,links),notes=Object.hasOwn(req.body,'notes')?text(req.body.notes,4000,'Notas'):existing.notes;
 const {data,error}=await supabase.from(TABLE).update({config:options,decisions:links,notes,version:existing.version+1,actor:req.user.email||req.user.id,updated_at:new Date().toISOString()}).eq('id',existing.id).eq('version',existing.version).select('*').maybeSingle();
 if(error)fail('No se pudo guardar la revisión',503);if(!data)fail('La revisión cambió mientras guardabas. Recarga antes de continuar.',409);
 res.json({review:data,comparison});
}));
router.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 const status=error instanceof multer.MulterError?400:error.code==='STALE_MATCH'?409:error.status||500;
 res.status(status).json({error:error instanceof multer.MulterError?'Adjunta un solo CSV o XLSX de hasta 5 MB':error.status||error.code==='STALE_MATCH'?error.message:'No se pudo completar la revisión bancaria',...(error.details?{details:error.details}:{})});
});
module.exports=router;
