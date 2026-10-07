'use strict';
// Optional full HTTP + PostgreSQL integration. Run with
// FINANCE_INVOICES_PGLITE=/absolute/path/to/@electric-sql/pglite. The runtime is
// a temporary developer tool; no production database or credentials are used.
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const engine=require('../lib/finance-invoices'),{createInvoiceTestDb}=require('./finance-invoices-test-db');
let PGlite;try{({PGlite}=require(process.env.FINANCE_INVOICES_PGLITE||'@electric-sql/pglite'));}catch(error){if(process.env.FINANCE_INVOICES_PGLITE)throw error;}
const run=(name,fn)=>test(name,{skip:!PGlite?'Set FINANCE_INVOICES_PGLITE for the isolated PostgreSQL integration':false},fn);
const issuer=()=>engine.party({name:'Emisor ficticio',tax_id:'FICTICIO-000',address:'Dirección ficticia 1',postal_code:'00000',city:'Ciudad ficticia',country:'País ficticio',email:'issuer@example.invalid',website:'https://example.invalid'},true);
const doc=(extra={})=>engine.validateDocument({date:'2020-10-02',due:null,customer:{name:'Cliente ficticio',tax_id:'FICTICIO-001',address:'Dirección ficticia 2',postal_code:'00000',city:'Ciudad ficticia',country:'País ficticio',email:'customer@example.invalid'},lines:[{description:'Servicio ficticio',detail:'',quantity:1000,unit_price:10000}],vat_rate:2100,irpf_rate:0,...extra});
let h,server,base,renders=[];const oldEnv={};
async function request(url='',method='GET',body,authorized=true){const response=await fetch(base+url,{method,headers:{...(authorized?{Authorization:'Bearer synthetic-test-session'}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:response.headers.get('content-type')?.includes('application/pdf')?Buffer.from(await response.arrayBuffer()):await response.json(),headers:response.headers};}
async function ledgerRequest(id,method,body,suffix=''){const response=await fetch(base.replace(/\/invoices$/,'')+'/records/'+id+suffix,{method,headers:{Authorization:'Bearer synthetic-test-session','Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
async function draft(values={}){return request('','POST',{id:randomUUID(),document:doc(),record_id:null,record_version:null,...values});}
async function issue(inv){return request('/'+inv.id+'/issue','POST',{version:inv.version});}
async function initialize(){const result=await request('/settings/series','POST',{year:2020,last_number:2,last_date:'2020-10-01'});assert.equal(result.status,200);}
async function linkedRecord(document=doc(),extra={}){const row={id:randomUUID(),data:engine.financialData(document,''),actor:'synthetic-user',...extra};const result=await h.supabase.from('finance_records').insert(row).select('*').single();assert.equal(result.error,null);return result.data;}
async function counts(){const rows=await h.db.query("SELECT (SELECT count(*) FROM finance_records)::int AS records,(SELECT count(*) FROM finance_invoices WHERE status='issued')::int AS issued,(SELECT last_number FROM finance_invoice_series WHERE year=2020) AS last");return rows.rows[0];}
test.before(async()=>{
 if(!PGlite)return;h=await createInvoiceTestDb(PGlite);
 for(const [key,value]of Object.entries({FINANCE_V2:'true',FINANCE_V2_LIVE:'true',SUPABASE_SERVICE_KEY:'synthetic-only'})){oldEnv[key]=process.env[key];process.env[key]=value;}
 require.cache[require.resolve('../config/supabase')]={exports:{supabase:h.supabase}};
 require.cache[require.resolve('../middleware/auth')]={exports:(req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic-test-session')return res.status(401).json({error:'Sesión requerida'});req.user={id:randomUUID(),email:'reviewer@example.invalid'};next();}};
 const express=require('express'),app=express();app.use(express.json());
 app.use('/api/finance',require('../routes/finance'));
 require.cache[path.resolve(__dirname,'../lib/finance-invoice-pdf.js')]={exports:{async renderInvoice(invoice,source){renders.push({invoice,issuer:source});return Buffer.from('%PDF-1.4\nsynthetic renderer\n%%EOF');}}};
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port+'/api/finance/invoices';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(h)await h.close();for(const[key,value]of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
test.beforeEach(async()=>{
 if(!h)return;await h.db.exec('TRUNCATE finance_invoices,finance_invoice_series,finance_invoice_audit,finance_records,finance_audit RESTART IDENTITY CASCADE;');
 await h.db.query('INSERT INTO finance_settings(id,baseline) VALUES(true,$1) ON CONFLICT(id) DO UPDATE SET baseline=EXCLUDED.baseline',[JSON.stringify({cutoff:'2020-01-01',cash:{bank:0,cash:0},operating:{santi:0,agus:0},groups:{startup:{santi:0,agus:0,settled:0},capital:{santi:0,agus:0,settled:0}}})]);
 await h.db.query('UPDATE finance_invoice_settings SET issuer=$1,version=1,actor=$2 WHERE id=true',[JSON.stringify(issuer()),'synthetic-user']);h.stored.clear();h.calls.length=0;renders=[];
});

run('auth and live-mode gates protect drafts, settings, issuance and PDFs',async()=>{
 assert.equal((await request('','GET',undefined,false)).status,401);assert.equal((await request('','POST',{id:randomUUID(),document:doc()},false)).status,401);
 const created=await draft();assert.equal(created.status,201);assert.equal((await request('/'+created.data.id+'/pdf','GET',undefined,false)).status,401);
 process.env.FINANCE_V2_LIVE='false';try{assert.equal((await issue(created.data)).status,409);assert.equal((await request('')).status,200);}finally{process.env.FINANCE_V2_LIVE='true';}
 assert.deepEqual(await counts(),{records:0,issued:0,last:null});
});
run('drafts and exact retries never create money movements or allocate numbers',async()=>{
 const id=randomUUID(),body={id,document:doc({totals:{net:1}}),record_id:null,record_version:null};const first=await request('','POST',body),retry=await request('','POST',body);
 assert.equal(first.status,201);assert.equal(retry.status,200);assert.equal(first.data.number,null);assert.equal(first.data.document.totals.net,12100);assert.equal(retry.data.id,id);
 assert.equal((await request('','POST',{...body,document:doc({notes:'Different'})})).status,409);
 const edit={version:1,document:doc({notes:'Updated'}),record_id:null,record_version:null},updated=await request('/'+id,'PUT',edit),retryEdit=await request('/'+id,'PUT',edit);
 assert.equal(updated.status,200);assert.equal(updated.data.version,2);assert.equal(retryEdit.status,200);assert.equal(retryEdit.data.version,2);
 assert.equal((await request('/'+id,'PUT',{...edit,document:doc({notes:'Stale'})})).status,409);
 assert.deepEqual(await counts(),{records:0,issued:0,last:null});
});
run('a reviewed series is required and cannot be reset after initialization',async()=>{
 const created=await draft();assert.equal((await issue(created.data)).status,409);assert.deepEqual(await counts(),{records:0,issued:0,last:null});
 await initialize();assert.equal((await request('/settings/series','POST',{year:2020,last_number:2,last_date:'2020-10-01'})).status,200);
 assert.equal((await request('/settings/series','POST',{year:2020,last_number:0,last_date:null})).status,409);
 const issued=await issue(created.data);assert.equal(issued.status,200);assert.equal(issued.data.number,'2020-003');
 assert.deepEqual(await counts(),{records:1,issued:1,last:3});
});
run('simultaneous issue retries create exactly one numbered invoice and one unpaid income',async()=>{
 await initialize();const created=(await draft()).data,results=await Promise.all([issue(created),issue(created),issue(created)]);
 assert.deepEqual(results.map(result=>result.status),[200,200,200]);assert.equal(new Set(results.map(result=>result.data.number)).size,1);
 const row=(await h.db.query('SELECT * FROM finance_records')).rows[0];assert.deepEqual(row.data.payments,[]);assert.equal(row.data.amount,12100);assert.equal(row.id,created.new_record_id);
 assert.deepEqual(await counts(),{records:1,issued:1,last:3});
 const audit=(await h.db.query("SELECT * FROM finance_invoice_audit WHERE entity='finance_invoices' ORDER BY id")).rows;assert.equal(audit.length,2);assert.equal(audit[1].before_row.status,'draft');assert.equal(audit[1].after_row.status,'issued');
});
run('different issued drafts get consecutive unique numbers and cannot be backdated',async()=>{
 await initialize();const first=(await draft()).data,second=(await draft()).data,results=await Promise.all([issue(first),issue(second)]);
 assert.deepEqual(results.map(result=>result.status),[200,200]);assert.deepEqual(results.map(result=>result.data.number).sort(),['2020-003','2020-004']);
 const previous=(await draft({document:doc({date:'2020-10-01'})})).data;assert.equal((await issue(previous)).status,409);assert.deepEqual(await counts(),{records:2,issued:2,last:4});
});
run('linking a reviewed income preserves payments and history without duplicating revenue',async()=>{
 await initialize();const source={table:'invoices',id:randomUUID(),original:{numero:'VOCAI-2020-099',estado:'cobrada'}},data={...engine.financialData(doc(),source.original.numero),history:{status:'paid',sources:[source]},payments:[{id:randomUUID(),amount:12100,date:'2020-10-02',account:'bank'}]};
 const existing=await linkedRecord(doc(),{data,included_in_opening:true}),before=structuredClone(existing);
 const created=(await draft({record_id:existing.id,record_version:existing.version})).data,result=await issue(created);assert.equal(result.status,200);assert.equal(result.data.record_id,existing.id);
 const after=(await h.supabase.from('finance_records').select('*').eq('id',existing.id).single()).data;assert.equal(after.version,2);assert.equal(after.included_in_opening,true);assert.equal(after.data.amount,before.data.amount);assert.deepEqual(after.data.payments,before.data.payments);assert.deepEqual(after.data.history,before.data.history);assert.equal(after.data.number,'2020-003');assert.deepEqual(await counts(),{records:1,issued:1,last:3});
});
run('two drafts for the same income cannot create two issued invoices',async()=>{
 await initialize();const record=await linkedRecord(),one=(await draft({record_id:record.id,record_version:1})).data,two=(await draft({record_id:record.id,record_version:1})).data;
 const results=await Promise.all([issue(one),issue(two)]);assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);assert.deepEqual(await counts(),{records:1,issued:1,last:3});
});
run('changed record versions, gross/net mismatches and issuer races allocate no number',async()=>{
 await initialize();const record=await linkedRecord(),created=(await draft({record_id:record.id,record_version:1})).data;
 await h.db.query('UPDATE finance_records SET version=2 WHERE id=$1',[record.id]);assert.equal((await issue(created)).status,409);
 const mismatch=(await draft({record_id:record.id,record_version:2,document:doc({lines:[{description:'Wrong total',quantity:1000,unit_price:11000}]})})).data;assert.equal((await issue(mismatch)).status,409);
 const valid=(await draft()).data;const original=h.supabase.rpc;
 h.supabase.rpc=async(name,args)=>{if(name==='finance_issue_invoice')await h.db.exec('UPDATE finance_invoice_settings SET version=version+1 WHERE id=true');return original(name,args);};
 try{assert.equal((await issue(valid)).status,409);}finally{h.supabase.rpc=original;}
 assert.deepEqual(await counts(),{records:1,issued:0,last:2});
});
run('the SQL function rejects corrupted totals even if a caller bypasses the HTTP calculator',async()=>{
 await initialize();const created=(await draft()).data;await h.db.query("UPDATE finance_invoices SET document=jsonb_set(document,'{totals,net}','1') WHERE id=$1",[created.id]);
 const result=await h.supabase.rpc('finance_issue_invoice',{p_invoice_id:created.id,p_version:1,p_issuer_version:1,p_actor:'synthetic-user'});assert.equal(result.error.code,'P0001');assert.match(result.error.message,/totales/);assert.deepEqual(await counts(),{records:0,issued:0,last:2});
});
run('a response lost after committed issuance can be retried without another number',async()=>{
 await initialize();const created=(await draft()).data,original=h.supabase.rpc;let lost=true;
 h.supabase.rpc=async(name,args)=>{const result=await original(name,args);if(name==='finance_issue_invoice'&&lost&&!result.error){lost=false;return {data:null,error:{code:'NETWORK'}};}return result;};
 try{assert.equal((await issue(created)).status,503);assert.equal((await issue(created)).status,200);}finally{h.supabase.rpc=original;}
 assert.deepEqual(await counts(),{records:1,issued:1,last:3});
});
run('issued invoices and their financial identity are immutable while actual receipts can append',async()=>{
 await initialize();const created=(await draft()).data,issued=(await issue(created)).data;
 assert.equal((await request('/'+issued.id,'PUT',{version:issued.version,document:doc(),record_id:issued.record_id,record_version:issued.record_version})).status,409);
 const row=(await h.supabase.from('finance_records').select('*').eq('id',issued.record_id).single()).data;
 for(const data of [{...row.data,amount:1},{...row.data,date:'2020-10-03'},{...row.data,number:'2020-999'}]){const result=await h.supabase.from('finance_records').update({data}).eq('id',row.id).select('*').single();assert.equal(result.error.code,'P0001');assert.match(result.error.message,/La factura emitida/);}
 assert.equal((await h.supabase.from('finance_records').update({voided:true}).eq('id',row.id).select('*').single()).error.code,'P0001');
 const payments=[{id:randomUUID(),amount:5000,date:'2020-10-03',account:'bank'}],paid=await h.supabase.from('finance_records').update({data:{...row.data,payments},version:2}).eq('id',row.id).select('*').single();assert.equal(paid.error,null);
 assert.equal((await h.supabase.from('finance_records').update({data:row.data}).eq('id',row.id).select('*').single()).error.code,'P0001');
 assert.equal((await h.supabase.from('finance_invoices').delete().eq('id',issued.id)).error.code,'P0001');
});
run('the ordinary finance API can append a receipt but cannot modify or void an issued income',async()=>{
 await initialize();const issued=(await issue((await draft()).data)).data,row=(await h.supabase.from('finance_records').select('*').eq('id',issued.record_id).single()).data;
 const received={...row.data,payments:[{id:randomUUID(),amount:5000,date:'2020-10-03',account:'bank'}]};
 const result=await ledgerRequest(row.id,'PUT',{version:row.version,data:received});assert.equal(result.status,200);assert.deepEqual(result.data.data.payments,received.payments);assert.equal(result.data.data.date,row.data.date);assert.equal(result.data.data.number,issued.number);
 const edited=await ledgerRequest(row.id,'PUT',{version:result.data.version,data:{...result.data.data,date:'2020-10-04'}});assert.equal(edited.status,409);assert.match(edited.data.error,/factura emitida/);
 assert.equal((await ledgerRequest(row.id,'POST',{version:result.data.version,reason:'Synthetic void attempt'},'/void')).status,409);
 assert.equal((await request('/'+issued.id)).data.number,issued.number);assert.deepEqual(await counts(),{records:1,issued:1,last:3});
});
run('forecast links and changed service dates cannot be issued against another period',async()=>{
 await initialize();const forecast=await linkedRecord();await h.db.query("UPDATE finance_records SET data=jsonb_set(data,'{stage}','\"forecast\"') WHERE id=$1",[forecast.id]);
 assert.equal((await draft({record_id:forecast.id,record_version:1})).status,409);
 const real=await linkedRecord(),baseDocument=doc();
 for(const changes of [{date:'2020-10-03'},{due:'2020-10-04'},{period_start:'2020-09-01',period_end:'2020-09-30'}]){
  const created=(await draft({record_id:real.id,record_version:1,document:{...baseDocument,...changes}})).data;
  const blocked=await issue(created);assert.equal(blocked.status,409);assert.match(blocked.data.error,/fecha|período/);
  const direct=await h.supabase.rpc('finance_issue_invoice',{p_invoice_id:created.id,p_version:1,p_issuer_version:1,p_actor:'synthetic-user'});assert.equal(direct.error.code,'P0001');assert.match(direct.error.message,/fecha|período/);
 }
 assert.deepEqual(await counts(),{records:2,issued:0,last:2});
});
run('PDF preview uses the current issuer and issued PDF always uses its preserved snapshot',async()=>{
 await initialize();const created=(await draft()).data,preview=await request('/'+created.id+'/pdf');assert.equal(preview.status,200);assert.match(preview.headers.get('cache-control'),/no-store/);assert.equal(renders[0].invoice.status,'draft');
 const issued=(await issue(created)).data;const updatedIssuer={...issuer(),name:'Emisor cambiado'};assert.equal((await request('/settings','PUT',{version:1,issuer:updatedIssuer})).status,200);
 const download=await request('/'+issued.id+'/pdf');assert.equal(download.status,200);assert.equal(renders.at(-1).issuer.name,'Emisor ficticio');assert.equal(renders.at(-1).invoice.number,'2020-003');
 assert.deepEqual(await counts(),{records:1,issued:1,last:3});
});
run('RLS privileges deny direct browser reads and RPC issuance',async()=>{
 for(const role of ['anon','authenticated']){
  for(const table of ['finance_invoices','finance_invoice_settings','finance_invoice_series','finance_invoice_audit']){const privileges=await h.db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,table,'SELECT']);assert.equal(privileges.rows[0].allowed,false);}
  const privileges=await h.db.query("SELECT has_function_privilege($1,'finance_issue_invoice(uuid,integer,integer,text)','EXECUTE') AS allowed",[role]);assert.equal(privileges.rows[0].allowed,false);
 }
});
run('migration can be repeated without resetting issuer, sequence or issued records',async()=>{
 await initialize();const created=(await draft()).data;await issue(created);const before=await counts();
 await h.db.exec(fs.readFileSync(path.join(__dirname,'../db/migration_finance_invoices.sql'),'utf8'));
 assert.deepEqual(await counts(),before);assert.equal((await request('')).data.invoices[0].number,'2020-003');
});
