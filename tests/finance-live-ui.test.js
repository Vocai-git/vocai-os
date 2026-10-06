'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(records=[],review=false){
 const nodes={},calls={modals:[],toasts:[],closed:[],renders:[],post:[],put:[],uploads:[]};let serial=0;
 const ctx={window:{},FinanceTax:require('../public/js/finance-tax'),document:{getElementById:id=>nodes[id]},Intl,Date,JSON,Number,FormData:class{append(){}},
  crypto:{randomUUID:()=>`fixture-${++serial}`},localStorage:{getItem:()=>''},formatMoney:n=>n.toFixed(2),escHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  createModal:(...args)=>calls.modals.push(args),closeModal:id=>calls.closed.push(id),toast:(...args)=>calls.toasts.push(args),
  API:{post:async(path,payload)=>{calls.post.push({path,payload});return {id:payload.id,version:1,data:payload.data};},put:async(path,payload)=>{calls.put.push({path,payload});return {id:path.split('/').pop(),version:payload.version+1,data:payload.data};}},
  fetch:async(...args)=>{calls.uploads.push(args);return {ok:true,json:async()=>({id:'file'})};},
 };
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/js/modules/money-tax.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/js/modules/money.js'),'utf8'),ctx);
 ctx.moneyState=ctx.window.moneyState;ctx.moneyState.data={review,baseline:{cutoff:'2026-10-05'},records,files:[]};ctx.moneyState.view='summary';
 ctx.moneyToday=()=> '2026-10-05';ctx.renderMoney=async(el,view)=>calls.renders.push(view);
 const fields=values=>Object.entries(values).forEach(([id,value])=>{nodes[id]={value,disabled:false,textContent:''};});
 return {ctx,nodes,calls,fields};
}
const record=(data={},extra={})=>({id:'original',version:1,included_in_opening:true,data:{kind:'expense',title:'Servicio',amount:10000,date:'2026-10-01',payments:[],repeat:'monthly',history:{status:'paid',account:'santi'},...data},...extra});
function captureForm(h,file){
 h.ctx.moneyForm('expense');
 h.fields({mf_title:'Servicio',mf_amount:'12,50',mf_date:'2026-10-05',mf_status:'paid',mf_payment_date:'2026-10-05',mf_account:'santi',mf_save:'',mf_error:''});
 h.nodes.mf_file={files:file?[file]:[]};
}

test('live opening history supports attachments and next month without editable opening fields',()=>{
 const h=harness([record()]);h.ctx.moneyForm('expense','original');
 const [id,title,body,footer]=h.calls.modals.at(-1);
 assert.equal(id,'moneyClosed');
 assert.match(body,/Importe y pagos del cierre bloqueados/);
 assert.match(body,/id="mc_file"/);
 assert.match(footer,/Preparar próximo mes/);
 assert.match(footer,/Guardar adjunto/);
 assert.doesNotMatch(body,/id="mf_amount"|id="mf_date"/);
 assert.doesNotMatch(footer,/moneyVoid|moneySave/);
});

test('review remains read-only and nonrecurring opening documents cannot prepare another month',()=>{
 const review=harness([record()],true);review.ctx.moneyForm('expense','original');
 assert.equal(review.calls.modals.at(-1)[0],'moneyReview');
 assert.doesNotMatch(review.calls.modals.at(-1)[2],/mc_file|Preparar próximo mes/);
 const live=harness([record({repeat:'none'})]);live.ctx.moneyForm('expense','original');
 assert.doesNotMatch(live.calls.modals.at(-1)[3],/Preparar próximo mes/);
 assert.match(live.calls.modals.at(-1)[3],/Guardar adjunto/);
});

test('attachment failure and retry keep a single saved movement with its original payment',async()=>{
 const h=harness(),file={name:'factura.pdf',type:'application/pdf',size:128};captureForm(h,file);
 h.ctx.fetch=async(...args)=>{h.calls.uploads.push(args);return h.calls.uploads.length===1?{ok:false,status:503,json:async()=>({error:'Storage unavailable'})}:{ok:true,json:async()=>({id:'file'})};};
 await h.ctx.moneySave();
 assert.match(h.nodes.mf_error.textContent,/Movimiento guardado; el adjunto falló/);
 assert.equal(h.calls.post.length,1);
 assert.equal(h.calls.post[0].payload.data.payments.length,1);
 assert.equal(h.calls.post[0].payload.data.payments[0].amount,1250);
 await h.ctx.moneySave();
 assert.equal(h.calls.post.length,1);
 assert.equal(h.calls.put.length,0);
 assert.equal(h.calls.uploads.length,2);
 assert.ok(h.calls.closed.includes('moneyModal'));
});

test('uncertain save retries preserve the payment id and reject changed payment fields',async()=>{
 const h=harness();captureForm(h);
 h.ctx.API.post=async(path,payload)=>{h.calls.post.push({path,payload});if(h.calls.post.length===1)throw new Error('Network unavailable');return {id:payload.id,version:1,data:payload.data};};
 await h.ctx.moneySave();
 const firstId=h.calls.post[0].payload.data.payments[0].id;
 h.nodes.mf_account.value='bank';await h.ctx.moneySave();
 assert.equal(h.calls.post.length,1);
 assert.match(h.nodes.mf_error.textContent,/guardado sin confirmar/);
 h.nodes.mf_account.value='santi';await h.ctx.moneySave();
 assert.equal(h.calls.post.length,2);
 assert.equal(h.calls.post[1].payload.data.payments[0].id,firstId);
});

test('invalid attachments never create a financial record',async()=>{
 for(const file of [{name:'big.pdf',type:'application/pdf',size:10485761},{name:'script.html',type:'text/html',size:20},{name:'empty.pdf',type:'application/pdf',size:0}]){
  const h=harness();captureForm(h,file);await h.ctx.moneySave();
  assert.equal(h.calls.post.length,0);
  assert.ok(h.nodes.mf_error.textContent);
  assert.equal(h.nodes.mf_save.disabled,false);
 }
});

test('closed upload errors stay legible even when the server response is not JSON',async()=>{
 const h=harness([record()]);h.nodes.mc_file={files:[{name:'receipt.png',type:'image/png',size:100}]};h.fields({mc_save:'',mc_error:''});
 h.ctx.fetch=async()=>({ok:false,status:502,json:async()=>{throw new Error('Unexpected token');}});
 await h.ctx.moneyClosedFile('original');
 assert.match(h.nodes.mc_error.textContent,/HTTP 502/);
 assert.equal(h.nodes.mc_save.disabled,false);
 assert.equal(h.calls.post.length,0);
 assert.equal(h.calls.put.length,0);
 assert.equal(h.calls.closed.length,0);
});

test('payment dates and remaining amount are validated before updating a document',async()=>{
 const r=record({date:'2026-10-05',payments:[],history:undefined},{included_in_opening:false}),h=harness([r]);h.ctx.moneyPayment('original');
 h.fields({mp_amount:'100',mp_date:'2026-10-06',mp_account:'bank',mp_save:'',mp_error:''});
 await h.ctx.moneyPaySave();assert.match(h.nodes.mp_error.textContent,/pago futuro/);assert.equal(h.calls.put.length,0);
 h.nodes.mp_date.value='2026-10-04';await h.ctx.moneyPaySave();assert.match(h.nodes.mp_error.textContent,/cierre inicial/);assert.equal(h.calls.put.length,0);
 h.nodes.mp_date.value='2026-10-05';h.nodes.mp_amount.value='101';await h.ctx.moneyPaySave();assert.match(h.nodes.mp_error.textContent,/supera/);assert.equal(h.calls.put.length,0);
 h.nodes.mp_amount.value='100';await h.ctx.moneyPaySave();assert.equal(h.calls.put.length,1);
 assert.equal(h.calls.put[0].payload.data.payments[0].date,'2026-10-05');
 assert.equal(r.data.payments.length,0);
});

test('opening payments cannot be registered again and next month opens the created forecast',async()=>{
 const h=harness([record()]);h.ctx.moneyPayment('original');
 assert.equal(h.calls.modals.at(-1)[0],'moneyClosed');assert.equal(h.ctx.moneyState.payment,undefined);
 h.ctx.API.post=async(path)=>{h.calls.post.push({path});return record({date:'2026-11-01',stage:'forecast'},{included_in_opening:false});};
 await h.ctx.moneyNext('original');
 assert.equal(h.ctx.moneyState.month,'2026-11');
 assert.equal(h.ctx.moneyState.reportMode,'forecast');
 assert.equal(h.ctx.moneyState.filter,'expense');
 assert.equal(h.calls.renders.at(-1),'records');
});
