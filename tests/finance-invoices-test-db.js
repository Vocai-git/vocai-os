'use strict';
// Optional PostgreSQL test harness. PGlite is supplied by the caller, never a
// production dependency. Every table, session and stored file stays in memory.
const fs=require('node:fs'),path=require('node:path');
const plain=value=>value==null?value:JSON.parse(JSON.stringify(value));
const identifier=value=>{if(!/^[a-z_][a-z_0-9]*$/.test(value))throw new Error('Unexpected test SQL identifier');return '"'+value+'"';};
async function createInvoiceTestDb(PGlite){
 const db=new PGlite(),stored=new Map(),calls=[];
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 const workspace=fs.readFileSync(path.join(__dirname,'../db/migration_finance_workspace.sql'),'utf8').split('INSERT INTO storage.buckets')[0];
 await db.exec(workspace+'COMMIT;');
 await db.exec(fs.readFileSync(path.join(__dirname,'../db/migration_finance_invoices.sql'),'utf8'));
 function from(table){
  identifier(table);let operation='select',payload,fields='*',filters=[],sorts=[],start=0,end=null,single=false,options={};
  const query={
   select(value='*',opts={}){fields=value;options=opts;return query;},eq(key,value){filters.push({key,value,op:'='});return query;},neq(key,value){filters.push({key,value,op:'<>'});return query;},in(key,value){filters.push({key,value,op:'IN'});return query;},is(key,value){filters.push({key,value,op:'IS'});return query;},order(key,opts={}){sorts.push([key,opts.ascending!==false]);return query;},range(a,b){start=a;end=b;return query;},limit(value){end=start+value-1;return query;},single(){single=true;return query;},maybeSingle(){single=true;return query;},insert(value){operation='insert';payload=value;return query;},update(value){operation='update';payload=value;return query;},delete(){operation='delete';return query;},
   then(resolve,reject){return (async()=>{
    const params=[],arg=value=>{params.push(value&&typeof value==='object'?JSON.stringify(value):value);return '$'+params.length;};
    const projection=fields==='*'?'*':fields.split(',').map(identifier).join(',');let sql;
    const where=()=>filters.length?' WHERE '+filters.map(filter=>filter.op==='IN'?identifier(filter.key)+' IN ('+filter.value.map(arg).join(',')+')':filter.op==='IS'&&filter.value===null?identifier(filter.key)+' IS NULL':identifier(filter.key)+' '+filter.op+' '+arg(filter.value)).join(' AND '):'';
    if(operation==='insert'){
     const rows=Array.isArray(payload)?payload:[payload],keys=Object.keys(rows[0]);
     sql='INSERT INTO '+identifier(table)+'('+keys.map(identifier).join(',')+') VALUES '+rows.map(row=>'('+keys.map(key=>arg(row[key])).join(',')+')').join(',')+' RETURNING '+projection;
    }else if(operation==='update')sql='UPDATE '+identifier(table)+' SET '+Object.entries(payload).map(([key,value])=>identifier(key)+'='+arg(value)).join(',')+where()+' RETURNING '+projection;
    else if(operation==='delete')sql='DELETE FROM '+identifier(table)+where()+' RETURNING '+projection;
    else sql='SELECT '+projection+(options.count?',count(*) OVER() AS __count':'')+' FROM '+identifier(table)+where()+(sorts.length?' ORDER BY '+sorts.map(([key,ascending])=>identifier(key)+(ascending?' ASC':' DESC')).join(','):'')+(end!==null?' LIMIT '+(end-start+1):'')+(start?' OFFSET '+start:'');
    calls.push({table,operation});
    try{const result=await db.query(sql,params),rows=plain(result.rows),count=rows[0]?.__count;for(const row of rows)delete row.__count;return {data:options.head?null:single?(rows[0]||null):rows,error:null,...(options.count?{count:Number(count||0)}:{})};}catch(error){return {data:null,error:{code:error.code,message:error.message}};}
   })().then(resolve,reject);}
  };return query;
 }
 const supabase={from,async rpc(name,args){
  calls.push({rpc:name});const params=Object.values(args),sql='SELECT '+identifier(name)+'('+Object.keys(args).map((key,index)=>identifier(key)+'=> $'+(index+1)).join(',')+') AS value';
  try{const result=await db.query(sql,params);return {data:plain(result.rows[0].value),error:null};}catch(error){return {data:null,error:{code:error.code,message:error.message}};}
 },storage:{from:bucket=>({async download(file){const value=stored.get(bucket+'/'+file);return value?{data:new Blob([value]),error:null}:{data:null,error:{message:'missing'}};},async upload(file,buffer){stored.set(bucket+'/'+file,Buffer.from(buffer));return {data:{path:file},error:null};},async createSignedUrl(){return {data:{signedUrl:'https://example.invalid/private-file'},error:null};}})}};
 return {db,supabase,stored,calls,close:()=>db.close()};
}
module.exports={createInvoiceTestDb};
