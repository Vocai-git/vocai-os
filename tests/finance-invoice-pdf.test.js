'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {renderInvoice,LIMITS}=require('../lib/finance-invoice-pdf');
const issuer={name:'Emisor de prueba',tax_id:'IDENTIFICADOR-FICTICIO',address:'Calle de ejemplo 1',postal_code:'00000',city:'Ciudad de prueba',country:'España',email:'facturas@example.invalid',website:'example.invalid',iban:'CUENTA DE PRUEBA',payment_method:'Transferencia bancaria'};
function invoice(extra={}){
 return {id:'synthetic',status:'draft',number:null,document:{date:'2026-10-07',due:'2026-11-06',period_start:'2026-09-01',period_end:'2026-09-30',customer:{name:'Cliente de prueba',tax_id:'CLIENTE-FICTICIO',address:'Dirección de ejemplo',postal_code:'00000',city:'Ciudad',country:'España',email:'cliente@example.invalid'},lines:[{description:'Servicio de prueba',detail:'Detalle del servicio',quantity:1500,unit_price:10000}],vat_rate:2100,irpf_rate:0,tax_note:'',notes:'Nota de prueba',theme:'dark',totals:{base:15000,vat:3150,irpf:0,gross:18150,net:18150}},...extra};
}
const pageCount=buffer=>(buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
const poppler=!spawnSync('pdftotext',['-v'],{encoding:'utf8',windowsHide:true}).error;
const python=process.env.PDF_TEST_PYTHON||'python';
const pythonParser=!poppler&&spawnSync(python,['-c','import pdfplumber'],{windowsHide:true}).status===0;
const parser=poppler||pythonParser;
function extract(buffer,bbox=false){
 const script="import io,sys,pdfplumber\npdf=pdfplumber.open(io.BytesIO(sys.stdin.buffer.read()))\nif sys.argv[1]=='bbox':\n print('\\n'.join('<word xMin=\"'+str(w['x0'])+'\" yMin=\"'+str(w['top'])+'\" xMax=\"'+str(w['x1'])+'\" yMax=\"'+str(w['bottom'])+'\"/>' for p in pdf.pages for w in p.extract_words()))\nelse:\n print('\\n'.join(p.extract_text() or '' for p in pdf.pages))";
 const result=spawnSync(poppler?'pdftotext':python,poppler?[bbox?'-bbox':'-layout','-','-']:['-c',script,bbox?'bbox':'text'],{input:buffer,maxBuffer:20*1024*1024,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
 assert.equal(result.status,0,result.stderr?.toString());return result.stdout.toString('utf8');
}
function normalized(value){return value.replace(/\s+/g,' ');}

test('renderer returns an A4 PDF buffer in both local-asset themes without changing snapshots',async()=>{
 for(const theme of ['dark','light']){
  const source=invoice();source.document.theme=theme;const before=JSON.stringify({source,issuer}),buffer=await renderInvoice(source,issuer);
  assert.equal(buffer.subarray(0,5).toString(),'%PDF-');assert.ok(buffer.length>10000);assert.match(buffer.toString('latin1'),/\/MediaBox\s*\[0 0 595\.28 841\.89\]/);assert.ok(pageCount(buffer)>=1);assert.equal(JSON.stringify({source,issuer}),before);
  assert.doesNotMatch(buffer.toString('latin1'),/\/JavaScript|\/Launch|\/URI\s*\(/);
 }
});

test('draft pages suppress an accidentally supplied official number and remain visibly unissued',{skip:!parser},async()=>{
 const source=invoice({number:'2026-998'}),buffer=await renderInvoice(source,issuer),text=normalized(extract(buffer));
 assert.match(text,/BORRADOR - SIN EMITIR/);assert.doesNotMatch(text,/2026-998/);assert.match(text,/Página 1 \/ 1/);assert.match(text,/01\/09\/2026 - 30\/09\/2026/);assert.match(text,/06\/11\/2026/);
});

test('issued documents use the immutable issuer snapshot and validated gross, withholding and net totals',{skip:!parser},async()=>{
 const source=invoice({status:'issued',number:'2026-009',issuer_snapshot:{...issuer,name:'Emisor guardado'}});
 Object.assign(source.document,{irpf_rate:1500,totals:{base:15000,vat:3150,irpf:2250,gross:18150,net:15900}});
 const result=normalized(extract(await renderInvoice(source,{...issuer,name:'Emisor cambiado'})));
 assert.match(result,/Emisor guardado/);assert.doesNotMatch(result,/Emisor cambiado|BORRADOR/);assert.match(result,/2026-009/);
 for(const expected of ['150,00 €','31,50 €','181,50 €','-22,50 €','159,00 €','IRPF 15 %'])assert.ok(result.includes(expected),expected);
});

test('missing line bases use exact thousandths rounding and user markup remains literal text',{skip:!parser},async()=>{
 const source=invoice();source.document.lines=[{description:'<script>NO_EJECUTAR</script>',detail:'https://example.invalid/recurso',quantity:1001,unit_price:1500}];
 source.document.totals={base:1502,vat:315,irpf:0,gross:1817,net:1817};
 const buffer=await renderInvoice(source,issuer),result=normalized(extract(buffer));
 assert.match(result,/<script>NO_EJECUTAR<\/script>/);assert.match(result,/15,02 €/);assert.match(result,/1,001/);assert.match(result,/example.invalid\/recurso/);assert.doesNotMatch(buffer.toString('latin1'),/\/URI|\/JavaScript/);
});

test('fifty long concepts, unbroken words, addresses and notes paginate without dropping text or leaving A4',{skip:!parser},async()=>{
 const source=invoice(),rows=Array.from({length:50},(_,i)=>({description:'LINEA-'+String(i+1).padStart(3,'0')+' '+('Descripción extensa '.repeat(7)),detail:'PalabraLarga'.repeat(40)+' FINAL-'+String(i+1).padStart(3,'0'),quantity:1000,unit_price:100}));
 source.document.lines=rows;source.document.customer.address='Dirección '.repeat(130)+'FIN-DIRECCION';source.document.notes='Observaciones de prueba. '.repeat(70)+'FIN-OBSERVACIONES';source.document.totals={base:5000,vat:1050,irpf:0,gross:6050,net:6050};
 const buffer=await renderInvoice(source,issuer),count=pageCount(buffer),result=normalized(extract(buffer));assert.ok(count>3);assert.ok(count<LIMITS.pages);
 for(let i=1;i<=50;i++){assert.ok(result.includes('LINEA-'+String(i).padStart(3,'0')),'Missing description '+i);assert.ok(result.includes('FINAL-'+String(i).padStart(3,'0')),'Missing detail '+i);}
 assert.match(result,/FIN-DIRECCION/);assert.match(result,/FIN-OBSERVACIONES/);assert.ok((result.match(/BORRADOR - SIN EMITIR/g)||[]).length>=count);
 for(let i=1;i<=count;i++)assert.ok(result.includes('Página '+i+' / '+count),'Missing page number '+i);
 const boxes=extract(buffer,true);let words=0;for(const match of boxes.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)){words++;const [x0,y0,x1,y1]=match.slice(1).map(Number);assert.ok(x0>=0&&y0>=0&&x1<=595.29&&y1<=841.9,'Text outside A4 bounds');}assert.ok(words>1000);
});

test('renderer rejects invalid inputs and bounded limits before generating an invoice',async()=>{
 await assert.rejects(renderInvoice(null,issuer),/Factura/);
 const missing=invoice({status:'issued'});await assert.rejects(renderInvoice(missing,issuer),/número/);
 const many=invoice();many.document.lines=Array.from({length:51},()=>many.document.lines[0]);await assert.rejects(renderInvoice(many,issuer),/50 conceptos/);
 const huge=invoice();huge.document.notes='x'.repeat(LIMITS.field+1);await assert.rejects(renderInvoice(huge,issuer),/texto/);
 const fractional=invoice();fractional.document.lines[0].quantity=1.5;await assert.rejects(renderInvoice(fractional,issuer),/Cantidad/);
 const amount=invoice();amount.document.totals.net=-1;await assert.rejects(renderInvoice(amount,issuer),/net/);
});
