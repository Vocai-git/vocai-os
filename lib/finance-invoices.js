'use strict';

// Issuing a document is distinct from collecting money. All arithmetic here is
// integer cents; quantities use thousandths and percentages use basis points.
const {isDeepStrictEqual}=require('node:util');
const {UUID,todayMadrid}=require('./finance');
const MAX_AMOUNT=1000000000,MAX_LINES=50,MAX_QUANTITY=100000000;
const CUSTOMER_FIELDS=['name','tax_id','address','postal_code','city','country','email'];
const ISSUER_FIELDS=[...CUSTOMER_FIELDS,'website','iban','payment_method'];
const FISCAL_FIELDS=['name','tax_id','address','postal_code','city','country'];
const PUBLIC_FIELDS=['id','document','status','number','version','record_id','record_version','new_record_id','issuer_snapshot','pdf_path','created_at','updated_at','issued_at'];
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function check(ok,message,status=400){if(!ok)fail(message,status);}
function object(value,label){check(value&&typeof value==='object'&&!Array.isArray(value),label+': datos no válidos');return value;}
function keys(value,allowed,label){object(value,label);check(Object.keys(value).every(key=>allowed.includes(key)),label+': hay campos no admitidos');}
function text(value,max,label){check(value==null||typeof value==='string',label+': texto no válido');const out=(value||'').trim();check(out.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(out),label+': revisa el texto');return out;}
function date(value,label){check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),label+': fecha no válida');const parsed=new Date(value+'T12:00:00Z');check(!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value,label+': fecha no válida');return value;}
function integer(value,min,max,label){check(Number.isSafeInteger(value)&&value>=min&&value<=max,label+': valor fuera del límite');return value;}
function uuid(value){check(typeof value==='string'&&UUID.test(value),'Identificador no válido');return value;}
function version(value){return integer(value,1,2147483647,'Versión');}
function round(numerator,denominator){return (numerator+denominator/2n)/denominator;}
function party(input={},issuer=false){
 const fields=issuer?ISSUER_FIELDS:CUSTOMER_FIELDS;keys(input,fields,issuer?'Emisor':'Cliente');
 const limits={name:180,tax_id:80,address:500,postal_code:30,city:100,country:80,email:254,website:250,iban:40,payment_method:180};
 const result=Object.fromEntries(fields.map(key=>[key,text(input[key],limits[key],key)]));
 if(result.email)check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email),'Revisa el correo electrónico');
 if(issuer&&result.website){let url;try{url=new URL(result.website);}catch(_){}check(url&&['https:','http:'].includes(url.protocol)&&!url.username&&!url.password,'La web debe ser una URL http o https');}
 if(issuer&&result.iban){result.iban=result.iban.replace(/\s/g,'').toUpperCase();check(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(result.iban),'Revisa el IBAN del emisor');}
 return result;
}
function completeParty(value){return !!value&&FISCAL_FIELDS.every(key=>typeof value[key]==='string'&&value[key].trim().length>0);}
function validateDocument(input,{issue=false,today=todayMadrid()}={}){
 keys(input,['date','due','period_start','period_end','customer','lines','vat_rate','irpf_rate','tax_note','notes','theme','totals'],'Factura');
 const result={date:date(input.date??today,'Fecha'),due:input.due?date(input.due,'Vencimiento'):null,period_start:input.period_start?date(input.period_start,'Inicio del período'):null,period_end:input.period_end?date(input.period_end,'Fin del período'):null,customer:party(input.customer??{}),lines:[],vat_rate:integer(input.vat_rate??2100,0,10000,'IVA'),irpf_rate:integer(input.irpf_rate??0,0,10000,'IRPF'),tax_note:text(input.tax_note,500,'Motivo fiscal'),notes:text(input.notes,2000,'Notas'),theme:input.theme??'dark'};
 check(['dark','light'].includes(result.theme),'Selecciona un diseño válido');
 check(!result.due||result.due>=result.date,'El vencimiento no puede ser anterior a la fecha');
 check((!result.period_start&&!result.period_end)||(result.period_start&&result.period_end&&result.period_start<=result.period_end),'Completa un período válido, con inicio y fin');
 check(Array.isArray(input.lines)&&input.lines.length<=MAX_LINES,'La factura admite hasta 50 conceptos');
 let base=0n,allocatedVat=0n;
 result.lines=input.lines.map(line=>{
  keys(line,['description','detail','quantity','unit_price','base','vat','total'],'Concepto');
  const description=text(line.description,180,'Descripción'),detail=text(line.detail,500,'Detalle'),quantity=integer(line.quantity,1,MAX_QUANTITY,'Cantidad'),unit_price=integer(line.unit_price,0,MAX_AMOUNT,'Precio unitario');
  const lineBase=round(BigInt(quantity)*BigInt(unit_price),1000n);base+=lineBase;
  check(base<=BigInt(MAX_AMOUNT),'La base de la factura supera el importe máximo');
  // Allocate the aggregate rounding across lines, so line VAT sums exactly to
  // the invoice VAT even for small fractional quantities.
  const cumulativeVat=round(base*BigInt(result.vat_rate),10000n),vat=cumulativeVat-allocatedVat;allocatedVat=cumulativeVat;
  if(issue)check(description.length>0,'Cada concepto necesita una descripción');
  return {description,detail,quantity,unit_price,base:Number(lineBase),vat:Number(vat),total:Number(lineBase+vat)};
 });
 const vat=round(base*BigInt(result.vat_rate),10000n),irpf=round(base*BigInt(result.irpf_rate),10000n),gross=base+vat,net=gross-irpf;
 check(gross<=BigInt(MAX_AMOUNT),'El total con IVA supera el importe máximo');
 result.totals={base:Number(base),vat:Number(vat),irpf:Number(irpf),gross:Number(gross),net:Number(net)};
 if(issue){check(result.date<=today,'La fecha de emisión no puede estar en el futuro');check(completeParty(result.customer),'Completa los datos fiscales del cliente');check(result.lines.length>0&&base>0n&&net>0n,'La factura necesita un importe neto positivo');}
 return result;
}
function validateLink(recordId,recordVersion){
 if(recordId==null){check(recordVersion==null,'No hay un ingreso vinculado para esa versión');return {record_id:null,record_version:null};}
 return {record_id:uuid(recordId),record_version:version(recordVersion)};
}
function checkRecord(record,expectedVersion,document=null){
 check(record&&!record.voided&&record.data?.kind==='income','Selecciona un ingreso existente y no anulado',409);
 check(record.version===expectedVersion,'El ingreso cambió. Recarga y revisa su vinculación.',409);
 check(!['assigned','draft','duplicate','review'].includes(record.data.history?.status)&&record.data.history?.classification!=='startup','Este ingreso no puede vincularse a una factura emitida',409);
 check(record.data.stage!=='forecast','Confirma primero el ingreso previsto antes de emitir su factura',409);
 const number=record.data.number||'';
 const internalReference=/^VOCAI-\d{4}-\d{3,}$/.test(number)&&(record.data.history?.sources||[]).some(source=>source.table==='invoices'&&source.original?.numero===number);
 check(!number||internalReference,'El ingreso ya tiene un número de factura. Conserva el documento existente; no lo vuelvas a emitir.',409);
 if(document){
  const data=record.data,totals=document.totals;
  check(['date','period_start','period_end','due'].every(key=>(data[key]||null)===(document[key]||null)),'La fecha, el período y el vencimiento deben coincidir con el ingreso vinculado. Revisa el ingreso antes de emitir.',409);
  check(data.amount===totals.gross&&data.amount-(data.irpf?.tax||0)===totals.net,'La factura no coincide con el total y el neto del ingreso. Revisa sus importes sin crear un ingreso duplicado.',409);
  if(data.vat)check(data.vat.base===totals.base&&data.vat.tax===totals.vat&&data.vat.rate===document.vat_rate,'El desglose de IVA no coincide con el ingreso vinculado',409);
  if(data.irpf)check(data.irpf.base===totals.base&&data.irpf.tax===totals.irpf&&data.irpf.rate===document.irpf_rate,'El IRPF no coincide con el ingreso vinculado',409);
  check((data.payments||[]).reduce((sum,p)=>sum+p.amount,0)<=totals.net,'Los cobros superan el neto de la factura',409);
 }
 return record;
}
function taxMetadata(document){const {base,vat,irpf,gross}=document.totals;return {vat:{mode:document.vat_rate?'added':'none',input:base,rate:document.vat_rate,base,tax:vat,total:gross},...(document.irpf_rate?{irpf:{rate:document.irpf_rate,base,tax:irpf}}:{})};}
function financialData(document,number){return {kind:'income',title:document.lines.map(line=>line.description).join(' · ').slice(0,180),amount:document.totals.gross,date:document.date,party:document.customer.name,number,notes:document.notes,category:'',period_start:document.period_start,period_end:document.period_end,due:document.due,repeat:'none',group:null,source:null,target:null,stage:'document',payments:[],...taxMetadata(document)};}
function publicInvoice(row){return Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,row[key]??null]));}
function publicSettings(row,series,today=todayMadrid()){const issuer=row?.issuer||party({},true);return {issuer,version:row?.version||1,series:(series||[]).map(item=>({year:item.year,last_number:item.last_number,last_date:item.last_date})),configured:completeParty(issuer)&&(series||[]).some(item=>item.year===Number(today.slice(0,4)))};}
function sameDraft(row,document,link){return isDeepStrictEqual(row.document,document)&&row.record_id===link.record_id&&row.record_version===link.record_version;}
function validateSeries(input){keys(input,['year','last_number','last_date'],'Numeración');const year=integer(input.year,2000,9999,'Año'),last_number=integer(input.last_number,0,999999999,'Último número'),last_date=input.last_date?date(input.last_date,'Última fecha'):null;check(last_number===0?last_date===null:last_date&&Number(last_date.slice(0,4))===year,'Indica la fecha de la última factura o deja la fecha vacía si la serie empieza de cero');check(!last_date||last_date<=todayMadrid(),'La última fecha no puede ser futura');return {year,last_number,last_date};}
module.exports={MAX_AMOUNT,MAX_LINES,MAX_QUANTITY,CUSTOMER_FIELDS,ISSUER_FIELDS,FISCAL_FIELDS,PUBLIC_FIELDS,fail,check,keys,uuid,version,party,completeParty,validateDocument,validateLink,checkRecord,taxMetadata,financialData,publicInvoice,publicSettings,sameDraft,validateSeries};
