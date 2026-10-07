'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const invoices=require('../lib/finance-invoices');
const fiscal=()=>({name:'Empresa de prueba',tax_id:'FICTICIO-123',address:'Calle de prueba 1',postal_code:'00000',city:'Ciudad de prueba',country:'País de prueba',email:'test@example.invalid'});
const input=extra=>({date:'2026-10-01',customer:fiscal(),lines:[{description:'Servicio de prueba',detail:'',quantity:1000,unit_price:10000}],vat_rate:2100,irpf_rate:0,...extra});
const record=(doc,extra={})=>({id:randomUUID(),version:1,voided:false,included_in_opening:false,data:{kind:'income',amount:doc.totals.gross,date:doc.date,period_start:doc.period_start,period_end:doc.period_end,due:doc.due,payments:[],...invoices.taxMetadata(doc)},...extra});

test('canonical tax totals ignore client totals and use aggregate base',()=>{
 const result=invoices.validateDocument(input({totals:{net:1},lines:[{description:'Uno',quantity:1000,unit_price:2,base:999},{description:'Dos',quantity:1000,unit_price:2}]}));
 assert.deepEqual(result.totals,{base:4,vat:1,irpf:0,gross:5,net:5});
 assert.equal(result.lines.reduce((sum,line)=>sum+line.vat,0),1);
 assert.equal(result.lines.reduce((sum,line)=>sum+line.total,0),5);
 assert.equal(result.lines[0].base,2);
});
test('fractional quantities, half cents and optional IRPF round using integer arithmetic',()=>{
 const doc=invoices.validateDocument(input({lines:[{description:'Fracción',quantity:1500,unit_price:101}],irpf_rate:1500}));
 assert.deepEqual(doc.totals,{base:152,vat:32,irpf:23,gross:184,net:161});
 assert.deepEqual(invoices.taxMetadata(doc).irpf,{rate:1500,base:152,tax:23});
 const zero=invoices.validateDocument(input({vat_rate:0,irpf_rate:0}));assert.equal(zero.totals.net,10000);assert.equal(invoices.taxMetadata(zero).irpf,undefined);
});
test('large quantity multiplication stays exact and bounded before totals escape cents',()=>{
 const doc=invoices.validateDocument(input({vat_rate:0,lines:[{description:'Límite',quantity:100000000,unit_price:10000}]}));assert.equal(doc.totals.gross,1000000000);
 assert.throws(()=>invoices.validateDocument(input({lines:[{description:'Demasiado',quantity:100000000,unit_price:10001}]})),/máximo/);
 for(const bad of [NaN,Infinity,1.01,0,-1,100000001,'1000'])assert.throws(()=>invoices.validateDocument(input({lines:[{description:'x',quantity:bad,unit_price:1}]})));
});
test('drafts allow incomplete customer and zero amounts without being issuable',()=>{
 const doc=invoices.validateDocument(input({customer:{},lines:[{description:'',quantity:1000,unit_price:0}]}));assert.equal(doc.totals.net,0);
 assert.throws(()=>invoices.validateDocument(doc,{issue:true,today:'2026-10-07'}),/descripción|fiscales|positivo/);
 assert.equal(invoices.validateDocument(input({lines:[]})).lines.length,0);
 assert.throws(()=>invoices.validateDocument(input({lines:[]}),{issue:true,today:'2026-10-07'}),/positivo/);
});
test('issue requires fiscal identity, positive net and nonfuture dates',()=>{
 assert.doesNotThrow(()=>invoices.validateDocument(input(),{issue:true,today:'2026-10-07'}));
 for(const field of invoices.FISCAL_FIELDS)assert.throws(()=>invoices.validateDocument(input({customer:{...fiscal(),[field]:''}}),{issue:true,today:'2026-10-07'}),/fiscales/);
 assert.throws(()=>invoices.validateDocument(input({date:'2026-10-08'}),{issue:true,today:'2026-10-07'}),/futuro/);
 assert.throws(()=>invoices.validateDocument(input({vat_rate:0,irpf_rate:10000}),{issue:true,today:'2026-10-07'}),/positivo/);
});
test('invalid dates, reversed service periods and injected transaction fields are rejected',()=>{
 for(const values of [{date:'2026-02-30'},{due:'2026-09-30'},{period_start:'2026-09-01'},{period_start:'2026-09-30',period_end:'2026-09-01'},{theme:'remote'},{payments:[{amount:1}]},{status:'issued'},{vat_rate:2100.5},{irpf_rate:-1}])assert.throws(()=>invoices.validateDocument(input(values)));
 assert.throws(()=>invoices.validateDocument(input({lines:Array.from({length:51},()=>({quantity:1000,unit_price:1}))})),/50/);
 assert.throws(()=>invoices.validateDocument(input({notes:'a'.repeat(2001)})),/texto/);
});
test('issuer starts empty, preserves optional fields and rejects active URL schemes',()=>{
 assert.equal(invoices.completeParty(invoices.party({},true)),false);
 const issuer=invoices.party({...fiscal(),website:'https://example.invalid',payment_method:'Transferencia'},true);assert.equal(invoices.completeParty(issuer),true);
 assert.throws(()=>invoices.party({...fiscal(),website:'javascript:alert(1)'},true),/http/);
 assert.throws(()=>invoices.party({...fiscal(),email:'bad-address'},true),/correo/);
 assert.throws(()=>invoices.party({...fiscal(),iban:'not-an-iban'},true),/IBAN/);
 assert.equal(invoices.publicSettings({issuer,version:2},[],'2026-10-07').configured,false);
 assert.equal(invoices.publicSettings({issuer,version:2},[{year:2026,last_number:0,last_date:null}],'2026-10-07').configured,true);
});
test('income linkage captures version, requires exact gross/net and preserves real payments',()=>{
 const doc=invoices.validateDocument(input({irpf_rate:1500})),row=record(doc);row.data.payments.push({id:randomUUID(),account:'bank',date:'2026-10-01',amount:5000});const before=structuredClone(row);
 invoices.checkRecord(row,1,doc);assert.deepEqual(row,before);
 assert.throws(()=>invoices.checkRecord(row,2,doc),/cambió/);
 const mismatch=structuredClone(row);mismatch.data.amount++;assert.throws(()=>invoices.checkRecord(mismatch,1,doc),/no coincide/);
 const noRetention=structuredClone(row);delete noRetention.data.irpf;assert.throws(()=>invoices.checkRecord(noRetention,1,doc),/neto/);
 const wrongVat=structuredClone(row);wrongVat.data.vat.rate=1000;assert.throws(()=>invoices.checkRecord(wrongVat,1,doc),/IVA/);
});
test('only proven imported internal numbers may be replaced by official numbering',()=>{
 const doc=invoices.validateDocument(input()),row=record(doc);row.data.number='VOCAI-2026-001';
 assert.throws(()=>invoices.checkRecord(row,1,doc),/número/);
 row.data.history={status:'reviewed',sources:[{table:'invoices',original:{numero:'VOCAI-2026-001'}}]};assert.doesNotThrow(()=>invoices.checkRecord(row,1,doc));
 row.data.number='2026-001';assert.throws(()=>invoices.checkRecord(row,1,doc),/número/);
 for(const status of ['assigned','draft','duplicate','review']){const bad=record(doc);bad.data.history={status};assert.throws(()=>invoices.checkRecord(bad,1,doc),/no puede/);}
});
test('new financial records contain no money movements and series require reviewed initialization',()=>{
 const doc=invoices.validateDocument(input()),row=invoices.financialData(doc,'2026-003');assert.deepEqual(row.payments,[]);assert.equal(row.stage,'document');assert.equal(row.amount,12100);assert.equal(row.number,'2026-003');
 assert.deepEqual(invoices.validateLink(null,null),{record_id:null,record_version:null});assert.throws(()=>invoices.validateLink(null,1));
 assert.deepEqual(invoices.validateSeries({year:2026,last_number:0,last_date:null}),{year:2026,last_number:0,last_date:null});
 for(const series of [{year:2026,last_number:2,last_date:null},{year:2026,last_number:0,last_date:'2026-01-01'},{year:2026,last_number:2,last_date:'2025-01-01'}])assert.throws(()=>invoices.validateSeries(series));
});
