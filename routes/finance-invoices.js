'use strict';
// Mounted by the authenticated finance router. Drafts never create movements.
const express=require('express'),{randomUUID}=require('node:crypto'),{isDeepStrictEqual}=require('node:util');
const {supabase}=require('../config/supabase'),invoice=require('../lib/finance-invoices');
const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const actor=req=>req.user.email||req.user.id;
const fail=invoice.fail;
router.use((req,res,next)=>{
 if(!req.user)return res.status(401).json({error:'Sesión requerida'});
 if(process.env.FINANCE_V2!=='true'||!process.env.SUPABASE_SERVICE_KEY)return res.status(503).json({error:'La emisión de facturas está pendiente de activar'});
 if(!['GET','HEAD'].includes(req.method)&&process.env.FINANCE_V2_LIVE!=='true')return res.status(409).json({error:'Finanzas está en revisión. No se pueden guardar ni emitir facturas.'});
 next();
});
async function find(id){const {data,error}=await supabase.from('finance_invoices').select('*').eq('id',invoice.uuid(id)).maybeSingle();if(error)fail('La sección de facturas está pendiente de activar',503);return data;}
async function get(id){const row=await find(id);if(!row)fail('Factura no encontrada',404);return row;}
async function settings(){
 const [saved,series]=await Promise.all([supabase.from('finance_invoice_settings').select('*').eq('id',true).single(),supabase.from('finance_invoice_series').select('year,last_number,last_date').order('year',{ascending:false})]);
 if(saved.error||series.error||!saved.data)fail('La emisión de facturas está pendiente de activar',503);
 return {row:saved.data,public:invoice.publicSettings(saved.data,series.data||[])};
}
async function linked(link,document=null){
 if(!link.record_id)return null;
 const {data,error}=await supabase.from('finance_records').select('*').eq('id',link.record_id).maybeSingle();
 if(error)fail('No se pudo comprobar el ingreso vinculado',503);
 return invoice.checkRecord(data,link.record_version,document);
}
function rpcError(error,fallback){if(!error)return;if(error.code==='P0001')fail(error.message,409);if(error.code==='23505')fail('El número o el ingreso ya está asociado a otra factura. Recarga antes de continuar.',409);fail(fallback,503);}
router.get('/',wrap(async(req,res)=>{
 const config=await settings(),rows=[];
 for(let offset=0;;offset+=1000){
  const {data,error}=await supabase.from('finance_invoices').select(invoice.PUBLIC_FIELDS.join(',')).order('created_at',{ascending:false}).order('id').range(offset,offset+999);
  if(error)fail('No se pudieron cargar las facturas',503);rows.push(...(data||[]));if((data||[]).length<1000)break;
 }
 res.json({invoices:rows.map(invoice.publicInvoice),settings:config.public});
}));
router.put('/settings',wrap(async(req,res)=>{
 invoice.keys(req.body,['version','issuer'],'Configuración');const expected=invoice.version(req.body.version),issuer=invoice.party(req.body.issuer,true),config=await settings();
 if(isDeepStrictEqual(config.row.issuer,issuer)&&[config.row.version,config.row.version-1].includes(expected))return res.json(config.public);
 if(expected!==config.row.version)fail('Los datos del emisor cambiaron. Recarga antes de guardarlos.',409);
 const {data,error}=await supabase.from('finance_invoice_settings').update({issuer,version:expected+1,actor:actor(req),updated_at:new Date().toISOString()}).eq('id',true).eq('version',expected).select('*').maybeSingle();
 if(error)fail('No se pudieron guardar los datos del emisor',503);if(!data)fail('Otra persona cambió los datos del emisor. Recarga antes de continuar.',409);
 res.json(invoice.publicSettings(data,config.public.series));
}));
router.post('/settings/series',wrap(async(req,res)=>{
 const data=invoice.validateSeries(req.body),{data:series,error}=await supabase.rpc('finance_initialize_invoice_series',{p_year:data.year,p_last_number:data.last_number,p_last_date:data.last_date,p_actor:actor(req)});
 rpcError(error,'No se pudo inicializar la numeración');if(!series)fail('No se pudo confirmar la numeración',503);
 res.json((await settings()).public);
}));
router.post('/',wrap(async(req,res)=>{
 invoice.keys(req.body,['id','document','record_id','record_version'],'Borrador');
 const id=invoice.uuid(req.body.id),document=invoice.validateDocument(req.body.document),link=invoice.validateLink(req.body.record_id,req.body.record_version);
 const previous=await find(id);if(previous){if(previous.status==='draft'&&invoice.sameDraft(previous,document,link))return res.json(invoice.publicInvoice(previous));fail('Este identificador ya corresponde a otra factura. Recarga antes de continuar.',409);}
 await linked(link);
 const {data,error}=await supabase.from('finance_invoices').insert({id,document,...link,new_record_id:randomUUID(),actor:actor(req)}).select('*').single();
 if(error){
  // A lost insert response must never create another draft or overwrite it.
  const recovered=await find(id);if(recovered?.status==='draft'&&invoice.sameDraft(recovered,document,link))return res.json(invoice.publicInvoice(recovered));
  if(error.code==='23505')fail('Ya existe esa factura. Recarga antes de continuar.',409);fail('No se pudo confirmar el borrador. Reintenta con el mismo contenido.',503);
 }
 res.status(201).json(invoice.publicInvoice(data));
}));
router.put('/:id',wrap(async(req,res)=>{
 invoice.keys(req.body,['version','document','record_id','record_version'],'Borrador');
 const expected=invoice.version(req.body.version),document=invoice.validateDocument(req.body.document),link=invoice.validateLink(req.body.record_id,req.body.record_version),current=await get(req.params.id);
 if(current.status!=='draft')fail('Una factura emitida se conserva sin cambios. Su corrección requiere otro documento.',409);
 if(expected===current.version-1&&invoice.sameDraft(current,document,link))return res.json(invoice.publicInvoice(current));
 if(expected!==current.version)fail('El borrador cambió. Recarga antes de continuar.',409);
 await linked(link);
 const {data,error}=await supabase.from('finance_invoices').update({document,...link,version:expected+1,actor:actor(req),updated_at:new Date().toISOString()}).eq('id',current.id).eq('version',expected).eq('status','draft').select('*').maybeSingle();
 if(error)rpcError(error,'No se pudo guardar el borrador');if(!data)fail('Otra persona modificó o emitió la factura. Recarga antes de continuar.',409);
 res.json(invoice.publicInvoice(data));
}));
router.post('/:id/issue',wrap(async(req,res)=>{
 invoice.keys(req.body,['version'],'Emisión');const expected=invoice.version(req.body.version),current=await get(req.params.id);
 let issuerVersion=null;
 if(current.status==='draft'){
  if(current.version!==expected)fail('El borrador cambió. Recarga antes de emitirlo.',409);
  const document=invoice.validateDocument(current.document,{issue:true}),config=await settings();
  invoice.check(invoice.completeParty(config.row.issuer),'Completa los datos fiscales de VOCAI antes de emitir');
  await linked(current,document);issuerVersion=config.row.version;
 }
 const {data,error}=await supabase.rpc('finance_issue_invoice',{p_invoice_id:current.id,p_version:expected,p_issuer_version:issuerVersion,p_actor:actor(req)});
 rpcError(error,'No se pudo confirmar la emisión. Reintenta la misma factura; no crees otra.');if(!data)fail('No se pudo confirmar la emisión. Reintenta la misma factura.',503);
 res.json(invoice.publicInvoice(data));
}));
router.get('/:id/pdf',wrap(async(req,res)=>{
 const current=await get(req.params.id);let buffer;
 if(current.pdf_path){
  const {data,error}=await supabase.storage.from('finance-private').download(current.pdf_path);
  if(error||!data)fail('No se pudo abrir el PDF privado',503);buffer=Buffer.from(await data.arrayBuffer());
 }else{
  const issuer=current.status==='draft'?(await settings()).row.issuer:current.issuer_snapshot;
  if(!issuer)fail('Faltan los datos del emisor conservados con la factura',503);
  const {renderInvoice}=require('../lib/finance-invoice-pdf');buffer=await renderInvoice(invoice.publicInvoice(current),issuer);
 }
 if(!Buffer.isBuffer(buffer)||buffer.subarray(0,5).toString()!=='%PDF-')fail('No se pudo generar el PDF',503);
 const filename=current.status==='draft'?'borrador-'+current.id:('factura-'+(current.number||current.id)).replace(/[^a-zA-Z0-9_-]/g,'_');
 res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+filename+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(buffer);
}));
router.get('/:id',wrap(async(req,res)=>res.json(invoice.publicInvoice(await get(req.params.id)))));
router.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(error.status||500).json({error:error.status?error.message:'No se pudo procesar la factura'});});
module.exports=router;
