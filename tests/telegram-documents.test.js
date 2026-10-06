'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../lib/telegram-documents'),D=require('../lib/finance-documents');
const env=()=>({FINANCE_V2:'true',FINANCE_V2_LIVE:'true',SUPABASE_SERVICE_KEY:'synthetic',TELEGRAM_DOCUMENTS_BOT_TOKEN:'12345:'+'t'.repeat(32),TELEGRAM_DOCUMENTS_WEBHOOK_SECRET:'s'.repeat(32),TELEGRAM_DOCUMENTS_BOT_USERNAME:'vocai_test_bot'});
const update=(id=1,extra={})=>({update_id:id,message:{message_id:id,chat:{id:123,type:'private'},from:{id:123,is_bot:false},document:{file_id:'synthetic_file_id',file_name:'invoice.pdf',mime_type:'application/pdf'},...extra}});
const pdf=Buffer.from('%PDF-1.7\nSynthetic fixture\n%%EOF');
function harness(){
 const updates=new Map(),calls=[],received=[],replies=[];let paired=true,active=true,blocked=false,downloadFailure=false,replyFailure=false,pairFailure=false,ownerFailure=false,ingestFailure=false;
 const owner={user_id:'12345678-1234-4234-8234-123456789abc',telegram_user_id:123,chat_id:123,bot_id:12345,actor:'fixture@example.invalid'};
 const db={from(table){assert.equal(table,'finance_telegram_pairs');const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){return {data:paired&&filters.bot_id===12345&&filters.chat_id===123?owner:null,error:pairFailure?{}:null};}};},auth:{admin:{async getUserById(id){assert.equal(id,owner.user_id);return {data:{user:active?{id,banned_until:blocked?'2999-01-01T00:00:00Z':null}:null},error:ownerFailure?{status:503}:null};}}},async rpc(name,args){
  calls.push({name,args});const key=args.p_bot_id+':'+args.p_update_id;
  if(name==='finance_claim_telegram_update'){let r=updates.get(key);if(r){if(r.fingerprint!==args.p_fingerprint)return {data:{state:'conflict'}};if(r.done)return {data:{state:'done'}};if(r.busy)return {data:{state:'busy'}};}r={fingerprint:args.p_fingerprint,lease:args.p_lease,busy:true};updates.set(key,r);return {data:{state:'claimed'}};}
  if(name==='finance_finish_telegram_update'){const r=updates.get(key);r.done=true;r.outcome=args.p_outcome;r.documentId=args.p_document_id;return {data:true};}
  if(name==='finance_release_telegram_update'){updates.get(key).busy=false;return {data:true};}
  if(name==='finance_consume_telegram_code')return {data:args.p_hash===require('node:crypto').createHash('sha256').update('c'.repeat(32)).digest('hex')?owner:null};
  throw new Error('Unexpected RPC '+name);
 }};
 const client={async download(){calls.push({name:'download'});if(downloadFailure)throw Object.assign(new Error('Network unavailable'),{status:503});return pdf;},async reply(chatId,text){replies.push({chatId,text});if(replyFailure)throw new Error('Reply lost');}};
 const store={async ingest(input){if(ingestFailure)throw Object.assign(new Error('Storage unavailable'),{status:503});received.push(input);return {document:{id:'12345678-1234-4234-8234-123456789def'},duplicate:false};}};
 return {receiver:T.createReceiver({db,env:env(),store,client}),db,updates,calls,received,replies,setPair:v=>paired=v,setActive:v=>active=v,setBlocked:v=>blocked=v,setDownloadFailure:v=>downloadFailure=v,setReplyFailure:v=>replyFailure=v,setPairFailure:v=>pairFailure=v,setOwnerFailure:v=>ownerFailure=v,setIngestFailure:v=>ingestFailure=v};
}
test('configuration and webhook secret validation never accept absent or malformed secrets',()=>{
 assert.equal(T.configuration(env()).configured,true);assert.equal(T.configuration(env()).botId,12345);assert.equal(T.configuration({}).configured,false);
 assert.equal(T.verifySecret('s'.repeat(32),'s'.repeat(32)),true);for(const v of [undefined,null,[], 'x'.repeat(32),'s'.repeat(31)])assert.equal(T.verifySecret(v,'s'.repeat(32)),false);
 assert.equal(T.enabled({...env(),FINANCE_V2_LIVE:'false'}),false);
 const code=T.newCode();assert.match(code.code,/^[A-Za-z0-9_-]{32}$/);assert.match(code.hash,/^[a-f0-9]{64}$/);assert.notEqual(code.code,T.newCode().code);
});
test('only a positive private chat with the matching real sender can receive files',async()=>{
 const h=harness();for(const extra of [{chat:{id:-123,type:'group'}},{chat:{id:123,type:'group'}},{chat:{id:123,type:'private'},from:{id:124}},{from:{id:123,is_bot:true}},{from:{id:Number.MAX_SAFE_INTEGER+1}},{chat:{id:'123',type:'private'}}])assert.equal((await h.receiver.receive(update(1,extra))).ignored,true);
 assert.equal(h.calls.length,0);assert.equal(h.received.length,0);
 h.setPair(false);await h.receiver.receive(update(2));assert.equal(h.received.length,0);assert.equal(h.calls.filter(c=>c.name==='download').length,0);
});
test('valid intake is namespaced and deduplicates delivery IDs before downloading or replying again',async()=>{
 const h=harness(),message=update(3,{caption:'Factura pendiente'});await h.receiver.receive(message);assert.equal(h.received.length,1);assert.equal(h.received[0].sourceKey,'telegram:12345:3');assert.equal(h.received[0].notes,'Factura pendiente');assert.equal(h.received[0].actor,'fixture@example.invalid');
 assert.equal((await h.receiver.receive(message)).duplicate,true);assert.equal(h.received.length,1);assert.equal(h.replies.length,1);
 assert.equal((await h.receiver.receive(update(3,{caption:'Different payload'}))).ignored,true);assert.equal(h.received.length,1);
 assert.ok(h.calls.filter(c=>c.name.startsWith('finance_')).every(c=>c.args.p_bot_id===12345));
});
test('transient download and storage failures release their lease and allow a safe retry',async()=>{
 for(const phase of ['download','store']){const h=harness();if(phase==='download')h.setDownloadFailure(true);else h.setIngestFailure(true);await assert.rejects(h.receiver.receive(update(4)),error=>error.status===503);assert.equal(h.updates.get('12345:4').done,undefined);assert.equal(h.updates.get('12345:4').busy,false);h.setDownloadFailure(false);h.setIngestFailure(false);await h.receiver.receive(update(4));assert.equal(h.received.length,1);}
});
test('failed acknowledgements cannot cause duplicate stored files',async()=>{
 const h=harness();h.setReplyFailure(true);await h.receiver.receive(update(5));assert.equal((await h.receiver.receive(update(5))).duplicate,true);assert.equal(h.received.length,1);assert.equal(h.replies.length,1);
});
test('deleted or banned owners cannot download or archive documents and auth outages are retryable',async()=>{
 for(const state of ['deleted','banned']){const h=harness();if(state==='deleted')h.setActive(false);else h.setBlocked(true);await h.receiver.receive(update(6));assert.equal(h.received.length,0);assert.equal(h.calls.some(c=>c.name==='download'),false);}
 const h=harness();h.setOwnerFailure(true);await assert.rejects(h.receiver.receive(update(7)),error=>error.status===503);assert.equal(h.received.length,0);assert.equal(h.updates.get('12345:7').busy,false);
});
test('unsupported attachments are rejected durably without retry loops or file downloads',async()=>{
 const h=harness();await h.receiver.receive(update(8,{document:{file_id:'id',file_name:'x.exe',mime_type:'application/octet-stream'}}));assert.equal(h.updates.get('12345:8').outcome,'rejected');assert.equal(h.received.length,0);assert.equal(h.calls.some(c=>c.name==='download'),false);
 await h.receiver.receive(update(9,{document:{file_id:'id',file_name:'x.pdf',file_size:D.MAX_BYTES+1}}));assert.equal(h.received.length,0);
});
test('pair codes are hashed before consumption and require an active owner',async()=>{
 const h=harness();await h.receiver.receive(update(10,{document:undefined,text:'/start '+'c'.repeat(32)}));
 const call=h.calls.find(c=>c.name==='finance_consume_telegram_code');assert.match(call.args.p_hash,/^[a-f0-9]{64}$/);assert.equal(call.args.p_chat_id,123);assert.equal(call.args.p_user_id,123);assert.equal(h.updates.get('12345:10').outcome,'paired');assert.equal(h.received.length,0);
});
test('getFile and downloads use only Telegram HTTPS, refuse redirects and validate real file bytes',async()=>{
 const calls=[],fetcher=async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(JSON.stringify({ok:true,result:{file_path:'documents/invoice.pdf',file_size:pdf.length}})):new Response(pdf,{headers:{'content-length':String(pdf.length)}});};
 const result=await T.createClient(T.configuration(env()),fetcher).download({id:'file_id',name:'invoice.pdf',size:pdf.length});assert.deepEqual(result,pdf);
 assert.ok(calls.every(call=>new URL(call.url).origin==='https://api.telegram.org'&&call.options.redirect==='error'&&call.options.signal));assert.equal(calls[0].options.method,'POST');assert.equal(JSON.parse(calls[0].options.body).file_id,'file_id');
});
test('unsafe Telegram file paths are rejected before a download can target another origin',async()=>{
 for(const path of ['https://evil.invalid/x','//evil.invalid/x','../x','documents/../x','documents/%2e%2e/x','documents/x?token=y','documents/x#z','documents\\x','documents//x']){
  let calls=0;const fetcher=async()=>{calls++;return new Response(JSON.stringify({ok:true,result:{file_path:path}}));};
  await assert.rejects(T.createClient(T.configuration(env()),fetcher).download({id:'file',name:'x.pdf'}),/Ruta/);assert.equal(calls,1);
 }
});
test('stream limits are enforced even when content length is absent or dishonest',async()=>{
 await assert.rejects(T.bounded(new Response(Buffer.alloc(5)),4),/tamaño/);
 await assert.rejects(T.bounded(new Response(Buffer.alloc(5),{headers:{'content-length':'1'}}),4),/tamaño/);
 await assert.rejects(T.bounded(new Response(Buffer.alloc(1),{headers:{'content-length':'99999'}}),4),/tamaño/);
 let count=0;const fetcher=async()=>++count===1?new Response(JSON.stringify({ok:true,result:{file_path:'documents/x.pdf',file_size:pdf.length+1}})):new Response(pdf);
 await assert.rejects(T.createClient(T.configuration(env()),fetcher).download({id:'file',name:'x.pdf'}),/tamaño/);
});
