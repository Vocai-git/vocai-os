'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const docs=require('../lib/finance-documents');
const pdf=Buffer.from('%PDF-1.7\nSynthetic invoice only\n%%EOF');
function harness(){
 const rows=[],stored=new Map(),removed=[],rpcCalls=[];let insertMode='',lookupError=false,uploadError=false;
 const db={from(table){assert.equal(table,'finance_documents');let field,value,insert;
  const q={select(){return q;},eq(k,v){field=k;value=v;return q;},maybeSingle(){return q;},single(){return q;},insert(row){insert=row;return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(!insert){if(lookupError)return {error:{code:'08006'}};return {data:rows.find(r=>r[field]===value)||null};}
   if(insertMode==='sql')return {error:{code:'23514'}};
   if(insertMode==='unknown')return {error:{}};
   const existing=rows.find(r=>r.hash===insert.hash||insert.source_key&&r.source_key===insert.source_key);
   if(existing)return {error:{code:'23505'}};
   const created={version:1,record_id:null,file_id:null,created_at:'2026-10-06T10:00:00Z',updated_at:'2026-10-06T10:00:00Z',...insert};rows.push(created);
   return insertMode==='lost'?{error:{}}:{data:structuredClone(created)};
  }).then(resolve,reject);}};return q;
 },storage:{from(bucket){assert.equal(bucket,'finance-private');return {async upload(path,bytes,options){if(uploadError)return {error:{}};assert.equal(options.upsert,false);stored.set(path,Buffer.from(bytes));return {};},async remove(paths){removed.push(...paths);paths.forEach(path=>stored.delete(path));return {};}};}},async rpc(name,args){rpcCalls.push({name,args});return {data:{document:rows[0],file:{id:randomUUID(),record_id:args.p_record_id,path:'private-hidden',name:'test.pdf',mime:'application/pdf',bytes:pdf.length}}};}};
 return {db,rows,stored,removed,rpcCalls,store:docs.createStore(db),setInsert:v=>insertMode=v,setLookup:v=>lookupError=v,setUpload:v=>uploadError=v};
}
test('file inspection checks actual signatures, size, names and hash without trusting extensions',()=>{
 const result=docs.inspect(pdf,'C:\\secret\\invoice.pdf');assert.equal(result.mime,'application/pdf');assert.equal(result.name,'invoice.pdf');assert.match(result.hash,/^[a-f0-9]{64}$/);
 assert.equal(docs.inspect(Buffer.from([255,216,255,1]),'../x.png').extension,'jpg');
 assert.equal(docs.inspect(Buffer.from([137,80,78,71,13,10,26,10]),'x').mime,'image/png');
 for(const buffer of [Buffer.alloc(0),Buffer.from('<svg onload=alert(1)>'),Buffer.from('<html>'),Buffer.alloc(docs.MAX_BYTES+1)])assert.throws(()=>docs.inspect(buffer,'invoice.pdf'),error=>error.status===400);
 assert.throws(()=>docs.caption('a'.repeat(2001)),/2000/);assert.equal(docs.caption(' texto '),'texto');
});
test('receiving an invoice stores private evidence and a stable draft id without creating financial data',async()=>{
 const h=harness(),result=await h.store.ingest({buffer:pdf,name:'invoice.pdf',actor:'member@example.invalid'});
 assert.equal(result.duplicate,false);assert.equal(result.document.status,'pending');assert.equal(result.document.source,'manual');assert.equal(result.document.record_id,null);assert.equal(h.rows.length,1);assert.equal(h.stored.size,1);
 assert.notEqual(result.document.id,result.document.draft_record_id);assert.equal(result.document.path,undefined);assert.equal(result.document.hash,undefined);assert.equal(result.document.actor,undefined);assert.equal(h.rpcCalls.length,0);
});
test('global hash dedup preserves linked and archived originals including their draft id and note',async()=>{
 const h=harness(),first=await h.store.ingest({buffer:pdf,name:'invoice.pdf',notes:'Original',actor:'one@example.invalid'});
 h.rows[0].status='linked';h.rows[0].version=4;h.rows[0].record_id=randomUUID();h.rows[0].file_id=randomUUID();
 const duplicate=await h.store.ingest({buffer:pdf,name:'different.pdf',source:'telegram',sourceKey:'telegram:12345:17',notes:'New',actor:'two@example.invalid'});
 assert.equal(duplicate.duplicate,true);assert.equal(duplicate.document.id,first.document.id);assert.equal(duplicate.document.draft_record_id,first.document.draft_record_id);assert.equal(duplicate.document.caption,'Original');assert.equal(duplicate.document.status,'linked');assert.equal(duplicate.document.version,4);assert.equal(h.stored.size,1);
 h.rows[0].status='archived';assert.equal((await h.store.ingest({buffer:pdf,name:'again.pdf',actor:'one'})).document.status,'archived');
});
test('concurrent uploads keep one hash winner and remove only the loser object',async()=>{
 const h=harness(),results=await Promise.all([h.store.ingest({buffer:pdf,name:'a.pdf',actor:'one'}),h.store.ingest({buffer:pdf,name:'b.pdf',actor:'two'})]);
 assert.equal(h.rows.length,1);assert.equal(h.stored.size,1);assert.equal(h.removed.length,1);assert.equal(results[0].document.id,results[1].document.id);assert.ok(!h.removed.includes(h.rows[0].path));
});
test('a lost insert response recovers the committed document without deleting its file',async()=>{
 const h=harness();h.setInsert('lost');const result=await h.store.ingest({buffer:pdf,name:'invoice.pdf',actor:'one'});
 assert.equal(result.document.id,h.rows[0].id);assert.equal(h.stored.size,1);assert.equal(h.removed.length,0);
});
test('unknown commit outcome keeps a private object; definite SQL rejection cleans only its own path',async()=>{
 const unknown=harness();unknown.setInsert('unknown');await assert.rejects(unknown.store.ingest({buffer:pdf,name:'x.pdf',actor:'one'}),error=>error.status===503);assert.equal(unknown.stored.size,1);assert.equal(unknown.rows.length,0);
 const rejected=harness();rejected.setInsert('sql');await assert.rejects(rejected.store.ingest({buffer:pdf,name:'x.pdf',actor:'one'}),error=>error.status===503);assert.equal(rejected.stored.size,0);assert.equal(rejected.removed.length,1);
 const unavailable=harness();unavailable.setUpload(true);await assert.rejects(unavailable.store.ingest({buffer:pdf,name:'x.pdf',actor:'one'}));assert.equal(unavailable.rows.length,0);
});
test('delivery keys cannot be reused for different file content',async()=>{
 const h=harness();await h.store.ingest({buffer:pdf,name:'x.pdf',source:'telegram',sourceKey:'telegram:12345:21',actor:'one'});
 await assert.rejects(h.store.ingest({buffer:Buffer.from('%PDF-1.7 DIFFERENT'),name:'x.pdf',source:'telegram',sourceKey:'telegram:12345:21',actor:'one'}),error=>error.status===409);assert.equal(h.stored.size,1);
});
test('link only delegates to the transactional RPC and returns no private storage path',async()=>{
 const h=harness(),result=await h.store.ingest({buffer:pdf,name:'x.pdf',actor:'one'}),recordId=randomUUID();
 const linked=await h.store.link(result.document.id,recordId,1,'member');
 assert.equal(h.rpcCalls.length,1);assert.equal(h.rpcCalls[0].name,'finance_link_document');assert.deepEqual(h.rpcCalls[0].args,{p_document_id:result.document.id,p_record_id:recordId,p_version:1,p_actor:'member'});assert.equal(linked.file.path,undefined);
 await assert.rejects(h.store.link('../x',recordId,1,'member'),error=>error.status===400);assert.equal(h.rpcCalls.length,1);
});
