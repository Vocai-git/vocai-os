'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const Bank=require('../public/js/finance-bank');
const month='2026-10';
const config=(extra={})=>({month,sheet:0,header:0,date:0,description:1,amount:2,debit:null,credit:null,decimal:'comma',dateOrder:'dmy',openingBalance:null,closingBalance:null,...extra});
const sheet=rows=>[{name:'Movimientos',rows:[['Fecha','Concepto','Importe'],...rows]}];
const row=(id,date,amount,description='Proveedor ficticio')=>({id,date,amount,description,sourceRow:Number(id.replace(/\D/g,''))||2});
const payment=(id,amount,date='2026-10-05',account='bank')=>({id,amount,date,account});
const record=(id,data={},extra={})=>({id,version:1,voided:false,included_in_opening:false,data:{kind:'expense',title:'Proveedor ficticio',amount:2000,date:'2026-10-05',payments:[payment('p-'+id,2000)],...data},...extra});
const decision=(bankRow,item)=>({rowId:bankRow.id,ledgerKey:item.key,fingerprint:item.fingerprint});

test('normalization preserves physical rows, signed cents and only the requested month',()=>{
 const input=sheet([['02/10/2026','Compra A','-1.234,56 €'],['2026-10-03','Ingreso',50.25],['30/09/2026','Anterior','5,00'],[],['04/10/2026','Compra B','(10,00)']]);
 const before=JSON.stringify(input),result=Bank.normalize(input,config());
 assert.deepEqual(result.rows.map(r=>[r.id,r.sourceRow,r.date,r.amount]),[['row-2',2,'2026-10-02',-123456],['row-3',3,'2026-10-03',5025],['row-6',6,'2026-10-04',-1000]]);
 assert.equal(result.outsideCount,1);assert.deepEqual(result.errors,[]);assert.equal(JSON.stringify(input),before);
});

test('debit and credit columns require one positive side and preserve every invalid nonempty row',()=>{
 const input=[{name:'Test',rows:[['Fecha','Concepto','Cargo','Abono'],['01/10/2026','Débito','35,20',''],['02/10/2026','Crédito','','50,00'],['03/10/2026','Ambiguo','1,00','2,00'],['04/10/2026','Cero','',''],['05/10/2026','Signo incorrecto','-1,00','']]}];
 const result=Bank.normalize(input,config({amount:null,debit:2,credit:3}));
 assert.deepEqual(result.rows.map(r=>r.amount),[-3520,5000]);assert.deepEqual(result.errors.map(e=>e.row),[4,5,6]);
 assert.match(result.errors[0].message,/cargo y abono/);assert.match(result.errors[1].message,/cero/);
});

test('locale and date mapping are explicit; invalid days, ambiguous years and missing data are errors',()=>{
 const input=sheet([['10/05/2026','US format','1,234.56'],['2026-10-06T00:00:00.000Z','ISO','12.34'],['31/10/2026','Wrong for MDY','2.00'],['2026-02-30','Invalid day','4.00'],['05/10/26','Short year','8.00'],['2026-10-06','',9],['2026-10-06','Missing amount',''],['2026-10-06','Wrong decimal','10,25']]);
 const result=Bank.normalize(input,config({dateOrder:'mdy',decimal:'dot'}));
 assert.deepEqual(result.rows.map(r=>[r.date,r.amount]),[['2026-10-05',123456],['2026-10-06',1234]]);
 assert.equal(result.errors.length,6);assert.equal(result.outsideCount,0);
});

test('normalization rejects unsafe precision and does not silently round text amounts',()=>{
 const result=Bank.normalize(sheet([['2026-10-01','Precisión','1,005'],['2026-10-01','Demasiado grande','90071992547409,92'],['2026-10-01','Float no financiero',0.30000000000000004],['2026-10-01','Mal agrupado','12.34,56'],['2026-10-01','Sin signo','-'],['2026-10-01','Cero',0]]),config());
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].amount,30);assert.equal(result.errors.length,5);
 assert.throws(()=>Bank.normalize(sheet([['2026-10-01','x','1,00']]),config({date:1})),/dos funciones/);
 assert.throws(()=>Bank.normalize(sheet([]),config({month:'2026-13'})),/mes/);
 assert.throws(()=>Bank.normalize(sheet([]),config({amount:2,debit:2})),/importe con signo/);
});

test('header inference locates the actual table and leaves absent mappings unguessed',()=>{
 const sheets=[{name:'Notas',rows:[['Informe del banco']]},{name:'Cuenta',rows:[['Resumen'],[],['Fecha operación','Descripción','Cargo','Abono'],['05/10/2026','Recibo','25,50','']]}];
 const inferred=Bank.inferConfig(sheets,{month});assert.equal(inferred.sheet,1);assert.equal(inferred.header,2);assert.equal(inferred.date,0);assert.equal(inferred.description,1);assert.equal(inferred.amount,null);assert.equal(inferred.debit,2);assert.equal(inferred.credit,3);assert.equal(inferred.decimal,'comma');
 assert.equal(Bank.normalize(sheets,inferred).rows[0].amount,-2550);
 const missing=Bank.inferConfig([{name:'Sin formato',rows:[['Hola','Mundo']]}],month);assert.equal(missing.date,null);assert.equal(missing.amount,null);
});

test('bank extraction uses individual bank payments, includes opening references and never mutates records',()=>{
 const records=[record('split',{amount:6000,payments:[payment('a',1000,'2026-10-03','bank'),payment('b',2000,'2026-10-04','santi'),payment('c',3000,'2026-10-05','bank')]}),record('opening',{kind:'income',payments:[payment('d',4000)]},{included_in_opening:true}),record('personal',{payments:[payment('e',2000,'2026-10-05','agus')]}),record('cash',{payments:[payment('f',2000,'2026-10-05','cash')]}),record('forecast',{stage:'forecast',payments:[]}),record('forecast-partial',{stage:'forecast',payments:[payment('g',500)]})];
 const before=JSON.stringify(records),result=Bank.extract(records,month);
 assert.deepEqual(result.items.map(i=>[i.recordId,i.paymentId,i.amount]),[['split','a',-1000],['forecast-partial','g',-500],['opening','d',4000],['split','c',-3000]]);
 assert.equal(result.items.find(i=>i.recordId==='opening').opening,true);
 assert.ok(result.items.every(i=>i.inMonth&&i.estimated===false));assert.deepEqual(result.warnings,[]);assert.equal(JSON.stringify(records),before);
});

test('capital and bank transfers are bank movements; personal settlements and assigned income are not',()=>{
 const transfer=(id,kind,source,target,amount)=>record(id,{kind,source,target,amount,payments:[]});
 const records=[transfer('capital','contribution','santi','bank',7000),transfer('refund','transfer','bank','santi',500),transfer('cash-withdrawal','transfer','bank','cash',1000),transfer('cash-deposit','transfer','cash','bank',2000),transfer('personal','settlement','agus','santi',4000),record('assigned',{kind:'income',history:{status:'assigned',account:'santi'},payments:[]}),record('duplicate',{history:{status:'duplicate'}}),record('void',{}, {voided:true})];
 assert.deepEqual(Bank.extract(records,month).items.map(i=>[i.recordId,i.amount]),[['capital',7000],['cash-deposit',2000],['cash-withdrawal',-1000],['refund',-500]]);
});

test('unknown historical bank dates produce warnings rather than fabricated payments',()=>{
 const records=[record('inferred',{payments:[],history:{status:'paid',account:'bank'}},{included_in_opening:true}),record('approximate',{history:{payment_date_basis:'registered_month'}},{included_in_opening:true}),record('missing-day',{payments:[payment('bad',2000,'2026-10')]})];
 const result=Bank.extract(records,month);assert.equal(result.items.length,0);assert.equal(result.warnings.length,3);
 assert.equal(Bank.compare([],records,config({openingBalance:100,closingBalance:100})).ready,false);
});

test('extractor includes seven-day boundary context but only marks the selected month as inMonth',()=>{
 const records=['2026-09-23','2026-09-24','2026-09-30','2026-10-01','2026-10-31','2026-11-07','2026-11-08'].map((date,i)=>record('context-'+i,{payments:[payment('c'+i,100,date)]}));
 const result=Bank.extract(records,month);
 assert.deepEqual(result.items.map(i=>i.date),['2026-09-24','2026-09-30','2026-10-01','2026-10-31','2026-11-07']);
 assert.equal(result.items.filter(i=>i.inMonth).length,2);
 assert.equal(Bank.compare([],records,config()).unmatchedLedger.length,2);
});

test('exact suggestions never count as confirmed until explicitly linked',()=>{
 const records=[record('invoice')],rows=[row('row-2','2026-10-05',-2000)];
 const first=Bank.compare(rows,records,config({openingBalance:5000,closingBalance:3000}));
 assert.equal(first.bankRows[0].status,'suggested');assert.equal(first.totals.matchedCount,0);assert.equal(first.unmatchedLedger.length,1);assert.equal(first.ready,false);
 const decisions=[decision(rows[0],first.bankRows[0].match)],confirmed=Bank.compare(rows,records,config({openingBalance:5000,closingBalance:3000}),decisions);
 assert.equal(confirmed.bankRows[0].status,'matched');assert.equal(confirmed.totals.matchedCount,1);assert.equal(confirmed.totals.remainingCount,0);assert.equal(confirmed.unmatchedLedger.length,0);assert.equal(confirmed.ready,true);
 assert.deepEqual(Bank.validateDecisions(rows,records,config(),decisions),decisions);
});

test('duplicate bank rows cannot both consume or uniquely suggest the same movement',()=>{
 const records=[record('only')],rows=[row('row-2','2026-10-05',-2000),row('row-3','2026-10-05',-2000)],comparison=Bank.compare(rows,records,config());
 assert.deepEqual(comparison.bankRows.map(r=>r.status),['ambiguous','ambiguous']);assert.ok(comparison.bankRows.every(r=>r.match===null));
 const item=comparison.ledgerItems[0];
 assert.throws(()=>Bank.validateDecisions(rows,records,config(),rows.map(r=>decision(r,item))),error=>error.status===400&&error.code==='INVALID_DECISION');
 const confirmed=Bank.compare(rows,records,config(),[decision(rows[0],item)]);assert.equal(confirmed.bankRows[0].status,'matched');assert.equal(confirmed.bankRows[1].status,'unmatched');
});

test('duplicate ledger amounts stay ambiguous unless descriptions distinguish them',()=>{
 const records=[record('one',{title:'Proveedor Azul'}),record('two',{title:'Proveedor Verde'})];
 assert.equal(Bank.compare([row('row-2','2026-10-05',-2000,'Cargo tarjeta')],records,config()).bankRows[0].status,'ambiguous');
 const comparison=Bank.compare([row('row-2','2026-10-05',-2000,'Compra Proveedor Verde')],records,config());
 assert.equal(comparison.bankRows[0].status,'suggested');assert.equal(comparison.bankRows[0].match.recordId,'two');
});

test('boundary-date suggestions require supporting text, and context matches are not missing ledger entries',()=>{
 const records=[record('old',{title:'Suscripción Acme',payments:[payment('old',2000,'2026-09-30')]})],rows=[row('row-2','2026-10-02',-2000,'Compra Acme')];
 const suggested=Bank.compare(rows,records,config());assert.equal(suggested.bankRows[0].status,'suggested');assert.equal(suggested.unmatchedLedger.length,0);
 const confirmed=Bank.compare(rows,records,config({openingBalance:5000,closingBalance:3000}),[decision(rows[0],suggested.bankRows[0].match)]);assert.equal(confirmed.ready,true);assert.equal(confirmed.totals.ledgerOut,0);
 assert.equal(Bank.compare([{...rows[0],description:'Cargo sin identificar'}],records,config()).bankRows[0].status,'unmatched');
});

test('amount differences need a unique same-day same-sign text match and cannot be confirmed',()=>{
 const records=[record('fee',{title:'Servicio Acme'})],rows=[row('row-2','2026-10-05',-2100,'Recibo Servicio Acme')];
 const result=Bank.compare(rows,records,config());assert.equal(result.bankRows[0].status,'difference');assert.equal(result.bankRows[0].match.amount,-2000);
 assert.throws(()=>Bank.validateDecisions(rows,records,config(),[decision(rows[0],result.bankRows[0].match)]),/importes/);
 assert.equal(Bank.compare([{...rows[0],amount:2100}],records,config()).bankRows[0].status,'unmatched');
 assert.equal(Bank.compare([{...rows[0],date:'2026-10-06'}],records,config()).bankRows[0].status,'unmatched');
 assert.equal(Bank.compare([{...rows[0],description:'Otra empresa'}],records,config()).bankRows[0].status,'unmatched');
});

test('record changes invalidate a stored fingerprint even if the payment amount stays equal',()=>{
 const records=[record('mutable')],rows=[row('row-2','2026-10-05',-2000)],item=Bank.extract(records,month).items[0],decisions=[decision(rows[0],item)];
 const changed=structuredClone(records);changed[0].version=2;changed[0].data.title='New description';
 const result=Bank.compare(rows,changed,config(),decisions);assert.equal(result.bankRows[0].status,'stale');assert.equal(result.totals.matchedCount,0);
 assert.throws(()=>Bank.validateDecisions(rows,changed,config(),decisions),error=>error.status===400&&error.code==='STALE_MATCH');
 assert.equal(Bank.compare(rows,[{...records[0],voided:true}],config(),decisions).bankRows[0].status,'stale');
 assert.throws(()=>Bank.validateDecisions(rows,records,config(),[{...decisions[0],rowId:'missing'}]),error=>error.code==='STALE_MATCH');
});

test('fingerprints use deterministic SHA-256 rather than object insertion order',()=>{
 const original=record('unicode',{title:'Gestión café 🌿'}),item=Bank.extract([original],month).items[0];
 const canonical=value=>value==null?'null':Array.isArray(value)?'['+value.map(canonical).join(',')+']':typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
 const hash=text=>createHash('sha256').update(text).digest('hex');
 assert.equal(item.fingerprint,hash(hash(canonical(original))+'|'+item.key));
 const reordered=Object.fromEntries(Object.entries(original).reverse());reordered.data=Object.fromEntries(Object.entries(original.data).reverse());
 assert.equal(Bank.extract([reordered],month).items[0].fingerprint,item.fingerprint);
});

test('opening references reconcile without a synthetic starting-balance transaction',()=>{
 const records=[record('capital',{kind:'contribution',source:'santi',target:'bank',amount:10000,payments:[],date:'2026-10-01'},{included_in_opening:true}),record('paid',{payments:[payment('paid',2000,'2026-10-02')]},{included_in_opening:true})];
 const rows=[row('row-2','2026-10-01',10000,'Capital'),row('row-3','2026-10-02',-2000)],items=Bank.extract(records,month).items;
 const decisions=rows.map(bankRow=>decision(bankRow,items.find(i=>i.amount===bankRow.amount)));
 const result=Bank.compare(rows,records,config({openingBalance:4000,closingBalance:12000}),decisions);
 assert.equal(result.ready,true);assert.deepEqual(result.balance,{opening:4000,closing:12000,calculated:12000,difference:0});assert.equal(result.ledgerItems.length,2);
 assert.ok(result.ledgerItems.every(i=>i.opening));assert.equal(result.totals.bankNet,8000);assert.equal(result.totals.ledgerNet,8000);
});

test('missing balances, unexplained movements or a balance difference prevent completion',()=>{
 const records=[record('main')],rows=[row('row-2','2026-10-05',-2000)],item=Bank.extract(records,month).items[0],decisions=[decision(rows[0],item)];
 assert.equal(Bank.compare(rows,records,config(),decisions).ready,false);
 const mismatch=Bank.compare(rows,records,config({openingBalance:5000,closingBalance:3500}),decisions);assert.equal(mismatch.ready,false);assert.equal(mismatch.balance.difference,500);
 assert.equal(Bank.compare(rows,[...records,record('extra',{payments:[payment('x',100)]})],config({openingBalance:5000,closingBalance:3000}),decisions).ready,false);
 assert.equal(Bank.compare([],[],config({openingBalance:0,closingBalance:0})).ready,true);
 assert.throws(()=>Bank.compare(rows,records,config({openingBalance:1.5})),/precisión/);
 assert.throws(()=>Bank.compare([rows[0],{...rows[0]}],records,config()),/duplicado/);
});

test('read-only comparisons leave caller records, rows, configuration and decisions unchanged',()=>{
 const records=[record('pure')],rows=[row('row-2','2026-10-05',-2000)],configuration=config({openingBalance:5000,closingBalance:3000}),decisions=[decision(rows[0],Bank.extract(records,month).items[0])];
 const before=JSON.stringify({records,rows,configuration,decisions});Bank.compare(rows,records,configuration,decisions);Bank.validateDecisions(rows,records,configuration,decisions);
 assert.equal(JSON.stringify({records,rows,configuration,decisions}),before);
});

test('the same module loads in a browser without Node or DOM dependencies',()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../public/js/finance-bank'),'utf8'),context);
 assert.equal(typeof context.window.FinanceBank.compare,'function');
 const rows=[row('row-2','2026-10-05',-2000)],records=[record('browser')];
 assert.equal(JSON.stringify(context.window.FinanceBank.compare(rows,records,config())),JSON.stringify(Bank.compare(rows,records,config())));
});

test('file limits and malformed sheets are rejected before inference or normalization',()=>{
 const thirty=Array.from({length:30},()=>({name:'Hoja',rows:[]}));
 assert.equal(Bank.inferConfig(thirty,month).sheet,0);
 assert.throws(()=>Bank.inferConfig([...thirty,{name:'Extra',rows:[]}],month),/treinta/);
 assert.throws(()=>Bank.inferConfig([{name:'Inválida',rows:[null]}],month),/filas o columnas/);
 assert.throws(()=>Bank.normalize([{name:'Ancha',rows:[Array(101).fill('x')]}],config()),/columnas/);
 assert.throws(()=>Bank.inferConfig([{name:'A',rows:Array.from({length:2501},()=>[])},{name:'B',rows:Array.from({length:2500},()=>[])}],month),/5000 filas/);
});

test('value date is never inferred as operation date and malformed separators remain visible',()=>{
 const input=[{name:'Cuenta',rows:[['Fecha valor','Concepto','Importe'],['05/10-2026','Pago','1,00'],['05/10/2026','Texto excesivo','1'.repeat(101)]]}];
 assert.equal(Bank.inferConfig(input,month).date,null);
 const result=Bank.normalize(input,config());assert.equal(result.rows.length,0);assert.equal(result.errors.length,2);
});

test('malformed or repeated ledger payments warn without flipping signs or doubling totals',()=>{
 const original=record('repeated',{payments:[payment('same',2000),payment('same',2000),payment('bad-sign',-1000),payment('bad-date',1000,'desconocida'),null]});
 const result=Bank.extract([original],month);
 assert.deepEqual(result.items.map(i=>i.amount),[-2000]);assert.equal(result.warnings.length,3);
 assert.equal(Bank.compare([], [original], config({openingBalance:0,closingBalance:0})).ready,false);
});

test('sums and balances never exceed safe integer precision',()=>{
 const rows=[row('row-2','2026-10-05',Number.MAX_SAFE_INTEGER),row('row-3','2026-10-06',1)];
 assert.throws(()=>Bank.compare(rows,[],config()),/precisión/);
 assert.throws(()=>Bank.compare([rows[0]],[],config({openingBalance:1})),/precisión/);
});
