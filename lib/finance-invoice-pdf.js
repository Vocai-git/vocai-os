'use strict';
// Invoice snapshots become PDF drawing commands. No HTML, remote resources,
// document scripts or user-supplied asset paths are interpreted.
const PDFDocument=require('pdfkit');
const path=require('node:path');
const ASSETS=path.join(__dirname,'../public/invoice-assets');
const LIMITS={lines:50,field:5000,pages:100,bytes:20*1024*1024};
const MARGIN=42,TOP=124,LINE=14;
function fail(message){const error=new Error(message);error.status=400;throw error;}
function text(value){if(value==null)return '';if(typeof value!=='string'||value.length>LIMITS.field)fail('El texto de la factura supera el límite permitido');return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').replace(/\r\n?/g,'\n');}
function integer(value,label){if(!Number.isSafeInteger(value)||value<0||value>1000000000000)fail(label+' no válido');return value;}
function date(value){if(!value)return 'Por completar';if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('Fecha de factura no válida');const [y,m,d]=value.split('-');return d+'/'+m+'/'+y;}
const money=value=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(value/100);
const quantity=value=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:3}).format(value/1000);
const rate=value=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(value/100)+' %';
function model(invoice,issuer){
 if(!invoice||!['draft','issued','imported'].includes(invoice.status)||!invoice.document)fail('Factura no válida para generar PDF');
 const d=invoice.document,company=invoice.issuer_snapshot||issuer;
 if(!company||typeof company!=='object'||!d.customer||typeof d.customer!=='object')fail('Faltan los datos de emisor o cliente');
 if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>LIMITS.lines)fail('La factura debe tener entre 1 y 50 conceptos');
 const cleanParty=value=>Object.fromEntries(['name','tax_id','address','postal_code','city','country','email','website','iban','payment_method'].map(key=>[key,text(value[key])]));
 const lines=d.lines.map(line=>{
  if(!line||typeof line!=='object')fail('Concepto de factura no válido');
  const q=integer(line.quantity,'Cantidad'),unit=integer(line.unit_price,'Precio unitario');if(!q)fail('La cantidad debe ser mayor que cero');
  const base=line.base==null?Number((BigInt(q)*BigInt(unit)+500n)/1000n):integer(line.base,'Base de la línea');
  integer(base,'Base de la línea');return {description:text(line.description),detail:text(line.detail),quantity:q,unit_price:unit,base};
 });
 const totals=Object.fromEntries(['base','vat','irpf','gross','net'].map(key=>[key,integer(d.totals?.[key],key)]));
 const vatRate=integer(d.vat_rate??0,'IVA'),irpfRate=integer(d.irpf_rate??0,'IRPF');if(vatRate>10000||irpfRate>10000)fail('Tipo impositivo no válido');
 const draft=invoice.status==='draft',number=draft?'':text(invoice.number);if(!draft&&!number)fail('La factura emitida debe tener número');
 return {draft,number,status:invoice.status,company:cleanParty(company),customer:cleanParty(d.customer),lines,totals,vatRate,irpfRate,date:date(d.date),due:date(d.due),period:d.period_start||d.period_end?(d.period_start!==d.date||d.period_end!==d.date?[d.period_start,d.period_end].filter(Boolean).map(date).join(' - '):''):'',notes:text(d.notes),taxNote:text(d.tax_note),light:d.theme==='light'};
}
async function renderInvoice(invoice,issuer){
 const data=model(invoice,issuer);
 const doc=new PDFDocument({size:'A4',margin:0,autoFirstPage:false,bufferPages:true,compress:true,info:{Title:data.draft?'Borrador de factura':'Factura '+data.number,Author:data.company.name||'VOCAI',Creator:'VOCAI',Producer:'VOCAI / PDFKit'}});
 const chunks=[];let bytes=0;
 const result=new Promise((resolve,reject)=>{doc.on('data',chunk=>{bytes+=chunk.length;if(bytes>LIMITS.bytes){doc.destroy(new Error('La factura supera el tamaño de PDF permitido'));return;}chunks.push(chunk);});doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));});
 // Prevent an early stream failure from becoming an unhandled rejection while
 // the synchronous layout is still running; the same error is returned below.
 result.catch(()=>{});
 try{
  doc.registerFont('regular',path.join(ASSETS,'Inter-Regular.ttf'));doc.registerFont('bold',path.join(ASSETS,'Inter-Bold.ttf'));
  const colors=data.light?{background:'#FFFFFF',card:'#F4F6FB',text:'#141D35',muted:'#4B5568',border:'#DCE2EE'}:{background:'#141D35',card:'#1E2A47',text:'#E0E4EC',muted:'#AAB4C7',border:'#344666'};
  colors.blue='#2979FF';colors.coral='#FF6B6B';
  let y=TOP,pageCount=0,width,height,bottom,bodyWidth;
  function font(bold=false,size=10){doc.font(bold?'bold':'regular').fontSize(size);}
  function write(value,x,at,{size=10,bold=false,color=colors.text,width:area,align='left'}={}){
   font(bold,size);doc.fillColor(color).text(value,x,at,{lineBreak:false,...(area?{width:area,align}:{}),features:['kern']});
  }
  function wrap(value,area,bold=false,size=10){
   font(bold,size);const lines=[];
   for(const paragraph of value.split('\n')){
    if(!paragraph.trim()){lines.push('');continue;}
    let current='';
    for(const word of paragraph.trim().split(/\s+/u)){
     if(doc.widthOfString(current?current+' '+word:word)<=area){current=current?current+' '+word:word;continue;}
     if(current){lines.push(current);current='';}
     if(doc.widthOfString(word)<=area){current=word;continue;}
     const characters=Array.from(word);let offset=0;
     while(offset<characters.length){
      let low=1,high=characters.length-offset,best=1;
      while(low<=high){const middle=Math.floor((low+high)/2);if(doc.widthOfString(characters.slice(offset,offset+middle).join(''))<=area){best=middle;low=middle+1;}else high=middle-1;}
      const part=characters.slice(offset,offset+best).join('');offset+=best;if(offset<characters.length)lines.push(part);else current=part;
     }
    }
    if(current)lines.push(current);
   }
   return lines;
  }
  function box(x,at,w,h){doc.roundedRect(x,at,w,h,7).fillAndStroke(colors.card,colors.border);}
  function newPage(){
   if(pageCount>=LIMITS.pages)fail('La factura supera el límite de páginas');
   doc.addPage();pageCount++;width=doc.page.width;height=doc.page.height;bottom=height-76;bodyWidth=width-2*MARGIN;y=TOP;
   doc.rect(0,0,width,height).fill(colors.background);
   doc.image(path.join(ASSETS,'logo.png'),MARGIN,34,{fit:[112,32]});
   write('FACTURA',width-240,32,{size:17,bold:true,width:198,align:'right'});
   if(data.draft)write('BORRADOR - SIN EMITIR',width-310,58,{size:11,bold:true,color:colors.coral,width:268,align:'right'});
   else{
    const numberLines=wrap('Nº '+data.number,240,true,11);
    if(numberLines.length>2)fail('El número de factura es demasiado largo');
    numberLines.forEach((line,i)=>write(line,width-282,57+i*13,{size:11,bold:true,width:240,align:'right'}));
   }
   write('Emisión: '+data.date,MARGIN,86,{size:9,color:colors.muted});
   write(data.status==='imported'?'Documento archivado':'VOCAI · Facturación',width-255,86,{size:9,color:colors.muted,width:213,align:'right'});
   const gradient=doc.linearGradient(MARGIN,108,width-MARGIN,108).stop(0,colors.blue).stop(1,colors.coral);doc.rect(MARGIN,108,bodyWidth,3).fill(gradient);
  }
  function ensure(space){if(y+space>bottom)newPage();}
  function partyLines(party,customer=false){
   const area=(bodyWidth-16)/2-26,lines=[];
   const fields=[[party.name||(customer?'Cliente por completar':'Emisor por completar'),true],...party.address.split('\n').map(line=>[line,false]),[[party.postal_code,party.city].filter(Boolean).join(' '),false],[party.country,false],[party.tax_id?'NIF / CIF: '+party.tax_id:'',false],[party.email,false]];
   for(const [value,bold]of fields)if(value)for(const line of wrap(value,area,bold,bold?10.5:9.5))lines.push({text:line,bold});
   return lines;
  }
  function parties(){
   const left=partyLines(data.company),right=partyLines(data.customer,true),w=(bodyWidth-16)/2;let continued=false;
   while(left.length||right.length){
    ensure(62);const capacity=Math.max(1,Math.floor((bottom-y-36)/LINE)),count=Math.min(capacity,Math.max(left.length,right.length)),h=36+count*LINE;
    for(const [queue,x,label]of [[left,MARGIN,'EMISOR'],[right,MARGIN+w+16,'CLIENTE']]){
     box(x,y,w,h);write(label+(continued?' · continúa':''),x+13,y+11,{size:8,bold:true,color:colors.blue});
     queue.splice(0,count).forEach((line,i)=>write(line.text,x+13,y+29+i*LINE,{size:line.bold?10.5:9.5,bold:line.bold,color:line.bold?colors.text:colors.muted}));
    }
    y+=h+16;continued=true;if(left.length||right.length)newPage();
   }
  }
  function textCard(title,value){
   if(!value)return;const lines=wrap(value,bodyWidth-28,false,9.5);let continued=false;
   while(lines.length){ensure(62);const count=Math.min(lines.length,Math.max(1,Math.floor((bottom-y-36)/LINE))),h=36+count*LINE;box(MARGIN,y,bodyWidth,h);write(title+(continued?' · continúa':''),MARGIN+14,y+11,{size:8,bold:true,color:colors.blue});lines.splice(0,count).forEach((line,i)=>write(line,MARGIN+14,y+29+i*LINE,{size:9.5}));y+=h+16;continued=true;if(lines.length)newPage();}
  }
  function table(){
   const widths=[bodyWidth-225,82,48,95],xs=[MARGIN,MARGIN+widths[0],MARGIN+widths[0]+82,MARGIN+widths[0]+130];
   function header(){ensure(60);doc.rect(MARGIN,y,bodyWidth,25).fill(colors.card);['CONCEPTO','PRECIO UD.','CANT.','BASE'].forEach((label,i)=>write(label,xs[i]+10,y+8,{size:8,bold:true,color:colors.muted,width:widths[i]-20,align:i?'right':'left'}));y+=25;}
   header();
   for(const line of data.lines){
    const columns=[...wrap(line.description||'Concepto',widths[0]-20,true,9.5).map(value=>({text:value,bold:true})),...wrap(line.detail,widths[0]-20,false,9).filter(Boolean).map(value=>({text:value,bold:false}))];
    const numeric=[money(line.unit_price),quantity(line.quantity),money(line.base)].map((value,i)=>wrap(value,widths[i+1]-20,false,9));
    let first=true;
    while(columns.length||first){
     const numericRows=first?Math.max(...numeric.map(items=>items.length)):0;
     if(y+20+Math.max(1,numericRows)*LINE>bottom){newPage();header();}
     const capacity=Math.floor((bottom-y-20)/LINE),count=Math.min(columns.length,capacity),rows=Math.max(count,numericRows,1),h=20+rows*LINE;
     doc.rect(MARGIN,y,bodyWidth,h).fill(colors.card);doc.moveTo(MARGIN,y+h).lineTo(width-MARGIN,y+h).strokeColor(colors.border).lineWidth(0.5).stroke();
     columns.splice(0,count).forEach((value,i)=>write(value.text,MARGIN+10,y+9+i*LINE,{size:value.bold?9.5:9,bold:value.bold,color:value.bold?colors.text:colors.muted}));
     if(first)numeric.forEach((items,j)=>items.forEach((value,i)=>write(value,xs[j+1]+10,y+9+i*LINE,{size:9,width:widths[j+1]-20,align:'right'})));
     y+=h;first=false;if(columns.length){newPage();header();}
    }
   }
   y+=16;
  }
  function settlement(){
   const gap=16,leftWidth=bodyWidth-230-gap,rightX=MARGIN+leftWidth+gap;
   const payment=[['Vencimiento',data.due],['Método de pago',data.company.payment_method||'Por indicar'],['Cuenta bancaria',data.company.iban||'Por indicar']];
   const paymentLines=[];for(const [label,value]of payment){paymentLines.push({text:label,bold:true});wrap(value,leftWidth-26,false,9.5).forEach(line=>paymentLines.push({text:line,bold:false}));paymentLines.push({text:'',bold:false});}
   const amounts=[['Base imponible',data.totals.base],['IVA '+rate(data.vatRate),data.totals.vat]];
   if(data.totals.irpf||data.irpfRate)amounts.push(['Total con IVA',data.totals.gross],['IRPF '+rate(data.irpfRate),-data.totals.irpf]);
   const totalHeight=amounts.length*23+70,maxLines=Math.floor((bottom-TOP-38)/LINE),count=Math.min(maxLines,paymentLines.length),blockHeight=Math.max(totalHeight,38+count*LINE);
   ensure(blockHeight);box(MARGIN,y,leftWidth,blockHeight);box(rightX,y,230,totalHeight);
   write('PAGO',MARGIN+13,y+11,{size:8,bold:true,color:colors.coral});paymentLines.splice(0,count).forEach((line,i)=>write(line.text,MARGIN+13,y+29+i*LINE,{size:9.5,bold:line.bold,color:line.bold?colors.muted:colors.text}));
   amounts.forEach(([label,value],i)=>{write(label,rightX+13,y+13+i*23,{size:9,color:colors.muted});write(money(value),rightX+92,y+13+i*23,{size:9.5,bold:true,width:125,align:'right'});});
   const totalY=y+amounts.length*23+13;doc.moveTo(rightX+13,totalY-1).lineTo(rightX+217,totalY-1).strokeColor(colors.border).stroke();write('TOTAL A PAGAR',rightX+13,totalY+10,{size:8,bold:true});
   const amount=money(data.totals.net);font(true,19);const size=Math.min(19,19*204/Math.max(1,doc.widthOfString(amount)));write(amount,rightX+13,totalY+28,{size,bold:true,color:colors.coral,width:204,align:'right'});
   y+=blockHeight+16;
   if(paymentLines.length)textCard('DATOS DE PAGO · continuación',paymentLines.map(line=>line.text).join('\n'));
  }
  newPage();parties();if(data.period)textCard('PERÍODO DEL SERVICIO',data.period);table();settlement();textCard('NOTA FISCAL',data.taxNote);textCard('OBSERVACIONES',data.notes);
  const pages=doc.bufferedPageRange();
  for(let i=0;i<pages.count;i++){
   doc.switchToPage(pages.start+i);doc.moveTo(MARGIN,height-59).lineTo(width-MARGIN,height-59).strokeColor(colors.border).lineWidth(0.5).stroke();
   doc.image(path.join(ASSETS,data.light?'logo.png':'logo-white.png'),MARGIN,height-47,{fit:[63,19]});
   write(data.draft?'BORRADOR - SIN EMITIR':'La voz de tu negocio',MARGIN+76,height-44,{size:8,bold:data.draft,color:data.draft?colors.coral:colors.muted});
   write('Página '+(i+1)+' / '+pages.count,width-172,height-44,{size:8,color:colors.muted,width:130,align:'right'});
  }
  doc.end();
 }catch(error){doc.destroy();throw error;}
 return result;
}
module.exports={renderInvoice,LIMITS};
