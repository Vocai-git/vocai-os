'use strict';
// Standalone, offline review copy. All changes stay in browser memory.
// Usage: node scripts/finance-preview.js output.html [private-opening.json]
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const output = process.argv[2];
if (!output) throw new Error('Provide an output HTML path');
const fixture = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : require('../tests/fixtures/finance');
fixture.records = fixture.records.map((r, i) => ({ id:r.id || `a1052026-0000-4000-8000-${String(i+1).padStart(12,'0')}`, version:1, voided:false, ...r }));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const core = read('lib/finance.js').replace('module.exports =', 'return').replace("require('../public/js/finance-tax')", 'window.FinanceTax');
const historyPath = path.join(root,'config/finance-history.private.json');
if(process.argv[3] && fs.existsSync(historyPath)) fixture.archive=JSON.parse(fs.readFileSync(historyPath,'utf8'));
const json = JSON.stringify(fixture).replace(/</g, '\\u003c');
const helper = String.raw`
const demo = OPENING_FIXTURE;
const demoFiles=[];const demoAudit=[];window.moneyBankPreview=true;
function escHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatMoney(n){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);}
function createModal(id,title,body,footer=''){document.getElementById(id)?.remove();const el=document.createElement('div');el.className='modal-overlay open';el.id=id;el.innerHTML='<div class="modal"><div class="modal-header"><h2 class="modal-title">'+escHtml(title)+'</h2><button class="modal-close" onclick="closeModal(\''+id+'\')">×</button></div><div class="modal-body">'+body+'</div><div class="modal-footer">'+footer+'</div></div>';document.body.append(el);}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function toast(message){const el=document.getElementById('demoToast');el.textContent=message;setTimeout(()=>el.textContent='',4000);}
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
const API={
 async get(url){
  if(url==='/finance/status')return {enabled:true};
  if(url.startsWith('/finance/bank-reviews?'))return [];
  if(url==='/finance')return structuredClone({review:true,baseline:demo.baseline,records:demo.records,files:demoFiles,summary:demoFinance.summarize(demo.baseline,demo.records)});
  if(url==='/finance/archive')return demo.archive || {expenses:[],invoices:[]};
  if(url.includes('/audit'))return demoAudit.filter(x=>x.after_row.id===url.split('/')[3]);
  if(url.startsWith('/finance/files/'))return {url:demoFiles.find(x=>x.id===url.split('/')[3]).url};
  fail('Ruta de demostración no disponible');
 },
 async post(url,body){
  if(url==='/finance/records'){const data=demoFinance.validate(body.data,demo.baseline.cutoff);const old=demo.records.find(x=>x.id===body.id);if(old)return structuredClone(old);const r={id:body.id,data,version:1,voided:false};demo.records.push(r);demoAudit.push({actor:'Prueba local',at:new Date().toISOString(),before_row:null,after_row:structuredClone(r)});return structuredClone(r);}
  const id=url.split('/')[3],r=demo.records.find(x=>x.id===id);if(!r)fail('No encontrado',404);
  if(url.endsWith('/next')){const key='next:'+id;const old=demo.records.find(x=>x.origin_key===key);if(old)return old;const data=demoFinance.nextDocument(r.data);const n={id:crypto.randomUUID(),data,version:1,voided:false,origin_key:key};demo.records.push(n);return n;}
  if(url.endsWith('/void')){r.voided=true;r.version++;return r;}fail('No disponible');
 },
 async put(url,body){const r=demo.records.find(x=>x.id===url.split('/')[3]);if(r.version!==body.version)fail('Recarga el registro',409);const before=structuredClone(r);r.data=demoFinance.validate(body.data,demo.baseline.cutoff);r.version++;demoAudit.push({actor:'Prueba local',at:new Date().toISOString(),before_row:before,after_row:structuredClone(r)});return structuredClone(r);}
};
const nativeFetch=window.fetch;
window.fetch=async(url,options)=>{if(String(url).startsWith('/api/finance/records/')&&String(url).endsWith('/files')){const file=options.body.get('file');const saved={id:crypto.randomUUID(),record_id:String(url).split('/')[4],name:file.name,url:URL.createObjectURL(file),mime:file.type,bytes:file.size};demoFiles.push(saved);return {ok:true,json:async()=>saved};}return nativeFetch(url,options);};
`.replace('OPENING_FIXTURE', json);
const html = `<!doctype html><html lang="es" data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VOCAI · Finanzas · Vista previa</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Syne:wght@600;700;800&display=swap" rel="stylesheet"><style>${read('public/css/main.css')}\n${read('public/css/money.css')}\n${read('public/css/finance-dashboard.css')}\n${read('public/css/finance-balances.css')}\n${read('public/css/finance-bank.css')}\n${read('public/css/finance-tax.css')}\nbody{margin:0;padding:0}.preview-banner{padding:10px 30px;background:var(--sidebar-bg);color:var(--text-muted);font:14px system-ui;display:flex;justify-content:space-between;gap:20px}.preview-banner button{cursor:pointer;border:1px solid var(--border);color:var(--text);border-radius:6px;background:transparent;padding:3px 9px}.preview-banner>span{display:flex;align-items:center;gap:20px;font-size:12px}.preview-wordmark{font:800 18px Outfit,sans-serif;letter-spacing:1px;color:var(--text)}.preview-content{padding:24px 30px;max-width:1660px;margin:auto}.preview-topbar{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-bottom:1px solid var(--border)}.preview-topbar .money-tabs{margin:0;padding:0}.preview-topbar .preview-brand{padding:0}.preview-brand{padding:22px 28px 0;font-size:23px;font-weight:800;letter-spacing:2px}#demoToast{position:fixed;bottom:20px;left:20px;background:#244d40;color:white;padding:10px;border-radius:8px;z-index:9999}#demoToast:empty{display:none}</style><body><div class="preview-banner"><span><b class="preview-wordmark">VOCAI</b><span>Vista previa · sin publicar</span></span><button onclick="location.reload()">Reiniciar prueba</button></div><main id="pageContent" class="preview-content"></main><div id="demoToast"></div><script>${read('public/js/finance-tax.js')}\nconst demoFinance=(()=>{${core}})();\n${helper}\n${read('public/js/finance-report.js')}\n${read('public/js/modules/money-dashboard.js')}\n${read('public/js/finance-balances.js')}\n${read('public/js/modules/money-balances.js')}\n${read('public/js/finance-bank.js')}\n${read('public/js/modules/money-bank.js')}\n${read('public/js/modules/money-tax.js')}\n${read('public/js/modules/money.js')}\nrenderMoney(document.getElementById('pageContent'));</script></body></html>`;
fs.mkdirSync(path.dirname(path.resolve(output)), {recursive:true});
fs.writeFileSync(output, html);
console.log('Preview written: ' + path.resolve(output));
