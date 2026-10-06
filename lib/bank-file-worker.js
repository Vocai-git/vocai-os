'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {inflateRawSync}=require('node:zlib');
const readExcel=require('read-excel-file/node');
function check(ok,message='El XLSX está dañado o usa un formato no admitido'){if(!ok)throw new Error(message);}
// Check every ZIP entry before the library allocates its sheet arrays. Native
// decompression is bounded as well as the worker heap and execution time.
function inspect(buffer){
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 check(end>=0);const entries=buffer.readUInt16LE(end+10),offset=buffer.readUInt32LE(end+16),size=buffer.readUInt32LE(end+12);
 check(!buffer.readUInt16LE(end+4)&&!buffer.readUInt16LE(end+6)&&entries===buffer.readUInt16LE(end+8));
 check(entries>0&&entries<=200&&offset+size<=end);let cursor=offset,total=0,sheets=0;const names=new Set(),spans=[];
 for(let n=0;n<entries;n++){
  check(cursor+46<=buffer.length&&buffer.readUInt32LE(cursor)===0x02014b50);
  const flags=buffer.readUInt16LE(cursor+8),method=buffer.readUInt16LE(cursor+10),compressed=buffer.readUInt32LE(cursor+20),uncompressed=buffer.readUInt32LE(cursor+24),nameLength=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32),local=buffer.readUInt32LE(cursor+42);
  check(!(flags&1)&&[0,8].includes(method)&&cursor+46+nameLength+extra+comment<=buffer.length);
  const name=buffer.subarray(cursor+46,cursor+46+nameLength).toString('utf8');check(!names.has(name)&&!name.includes('..')&&!name.startsWith('/'));names.add(name);
  check(uncompressed<=8*1024*1024,'Una hoja del XLSX es demasiado grande');total+=uncompressed;check(total<=24*1024*1024,'El XLSX descomprimido es demasiado grande');
  check(local+30<=buffer.length&&buffer.readUInt32LE(local)===0x04034b50);
  check(buffer.readUInt16LE(local+6)===flags&&buffer.readUInt16LE(local+8)===method);
  if(!(flags&8))check(buffer.readUInt32LE(local+18)===compressed&&buffer.readUInt32LE(local+22)===uncompressed);
  const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);check(start+compressed<=offset);
  check(buffer.subarray(local+30,local+30+buffer.readUInt16LE(local+26)).toString('utf8')===name);spans.push({local,end:start+compressed,flags,compressed,uncompressed});
  const content=method===0?buffer.subarray(start,start+compressed):inflateRawSync(buffer.subarray(start,start+compressed),{maxOutputLength:8*1024*1024});check(content.length===uncompressed);
  if(name.endsWith('.xml')){
   const xml=content.toString('utf8');check(!/<!DOCTYPE|<!ENTITY/i.test(xml),'El XLSX contiene XML no admitido');
   if(/^xl\/worksheets\/[^/]+\.xml$/.test(name)){
    sheets++;check(sheets<=30,'El XLSX supera 30 hojas');
    for(const match of xml.matchAll(/\br=["']([A-Z]+)(\d+)["']/g)){let column=0;for(const c of match[1])column=column*26+c.charCodeAt(0)-64;check(column<=100&&Number(match[2])<=5000,'El XLSX supera 5000 filas o 100 columnas');}
    for(const match of xml.matchAll(/<row\b[^>]*\br=["'](\d+)["']/g))check(Number(match[1])<=5000,'El XLSX supera 5000 filas');
    for(const match of xml.matchAll(/<dimension\b[^>]*\bref=["'][^"']*?([A-Z]+)(\d+)["']/g)){let column=0;for(const c of match[1])column=column*26+c.charCodeAt(0)-64;check(column<=100&&Number(match[2])<=5000,'El XLSX supera 5000 filas o 100 columnas');}
   }
  }
  cursor+=46+nameLength+extra+comment;
 }
 // Streaming unzip must not encounter extra local entries absent from the
 // directory that was inspected above. Only the standard data descriptor
 // may separate two validated entries.
 spans.sort((a,b)=>a.local-b.local);let previous=0;
 for(let i=0;i<spans.length;i++){
  const span=spans[i];check(span.local===previous);previous=span.end;
  if(span.flags&8){const marker=buffer.readUInt32LE(previous)===0x08074b50?4:0;check(previous+marker+12<=offset);check(buffer.readUInt32LE(previous+marker+4)===span.compressed&&buffer.readUInt32LE(previous+marker+8)===span.uncompressed);previous+=marker+12;}
 }
 check(previous===offset&&cursor===offset+size);
 check(names.has('[Content_Types].xml')&&names.has('xl/workbook.xml')&&sheets>0);
}
(async()=>{try{const buffer=Buffer.from(workerData);inspect(buffer);const sheets=await readExcel(buffer);parentPort.postMessage({sheets:sheets.map(s=>({name:s.sheet,rows:s.data.map(row=>row.map(cell=>cell instanceof Date?cell.toISOString().slice(0,10):cell))}))});}catch(e){parentPort.postMessage({error:e.message?.startsWith('El XLSX')||e.message?.startsWith('Una hoja')?e.message:'No se pudo leer el XLSX. Comprueba el archivo o expórtalo a CSV.'});}})();
