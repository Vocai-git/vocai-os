'use strict';
// Real routers and session middleware; every external service is simulated.
// No server.js, dotenv, credentials, Telegram traffic or database is used.
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const clone=value=>structuredClone(value),hash=value=>createHash('sha256').update(value).digest('hex');
const {createDocumentsMock}=require('./finance-documents-mock');
const {supabase,tables,stored,remoteFiles,calls,user,state}=createDocumentsMock();
require.cache[require.resolve('../config/supabase')]={exports:{supabase}};
const originalFetch=global.fetch,oldEnv={},environment={FINANCE_V2:'true',FINANCE_V2_LIVE:'true',SUPABASE_SERVICE_KEY:'synthetic-only',TELEGRAM_DOCUMENTS_BOT_TOKEN:'123456:synthetic-test-token',TELEGRAM_DOCUMENTS_BOT_USERNAME:'test_documents_bot',TELEGRAM_DOCUMENTS_WEBHOOK_SECRET:'s'.repeat(48)};
const PDF=Buffer.from('%PDF-1.4\n synthetic invoice document\n%%EOF'),chatId=123456789;
let server,base;
function message(updateId,extra={},chat=chatId){return {update_id:updateId,message:{message_id:updateId,date:1791280800,from:{id:chat,is_bot:false,first_name:'Synthetic'},chat:{id:chat,type:'private'},...extra}};}
function documentMessage(updateId,fileId='receipt',extra={}){return message(updateId,{document:{file_id:fileId,file_unique_id:'unique-'+fileId,file_name:'receipt.pdf',mime_type:'application/pdf',file_size:(remoteFiles.get(fileId)||PDF).length},...extra});}
async function request(path,method='GET',body,token='documents-test-session'){
 const res=await originalFetch(base+'/api/finance/documents'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};
}
async function webhook(body,secret=environment.TELEGRAM_DOCUMENTS_WEBHOOK_SECRET){
 const res=await originalFetch(base+'/api/telegram/documents/webhook',{method:'POST',headers:{'Content-Type':'application/json',...(secret?{'X-Telegram-Bot-Api-Secret-Token':secret}:{})},body:typeof body==='string'?body:JSON.stringify(body)});return {status:res.status,data:await res.json()};
}
async function pair(){const issued=await request('/telegram/code','POST',{});assert.equal(issued.status,200);assert.equal((await webhook(message(1,{text:'/start '+issued.data.code}))).status,200);assert.equal(tables.finance_telegram_pairs.filter(pair=>pair.active).length,1);return issued.data;}
test.before(async()=>{
 for(const [key,value]of Object.entries(environment)){oldEnv[key]=process.env[key];process.env[key]=value;}
 global.fetch=async(url,options={})=>{
  const target=new URL(String(url));assert.equal(target.origin,'https://api.telegram.org','A document cannot initiate arbitrary network requests');
  calls.push({telegram:target.pathname.split('/').at(-1)});assert.equal(options.redirect,'error');
  if(target.pathname.endsWith('/getFile')){const input=JSON.parse(options.body),bytes=remoteFiles.get(input.file_id);return new Response(JSON.stringify(bytes?{ok:true,result:{file_path:'documents/'+input.file_id+'.pdf',file_size:bytes.length}}:{ok:false}),{status:bytes?200:404,headers:{'Content-Type':'application/json'}});}
  if(target.pathname.includes('/file/bot')){const fileId=target.pathname.split('/').at(-1).replace(/\.pdf$/,''),bytes=remoteFiles.get(fileId);return new Response(bytes||'',{status:bytes?200:404,headers:{'Content-Length':String(bytes?.length||0)}});}
  if(target.pathname.endsWith('/sendMessage'))return new Response(JSON.stringify({ok:true,result:{message_id:900}}),{headers:{'Content-Type':'application/json'}});
  throw new Error('Unexpected Telegram method');
 };
 const express=require('express'),app=express();
 app.use('/api/telegram/documents',require('../routes/telegram-documents'));
 app.use(express.json());app.use('/api/finance',require('../routes/finance'));
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));global.fetch=originalFetch;for(const [key,value]of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
test.beforeEach(()=>{
 for(const table of Object.keys(tables))tables[table].length=0;stored.clear();remoteFiles.clear();calls.length=0;Object.assign(state,{financialWrites:0,recordCreates:0,storageFailure:false,insertFailure:false,ownerDisabled:false,ownerAuthFailure:false});remoteFiles.set('receipt',PDF);
 tables.finance_records.push({id:randomUUID(),version:1,voided:false,included_in_opening:true,data:{kind:'expense',title:'Synthetic historical invoice',amount:7500,date:'2026-09-01',payments:[]}});
 tables.finance_settings.push({id:true,baseline:{cutoff:'2026-10-05',cash:{bank:20000},operating:{santi:0}}});
});
test.afterEach(()=>assert.equal(state.financialWrites,0,'Documents must never modify the ledger or opening balances'));

test('real session auth protects the inbox and the webhook secret is checked before parsing JSON',async()=>{
 assert.equal((await request('','GET',undefined,null)).status,401);assert.equal((await request('','GET',undefined,'expired-session')).status,401);
 assert.equal((await webhook('{invalid',null)).status,401);assert.equal((await webhook('{invalid','wrong-secret')).status,401);
 assert.ok(!calls.some(call=>call.rpc||call.upload||call.telegram));assert.equal(tables.finance_documents.length,0);
});

test('pairing uses a single-use private-chat code and does not persist its plaintext',async()=>{
 const issued=await pair();assert.ok(issued.code);assert.equal(tables.finance_telegram_codes[0].hash,hash(issued.code));assert.ok(!JSON.stringify(tables).includes(issued.code));
 const status=await request('/telegram');assert.equal(status.status,200);assert.equal(status.data.pairing.chatId,chatId);
 await webhook(message(2,{text:'/start '+issued.code},chatId+1));assert.equal(tables.finance_telegram_pairs.filter(pair=>pair.active).length,1);assert.equal(tables.finance_telegram_pairs[0].chat_id,chatId);
});

test('Telegram intake, list, atomic linking and signed download never change financial records',async()=>{
 await pair();const ledger=clone(tables.finance_records),settings=clone(tables.finance_settings);
 const received=await webhook(documentMessage(2));assert.equal(received.status,200);
 const list=await request('?status=pending&offset=0&limit=50');assert.equal(list.status,200);assert.equal(list.data.total,1);assert.equal(list.data.documents.length,1);
 const doc=list.data.documents[0];assert.equal(doc.source,'telegram');assert.equal(doc.status,'pending');assert.equal(tables.finance_documents[0].actor,user.email);assert.ok(doc.draft_record_id);assert.equal(tables.finance_files.length,0);
 const linked=await request('/'+doc.id+'/link','POST',{version:doc.version,recordId:ledger[0].id});assert.equal(linked.status,200);assert.equal(linked.data.document.status,'linked');assert.equal(linked.data.file.record_id,ledger[0].id);
 const retry=await request('/'+doc.id+'/link','POST',{version:doc.version,recordId:ledger[0].id});assert.equal(retry.status,200);assert.equal(retry.data.file.id,linked.data.file.id);assert.equal(tables.finance_files.length,1);
 const file=await request('/'+doc.id+'/file');assert.equal(file.status,200);assert.match(file.data.url,/expires=60/);assert.ok(calls.some(call=>call.signed&&call.bucket==='finance-private'&&call.seconds===60));
 assert.deepEqual(tables.finance_records,ledger);assert.deepEqual(tables.finance_settings,settings);assert.equal(tables.finance_documents_audit.length,2);
});

test('delivery retries and duplicate content preserve the existing document and its linked state',async()=>{
 await pair();const incoming=documentMessage(2);assert.equal((await webhook(incoming)).status,200);const doc=clone(tables.finance_documents[0]);
 await request('/'+doc.id+'/link','POST',{version:doc.version,recordId:tables.finance_records[0].id});const linked=clone(tables.finance_documents[0]),downloadCount=calls.filter(call=>call.telegram==='getFile').length;
 assert.equal((await webhook(incoming)).status,200);assert.equal(calls.filter(call=>call.telegram==='getFile').length,downloadCount);
 assert.equal((await webhook(documentMessage(3))).status,200);assert.equal(tables.finance_documents.length,1);assert.equal(tables.finance_files.length,1);assert.deepEqual(tables.finance_documents[0],linked);assert.equal(stored.size,1);
});

test('unpaired senders, group messages and forged file types never reach private intake',async()=>{
 assert.equal((await webhook(documentMessage(2))).status,200);assert.ok(!calls.some(call=>call.telegram==='getFile'));await pair();
 const group=documentMessage(3);group.message.chat={id:-123,type:'group'};await webhook(group);assert.ok(!calls.some(call=>call.telegram==='getFile'));
 remoteFiles.set('html',Buffer.from('<html>not a PDF</html>'));assert.equal((await webhook(documentMessage(4,'html'))).status,200);
 assert.equal(tables.finance_documents.length,0);assert.equal(stored.size,0);
});

test('a transient upload failure is retryable without duplicate documents or a lost original',async()=>{
 await pair();state.storageFailure=true;assert.equal((await webhook(documentMessage(2))).status,503);assert.equal(tables.finance_documents.length,0);assert.equal(stored.size,0);
 state.storageFailure=false;assert.equal((await webhook(documentMessage(2))).status,200);assert.equal(tables.finance_documents.length,1);assert.equal(stored.size,1);
});

test('concurrent identical file deliveries create one inbox document and leave its storage intact',async()=>{
 await pair();const results=await Promise.all([webhook(documentMessage(2)),webhook(documentMessage(3))]);assert.deepEqual(results.map(result=>result.status),[200,200]);
 assert.equal(tables.finance_documents.length,1);assert.equal(stored.size,1);const doc=tables.finance_documents[0];assert.ok(stored.has('finance-private/'+doc.path));assert.deepEqual(stored.get('finance-private/'+doc.path).buffer,PDF);
});

test('only explicit create records an unpaid expense and retries reuse the reserved id and attachment',async()=>{
 await pair();await webhook(documentMessage(2));const doc=clone(tables.finance_documents[0]),ledger=clone(tables.finance_records),settings=clone(tables.finance_settings);
 const data={kind:'expense',title:'Reviewed synthetic document',date:'2026-10-06',amount:4200,payments:[]};
 assert.equal((await request('/'+doc.id+'/record','POST',{version:doc.version,data},null)).status,401);assert.equal(state.recordCreates,0);
 const result=await request('/'+doc.id+'/record','POST',{version:doc.version,data});assert.equal(result.status,200);assert.equal(result.data.record.id,doc.draft_record_id);assert.equal(result.data.document.record_id,doc.draft_record_id);assert.equal(result.data.file.record_id,doc.draft_record_id);assert.deepEqual(result.data.record.data.payments,[]);
 assert.equal(state.recordCreates,1);assert.equal(tables.finance_records.length,ledger.length+1);assert.deepEqual(tables.finance_records[0],ledger[0]);assert.deepEqual(tables.finance_settings,settings);
 const retry=await request('/'+doc.id+'/record','POST',{version:doc.version,data});assert.equal(retry.status,200);assert.equal(retry.data.record.id,result.data.record.id);assert.equal(retry.data.file.id,result.data.file.id);assert.equal(state.recordCreates,1);assert.equal(tables.finance_files.length,1);
 assert.equal((await request('/'+doc.id+'/record','POST',{version:doc.version,data:{...data,amount:4300}})).status,409);assert.equal(state.recordCreates,1);
});

test('a competing existing-record link blocks draft creation without an orphan financial record',async()=>{
 await pair();await webhook(documentMessage(2));const doc=clone(tables.finance_documents[0]),ledger=clone(tables.finance_records);
 assert.equal((await request('/'+doc.id+'/link','POST',{version:doc.version,recordId:ledger[0].id})).status,200);
 const result=await request('/'+doc.id+'/record','POST',{version:doc.version,data:{kind:'expense',title:'Stale create form',date:'2026-10-06',amount:4200,payments:[]}});
 assert.equal(result.status,409);assert.equal(state.recordCreates,0);assert.deepEqual(tables.finance_records,ledger);assert.equal(tables.finance_files.length,1);
});

test('disconnect revokes the chat and unused connection codes before any new download',async()=>{
 await pair();const fresh=await request('/telegram/code','POST',{});
 assert.equal((await request('/telegram','DELETE')).status,200);assert.equal((await request('/telegram')).data.pairing,null);
 await webhook(message(3,{text:'/start '+fresh.data.code}));await webhook(documentMessage(4));
 assert.equal(tables.finance_telegram_pairs.filter(pair=>pair.active).length,0);assert.ok(!calls.some(call=>call.telegram==='getFile'));assert.equal(tables.finance_documents.length,0);
});

test('revoked owners cannot send files and an unavailable session service stays retryable',async()=>{
 await pair();state.ownerDisabled=true;assert.equal((await webhook(documentMessage(2))).status,200);assert.ok(!calls.some(call=>call.telegram==='getFile'));assert.equal(tables.finance_documents.length,0);
 state.ownerDisabled=false;state.ownerAuthFailure=true;assert.equal((await webhook(documentMessage(3))).status,503);assert.ok(!calls.some(call=>call.telegram==='getFile'));
 state.ownerAuthFailure=false;assert.equal((await webhook(documentMessage(3))).status,200);assert.equal(tables.finance_documents.length,1);
});

test('review mode blocks reception and mutation while the inbox remains readable',async()=>{
 process.env.FINANCE_V2_LIVE='false';
 try{assert.equal((await request('')).status,200);assert.equal((await request('/telegram/code','POST',{})).status,409);assert.equal((await webhook(documentMessage(2))).status,503);assert.ok(!calls.some(call=>call.rpc||call.upload||call.telegram));}
 finally{process.env.FINANCE_V2_LIVE='true';}
});

test('webhook and inbox pagination enforce bounded requests without leaking storage metadata',async()=>{
 assert.equal((await webhook({update_id:1,message:{text:'x'.repeat(110000)}})).status,413);assert.ok(!calls.some(call=>call.rpc||call.upload||call.telegram));
 for(let i=0;i<103;i++)tables.finance_documents.push({id:randomUUID(),draft_record_id:randomUUID(),version:1,name:'Synthetic '+i,mime:'application/pdf',bytes:50,status:'pending',source:'manual',path:'inbox/private-'+i,hash:hash(String(i)),actor:user.email,created_at:new Date(2026,9,1,0,i).toISOString()});
 const result=await request('?status=pending&offset=100&limit=100');assert.equal(result.status,200);assert.equal(result.data.total,103);assert.equal(result.data.documents.length,3);assert.ok(result.data.documents.every(doc=>doc.path===undefined&&doc.hash===undefined&&doc.actor===undefined));
 assert.equal((await request('?limit=101')).status,400);assert.equal((await request('?offset=-1')).status,400);
});

test('a rejected inbox insert cleans its unreferenced private upload and permits a safe retry',async()=>{
 await pair();state.insertFailure=true;assert.equal((await webhook(documentMessage(2))).status,503);assert.equal(tables.finance_documents.length,0);assert.equal(stored.size,0);
 state.insertFailure=false;assert.equal((await webhook(documentMessage(2))).status,200);assert.equal(tables.finance_documents.length,1);assert.equal(stored.size,1);
});

test('a different bot requires its own pairing and can reuse Telegram update ids safely',async()=>{
 await pair();await webhook(documentMessage(2));const downloads=calls.filter(call=>call.telegram==='getFile').length;
 process.env.TELEGRAM_DOCUMENTS_BOT_TOKEN='654321:synthetic-test-token';
 try{
  assert.equal((await request('/telegram')).data.pairing,null);
  assert.equal((await webhook(documentMessage(2))).status,200);assert.equal(calls.filter(call=>call.telegram==='getFile').length,downloads);
  const code=await request('/telegram/code','POST',{});assert.equal(code.status,200);assert.equal((await webhook(message(1,{text:'/start '+code.data.code}))).status,200);
  assert.equal(tables.finance_telegram_pairs.filter(pair=>pair.active).length,2);
  remoteFiles.set('second',Buffer.from('%PDF-1.4\n second synthetic document\n%%EOF'));assert.equal((await webhook(documentMessage(3,'second'))).status,200);
  assert.equal(tables.finance_documents.length,2);assert.ok(tables.finance_documents.some(doc=>doc.source_key==='telegram:654321:3'));
  assert.deepEqual(tables.finance_telegram_updates.filter(update=>update.update_id===2).map(update=>update.bot_id).sort(),[123456,654321]);
 }finally{process.env.TELEGRAM_DOCUMENTS_BOT_TOKEN=environment.TELEGRAM_DOCUMENTS_BOT_TOKEN;}
});
