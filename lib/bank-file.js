'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const LIMITS=Object.freeze({bytes:5*1024*1024,rows:5000,columns:100,sheets:30,cell:32768,timeout:15000,workers:2});
let activeWorkers=0;
const fail=message=>{const e=new Error(message);e.status=400;throw e;};
function validateSheets(sheets){
 if(!Array.isArray(sheets)||!sheets.length||sheets.length>LIMITS.sheets)fail('El archivo debe contener entre 1 y 30 hojas');
 let count=0;
 const result=sheets.map(sheet=>{
  if(!Array.isArray(sheet.rows))fail('La hoja no contiene filas legibles');
  count+=sheet.rows.length;if(count>LIMITS.rows)fail('El archivo supera 5000 filas. Exporta un mes por archivo');
  return {name:String(sheet.name||'Hoja').slice(0,180),rows:sheet.rows.map(row=>{
   if(!Array.isArray(row)||row.length>LIMITS.columns)fail('El archivo supera 100 columnas');
   return row.map(cell=>{
    if(cell instanceof Date)return cell.toISOString().slice(0,10);
    if(cell==null)return null;
    if(typeof cell==='string'){if(cell.length>LIMITS.cell)fail('Una celda contiene demasiado texto');return cell;}
    if(typeof cell==='number'&&Number.isFinite(cell)||typeof cell==='boolean')return cell;
    fail('El archivo contiene un valor de celda no admitido');
   });
  })};
 });
 if(!count)fail('El archivo está vacío');return result;
}
function delimiter(text){
 const counts={';':[],',':[],'\t':[]};let quoted=false,current={';':0,',':0,'\t':0},lines=0;
 for(let i=0;i<text.length&&lines<30;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;continue;}
  if(quoted)continue;
  if(c in current)current[c]++;
  if(c==='\n'){for(const sep of Object.keys(counts))counts[sep].push(current[sep]);current={';':0,',':0,'\t':0};lines++;}
 }
 if(!lines)for(const sep of Object.keys(counts))counts[sep].push(current[sep]);
 return Object.keys(counts).sort((a,b)=>{
  const score=sep=>{const nonzero=counts[sep].filter(n=>n>0);return nonzero.length?nonzero.length*100+Math.min(...nonzero):0;};
  return score(b)-score(a);
 })[0];
}
function csv(buffer){
 if(buffer[0]===0xff&&buffer[1]===0xfe||buffer[0]===0xfe&&buffer[1]===0xff)fail('Exporta el CSV como UTF-8 o Windows-1252');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch(e){text=new TextDecoder('windows-1252').decode(buffer);}
 text=text.replace(/^\uFEFF/,'');if(text.includes('\0'))fail('El archivo no es un CSV de texto');
 const hint=text.match(/^sep=([;,\t])\r?\n/i),sep=hint?hint[1]:delimiter(text);if(hint)text=text.slice(hint[0].length);
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 const pushCell=()=>{row.push(cell);cell='';closed=false;if(row.length>LIMITS.columns)fail('El CSV supera 100 columnas');};
 const pushRow=()=>{pushCell();rows.push(row);row=[];if(rows.length>LIMITS.rows)fail('El CSV supera 5000 filas. Exporta un mes por archivo');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
  else if(c===sep)pushCell();
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow();}
  else if(c==='"'){if(cell||closed)fail('CSV no válido: comillas en una celda sin escapar');quoted=true;}
  else if(closed){if(c!==' '&&c!=='\t')fail('CSV no válido después de una celda entre comillas');}
  else cell+=c;
  if(cell.length>LIMITS.cell)fail('Una celda del CSV contiene demasiado texto');
 }
 if(quoted)fail('CSV no válido: falta cerrar unas comillas');
 if(cell||row.length||closed)pushRow();
 while(rows.length&&rows.at(-1).every(c=>!String(c).trim()))rows.pop();
 return validateSheets([{name:'CSV',rows}]);
}
async function parse(buffer,filename){
 if(!Buffer.isBuffer(buffer)||!buffer.length)fail('Selecciona un archivo CSV o XLSX');
 if(buffer.length>LIMITS.bytes)fail('El archivo supera 5 MB');
 const ext=path.extname(String(filename||'')).toLowerCase();
 if(!['.csv','.xlsx'].includes(ext))fail('Solo se admiten CSV y XLSX. Exporta los XLS o PDF a uno de esos formatos');
 if(ext==='.csv')return csv(buffer);
 if(buffer.length<4||buffer.readUInt32LE(0)!==0x04034b50)fail('El archivo no es un XLSX válido');
 if(activeWorkers>=LIMITS.workers){const error=new Error('Ya se están leyendo otros extractos. Reintenta en unos segundos');error.status=429;throw error;}
 return new Promise((resolve,reject)=>{
  let worker;activeWorkers++;
  try{worker=new Worker(path.join(__dirname,'bank-file-worker.js'),{workerData:buffer,resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}});}catch(e){activeWorkers--;return reject(Object.assign(new Error('No se pudo iniciar la lectura del XLSX'),{status:503}));}
  let finished=false;
  const finish=(error,result)=>{if(finished)return;finished=true;activeWorkers--;clearTimeout(timer);worker.terminate().catch(()=>{});if(error){error.status=400;reject(error);}else resolve(result);};
  const timer=setTimeout(()=>finish(new Error('El XLSX tarda demasiado en abrirse. Exporta un CSV más pequeño')),LIMITS.timeout);
  worker.once('message',message=>{if(message.error)return finish(new Error(message.error));try{finish(null,validateSheets(message.sheets));}catch(e){finish(e);}});
  worker.once('error',()=>finish(new Error('No se pudo leer el XLSX dentro de los límites. Exporta un CSV')));
  worker.once('exit',code=>{if(!finished)finish(new Error('No se pudo leer el XLSX'+(code?' dentro de los límites permitidos':'')));});
 });
}
module.exports={parse,LIMITS};
