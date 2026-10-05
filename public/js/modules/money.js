/* Finanzas prácticas: a single capture flow, actual payments, separate aportes. */
window.moneyState = { view: 'home', data: null, filter: 'all', search: '', month: '', archiveMonth: '', archiveKind: 'all' };
const MONEY_ACCOUNTS = { bank: 'Banco VOCAI', cash: 'Efectivo VOCAI', santi: 'Santiago · personal', agus: 'Agustín · personal' };
const MONEY_GROUPS = { startup: 'Inversión inicial', capital: 'Aporte societario' };
const moneyEuro = cents => formatMoney(cents / 100);
const moneyEsc = value => escHtml(String(value ?? ''));
function moneyToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function moneyCents(value) {
  const clean = String(value).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new Error('Escribe un importe positivo con hasta dos decimales');
  const n = Math.round(Number(clean) * 100);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Revisa el importe');
  return n;
}
function moneyPaid(d) { return (d.payments || []).reduce((s, p) => s + p.amount, 0); }
function moneyRecord(id) { return moneyState.data.records.find(r => r.id === id); }
async function moneyEnabled() { const s = await API.get('/finance/status'); return !!s.enabled && !!s.live; }
async function renderMoney(el, view = 'records') {
  moneyState.view = view;
  el.innerHTML = '<div class="empty-state">Cargando tus cuentas…</div>';
  try {
    moneyState.data = await API.get('/finance');
    try {moneyState.originals = await API.get('/finance/archive');moneyState.historyError=false;} catch(e){moneyState.originals=null;moneyState.historyError=true;}
    if (!moneyState.month) moneyState.month = moneyToday().slice(0,7);
    moneyDraw(el);
  } catch (e) {
    el.innerHTML = `<div class="money-notice"><strong>No se pudieron cargar las cuentas</strong><p>${moneyEsc(e.message)}</p><button class="btn btn-secondary" onclick="renderMoney(document.getElementById('pageContent'))">Reintentar</button></div>`;
  }
}
async function renderPracticalFinance(el) { if (await moneyEnabled()) return renderMoney(el); return renderFinanzas(el); }
async function renderPracticalContributions(el) { if (await moneyEnabled()) return renderMoney(el, 'contributions'); return renderExpenses(el); }
async function renderPracticalInvoices(el) { if (await moneyEnabled()) { moneyState.filter = 'income'; return renderMoney(el, 'records'); } return renderInvoices(el); }
function moneyView(view) { moneyState.view = view; moneyDraw(document.getElementById('pageContent')); }
function moneyDraw(el) {
  const { baseline, summary: s } = moneyState.data;
  const view = moneyState.view;
  el.innerHTML = `<section class="money-workspace">
    <header class="money-header"><div><p class="money-eyebrow">VOCAI · TU DINERO, CLARO</p><h2>${view === 'contributions' ? 'Inversión V2' : 'Finanzas V2'}</h2><p>Movimientos mensuales, pagos y aportes separados.</p></div>
      <div class="money-actions">${moneyState.data.review ? '<span class="money-chip">Solo consulta · revisión</span>' : '<button class="btn btn-secondary" onclick="moneyForm(\'expense\',null,true)">Adjuntar factura</button><button class="btn btn-primary" onclick="moneyForm(\'expense\')">+ Añadir</button>'}</div></header>
    ${moneyState.data.review ? '<div class="money-notice"><strong>V2 · en revisión con Agustín</strong><p>Las secciones originales siguen funcionando. Esta vista conserva el cierre revisado; los cambios posteriores en la versión original deberán conciliarse antes de activar V2.</p></div>' : ''}
    <nav class="money-tabs" aria-label="Secciones de finanzas">${[['home','Resumen'],['records','Movimientos'],['pending','Por pagar / cobrar'],['contributions','Aportes'],['archive','Todos los registros anteriores']].map(([key,label]) => `<button class="${view===key?'active':''}" onclick="moneyView('${key}')">${label}</button>`).join('')}</nav>
    <div id="moneyBody"></div>
    <p class="money-footnote">Punto de partida revisado: ${moneyEsc(baseline.cutoff)}. Los movimientos del histórico no se suman de nuevo. <button onclick="moneyBaseline()">Ver cómo se calculó</button></p>
  </section>`;
  const body = document.getElementById('moneyBody');
  if (view === 'home') body.innerHTML = moneyHome(s);
  else if (view === 'contributions') body.innerHTML = moneyContributions(s);
  else if (view === 'archive') moneyArchive(body);
  else moneyList(body, view === 'pending');
  if(moneyState.data.review) el.querySelectorAll('button[onclick^="moneyForm"]').forEach(button=>{button.disabled=true;button.title='Disponible al activar V2 después de la revisión';});
}
function moneyHome(s) {
  return `<div class="money-metrics">
    <article class="money-metric money-main"><span>Disponible en VOCAI</span><strong>${moneyEuro(s.cash.bank+s.cash.cash)}</strong><p>Banco ${moneyEuro(s.cash.bank)} · Efectivo ${moneyEuro(s.cash.cash)}</p></article>
    <article class="money-metric"><span>Por cobrar</span><strong>${moneyEuro(s.pending_income)}</strong><button onclick="moneyState.filter='income';moneyView('pending')">Ver cobros pendientes →</button></article>
    <article class="money-metric"><span>Por pagar</span><strong>${moneyEuro(s.pending_expense)}</strong><button onclick="moneyState.filter='expense';moneyView('pending')">Revisar antes de pagar →</button></article>
  </div>
  <div class="money-columns"><article class="money-panel"><p class="money-eyebrow">GASTOS ADELANTADOS</p><h3>VOCAI y vosotros</h3>
    ${['santi','agus'].map(p=>`<div class="money-balance"><div><strong>${p==='santi'?'Santiago':'Agustín'}</strong><small>${s.operating[p]>=0?'Pendiente de devolver por VOCAI':'Pendiente de entregar a VOCAI'}</small></div><b>${moneyEuro(Math.abs(s.operating[p]))}</b></div>`).join('')}
    <p class="money-muted">Incluye la compensación interna de Ana. No incluye la deuda personal entre socios por los aportes.</p>
    <button class="btn btn-secondary" onclick="moneyForm('transfer')">Registrar devolución o transferencia</button></article>
    <article class="money-panel"><p class="money-eyebrow">SIN VOLVER A ESCRIBIRLO</p><h3>¿Qué pasó hoy?</h3>
      <button class="money-quick" onclick="moneyForm('expense')"><span>↗</span><div><strong>Hicimos una compra</strong><small>Concepto, importe y quién pagó.</small></div><b>→</b></button>
      <button class="money-quick" onclick="moneyForm('income')"><span>↙</span><div><strong>Tenemos un ingreso</strong><small>Registra una venta; confirma el cobro cuando llegue.</small></div><b>→</b></button>
      <button class="money-quick" onclick="moneyView('contributions')"><span>◎</span><div><strong>Uno de nosotros puso dinero</strong><small>Aportes y compensaciones, por separado.</small></div><b>→</b></button>
    </article></div>`;
}
function moneyContributions(s) {
  return `<div class="money-columns">${Object.entries(s.groups).map(([key,g])=>`<article class="money-panel"><p class="money-eyebrow">${key==='startup'?'01 · ARRANQUE':'02 · CUENTA DE LA SOCIEDAD'}</p><h3>${MONEY_GROUPS[key]}</h3>
    <div class="money-big">${moneyEuro(g.total)}</div><div class="money-balance"><span>Santiago puso</span><b>${moneyEuro(g.santi)}</b></div><div class="money-balance"><span>Agustín puso</span><b>${moneyEuro(g.agus)}</b></div>
    <div class="money-balance"><span>Mitad de cada uno</span><b>${moneyEuro(g.each)}</b></div>
    <div class="money-notice">${g.agus_to_santi>=0?'Agustín → Santiago':'Santiago → Agustín'}<strong>${moneyEuro(Math.abs(g.agus_to_santi))} pendientes</strong></div>
    <button class="btn btn-secondary" onclick="moneyForm('settlement',null,false,'${key}')">Registrar compensación</button></article>`).join('')}</div>
    <div class="money-panel money-total"><div><strong>Total aportado ${moneyEuro(Object.values(s.groups).reduce((a,g)=>a+g.total,0))}</strong><p>El capital y el arranque se mantienen separados. Sus compensaciones no son gastos de VOCAI.</p></div><button class="btn btn-primary" onclick="moneyForm('contribution')">+ Nuevo aporte</button></div>`;
}
function moneyList(el, pending) {
  el.innerHTML = `<div class="money-toolbar"><label>Mes <input class="form-input" type="month" value="${moneyState.month}" onchange="moneyState.month=this.value;moneyRows(${pending})"></label><input id="moneySearch" class="form-input" type="search" placeholder="Buscar concepto, proveedor o factura…" aria-label="Buscar movimientos" value="${moneyEsc(moneyState.search)}" oninput="moneyState.search=this.value;moneyRows(${pending})"><select class="form-select" aria-label="Filtrar movimientos" onchange="moneyState.filter=this.value;moneyRows(${pending})">${[['all','Todo'],['expense','Compras y gastos'],['income','Ventas y cobros'],['transfer','Transferencias'],['contribution','Aportes'],['settlement','Compensaciones']].map(([v,t])=>`<option value="${v}" ${moneyState.filter===v?'selected':''}>${t}</option>`).join('')}</select></div><div id="moneyMonthSummary"></div><div id="moneyRows"></div><div id="moneyOriginalMonth"></div>`;
  moneyRows(pending);
}
function moneyRows(pending) {
  const query = moneyState.search.toLowerCase();
  moneyMonthlySummary();
  if(!pending)moneyOriginalMonth();else document.getElementById('moneyOriginalMonth').innerHTML='';
  const rows = moneyState.data.records.filter(r=>!r.voided).filter(r=>moneyState.filter==='all'||r.data.kind===moneyState.filter)
    .filter(r=>!moneyState.month || (pending ? (r.data.due||r.data.date).slice(0,7)<=moneyState.month : r.data.date.startsWith(moneyState.month)||(r.data.payments||[]).some(p=>p.date.startsWith(moneyState.month))))
    .filter(r=>!pending||(!r.included_in_opening&&['expense','income'].includes(r.data.kind)&&moneyPaid(r.data)<r.data.amount))
    .filter(r=>[r.data.title,r.data.party,r.data.number].join(' ').toLowerCase().includes(query)).sort((a,b)=>b.data.date.localeCompare(a.data.date));
  document.getElementById('moneyRows').innerHTML = rows.length ? rows.map(r=>{
    const d=r.data, remaining=d.amount-moneyPaid(d), documentType=['expense','income'].includes(d.kind);
    const files=moneyState.data.files.filter(f=>f.record_id===r.id);
    return `<article class="money-row"><div class="money-row-main"><strong>${moneyEsc(d.title)}</strong><small>${moneyEsc(d.date)}${d.party?' · '+moneyEsc(d.party):''}${d.period_start?' · Período '+moneyEsc(d.period_start)+' / '+moneyEsc(d.period_end||''):''}</small><span class="money-chip ${!moneyState.data.review&&!r.included_in_opening&&documentType&&remaining?'pending':'done'}">${r.included_in_opening?'Incluido en el cierre':documentType?(remaining?`Pendiente ${moneyEuro(remaining)}`:'Pagado / cobrado'):'Movimiento confirmado'}</span></div><div class="money-row-end"><b>${moneyEuro(d.amount)}</b><div class="money-actions">${!moneyState.data.review&&!r.included_in_opening&&documentType&&remaining?`<button class="btn btn-primary btn-sm" onclick="moneyPayment('${r.id}')">${d.kind==='income'?'Cobrar':'Pagar'}</button>`:''}<button class="btn btn-secondary btn-sm" onclick="moneyForm('${d.kind}','${r.id}')">${moneyState.data.review?'Ver detalle':r.included_in_opening?'Ver justificante':'Ver / editar'}</button>${files.map(f=>`<button class="btn btn-secondary btn-sm" onclick="moneyFile('${f.id}')" title="${moneyEsc(f.name)}">Adjunto</button>`).join('')}</div></div></article>`;
  }).join('') : '<div class="money-empty"><h3>Todo despejado</h3><p>No hay movimientos con estos filtros.</p></div>';
}
function moneyOptions(options, selected) { return Object.entries(options).map(([v,label])=>`<option value="${v}" ${selected===v?'selected':''}>${moneyEsc(label)}</option>`).join(''); }
function moneyForm(kind='expense', recordId=null, focusFile=false, group=null) {
  const record = recordId ? moneyRecord(recordId) : null;
  if(moneyState.data.review) return moneyReviewDetails(record);
  const d = record?.data || {kind,title:'',amount:0,date:moneyToday(),payments:[],repeat:'none',group:group||'capital'};
  const isDoc=['expense','income'].includes(kind);
  if(record?.included_in_opening){
    createModal('moneyClosed','Pago incluido en el cierre',`<div class="money-form"><h3>${moneyEsc(d.title)} · ${moneyEuro(d.amount)}</h3><p>${moneyEsc(d.notes)}</p><p>${d.payments.map(p=>moneyEsc(p.date)+' · '+moneyEsc(MONEY_ACCOUNTS[p.account])+' · '+moneyEuro(p.amount)).join('<br>')}</p><label>Adjuntar factura<input id="mc_file" type="file" accept="application/pdf,image/jpeg,image/png"></label><p class="money-muted">Este pago ya está incluido en los saldos iniciales; no se contabiliza dos veces.</p></div>`,`<button class="btn btn-secondary" onclick="closeModal('moneyClosed')">Cerrar</button>${d.repeat==='monthly'?`<button class="btn btn-secondary" onclick="moneyNext('${record.id}')">Preparar próximo mes</button>`:''}<button id="mc_save" class="btn btn-primary" onclick="moneyClosedFile('${record.id}')">Guardar adjunto</button>`);
    return;
  }
  moneyState.form = { id:recordId||crypto.randomUUID(), record, kind, busy:false };
  const labels={expense:'Compra o gasto',income:'Venta o ingreso',transfer:'Devolución o transferencia',contribution:'Nuevo aporte',settlement:'Compensación entre socios'};
  createModal('moneyModal', record?'Detalle del movimiento':labels[kind], `<div class="money-form">
    ${!record&&isDoc?`<div class="money-switch"><button class="${kind==='expense'?'active':''}" onclick="moneyForm('expense')">Compra / gasto</button><button class="${kind==='income'?'active':''}" onclick="moneyForm('income')">Venta / ingreso</button></div>`:''}
    ${isDoc?`<label class="money-upload">${focusFile?'Empieza adjuntando tu factura':'Factura o justificante (opcional)'}<input id="mf_file" type="file" accept="application/pdf,image/jpeg,image/png"><small>PDF, JPG o PNG · hasta 10 MB · adjunto privado. Completa los datos debajo.</small></label>`:''}
    <label>¿Qué es?<input id="mf_title" class="form-input" maxlength="180" value="${moneyEsc(d.title)}" placeholder="Ej. Café oficina o mensualidad de Fabi"></label>
    <div class="form-row"><label>Total (€)<input id="mf_amount" class="form-input" inputmode="decimal" value="${d.amount?(d.amount/100).toFixed(2):''}" placeholder="0,00"></label><label>${isDoc?'Fecha del documento':'Fecha del movimiento'}<input id="mf_date" class="form-input" type="date" value="${moneyEsc(d.date)}"></label></div>
    ${isDoc?`
      ${!record?`<div><p>¿Ya se pagó o cobró?</p><input id="mf_status" type="hidden" value="pending"><div class="money-switch"><button id="mf_pending_btn" class="active" onclick="moneySetPaid(false)">Todavía pendiente</button><button id="mf_paid_btn" onclick="moneySetPaid(true)">Sí, ya se pagó / cobró</button></div></div><div id="mf_paid_fields" class="form-row" hidden><label>${kind==='expense'?'¿De dónde salió?':'¿Dónde entró?'}<select id="mf_account" class="form-select">${moneyOptions(MONEY_ACCOUNTS,'santi')}</select></label><label>Fecha real de pago<input id="mf_payment_date" class="form-input" type="date" max="${moneyToday()}" value="${moneyToday()}"></label></div>`:
        `<div class="money-notice">${d.payments.length?d.payments.map(p=>`${moneyEsc(p.date)} · ${moneyEsc(MONEY_ACCOUNTS[p.account])} · ${moneyEuro(p.amount)}`).join('<br>'):'Todavía no tiene pagos.'}<small>Para corregir un pago real, anula este registro con motivo y vuelve a registrarlo. Su historial se conserva.</small></div>`}
      <details><summary>Datos de factura, período y repetición</summary><div class="form-row"><label>Proveedor / cliente<input id="mf_party" class="form-input" maxlength="180" value="${moneyEsc(d.party)}"></label><label>Número de factura<input id="mf_number" class="form-input" maxlength="100" value="${moneyEsc(d.number)}" placeholder="Opcional"></label></div><div class="form-row"><label>Desde<input id="mf_start" class="form-input" type="date" value="${moneyEsc(d.period_start)}"></label><label>Hasta<input id="mf_end" class="form-input" type="date" value="${moneyEsc(d.period_end)}"></label></div><div class="form-row"><label>Vencimiento<input id="mf_due" class="form-input" type="date" value="${moneyEsc(d.due)}"></label><label>Categoría<input id="mf_category" class="form-input" maxlength="80" value="${moneyEsc(d.category)}" placeholder="Software, oficina…"></label></div><label>¿Se repite?<select id="mf_repeat" class="form-select">${moneyOptions({none:'No · según consumo o puntual',monthly:'Mensual · preparar como pendiente'},d.repeat)}</select></label><p class="money-muted">Repetir nunca confirma un pago. Café y Dropbox quedan sin repetición.</p></details>`:
      `<div class="form-row"><label>Sale de<select id="mf_source" class="form-select">${moneyOptions(kind==='transfer'?MONEY_ACCOUNTS:{santi:'Santiago',agus:'Agustín'},d.source||(kind==='settlement'?'agus':kind==='transfer'?'bank':'santi'))}</select></label><label>Llega a<select id="mf_target" class="form-select">${moneyOptions(kind==='contribution'?{bank:'Banco VOCAI',cash:'Efectivo VOCAI'}:kind==='settlement'?{santi:'Santiago',agus:'Agustín'}:MONEY_ACCOUNTS,d.target||(kind==='contribution'?'bank':'santi'))}</select></label></div>${kind!=='transfer'?`<label>Bloque de aportación<select id="mf_group" class="form-select">${moneyOptions(MONEY_GROUPS,d.group)}</select></label>`:'<p class="money-muted">VOCAI → socio reduce lo que VOCAI le debe. Socio → VOCAI registra un adelanto corriente; para capital usa «Nuevo aporte».</p>'}`}
    <label>Notas<textarea id="mf_notes" class="form-textarea" maxlength="4000">${moneyEsc(d.notes)}</textarea></label><p id="mf_error" class="money-error" role="alert"></p>
    ${record?`<div class="money-actions"><button class="btn btn-secondary btn-sm" onclick="moneyAudit('${record.id}')">Historial</button>${isDoc&&d.repeat==='monthly'?`<button class="btn btn-secondary btn-sm" onclick="moneyNext('${record.id}')">Preparar próximo mes</button>`:''}<button class="btn btn-danger btn-sm" onclick="moneyVoid('${record.id}')">Anular</button></div>`:''}
  </div>`, '<button class="btn btn-secondary" onclick="closeModal(\'moneyModal\')">Cancelar</button><button id="mf_save" class="btn btn-primary" onclick="moneySave()">Guardar</button>');
}
async function moneySave() {
  const form=moneyState.form; if(form.busy)return;
  const val=id=>document.getElementById(id)?.value||'';
  const file=document.getElementById('mf_file')?.files[0];
  form.busy=true; document.getElementById('mf_save').disabled=true;
  try {
    if(file&&file.size>10485760)throw new Error('El adjunto supera 10 MB');
    const isDoc=['expense','income'].includes(form.kind);
    const amount=moneyCents(val('mf_amount'));
    const payments=form.record?.data.payments||[];
    if(!form.record&&isDoc&&val('mf_status')==='paid') payments.push({id:crypto.randomUUID(),amount,date:val('mf_payment_date'),account:val('mf_account')});
    const data={kind:form.kind,title:val('mf_title'),amount,date:val('mf_date'),notes:val('mf_notes'),
      party:val('mf_party'),number:val('mf_number'),category:val('mf_category'),
      period_start:val('mf_start')||null,period_end:val('mf_end')||null,due:val('mf_due')||null,
      repeat:val('mf_repeat')||'none',source:val('mf_source')||null,target:val('mf_target')||null,
      group:val('mf_group')||null,payments};
    // Keep the exact payload on a network retry: same id, payment UUIDs, and body.
    if(form.retryPayload){ if(JSON.stringify({...data,payments:[]})!==JSON.stringify({...form.retryPayload,payments:[]})) throw new Error('Hay un guardado sin confirmar. Reintenta sin cambiar los campos o recarga para comprobarlo.'); data.payments=form.retryPayload.payments; }
    form.retryPayload=data;
    const saved=form.record?await API.put('/finance/records/'+form.id,{version:form.record.version,data}):await API.post('/finance/records',{id:form.id,data});
    form.record=saved; form.retryPayload=null;
    // A failed attachment must not create a duplicate purchase on retry.
    if(file){const fd=new FormData();fd.append('file',file);const response=await fetch('/api/finance/records/'+form.id+'/files',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('vocai_token')},body:fd});const payload=await response.json();if(!response.ok)throw new Error('Movimiento guardado; el adjunto falló: '+payload.error);}
    closeModal('moneyModal');toast('Guardado. Tus cuentas están actualizadas.','success');await renderMoney(document.getElementById('pageContent'),moneyState.view);
  }catch(e){document.getElementById('mf_error').textContent=e.message;form.retryPayload=e.status&&e.status<500?null:form.retryPayload;}
  finally{form.busy=false;const button=document.getElementById('mf_save');if(button)button.disabled=false;}
}
function moneyPayment(recordId) {
  if(moneyState.data.review)return moneyReviewDetails(moneyRecord(recordId));
  const r=moneyRecord(recordId),remaining=r.data.amount-moneyPaid(r.data);
  moneyState.payment={record:r,id:crypto.randomUUID(),busy:false};
  createModal('moneyPayment','Confirmar '+(r.data.kind==='income'?'cobro':'pago'),`<div class="money-form"><p>${moneyEsc(r.data.title)} · pendiente ${moneyEuro(remaining)}</p><label>Importe recibido / pagado<input id="mp_amount" class="form-input" inputmode="decimal" value="${(remaining/100).toFixed(2)}"></label><label>Fecha real<input id="mp_date" class="form-input" type="date" max="${moneyToday()}" value="${moneyToday()}"></label><label>${r.data.kind==='income'?'Entró en':'Salió de'}<select id="mp_account" class="form-select">${moneyOptions(MONEY_ACCOUNTS,'bank')}</select></label><p id="mp_error" class="money-error" role="alert"></p></div>`, '<button class="btn btn-secondary" onclick="closeModal(\'moneyPayment\')">Cancelar</button><button id="mp_save" class="btn btn-primary" onclick="moneyPaySave()">Confirmar</button>');
}
async function moneyPaySave() {
  const p=moneyState.payment;if(p.busy)return;p.busy=true;document.getElementById('mp_save').disabled=true;
  try{
    const payment={id:p.id,amount:moneyCents(document.getElementById('mp_amount').value),date:document.getElementById('mp_date').value,account:document.getElementById('mp_account').value};
    const data={...p.record.data,payments:[...p.record.data.payments,payment]};
    await API.put('/finance/records/'+p.record.id,{version:p.record.version,data});
    closeModal('moneyPayment');toast('Pago confirmado','success');await renderMoney(document.getElementById('pageContent'),moneyState.view);
  }catch(e){document.getElementById('mp_error').textContent=e.message+(e.status===409?' Cierra y recarga antes de reintentar.':'');}
  finally{p.busy=false;const b=document.getElementById('mp_save');if(b)b.disabled=false;}
}
async function moneyFile(id){try{const {url}=await API.get('/finance/files/'+id);const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click();}catch(e){toast(e.message,'error');}}
async function moneyNext(id){if(moneyState.data.review)return toast('V2 está en revisión; todavía no crea previsiones.');try{await API.post('/finance/records/'+id+'/next',{});closeModal('moneyModal');closeModal('moneyClosed');toast('Próximo mes preparado como pendiente','success');await renderMoney(document.getElementById('pageContent'),'pending');}catch(e){toast(e.message,'error');}}
async function moneyVoid(id){const reason=prompt('Motivo de la anulación (se conserva el historial):');if(!reason)return;try{await API.post('/finance/records/'+id+'/void',{version:moneyRecord(id).version,reason});closeModal('moneyModal');await renderMoney(document.getElementById('pageContent'),moneyState.view);}catch(e){toast(e.message,'error');}}
async function moneyAudit(id){try{const rows=await API.get('/finance/records/'+id+'/audit');createModal('moneyAudit','Historial del registro',rows.map(x=>`<details class="money-panel"><summary>${moneyEsc(x.at)} · ${moneyEsc(x.actor)}</summary><pre class="money-json">${moneyEsc(JSON.stringify({antes:x.before_row?.data,despues:x.after_row.data,anulado:x.after_row.voided},null,2))}</pre></details>`).join(''));}catch(e){toast(e.message,'error');}}
function moneyBaseline(){const b=moneyState.data.baseline;createModal('moneyBaseline','Punto de partida revisado',`<div class="money-form"><p>${moneyEsc(b.description)}</p>${(b.explanation||[]).map(line=>`<p>${moneyEsc(line)}</p>`).join('')}<p><strong>Saldo corriente de Santiago al cierre:</strong> ${moneyEuro(b.operating.santi)}.</p><p>Compensación interna de Ana asignada a Santiago: ${moneyEuro(b.ana_assigned||0)}. No se presenta como cobro bancario real.</p><p>Banco: ${moneyEuro(b.cash.bank)} · Efectivo: ${moneyEuro(b.cash.cash)} · Pendiente a Agustín: ${moneyEuro(b.operating.agus)}.</p><p>Las aportaciones se muestran por separado. Los documentos y datos originales se conservan en Histórico. No vuelvas a registrar como nuevos los pagos incluidos en este cierre.</p></div>`);}
async function moneyArchive(el){
 el.innerHTML='<p>Cargando histórico completo…</p>';
 try{const data=await API.get('/finance/archive');if(moneyState.view!=='archive')return;
 moneyState.archive=[...data.expenses.map(x=>({...x,kind:'expense',title:x.nombre})),...data.invoices.map(x=>({...x,kind:'income',title:x.concepto}))];
 el.innerHTML=`<div class="money-notice"><strong>Todos los registros anteriores · ${data.expenses.length} gastos y ${data.invoices.length} facturas</strong><p>Datos originales, incluidos borradores y previsiones. El responsable registrado no demuestra quién pagó. Los pagos revisados se consultan en Movimientos; estas referencias no se suman otra vez ni generan un resultado de caja confirmado.</p></div><div class="money-toolbar"><label>Mes <input id="ma_month" type="month" class="form-input" value="${moneyState.archiveMonth}" onchange="moneyState.archiveMonth=this.value;moneyArchiveRows()"></label><button class="btn btn-secondary" onclick="moneyState.archiveMonth='';document.getElementById('ma_month').value='';moneyArchiveRows()">Todos los meses</button><select id="ma_kind" class="form-select" onchange="moneyState.archiveKind=this.value;moneyArchiveRows()">${moneyOptions({all:'Todos los registros',expense:'Gastos',income:'Facturas',investment:'Inversión original'},moneyState.archiveKind)}</select><input id="ma_search" class="form-input" placeholder="Buscar concepto, cliente o notas…" oninput="moneyArchiveRows()"></div><p id="ma_count"></p><div id="ma_rows"></div>`;moneyArchiveRows();
 }catch(e){el.textContent=e.message;}
}
function moneyArchiveRows(){
 const query=document.getElementById('ma_search').value.toLowerCase();
 const rows=moneyState.archive.filter(x=>(!moneyState.archiveMonth||String(x.fecha).startsWith(moneyState.archiveMonth))&&(moneyState.archiveKind==='all'||(moneyState.archiveKind==='investment'?x.kind==='expense'&&x.tipo==='inversion':x.kind===moneyState.archiveKind))&&[x.title,x.numero,x.cliente_nombre,x.notas].join(' ').toLowerCase().includes(query)).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
 document.getElementById('ma_count').textContent=rows.length+' registros originales · fechas de registro, no necesariamente de pago';
 document.getElementById('ma_rows').innerHTML=rows.map(x=>`<article class="money-row"><div><strong>${moneyEsc(x.title)}</strong><small>${moneyEsc(x.fecha)} · ${x.kind==='expense'?'Gasto':'Factura'} · ${moneyEsc(x.numero||x.responsable||'')}</small><small>${moneyEsc(x.cliente_nombre||'')} ${moneyEsc(x.notas||'')}</small><span class="money-chip">Original · ${moneyEsc(x.estado||x.tipo||'sin estado de pago')}</span></div><b>${formatMoney(x.total??x.importe)}</b></article>`).join('')||'<p>No hay registros para este filtro.</p>';
}
function moneyReviewDetails(record){
 if(!record)return toast('V2 está en revisión. La carga real sigue en las secciones originales.');
 const d=record.data;createModal('moneyReview','Movimiento revisado',`<h3>${moneyEsc(d.title)} · ${moneyEuro(d.amount)}</h3><p>${moneyEsc(d.notes)}</p><p>${moneyEsc(d.date)}${d.period_start?' · Período '+moneyEsc(d.period_start)+' / '+moneyEsc(d.period_end):''}</p>${(d.payments||[]).map(p=>`<p>${moneyEsc(p.date)} · ${moneyEsc(MONEY_ACCOUNTS[p.account])} · ${moneyEuro(p.amount)}</p>`).join('')}<p>${!['income','expense'].includes(d.kind)?'Movimiento confirmado · '+moneyEsc(MONEY_ACCOUNTS[d.source])+' → '+moneyEsc(MONEY_ACCOUNTS[d.target]):moneyPaid(d)?'Pagos revisados reflejados arriba.':'Pendiente de pago o cobro.'}</p><p>Solo consulta durante la revisión de V2.</p>`);
}
function moneyMonthlySummary(){
 const month=moneyState.month;let income=0,expense=0;
 for(const r of moneyState.data.records){if(r.voided||!['expense','income'].includes(r.data.kind))continue;for(const p of r.data.payments||[]){if(!month||p.date.startsWith(month)){if(r.data.kind==='income')income+=p.amount;else expense+=p.amount;}}}
 const partial=!month||month<=moneyState.data.baseline.cutoff.slice(0,7);
 document.getElementById('moneyMonthSummary').innerHTML=`<div class="money-metrics">${[['Ingresos cobrados',income],['Gastos pagados',expense],['Resultado neto de caja',income-expense]].map(([label,n])=>`<article class="money-metric"><span>${label}${partial?' · revisados':''}</span><strong>${label==='Resultado neto de caja'&&partial?'Por conciliar':moneyEuro(n)}</strong></article>`).join('')}</div><p class="money-muted">${partial?'Cobertura histórica parcial: estos importes corresponden solo a pagos revisados con fecha conocida. No son todavía el resultado completo del mes. Consulta todos los registros anteriores para revisar lo restante.':'Cobros menos pagos del negocio, incluidas cuentas personales. Aportes y devoluciones se muestran aparte.'}</p>`;
}

function moneySetPaid(paid){document.getElementById("mf_status").value=paid?"paid":"pending";document.getElementById("mf_paid_fields").hidden=!paid;document.getElementById("mf_pending_btn").classList.toggle("active",!paid);document.getElementById("mf_paid_btn").classList.toggle("active",paid);}

async function moneyClosedFile(id){const input=document.getElementById('mc_file');if(!input.files[0])return toast('Selecciona un archivo','error');const button=document.getElementById('mc_save');button.disabled=true;try{const form=new FormData();form.append('file',input.files[0]);const response=await fetch('/api/finance/records/'+id+'/files',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('vocai_token')},body:form});const result=await response.json();if(!response.ok)throw new Error(result.error);closeModal('moneyClosed');toast('Adjunto guardado','success');await renderMoney(document.getElementById('pageContent'),moneyState.view);}catch(e){toast(e.message,'error');}finally{button.disabled=false;}}

function moneyOriginalMonth(){
 const el=document.getElementById('moneyOriginalMonth');if(!el)return;
 if(moneyState.historyError){el.innerHTML='<div class="money-notice">No se pudo cargar el histórico. Recarga la sección para volver a intentarlo.</div>';return;}
 const originals=moneyState.originals||{expenses:[],invoices:[]};
 const query=moneyState.search.toLowerCase(),month=moneyState.month;
 const rows=[...originals.expenses.map(x=>({...x,kind:'expense',title:x.nombre})),...originals.invoices.map(x=>({...x,kind:'income',title:x.concepto}))].filter(x=>(!month||String(x.fecha).startsWith(month))&&(moneyState.filter==='all'||moneyState.filter===x.kind)&&[x.title,x.cliente_nombre,x.numero,x.notas].join(' ').toLowerCase().includes(query)).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
 el.innerHTML=`<details class="money-panel" ${rows.length?'open':''}><summary><strong>Registros originales del mes · ${rows.length}</strong></summary><p class="money-muted">Referencia completa de la versión anterior. Puede incluir documentos revisados arriba, borradores y previsiones. No se vuelve a sumar a los importes de caja ni acredita quién pagó.</p>${rows.map(x=>`<article class="money-row"><div><strong>${moneyEsc(x.title)}</strong><small>${moneyEsc(x.fecha)} · ${moneyEsc(x.cliente_nombre||x.responsable||'')} · ${moneyEsc(x.estado||x.tipo||'')}</small><small>${moneyEsc(x.notas||'')}</small></div><b>${formatMoney(x.total??x.importe)}</b></article>`).join('')}</details>`;
}
