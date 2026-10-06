'use strict';
// Express HTTP tests with synthetic records and an in-memory private database.
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const engine=require('../public/js/finance-bank');
const clone=value=>structuredClone(value),tables={finance_records:[],finance_settings:[],finance_bank_reviews:[],finance_bank_review_audit:[]},stored=new Map();
let unavailable=false,failUpload=false,failInsert=false,failDownload=false,uploads=0,downloads=0,downloadHook;
function from(table){
 let operation='select',payload,filters=[],columns='*',start=0,end=Infinity,single=false,sort;
 const q={select(value='*'){columns=value;return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},order(k,options){sort={k,ascending:options?.ascending!==false};return q;},limit(n){end=n-1;return q;},range(a,b){start=a;end=b;return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},insert(value){operation='insert';payload=value;return q;},update(value){operation='update';payload=value;return q;},then(resolve,reject){return Promise.resolve().then(()=>{
  if(unavailable&&table==='finance_bank_reviews')return {data:null,error:{code:'42P01'}};
  let selected;
  if(operation==='insert'){
   if(failInsert)return {data:null,error:{code:'XX000'}};
   const row={version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...clone(payload)};
   if(tables[table].some(r=>r.id===row.id||table==='finance_bank_reviews'&&r.month===row.month&&r.source_hash===row.source_hash))return {data:null,error:{code:'23505'}};
   tables[table].push(row);selected=[row];if(table==='finance_bank_reviews')tables.finance_bank_review_audit.push({before_row:null,after_row:clone(row),actor:row.actor});
  }else{
   selected=tables[table].filter(row=>filters.every(fn=>fn(row)));
   if(operation==='update')for(const row of selected){const before=clone(row);Object.assign(row,clone(payload));if(table==='finance_bank_reviews')tables.finance_bank_review_audit.push({before_row:before,after_row:clone(row),actor:row.actor});}
  }
  if(sort)selected=[...selected].sort((a,b)=>String(a[sort.k]).localeCompare(String(b[sort.k]))*(sort.ascending?1:-1));
  selected=selected.slice(start,end+1).map(row=>columns==='*'?clone(row):Object.fromEntries(columns.split(',').map(k=>[k,row[k]])));
  return {data:single?(selected[0]||null):selected,error:null};
 }).then(resolve,reject);}};return q;
}
const supabase={from,storage:{from:bucket=>({upload:async(path,buffer,options)=>{uploads++;if(failUpload)return {error:{message:'storage unavailable'}};stored.set(bucket+'/'+path,{buffer:Buffer.from(buffer),options});return {error:null};},download:async path=>{downloads++;if(downloadHook)downloadHook();const entry=stored.get(bucket+'/'+path);return failDownload||!entry?{data:null,error:{message:'storage unavailable'}}:{data:new Blob([entry.buffer]),error:null};},remove:async paths=>{paths.forEach(path=>stored.delete(bucket+'/'+path));return {error:null};},createSignedUrl:async(path,seconds)=>({data:{signedUrl:'https://example.invalid/private-download?expires='+seconds},error:stored.has(bucket+'/'+path)?null:{message:'missing'}})})}};
require.cache[require.resolve('../config/supabase')]={exports:{supabase}};
require.cache[require.resolve('../middleware/auth')]={exports:(req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic-session')return res.status(401).json({error:'auth required'});req.user={id:'synthetic-user',email:'reviewer@example.invalid'};next();}};
const express=require('express'),app=express();app.use(express.json({limit:'6mb'}));app.use('/api/finance',require('../routes/finance'));
let server,base;const env={FINANCE_V2:process.env.FINANCE_V2,FINANCE_V2_LIVE:process.env.FINANCE_V2_LIVE,SUPABASE_SERVICE_KEY:process.env.SUPABASE_SERVICE_KEY};
const CSV='Fecha;Concepto;Importe\n05/10/2026;Proveedor ficticio;-10,00\n',config=()=>({month:'2026-10',sheet:0,header:0,date:0,description:1,amount:2,debit:null,credit:null,decimal:'comma',dateOrder:'dmy',openingBalance:0,closingBalance:-1000});
test.before(async()=>{process.env.FINANCE_V2='true';process.env.FINANCE_V2_LIVE='true';process.env.SUPABASE_SERVICE_KEY='synthetic-only';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port+'/api/finance/bank-reviews';});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const [key,value] of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
test.beforeEach(()=>{
 for(const table of Object.keys(tables))tables[table].length=0;stored.clear();unavailable=false;failUpload=false;failInsert=false;failDownload=false;uploads=0;downloads=0;downloadHook=undefined;
 tables.finance_records.push({id:randomUUID(),version:1,data:{kind:'expense',title:'Proveedor ficticio',date:'2026-10-05',amount:1000,payments:[{id:randomUUID(),amount:1000,date:'2026-10-05',account:'bank'}]}});
 tables.finance_settings.push({id:true,baseline:{cash:{bank:7000},operating:{santi:2000}}});
});
async function json(path='',method='GET',body,authorized=true){const res=await fetch(base+path,{method,headers:{...(authorized?{Authorization:'Bearer synthetic-session'}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};}
async function upload(path='',{contents=CSV,filename='bank.csv',options=config(),decisions=[],notes='',authorized=true}={}){
 const form=new FormData();form.append('file',new Blob([contents]),filename);if(path!=='/parse'){form.append('config',JSON.stringify(options));form.append('decisions',JSON.stringify(decisions));if(notes)form.append('notes',notes);}
 const res=await fetch(base+path,{method:'POST',headers:authorized?{Authorization:'Bearer synthetic-session'}:{},body:form});return {status:res.status,data:await res.json()};
}
function sourceRows(){return engine.normalize([{name:'CSV',rows:[['Fecha','Concepto','Importe'],['05/10/2026','Proveedor ficticio','-10,00']]}],config()).rows;}
function links(){const item=engine.extract(tables.finance_records,'2026-10').items[0];return [{rowId:sourceRows()[0].id,ledgerKey:item.key,fingerprint:item.fingerprint}];}

test('authentication and parent live flags guard reads, parsing, comparison and writes',async()=>{
 assert.equal((await json('','GET',undefined,false)).status,401);
 assert.equal((await upload('/parse',{authorized:false})).status,401);
 assert.equal((await upload('',{authorized:false})).status,401);
 assert.equal((await json('/compare','POST',{rows:sourceRows(),config:config()},false)).status,401);
 process.env.FINANCE_V2_LIVE='false';try{assert.equal((await upload('/parse')).status,409);assert.equal((await json('')).status,200);}finally{process.env.FINANCE_V2_LIVE='true';}
 process.env.FINANCE_V2='false';try{assert.equal((await json('')).status,503);}finally{process.env.FINANCE_V2='true';}
 assert.equal(uploads,0);assert.equal(tables.finance_bank_reviews.length,0);
});
test('parse and compare do not persist files, reviews, payments or baseline',async()=>{
 const records=clone(tables.finance_records),settings=clone(tables.finance_settings);
 const parsed=await upload('/parse');assert.equal(parsed.status,200);assert.equal(parsed.data.filename,'bank.csv');assert.match(parsed.data.hash,/^[a-f0-9]{64}$/);assert.equal(parsed.data.sheets[0].rows.length,2);
 const compared=await json('/compare','POST',{rows:sourceRows(),config:config(),decisions:[]});assert.equal(compared.status,200);assert.ok(compared.data.bankRows);
 assert.equal(uploads,0);assert.equal(tables.finance_bank_reviews.length,0);assert.deepEqual(tables.finance_records,records);assert.deepEqual(tables.finance_settings,settings);
});
test('save reparses source, permits pending reviews and hash-month retries preserve the original version',async()=>{
 const records=clone(tables.finance_records),settings=clone(tables.finance_settings),first=await upload('',{notes:'Pending check'});
 assert.equal(first.status,201);assert.equal(first.data.duplicate,false);assert.equal(first.data.review.actor,'reviewer@example.invalid');assert.equal(first.data.review.rows[0].amount,-1000);assert.equal(first.data.review.version,1);
 const retry=await upload('',{options:{...config(),openingBalance:1234},notes:'Do not overwrite'});
 assert.equal(retry.status,200);assert.equal(retry.data.duplicate,true);assert.equal(retry.data.review.id,first.data.review.id);assert.equal(retry.data.review.notes,'Pending check');assert.equal(retry.data.review.config.openingBalance,0);assert.equal(retry.data.review.version,1);
 assert.equal(tables.finance_bank_reviews.length,1);assert.equal(stored.size,1);assert.equal(uploads,1);
 assert.deepEqual(tables.finance_records,records);assert.deepEqual(tables.finance_settings,settings);
});
test('optimistic updates alter only review decisions and notes; stale versions and forged rows fail',async()=>{
 const first=await upload(''),id=first.data.review.id,records=clone(tables.finance_records),source=clone(first.data.review.rows);
 const updated=await json('/'+id,'PUT',{version:1,decisions:links(),notes:'Compared',openingBalance:0,closingBalance:-1000});
 assert.equal(updated.status,200);assert.equal(updated.data.review.version,2);assert.equal(updated.data.comparison.ready,true);
 assert.equal((await json('/'+id,'PUT',{version:1,notes:'Stale'})).status,409);
 assert.equal((await json('/'+id,'PUT',{version:2,rows:[],month:'2026-11'})).status,400);
 assert.deepEqual(tables.finance_bank_reviews[0].rows,source);assert.deepEqual(tables.finance_records,records);assert.equal(tables.finance_bank_review_audit.length,2);
 assert.equal(tables.finance_bank_review_audit[1].actor,'reviewer@example.invalid');
});
test('changed ledger fingerprints invalidate stored matches without silently rewriting them',async()=>{
 const created=await upload('',{decisions:links()}),id=created.data.review.id,saved=clone(created.data.review.decisions);
 tables.finance_records[0].data.payments[0].amount=1100;
 const current=await json('/'+id);assert.equal(current.status,200);assert.equal(current.data.comparison.ready,false);
 assert.equal((await json('/'+id,'PUT',{version:1,decisions:saved})).status,409);
 assert.deepEqual(tables.finance_bank_reviews[0].decisions,saved);assert.equal(tables.finance_bank_reviews[0].version,1);
});
test('invalid source rows, columns and decisions never persist',async()=>{
 const invalid=await upload('',{contents:CSV+'invalid-date;Bad row;-2,00\n'});assert.equal(invalid.status,400);assert.equal(invalid.data.details.length,1);
 assert.equal((await upload('',{options:{...config(),date:1}})).status,400);
 assert.equal((await upload('',{decisions:[null]})).status,400);
 assert.equal((await upload('/parse',{contents:'%PDF',filename:'bank.pdf'})).status,400);
 assert.equal((await upload('/parse',{contents:'x',filename:'bank.xlsx'})).status,400);
 assert.equal((await json('/compare','POST',{rows:sourceRows(),config:{...config(),openingBalance:1.23}})).status,400);
 assert.equal(uploads,0);assert.equal(stored.size,0);assert.equal(tables.finance_bank_reviews.length,0);
});
test('private file URLs require authentication and list responses contain metadata only',async()=>{
 const created=await upload(''),id=created.data.review.id;
 assert.equal((await json('/'+id+'/file','GET',undefined,false)).status,401);
 const link=await json('/'+id+'/file');assert.equal(link.status,200);assert.match(link.data.url,/expires=60/);
 const list=await json('?month=2026-10');assert.equal(list.status,200);assert.equal(list.data.length,1);assert.equal(list.data[0].rows,undefined);assert.equal(list.data[0].path,undefined);
 assert.equal((await json('?month=2026-99')).status,400);
});
test('missing table and failed storage return errors without orphaning financial changes',async()=>{
 unavailable=true;assert.equal((await json('')).status,503);assert.equal((await upload('')).status,503);assert.equal(uploads,0);unavailable=false;
 failUpload=true;assert.equal((await upload('')).status,503);assert.equal(tables.finance_bank_reviews.length,0);failUpload=false;
 failInsert=true;assert.equal((await upload('')).status,503);assert.equal(stored.size,0);assert.equal(tables.finance_bank_reviews.length,0);
});
test('saved columns are reparsed from the authenticated private original without writing',async()=>{
 const created=await upload('',{notes:'Keep this note'}),id=created.data.review.id,reviewBefore=clone(created.data.review),records=clone(tables.finance_records),settings=clone(tables.finance_settings);
 assert.equal((await json('/'+id+'/columns','GET',undefined,false)).status,401);assert.equal(downloads,0);
 const result=await json('/'+id+'/columns');assert.equal(result.status,200);assert.equal(result.data.filename,'bank.csv');assert.equal(result.data.hash,created.data.review.source_hash);assert.deepEqual(result.data.sheets,[{name:'CSV',rows:[['Fecha','Concepto','Importe'],['05/10/2026','Proveedor ficticio','-10,00']]}]);
 assert.equal(downloads,1);assert.equal(uploads,1);assert.deepEqual(tables.finance_bank_reviews[0],reviewBefore);assert.deepEqual(tables.finance_records,records);assert.deepEqual(tables.finance_settings,settings);assert.equal(tables.finance_bank_review_audit.length,1);
});
test('remapping reparses amounts, clears matches, preserves notes and source, and audits both versions',async()=>{
 const contents='Fecha;Concepto;Importe;Neto\n05/10/2026;Proveedor ficticio;-10,00;-12,34\n';
 const created=await upload('',{contents,decisions:links(),notes:'Keep the original note'}),first=created.data.review,id=first.id,records=clone(tables.finance_records),settings=clone(tables.finance_settings),originalBytes=Buffer.from([...stored.values()][0].buffer);
 assert.equal(created.data.comparison.ready,true);
 assert.equal((await json('/'+id+'/remap','POST',{version:1,config:{...config(),amount:3}},false)).status,401);assert.equal(downloads,0);
 const result=await json('/'+id+'/remap','POST',{version:1,config:{...config(),amount:3,closingBalance:-1234}});
 assert.equal(result.status,200);assert.equal(result.data.review.version,2);assert.equal(result.data.review.rows[0].amount,-1234);assert.equal(result.data.review.config.amount,3);assert.equal(result.data.review.config.importErrorCount,0);assert.deepEqual(result.data.review.decisions,[]);assert.equal(result.data.comparison.ready,false);
 for(const field of ['id','month','source_hash','name','path','notes','created_at'])assert.deepEqual(result.data.review[field],first[field]);
 assert.equal(result.data.review.actor,'reviewer@example.invalid');assert.deepEqual(tables.finance_records,records);assert.deepEqual(tables.finance_settings,settings);assert.deepEqual([...stored.values()][0].buffer,originalBytes);assert.equal(uploads,1);
 const audit=tables.finance_bank_review_audit[1];assert.deepEqual(audit.before_row,first);assert.deepEqual(audit.after_row,result.data.review);assert.equal(tables.finance_bank_review_audit.length,2);
 const retry=await upload('',{contents});assert.equal(retry.data.duplicate,true);assert.equal(retry.data.review.version,2);assert.equal(retry.data.review.rows[0].amount,-1234);
});
test('remapping rejects different months, invalid or empty mappings, forged data, and stale versions',async()=>{
 const created=await upload('',{contents:'Fecha;Concepto;Importe;Otro mes;Texto\n05/10/2026;Proveedor ficticio;-10,00;05/11/2026;not-an-amount\n',decisions:links()}),id=created.data.review.id,before=clone(created.data.review);
 assert.equal((await json('/'+id+'/remap','POST',{version:0,config:config()})).status,409);
 assert.equal((await json('/'+id+'/remap','POST',{version:1,config:{...config(),month:'2026-11'}})).status,400);
 assert.equal((await json('/'+id+'/remap','POST',{version:1,config:config(),rows:[]})).status,400);assert.equal(downloads,0);
 const invalid=await json('/'+id+'/remap','POST',{version:1,config:{...config(),amount:4}});assert.equal(invalid.status,400);assert.equal(invalid.data.details.length,1);
 assert.equal((await json('/'+id+'/remap','POST',{version:1,config:{...config(),date:3}})).status,400);
 assert.deepEqual(tables.finance_bank_reviews[0],before);assert.equal(tables.finance_bank_review_audit.length,1);
 downloadHook=()=>{tables.finance_bank_reviews[0].version=2;downloadHook=undefined;};
 const raced=await json('/'+id+'/remap','POST',{version:1,config:{...config(),openingBalance:500}});assert.equal(raced.status,409);assert.deepEqual(tables.finance_bank_reviews[0],{...before,version:2});assert.equal(tables.finance_bank_review_audit.length,1);
});
test('private download failures, oversize and altered originals cannot modify a saved review',async()=>{
 const created=await upload('',{decisions:links()}),id=created.data.review.id,before=clone(created.data.review),records=clone(tables.finance_records),entry=[...stored.values()][0],bytes=Buffer.from(entry.buffer);
 failDownload=true;assert.equal((await json('/'+id+'/columns')).status,503);assert.equal((await json('/'+id+'/remap','POST',{version:1,config:config()})).status,503);failDownload=false;
 entry.buffer=Buffer.alloc(5*1024*1024+1,32);assert.equal((await json('/'+id+'/columns')).status,503);assert.equal((await json('/'+id+'/remap','POST',{version:1,config:config()})).status,503);
 entry.buffer=Buffer.from(CSV.replace('-10,00','-99,00'));assert.equal((await json('/'+id+'/columns')).status,409);assert.equal((await json('/'+id+'/remap','POST',{version:1,config:config()})).status,409);
 entry.buffer=bytes;stored.clear();assert.equal((await json('/'+id+'/columns')).status,503);
 assert.deepEqual(tables.finance_bank_reviews[0],before);assert.deepEqual(tables.finance_records,records);assert.equal(tables.finance_bank_review_audit.length,1);assert.equal(uploads,1);
});
