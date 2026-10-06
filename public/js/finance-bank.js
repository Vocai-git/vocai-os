/* Read-only bank reconciliation. This module never posts a payment or changes
 * the opening balance. Browser and server use the same normalization and links.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FinanceBank=factory();})(typeof window==='undefined'?this:window,function(){
 'use strict';
 const MAX_ROWS=5000,MAX_RECORDS=20000,MAX_COLUMNS=100,MAX_DESCRIPTION=2000,DAY=86400000;
 function fail(message,code='INVALID_INPUT'){const error=new Error(message);error.status=400;error.code=code;throw error;}
 function requireValue(ok,message,code){if(!ok)fail(message,code);}
 function safe(value,label){requireValue(Number.isSafeInteger(value),label+' supera el límite de precisión');return value;}
 function add(a,b){return safe(a+b,'El total');}
 function monthRange(month){
  requireValue(typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month),'Selecciona un mes válido');
  const start=Date.parse(month+'-01T12:00:00Z'),year=Number(month.slice(0,4)),number=Number(month.slice(5));
  requireValue(year>=1900&&year<=9998,'El año del extracto no es válido');
  const end=Date.UTC(year,number,0,12);
  return {start,end,lower:start-7*DAY,upper:end+7*DAY};
 }
 function isoDate(year,month,day){
  requireValue(year>=1900&&year<=9999&&month>=1&&month<=12&&day>=1&&day<=31,'Fecha no válida');
  const value=new Date(Date.UTC(year,month-1,day,12));
  requireValue(value.getUTCFullYear()===year&&value.getUTCMonth()+1===month&&value.getUTCDate()===day,'Fecha no válida');
  return value.toISOString().slice(0,10);
 }
 function parseDate(value,order='dmy'){
  requireValue(typeof value==='string','La fecha debe ser texto o una fecha convertida por el lector');
  const text=value.trim();let match=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/);
  if(match){if(text.length>10)requireValue(Number.isFinite(Date.parse(text)),'Fecha ISO no válida');return isoDate(+match[1],+match[2],+match[3]);}
  match=text.match(/^(\d{1,2})([\/.\-])(\d{1,2})\2(\d{4})$/);
  requireValue(!!match,'Fecha no reconocida: usa día/mes/año de cuatro cifras o ISO');
  return isoDate(+match[4],+(order==='mdy'?match[1]:match[3]),+(order==='mdy'?match[3]:match[1]));
 }
 function blank(value){return value==null||(typeof value==='string'&&!value.trim());}
 function parseAmount(value,decimal,emptyAllowed=false){
  if(blank(value)){requireValue(emptyAllowed,'Falta el importe');return 0;}
  if(typeof value==='number'){
   requireValue(Number.isFinite(value),'Importe no válido');
   const scaled=value*100,rounded=Math.round(scaled);
   requireValue(Number.isSafeInteger(rounded)&&Math.abs(scaled-rounded)<0.000001,'El importe debe tener como máximo dos decimales y precisión segura');
   return Object.is(rounded,-0)?0:rounded;
  }
  requireValue(typeof value==='string','Importe no válido');
  requireValue(value.length<=100,'El importe es demasiado largo');
  let text=value.trim().replace(/\u2212/g,'-').replace(/\u00a0|\u202f/g,' ').replace(/^(?:EUR|€)\s*/i,'').replace(/\s*(?:EUR|€)$/i,'').trim();
  let negative=false;
  if(/^\(.*\)$/.test(text)){negative=true;text=text.slice(1,-1).trim();requireValue(!/[+-]/.test(text),'Signo del importe ambiguo');}
  else if(/^[+-]/.test(text)){negative=text[0]==='-';text=text.slice(1).trim();}
  else if(/-$/.test(text)){negative=true;text=text.slice(0,-1).trim();}
  requireValue(!/[()+-]/.test(text),'Signo del importe no válido');
  const sep=decimal==='comma'?',':'.',group=decimal==='comma'?'.':',';
  const parts=text.split(sep);requireValue(parts.length<=2&&parts[0].length>0,'Separadores del importe no válidos');
  const fraction=parts[1]||'';
  requireValue((parts.length===1||fraction.length>0)&&/^\d{0,2}$/.test(fraction),'Revisa el separador decimal: máximo dos decimales');
  const integer=parts[0],hasGroup=integer.includes(group),hasSpace=integer.includes(' ');
  requireValue(!(hasGroup&&hasSpace),'Agrupación de miles ambigua');
  const sections=hasGroup?integer.split(group):hasSpace?integer.split(' '):[integer];
  requireValue(sections.every(s=>/^\d+$/.test(s)),'Importe no reconocido');
  requireValue(sections.length===1||(sections[0].length>=1&&sections[0].length<=3&&sections.slice(1).every(s=>s.length===3)),'Agrupación de miles no válida');
  const cents=BigInt(sections.join(''))*100n+BigInt(fraction.padEnd(2,'0')||'0');
  requireValue(cents<=BigInt(Number.MAX_SAFE_INTEGER),'El importe supera el límite de precisión');
  return Number(cents)*(negative?-1:1);
 }
 function validateSheets(sheets){
  requireValue(Array.isArray(sheets)&&sheets.length>0&&sheets.length<=30,'El archivo debe contener entre una y treinta hojas');
  let count=0;
  for(const sheet of sheets){
   requireValue(sheet&&Array.isArray(sheet.rows),'La hoja contiene filas no válidas');
   count+=sheet.rows.length;requireValue(count<=MAX_ROWS,'El archivo supera el límite de '+MAX_ROWS+' filas');
   requireValue(sheet.rows.every(row=>Array.isArray(row)&&row.length<=MAX_COLUMNS),'La hoja contiene filas o columnas no válidas');
  }
 }
 function normalize(sheets,config){
  validateSheets(sheets);config=config||{};monthRange(config.month);
  const sheetIndex=config.sheet??0,header=config.header??0;
  requireValue(Number.isInteger(sheetIndex)&&sheetIndex>=0&&sheetIndex<sheets.length,'Selecciona una hoja válida');
  const sheet=sheets[sheetIndex];
  requireValue(Number.isInteger(header)&&header>=0&&header<sheet.rows.length,'Selecciona la fila de cabecera');
  requireValue(sheet.rows.every(r=>Array.isArray(r)&&r.length<=MAX_COLUMNS),'La hoja contiene filas o columnas no válidas');
  requireValue(sheet.rows.length-header-1<=MAX_ROWS,'El extracto supera el límite de '+MAX_ROWS+' movimientos');
  requireValue(['comma','dot'].includes(config.decimal),'Selecciona el separador decimal');
  requireValue(['dmy','mdy'].includes(config.dateOrder),'Selecciona el orden de día y mes');
  const width=Math.max(0,...sheet.rows.map(r=>r.length)),column=value=>Number.isInteger(value)&&value>=0&&value<width;
  requireValue(column(config.date)&&column(config.description),'Selecciona las columnas de fecha y concepto');
  const signed=config.amount!=null,separate=config.debit!=null||config.credit!=null;
  requireValue(signed!==separate,'Selecciona un importe con signo o columnas separadas de cargo y abono');
  const mapped=[config.date,config.description];
  for(const key of signed?['amount']:['debit','credit'])if(config[key]!=null){requireValue(column(config[key]),'Columna de '+key+' no válida');mapped.push(config[key]);}
  requireValue(new Set(mapped).size===mapped.length,'Una columna no puede tener dos funciones');
  const rows=[],errors=[];let outsideCount=0,totalMagnitude=0;
  for(let index=header+1;index<sheet.rows.length;index++){
   const cells=sheet.rows[index],sourceRow=index+1;
   if(cells.every(blank))continue;
   try{
    const date=parseDate(cells[config.date],config.dateOrder),description=cells[config.description];
    requireValue(typeof description==='string'||typeof description==='number','Falta el concepto');
    const text=String(description).trim();requireValue(text.length>0&&text.length<=MAX_DESCRIPTION,'El concepto está vacío o supera '+MAX_DESCRIPTION+' caracteres');
    let amount;
    if(signed)amount=parseAmount(cells[config.amount],config.decimal);
    else{
     const debit=config.debit==null?0:parseAmount(cells[config.debit],config.decimal,true),credit=config.credit==null?0:parseAmount(cells[config.credit],config.decimal,true);
     requireValue(debit>=0&&credit>=0,'En columnas separadas, cargo y abono deben ser importes positivos');
     requireValue(!(debit&&credit),'La misma fila tiene cargo y abono: revisa las columnas');amount=credit-debit;
    }
    requireValue(amount!==0,'Importe cero: esta fila no identifica un movimiento');
    if(!date.startsWith(config.month)){outsideCount++;continue;}
    totalMagnitude=add(totalMagnitude,Math.abs(amount));
    rows.push({id:'row-'+sourceRow,date,description:text,amount,sourceRow});
   }catch(error){errors.push({row:sourceRow,message:error.message});}
  }
  return {rows,errors,outsideCount};
 }
 function folded(text){return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
 function inferConfig(sheets,monthOrOptions){
  validateSheets(sheets);const month=typeof monthOrOptions==='string'?monthOrOptions:monthOrOptions?.month;
  monthRange(month);let best={score:-1,sheet:0,header:0,date:null,description:null,amount:null,debit:null,credit:null};
  for(let sheet=0;sheet<sheets.length;sheet++)for(let header=0;header<Math.min(30,sheets[sheet].rows.length);header++){
   const values=sheets[sheet].rows[header];if(!Array.isArray(values))continue;
   const labels=values.map(v=>folded(v).replace(/[_-]/g,' '));
   const find=re=>{const index=labels.findIndex(s=>re.test(s));return index<0?null:index;};
   let date=find(/^(?:fecha(?: de)? (?:operacion|contable|movimiento)|booking date|transaction date)$/);
   if(date==null)date=find(/^(?:fecha|date)$/);
   const description=find(/^(?:concepto|descripcion|description|detalle|details|movimiento|concept|transaction description)$/);
   const amount=find(/^(?:importe(?: \(?eur\)?)?|amount|total|importe movimiento)$/),debit=find(/^(?:cargo|cargos|debe|debito|debit|withdrawal|salida)$/),credit=find(/^(?:abono|abonos|haber|credito|credit|deposit|entrada)$/);
   const score=(date!=null?4:0)+(description!=null?3:0)+(amount!=null?4:0)+(debit!=null?2:0)+(credit!=null?2:0);
   if(score>best.score)best={score,sheet,header,date,description,amount,debit:amount==null?debit:null,credit:amount==null?credit:null};
  }
  let comma=0,dot=0;
  for(const row of sheets[best.sheet].rows.slice(best.header+1,best.header+101))for(const col of [best.amount,best.debit,best.credit].filter(v=>v!=null)){
   const value=typeof row[col]==='string'?row[col].trim():'';
   if(/,\d{1,2}(?:\s*(?:EUR|€))?$/i.test(value))comma++;
   if(/\.\d{1,2}(?:\s*(?:EUR|€))?$/i.test(value))dot++;
  }
  delete best.score;return {...best,month,decimal:dot>comma?'dot':'comma',dateOrder:'dmy',openingBalance:null,closingBalance:null};
 }
 function canonical(value){
  if(value==null)return 'null';
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
 }
 // Synchronous SHA-256 keeps fingerprints identical in the browser and API.
 function digest(text){
  const bytes=[];for(const symbol of text){let n=symbol.codePointAt(0);if(n>=0xd800&&n<=0xdfff)n=0xfffd;if(n<128)bytes.push(n);else if(n<2048)bytes.push(192|(n>>6),128|(n&63));else if(n<65536)bytes.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else bytes.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63));}
  const bitLength=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
  const high=Math.floor(bitLength/4294967296),low=bitLength>>>0;for(const value of [high,low])for(let shift=24;shift>=0;shift-=8)bytes.push((value>>>shift)&255);
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],rotate=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let offset=0;offset<bytes.length;offset+=64){
   const w=new Array(64);for(let i=0;i<16;i++)w[i]=(bytes[offset+i*4]<<24)|(bytes[offset+i*4+1]<<16)|(bytes[offset+i*4+2]<<8)|bytes[offset+i*4+3];
   for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=((rotate(a,7)^rotate(a,18)^(a>>>3))+w[i-16]+(rotate(b,17)^rotate(b,19)^(b>>>10))+w[i-7])|0;}
   let [a,b,c,d,e,f,g,last]=h;
   for(let i=0;i<64;i++){const t1=(last+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;last=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
   [a,b,c,d,e,f,g,last].forEach((value,i)=>h[i]=(h[i]+value)|0);
  }
  return h.map(value=>(value>>>0).toString(16).padStart(8,'0')).join('');
 }
 function extract(records,month){
  const range=monthRange(month);requireValue(Array.isArray(records)&&records.length<=MAX_RECORDS,'Demasiados registros para comparar');
  const items=[],warnings=[],seenKeys=new Set(),seenRecordIds=new Set();
  const stamp=date=>Date.parse(date+'T12:00:00Z');
  function relevantHint(date){const hint=String(date||'').slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(hint))return true;return hint>=new Date(range.lower).toISOString().slice(0,7)&&hint<=new Date(range.upper).toISOString().slice(0,7);}
  for(const row of records){
   if(!row||row.voided)continue;const d=row.data,h=d?.history||{};
   if(!d||typeof row.id!=='string'){warnings.push('Hay un registro financiero sin identificador válido.');continue;}
   if(seenRecordIds.has(row.id)){warnings.push('Registro repetido: '+row.id);continue;}seenRecordIds.add(row.id);
   if(['duplicate','draft','review'].includes(h.status)||h.status==='assigned')continue;
   const opening=!!row.included_in_opening,description=[d.title,d.party,d.number].filter(v=>typeof v==='string'&&v.trim()).join(' · ');
   let fingerprint;
   function emit(key,paymentId,date,amount,estimated){
    if(estimated){if(relevantHint(date))warnings.push('Fecha bancaria sin confirmar: '+(d.title||row.id)+'. El mes registrado no demuestra el día del pago.');return;}
    let parsed;try{parsed=parseDate(date,'dmy');}catch(error){if(relevantHint(date))warnings.push('Fecha bancaria no válida: '+(d.title||row.id));return;}
    if(stamp(parsed)<range.lower||stamp(parsed)>range.upper)return;
    if(!Number.isSafeInteger(amount)||!amount){warnings.push('Importe bancario no válido: '+(d.title||row.id));return;}
    if(seenKeys.has(key)){warnings.push('Movimiento bancario repetido: '+key);return;}seenKeys.add(key);
    if(items.length>=MAX_ROWS)fail('Demasiados movimientos bancarios para comparar');
    fingerprint=fingerprint||digest(canonical(row));
    items.push({key,recordId:row.id,...(paymentId?{paymentId}:{}),date:parsed,description,amount,fingerprint:digest(fingerprint+'|'+key),opening,estimated:false,inMonth:parsed.startsWith(month)});
   }
   if(['expense','income'].includes(d.kind)){
    const payments=Array.isArray(d.payments)?d.payments:[];
    for(const payment of payments)if(payment?.account==='bank'){
     if(typeof payment.id!=='string'||!payment.id){warnings.push('Pago bancario sin identificador: '+(d.title||row.id));continue;}
     if(!Number.isSafeInteger(payment.amount)||payment.amount<=0){if(relevantHint(payment.date))warnings.push('Importe bancario no válido: '+(d.title||row.id));continue;}
     emit('payment:'+row.id+':'+payment.id,payment.id,payment.date,(d.kind==='expense'?-1:1)*payment.amount,opening&&h.payment_date_basis==='registered_month');
    }
    if(!payments.length&&h.status==='paid'&&h.account==='bank'&&relevantHint(d.date))warnings.push('Referencia bancaria histórica sin pago fechado: '+(d.title||row.id)+'. Requiere revisión manual.');
   }else if(['transfer','contribution'].includes(d.kind)){
    if(d.source==='bank'&&d.target==='bank'){warnings.push('Transferencia con la misma cuenta de origen y destino: '+(d.title||row.id));continue;}
    if(d.source==='bank'||d.target==='bank'){
     if(!Number.isSafeInteger(d.amount)||d.amount<=0){if(relevantHint(d.date))warnings.push('Importe bancario no válido: '+(d.title||row.id));continue;}
     emit('record:'+row.id,null,d.date,(d.source==='bank'?-1:1)*d.amount,false);
    }
   }
  }
  items.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));return {items,warnings};
 }
 function validateRows(rows,month){
  monthRange(month);requireValue(Array.isArray(rows)&&rows.length<=MAX_ROWS,'Demasiadas filas del extracto');const ids=new Set();let total=0;
  for(const row of rows){
   requireValue(row&&typeof row.id==='string'&&row.id.length>0&&row.id.length<=100&&!ids.has(row.id),'Identificador de fila vacío o duplicado');ids.add(row.id);
   requireValue(parseDate(row.date)===row.date&&row.date.startsWith(month),'Una fila no corresponde al mes seleccionado');
   requireValue(Number.isSafeInteger(row.amount)&&row.amount!==0,'Importe de fila no válido');
   requireValue(typeof row.description==='string'&&row.description.trim().length>0&&row.description.length<=MAX_DESCRIPTION,'Concepto de fila no válido');
   total=add(total,Math.abs(row.amount));
  }
 }
 function checkedDecisions(rows,items,decisions,strict){
  requireValue(Array.isArray(decisions)&&decisions.length<=MAX_ROWS,'Enlaces no válidos','INVALID_DECISION');
  const bank=new Map(rows.map(row=>[row.id,row])),ledger=new Map(items.map(item=>[item.key,item])),rowCounts=new Map(),keyCounts=new Map();
  for(const d of decisions)if(d&&typeof d==='object'){rowCounts.set(d.rowId,(rowCounts.get(d.rowId)||0)+1);keyCounts.set(d.ledgerKey,(keyCounts.get(d.ledgerKey)||0)+1);}
  const valid=[],stale=new Map(),warnings=[];
  for(const decision of decisions){
   const row=bank.get(decision?.rowId),item=ledger.get(decision?.ledgerKey);let message,code='INVALID_DECISION';
   if(!decision||typeof decision.rowId!=='string'||typeof decision.ledgerKey!=='string'||typeof decision.fingerprint!=='string')message='El enlace está incompleto.';
   else if(rowCounts.get(decision.rowId)>1||keyCounts.get(decision.ledgerKey)>1)message='Una fila o un movimiento no pueden estar enlazados más de una vez.';
   else if(!row||!item){message='El movimiento enlazado ya no está disponible para este mes.';code='STALE_MATCH';}
   else if(item.fingerprint!==decision.fingerprint){message='El movimiento cambió desde la revisión. Revisa el enlace antes de confirmarlo.';code='STALE_MATCH';}
   else if(row.amount!==item.amount)message='Los importes del extracto y del movimiento enlazado son distintos.';
   if(message){if(strict)fail(message,code);if(row)stale.set(row.id,{item:item||null,message});else warnings.push(message);}
   else valid.push({rowId:row.id,ledgerKey:item.key,fingerprint:item.fingerprint});
  }
  return {valid,stale,warnings};
 }
 function validateDecisions(rows,records,config,decisions=[]){
  config=config||{};validateRows(rows,config.month);const {items}=extract(records,config.month);
  return checkedDecisions(rows,items,decisions,true).valid;
 }
 const COMMON=new Set(['de','del','la','las','el','los','a','al','en','por','para','y','compra','pago','pagar','recibo','tarjeta','transferencia','sepa','banco','bank','payment','purchase','online','eur','euros','sl','sa','s','l']);
 function tokens(value){return new Set(folded(value).split(/[^a-z0-9]+/).filter(word=>word.length>=3&&!COMMON.has(word)));}
 function similarity(a,b){const left=tokens(a),right=tokens(b);if(!left.size||!right.size)return 0;let common=0;for(const token of left)if(right.has(token))common++;return common/Math.min(left.size,right.size);}
 function deltaDays(a,b){return Math.abs(Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/DAY;}
 function choose(items,row){
  if(!items.length)return {preferred:null,candidates:[]};
  const ranked=items.map(item=>({item,score:similarity(row.description,item.description)})).sort((a,b)=>b.score-a.score||deltaDays(row.date,a.item.date)-deltaDays(row.date,b.item.date)||a.item.key.localeCompare(b.item.key));
  const best=ranked[0];
  if(best.score>=0.5&&(ranked.length===1||best.score>ranked[1].score))return {preferred:best.item,candidates:ranked.map(x=>x.item)};
  return {preferred:null,candidates:ranked.map(x=>x.item)};
 }
 function compare(rows,records,config,decisions=[]){
  config=config||{};validateRows(rows,config.month);
  for(const key of ['openingBalance','closingBalance'])if(config[key]!=null)safe(config[key],'El saldo');
  const {items,warnings:extractionWarnings}=extract(records,config.month),links=checkedDecisions(rows,items,decisions,false),byKey=new Map(items.map(item=>[item.key,item]));
  const used=new Set(links.valid.map(d=>d.ledgerKey)),byRow=new Map(links.valid.map(d=>[d.rowId,d])),available=items.filter(item=>!used.has(item.key)),amounts=new Map(),dates=new Map();
  for(const item of available){if(!amounts.has(item.amount))amounts.set(item.amount,[]);amounts.get(item.amount).push(item);const key=item.date+':'+Math.sign(item.amount);if(!dates.has(key))dates.set(key,[]);dates.get(key).push(item);}
  const preferences=new Map();
  const bankRows=rows.map(row=>{
   const output={...row,status:'unmatched',match:null,candidates:[]};
   if(byRow.has(row.id)){output.status='matched';output.match=byKey.get(byRow.get(row.id).ledgerKey);return output;}
   if(links.stale.has(row.id)){output.status='stale';output.match=links.stale.get(row.id).item;return output;}
   const equal=(amounts.get(row.amount)||[]).filter(item=>deltaDays(row.date,item.date)<=7),sameDate=equal.filter(item=>item.date===row.date);
   let selected=null,candidates=equal;
   if(sameDate.length===1){selected=sameDate[0];candidates=sameDate;}
   else if(sameDate.length>1){const choice=choose(sameDate,row);selected=choice.preferred;candidates=choice.candidates;output.status=selected?'suggested':'ambiguous';}
   else if(equal.length){const choice=choose(equal,row);selected=choice.preferred;candidates=choice.candidates;output.status=selected?'suggested':equal.length>1?'ambiguous':'unmatched';}
   if(selected){output.status='suggested';output.match=selected;}
   if(!selected&&!candidates.length){
    const differences=(dates.get(row.date+':'+Math.sign(row.amount))||[]).filter(item=>item.amount!==row.amount&&similarity(row.description,item.description)>=0.5),choice=choose(differences,row);
    candidates=choice.candidates;if(choice.preferred){output.status='difference';output.match=choice.preferred;selected=choice.preferred;}else if(candidates.length>1)output.status='ambiguous';
   }
   output.candidates=candidates.slice(0,20);
   if(candidates.length>20)output.candidateCount=candidates.length;
   if(selected){if(!preferences.has(selected.key))preferences.set(selected.key,[]);preferences.get(selected.key).push(output);}
   return output;
  });
  // Suggestions are never reservations: competing rows must both be reviewed.
  for(const claims of preferences.values())if(claims.length>1)for(const row of claims){row.status='ambiguous';row.match=null;}
  const ledgerItems=items.map(item=>({...item,matched:used.has(item.key)})),unmatchedLedger=ledgerItems.filter(item=>item.inMonth&&!item.matched);
  const totals={bankIn:0,bankOut:0,bankNet:0,ledgerIn:0,ledgerOut:0,ledgerNet:0,matchedCount:links.valid.length,remainingCount:rows.length-links.valid.length};
  for(const row of rows)totals[row.amount>0?'bankIn':'bankOut']=add(totals[row.amount>0?'bankIn':'bankOut'],Math.abs(row.amount));
  for(const item of items.filter(i=>i.inMonth))totals[item.amount>0?'ledgerIn':'ledgerOut']=add(totals[item.amount>0?'ledgerIn':'ledgerOut'],Math.abs(item.amount));
  totals.bankNet=add(totals.bankIn,-totals.bankOut);totals.ledgerNet=add(totals.ledgerIn,-totals.ledgerOut);
  const opening=config.openingBalance??null,closing=config.closingBalance??null,calculated=opening===null?null:add(opening,totals.bankNet),difference=calculated===null||closing===null?null:add(closing,-calculated),balance={opening,closing,calculated,difference};
  const warnings=[...extractionWarnings,...links.warnings];
  const ready=totals.remainingCount===0&&unmatchedLedger.length===0&&opening!==null&&closing!==null&&difference===0&&warnings.length===0;
  return {bankRows,ledgerItems,unmatchedLedger,warnings,totals,balance,ready};
 }
 return {normalize,inferConfig,extract,compare,validateDecisions};
});
