'use strict';
// Real Express HTTP routing against an in-memory Supabase double. No .env,
// authentication secrets or production database are loaded by these tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('crypto');
const {baseline} = require('./fixtures/finance');
const tables={finance_records:[],finance_files:[],finance_audit:[],finance_settings:[{id:true,baseline}]};
const clone=x=>structuredClone(x);
function from(name){
 let operation='select',payload,filters=[],start=0,end=Infinity,single=false,maybe=false;
 const q={
  select(){return q;},order(){return q;},limit(n){end=n-1;return q;},range(a,b){start=a;end=b;return q;},
  eq(k,v){filters.push(row=>row[k]===v);return q;},
  insert(v){operation='insert';payload=v;return q;},update(v){operation='update';payload=v;return q;},
  single(){single=true;return q;},maybeSingle(){single=true;maybe=true;return q;},
  then(resolve,reject){return Promise.resolve().then(()=>{
   let selected;
   if(operation==='insert'){
    const row={version:1,voided:false,...clone(payload)};
    if(tables[name].some(x=>x.id===row.id||(row.origin_key&&x.origin_key===row.origin_key)))return {data:null,error:{code:'23505'}};
    tables[name].push(row);selected=[row];
   }else{
    selected=tables[name].filter(row=>filters.every(f=>f(row)));
    if(operation==='update')for(const row of selected)Object.assign(row,clone(payload));
   }
   selected=selected.slice(start,end+1);
   if(single&&!selected.length)return {data:null,error:maybe?null:{message:'not found'}};
   return {data:clone(single?selected[0]:selected),error:null};
  }).then(resolve,reject);},
 };return q;
}
const stub={from,storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://example.invalid/private-file'},error:null})})}};
require.cache[require.resolve('../config/supabase')]={exports:{supabase:stub}};
require.cache[require.resolve('../middleware/auth')]={exports:(req,res,next)=>{if(req.headers.authorization!=='Bearer test-session')return res.status(401).json({error:'auth required'});req.user={id:'test-user',email:'test@example.invalid'};next();}};
const express=require('express');const app=express();app.use(express.json());app.use('/api/finance',require('../routes/finance'));
let server,base;const oldEnabled=process.env.FINANCE_V2,oldLive=process.env.FINANCE_V2_LIVE,oldKey=process.env.SUPABASE_SERVICE_KEY;
test.before(async()=>{process.env.FINANCE_V2='true';process.env.FINANCE_V2_LIVE='true';process.env.SUPABASE_SERVICE_KEY='test-not-a-secret';server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));base='http://127.0.0.1:'+server.address().port+'/api/finance';});
test.after(async()=>{if(oldLive===undefined)delete process.env.FINANCE_V2_LIVE;else process.env.FINANCE_V2_LIVE=oldLive;await new Promise(r=>server.close(r));if(oldEnabled===undefined)delete process.env.FINANCE_V2;else process.env.FINANCE_V2=oldEnabled;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_KEY;else process.env.SUPABASE_SERVICE_KEY=oldKey;});
async function req(path,method='GET',body,authorized=true){const headers={};if(authorized)headers.Authorization='Bearer test-session';if(body)headers['Content-Type']='application/json';const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
function doc(){return {kind:'expense',title:'Test receipt',amount:1000,date:'2026-10-05',payments:[]};}
test('anonymous callers cannot inspect financial records',async()=>{assert.equal((await req('/','GET',null,false)).status,401);});
test('disabled feature fails closed, without accessing legacy data',async()=>{process.env.FINANCE_V2='false';assert.equal((await req('/')).status,503);process.env.FINANCE_V2='true';});
test('create retry is idempotent and changing content with same id conflicts',async()=>{
 const id=randomUUID(),data=doc();assert.equal((await req('/records','POST',{id,data})).status,201);
 assert.equal((await req('/records','POST',{id,data})).status,200);
 assert.equal(tables.finance_records.filter(x=>x.id===id).length,1);
 assert.equal((await req('/records','POST',{id,data:{...data,amount:2000}})).status,409);
});
test('optimistic locking prevents stale edits; identical retry after lost response succeeds',async()=>{
 const id=randomUUID(),data=doc();await req('/records','POST',{id,data});
 const edited={...data,title:'Updated'};
 assert.equal((await req('/records/'+id,'PUT',{version:1,data:edited})).status,200);
 assert.equal((await req('/records/'+id,'PUT',{version:1,data:edited})).status,200);
 assert.equal((await req('/records/'+id,'PUT',{version:1,data:{...data,title:'Stale edit'}})).status,409);
});
test('invalid dates and overpayment never persist',async()=>{
 const id=randomUUID(),data={...doc(),payments:[{id:randomUUID(),amount:1001,date:'2026-10-05',account:'santi'}]};
 assert.equal((await req('/records','POST',{id,data})).status,400);assert.ok(!tables.finance_records.some(x=>x.id===id));
});
test('preparing next month twice creates one unpaid forecast',async()=>{
 const id=randomUUID(),data={...doc(),repeat:'monthly'};await req('/records','POST',{id,data});
 const a=await req('/records/'+id+'/next','POST',{}),b=await req('/records/'+id+'/next','POST',{});
 assert.equal(a.status,201);assert.equal(b.status,200);assert.equal(a.data.id,b.data.id);assert.deepEqual(a.data.data.payments,[]);
});
test('voided documents remain traceable and cannot be edited',async()=>{
 const id=randomUUID(),data=doc();await req('/records','POST',{id,data});
 assert.equal((await req('/records/'+id+'/void','POST',{version:1,reason:'Duplicate receipt'})).status,200);
 assert.equal((await req('/records/'+id,'PUT',{version:2,data})).status,400);
 assert.equal(tables.finance_records.find(x=>x.id===id).voided,true);
});
test('attachment endpoint accepts a PDF, rejects disguised HTML and requires auth',async()=>{
 const id=randomUUID();await req('/records','POST',{id,data:doc()});
 async function send(contents,authorized=true){const form=new FormData();form.append('file',new Blob([contents],{type:'application/pdf'}),'receipt.pdf');return fetch(base+'/records/'+id+'/files',{method:'POST',headers:authorized?{Authorization:'Bearer test-session'}:{},body:form});}
 assert.equal((await send('<html>not a pdf</html>')).status,400);
 assert.equal((await send('%PDF-1.4\n test-only placeholder')).status,201);
 assert.equal((await send('%PDF-1.4\n',false)).status,401);
});
test('opening references cannot be edited or voided and can prepare the next month',async()=>{
 const id=randomUUID();tables.finance_records.push({id,version:1,voided:false,included_in_opening:true,data:{...doc(),repeat:'monthly'}});
 assert.equal((await req('/records/'+id,'PUT',{version:1,data:doc()})).status,409);
 assert.equal((await req('/records/'+id+'/void','POST',{version:1,reason:'Attempt to alter opening'})).status,409);
 const result=await req('/records/'+id+'/next','POST',{});assert.equal(result.status,201);assert.notEqual(result.data.included_in_opening,true);
});


test('review mode exposes the reviewed data but rejects every write route',async()=>{
 process.env.FINANCE_V2_LIVE='false';
 try {
  const status=await req('/status');assert.equal(status.data.enabled,true);assert.equal(status.data.live,false);
  const snapshot=await req('/');assert.equal(snapshot.status,200);assert.equal(snapshot.data.review,true);
  for(const [path,method,body] of [['/records','POST',{id:randomUUID(),data:doc()}],['/records/'+randomUUID(),'PUT',{}],['/records/'+randomUUID()+'/next','POST',{}],['/records/'+randomUUID()+'/void','POST',{}],['/records/'+randomUUID()+'/files','POST',{}]]) assert.equal((await req(path,method,body)).status,409);
 } finally {process.env.FINANCE_V2_LIVE='true';}
});
test('legacy writes remain available during review and are blocked only after live cutover',()=>{
 const guard=require('../middleware/finance-legacy');let next=false,status;
 const res={status(n){status=n;return this;},json(){return this;}};
 process.env.FINANCE_V2_LIVE='false';guard({method:'POST'},res,()=>next=true);assert.equal(next,true);
 process.env.FINANCE_V2_LIVE='true';next=false;guard({method:'POST'},res,()=>next=true);assert.equal(status,409);assert.equal(next,false);
 guard({method:'GET'},res,()=>next=true);assert.equal(next,true);
});
