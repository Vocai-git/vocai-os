/* Finanzas prácticas: a single capture flow, actual payments, separate aportes. */
window.moneyState = { view: 'summary', data: null, filter: 'all', search: '', month: '', archiveMonth: '', archiveKind: 'all', reportMode:'business' };
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
async function renderMoney(el, view = 'summary') {
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
function moneyView(view) { if(view==='summary')moneyState.reportMode='business'; moneyState.view = view; moneyDraw(document.getElementById('pageContent')); }
function moneyDraw(el) {
  const { baseline, summary: s } = moneyState.data;
  const view = moneyState.view;
  el.innerHTML = `<section class="money-workspace ${view==='summary'?'money-dashboard-active':''}">
    <header class="section-header money-header"><div><p class="money-eyebrow">VOCAI / ADMINISTRACIÓN</p><h2>${view === 'contributions' ? 'Inversión y aportes' : 'Finanzas'}</h2><p>Control económico de VOCAI</p></div>
      <div class="money-actions">${moneyState.data.review ? '<span class="money-chip">Solo consulta · revisión</span>' : '<button class="btn btn-secondary" onclick="moneyForm(\'expense\',null,true)">Adjuntar factura</button><button class="btn btn-primary" onclick="moneyForm(\'expense\')">+ Añadir</button>'}</div></header>

    <nav class="money-tabs" aria-label="Secciones de finanzas">${[['summary','Resumen del mes'],['records','Movimientos'],['contributions','Inversión y aportes'],['home','Saldos']].map(([key,label]) => `<button class="${view===key?'active':''}" onclick="${key==='records'?"moneyInspect('all')":"moneyView('"+key+"')"}">${label}</button>`).join('')}</nav>
    <div id="moneyBody"></div>
    <details class="money-footnote"><summary>Datos de esta revisión</summary><p>${moneyState.data.review?'V2 en revisión; la versión original sigue activa. ':''}Información revisada hasta ${moneyEsc(baseline.cutoff)}. ${baseline.history_import?baseline.history_import.count+' registros originales incorporados.':'Importación histórica en revisión.'}</p><button onclick="moneyBaseline()">Ver punto de partida</button> · <button onclick="moneyView('archive')">Consultar registros originales</button></details>
  </section>`;
  const body = document.getElementById('moneyBody');
  if (view === 'summary') moneyOverview(body);
  else if (view === 'home') body.innerHTML = moneyHome(s);
  else if (view === 'contributions') body.innerHTML = moneyContributions(s)+moneyStartupDetails();
  else if (view === 'archive') moneyArchive(body);
  else moneyList(body, view === 'pending');
  if(moneyState.data.review) el.querySelectorAll('button[data-money-write]').forEach(button=>{button.disabled=true;button.title='Disponible al activar V2 después de la revisión';});
}
function moneyHome(s) {
 const assigned=moneyState.data.baseline.ana_assigned||0,before=s.operating.santi+assigned,due=Object.values(s.groups).reduce((sum,g)=>sum+g.agus_to_santi,0);
 return `<div class="money-columns"><article class="card money-panel"><p class="money-eyebrow">CUENTA CORRIENTE · NEGOCIO</p><h3>VOCAI con Santiago</h3><div class="money-balance"><span>Saldo antes de compensar Ana</span><b>${moneyEuro(before)}</b></div><div class="money-balance"><span>Compensado con ingresos de Ana</span><b>− ${moneyEuro(assigned)}</b></div><div class="money-balance"><strong>VOCAI debe a Santiago</strong><strong>${moneyEuro(s.operating.santi)}</strong></div><p>Los ingresos de Ana pertenecen al negocio y se asignan a Santiago para compensar sus adelantos. La liquidación pendiente de Ana con Santiago es personal.</p><p class="money-muted">Esta compensación no mueve dinero del banco ni de la caja de VOCAI.</p></article><article class="card money-panel"><p class="money-eyebrow">CUENTA PERSONAL · SOCIOS</p><h3>Agustín con Santiago</h3>${Object.entries(s.groups).map(([key,g])=>`<div class="money-balance"><div><span>${MONEY_GROUPS[key]}</span><small>Reparto 50/50 · ${g.agus_to_santi>=0?'Agustín → Santiago':'Santiago → Agustín'}</small></div><b>${moneyEuro(Math.abs(g.agus_to_santi))}</b></div>`).join('')}<div class="money-balance"><strong>Pendiente de compensar</strong><strong>${moneyEuro(Math.abs(due))}</strong></div><span class="money-chip pending">PENDIENTE</span><p class="money-muted">Deuda personal por aportes, separada de los gastos adelantados a VOCAI.</p></article></div>
 <div class="money-metrics" style="margin-top:20px"><article class="card money-metric"><span>Disponible en VOCAI</span><strong>${moneyEuro(s.cash.bank+s.cash.cash)}</strong><p>Banco ${moneyEuro(s.cash.bank)} · Efectivo ${moneyEuro(s.cash.cash)}</p></article><article class="card money-metric"><span>Clientes por cobrar</span><strong>${moneyEuro(s.pending_income)}</strong><button onclick="moneyState.filter='income';moneyView('pending')">Ver cobros</button></article><article class="card money-metric"><span>VOCAI debe a Agustín</span><strong>${moneyEuro(s.operating.agus)}</strong><p>Adelantos operativos. Sin descontarlos automáticamente de lo que debe a Santiago.</p></article></div>${moneyState.data.review?'':'<button class="btn btn-primary" onclick="moneyForm(\'transfer\')">Registrar devolución de VOCAI</button>'}`;
}

function moneyContributions(s) {
 const groups=Object.entries(s.groups), total=groups.reduce((a,[,g])=>a+g.total,0), santi=groups.reduce((a,[,g])=>a+g.santi,0), agus=groups.reduce((a,[,g])=>a+g.agus,0), due=groups.reduce((a,[,g])=>a+g.agus_to_santi,0);
 return `<div class="money-invest-top"><article class="card money-invest-total"><p class="money-eyebrow">INVERSIÓN + CAPITAL</p><strong>${moneyEuro(total)}</strong><p>Total aportado al negocio</p><div class="money-stack" aria-label="Aportes Santiago ${moneyEuro(santi)}; Agustín ${moneyEuro(agus)}"><span style="width:${total?santi/total*100:0}%"></span><i style="width:${total?agus/total*100:0}%"></i></div><div class="money-legend"><span><i class="santi"></i>Santiago <b>${moneyEuro(santi)}</b></span><span><i class="agus"></i>Agustín <b>${moneyEuro(agus)}</b></span></div></article><article class="card money-settlement"><p class="money-eyebrow">EQUILIBRIO ENTRE SOCIOS · 50 / 50</p><p>${due>=0?'Agustín debe devolver a Santiago':'Santiago debe devolver a Agustín'}</p><strong>${moneyEuro(Math.abs(due))}</strong><small>Compensación personal por aportes. Separada de la deuda corriente de VOCAI.</small></article></div>
 <div class="money-table-heading"><div><h3>Detalle de aportaciones</h3><p>Dos bloques, un reparto acordado.</p></div>${moneyState.data.review?'':'<button class="btn btn-primary" onclick="moneyForm(\'contribution\')">+ Aporte</button>'}</div>
 <div class="table-wrapper money-sheet-wrap"><table class="money-sheet"><thead><tr><th>Bloque</th><th class="num">Santiago</th><th class="num">Agustín</th><th class="num">Total</th><th class="num">Mitad de cada uno</th><th class="num">Por compensar</th></tr></thead><tbody>${groups.map(([key,g],i)=>`<tr><td><span class="money-type-icon">0${i+1}</span><strong>${MONEY_GROUPS[key]}</strong></td><td class="num">${moneyEuro(g.santi)}</td><td class="num">${moneyEuro(g.agus)}</td><td class="num"><strong>${moneyEuro(g.total)}</strong></td><td class="num">${moneyEuro(g.each)}</td><td class="num"><span class="money-chip pending">${moneyEuro(Math.abs(g.agus_to_santi))}</span><small>${g.agus_to_santi>=0?'Agustín → Santiago':'Santiago → Agustín'}</small>${moneyState.data.review?'':`<button class="money-link" onclick="moneyForm('settlement',null,false,'${key}')">Registrar</button>`}</td></tr>`).join('')}</tbody></table></div><p class="money-muted">El aporte societario se conserva separado de los gastos del arranque. Las devoluciones no se registran como un gasto nuevo.</p>`;
}
function moneyMonthHeading(title,description) {
 return `<div class="money-period"><div><h3>${title}</h3><p>${description}</p></div><div class="money-month-control"><button aria-label="Mes anterior" onclick="moneyShiftMonth(-1)">‹</button><input id="moneyMonth" aria-label="Mes" type="month" value="${moneyState.month}" onchange="moneyState.month=this.value||moneyToday().slice(0,7);moneyState.focusIds=null;moneyState.focusLabel='';moneyDraw(document.getElementById('pageContent'))"><button aria-label="Mes siguiente" onclick="moneyShiftMonth(1)">›</button></div></div>`;
}
function moneyOverview(el) {
 el.innerHTML='<div id="moneyMonthSummary"></div>';moneyMonthlySummary();
}
function moneyInspect(mode='all',filter='all',ids=null,label='') {moneyState.reportMode=mode;moneyState.filter=filter;moneyState.search='';moneyState.focusIds=ids;moneyState.focusLabel=label;moneyView('records');}
function moneySetReport(mode) {moneyState.reportMode=mode;moneyDraw(document.getElementById('pageContent'));}
function moneyList(el, pending) {
 const mode=moneyState.reportMode;
 el.innerHTML=moneyMonthHeading(pending?'Pagos y cobros por hacer':'Todos los movimientos a mano',pending?'Pendientes confirmados y previsiones, identificados por separado.':mode==='cash'?'Cobros de clientes y pagos de gastos de este mes. Aportes e inversión están en «Todo».':mode==='business'?'Sólo ingresos y gastos que corresponden a este mes.':mode==='forecast'?'Importes previstos que todavía no se han confirmado.':'Incluye gastos, ingresos, inversión, aportes y registros por revisar.')+`
 <div class="money-filter-pills" aria-label="Tipo de resumen">${[['all','Todo'],['cash','Cobros y pagos'],['business','Ingresos y gastos'],['forecast','Previsiones']].map(([key,label])=>`<button class="${mode===key?'active':''}" onclick="moneySetReport('${key}')">${label}</button>`).join('')}</div>
 ${moneyState.focusLabel?`<div class="money-filter-focus">Categoría: ${moneyEsc(moneyState.focusLabel)} <button class="money-link" onclick="moneyInspect(moneyState.reportMode,moneyState.filter)">Quitar filtro ×</button></div>`:''}<div class="money-toolbar"><input id="moneySearch" class="form-input" type="search" placeholder="Buscar concepto, proveedor o factura…" aria-label="Buscar movimientos" value="${moneyEsc(moneyState.search)}" oninput="moneyState.search=this.value;moneyRows(${pending})"><select class="form-select" aria-label="Filtrar movimientos" onchange="moneyState.filter=this.value;moneyRows(${pending})">${[['all','Todos los conceptos'],['expense','Gastos'],['income','Ingresos'],['transfer','Transferencias'],['contribution','Aportes'],['settlement','Compensaciones']].map(([v,t])=>`<option value="${v}" ${moneyState.filter===v?'selected':''}>${t}</option>`).join('')}</select></div><div id="moneyRows"></div><div id="moneyOriginalMonth"></div>`;
 moneyRows(pending);
}
function moneyShiftMonth(delta){moneyState.focusIds=null;moneyState.focusLabel='';const [y,m]=moneyState.month.split('-').map(Number);moneyState.month=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);moneyDraw(document.getElementById('pageContent'));}
function moneyRows(pending) {
 const mode=moneyState.reportMode,month=moneyState.month,query=moneyState.search.toLowerCase();
 if(!pending)moneyOriginalMonth();else document.getElementById('moneyOriginalMonth').innerHTML='';
 const rows=moneyState.data.records.map(record=>{
   const entry=FinanceReport.entry(record,month,mode==='forecast'?'business':mode);
   if(mode==='forecast'){entry.included=entry.forecastAmount>0;entry.amount=entry.forecastAmount;}
   return {record,entry};
 }).filter(({record:r,entry:e})=>e.included&&!r.voided&&(moneyState.filter==='all'||r.data.kind===moneyState.filter))
 .filter(({record:r})=>!pending||(!r.included_in_opening&&['expense','income'].includes(r.data.kind)&&moneyPaid(r.data)<r.data.amount))
 .filter(({record:r})=>!moneyState.focusIds||moneyState.focusIds.includes(r.id))
 .filter(({record:r})=>[r.data.title,r.data.party,r.data.number].join(' ').toLowerCase().includes(query))
 .sort((a,b)=>String(b.entry.date).localeCompare(String(a.entry.date)));
 const income=rows.filter(x=>x.record.data.kind==='income').reduce((sum,x)=>sum+x.entry.amount,0),expense=rows.filter(x=>x.record.data.kind==='expense').reduce((sum,x)=>sum+x.entry.amount,0);
 const totals=['cash','business'].includes(mode)?`<div class="money-totals-line" aria-label="Totales de los movimientos visibles">${moneyState.filter==='all'||moneyState.filter==='income'?`<span>${mode==='cash'?'Cobrado':'Ingresos'} <b>${moneyEuro(income)}</b></span>`:''}${moneyState.filter==='all'||moneyState.filter==='expense'?`<span>${mode==='cash'?'Pagado':'Gastos'} <b>${moneyEuro(expense)}</b></span>`:''}${moneyState.filter==='all'?`<span>${mode==='cash'?'Diferencia':'Resultado'} <b>${moneyEuro(income-expense)}</b></span>`:''}</div>`:'';
 document.getElementById('moneyRows').innerHTML=totals+`<div class="table-wrapper money-sheet-wrap"><table class="money-sheet"><thead><tr><th>${mode==='business'?'Corresponde a':mode==='cash'?'Cobro / pago':'Fecha / período'}</th><th>Concepto</th><th>${mode==='cash'?'Por dónde pasó':'Cuenta'}</th><th>Estado</th><th class="num">${mode==='cash'?'Movido este mes':mode==='business'?'Importe del mes':mode==='forecast'?'Previsto':'Importe'}</th><th></th></tr></thead><tbody>${rows.length?rows.map(({record:r,entry:e})=>{
 const d=r.data,history=d.history||{},remaining=d.amount-moneyPaid(d),isDoc=['expense','income'].includes(d.kind),files=moneyState.data.files.filter(f=>f.record_id===r.id),pendingDoc=isDoc&&remaining>0&&!r.included_in_opening;
 const historyLabel={duplicate:'Duplicado · no suma',draft:'Borrador · no suma',assigned:'Compensa a Santiago',review:'Revisar posible duplicado'}[history.status];
 const payments=(d.payments||[]).filter(p=>mode!=='cash'||!month||p.date.startsWith(month));
 const accounts=[...new Set(payments.map(p=>MONEY_ACCOUNTS[p.account]))].join(', ')||MONEY_ACCOUNTS[history.account]||(!isDoc?`${MONEY_ACCOUNTS[d.source]||'—'} → ${MONEY_ACCOUNTS[d.target]||'—'}`:'—');
 const state=historyLabel||(history.classification==='startup'?'Inversión inicial':null)||(d.stage==='forecast'&&remaining>0?'Previsión · sin confirmar':pendingDoc?(d.kind==='income'?'Por cobrar':'Por pagar'):isDoc?(d.kind==='income'?'Cobrado':'Pagado'):'Confirmado');
 const date=String(e.date||d.date||'');
 const basis=e.basis==='period'?'Período del servicio':e.basis==='registered_month'?'Mes registrado':mode==='all'&&d.period_start?'Período: '+d.period_start.slice(0,7):'';
 return `<tr><td class="money-date">${moneyEsc(mode==='business'?date.slice(0,7):date.slice(8)+'/'+date.slice(5,7))}${basis?`<small>${moneyEsc(basis)}</small>`:''}</td><td><strong>${moneyEsc(d.title)}</strong><small>${moneyEsc(d.party||'')}${mode==='cash'&&d.period_start?' · Servicio: '+moneyEsc(d.period_start.slice(0,7)):''}</small></td><td><span class="money-account">${moneyEsc(accounts)}</span></td><td><span class="money-chip ${historyLabel||d.stage==='forecast'?'neutral':pendingDoc?'pending':'done'}">${state}</span></td><td class="num"><strong>${moneyEuro(e.amount)}</strong>${e.amount!==d.amount?`<small>Documento: ${moneyEuro(d.amount)}</small>`:''}</td><td><div class="money-table-actions">${!moneyState.data.review&&pendingDoc?`<button class="money-link" onclick="moneyPayment('${r.id}')">${d.kind==='income'?'Cobrar':'Pagar'}</button>`:''}<button class="money-detail-button" aria-label="Ver ${moneyEsc(d.title)}" onclick="moneyForm('${d.kind}','${r.id}')">↗</button>${files.map(f=>`<button class="money-link" onclick="moneyFile('${f.id}')">Adjunto</button>`).join('')}</div></td></tr>`;
 }).join(''):'<tr><td colspan="6" class="money-empty">No hay movimientos con estos filtros.</td></tr>'}</tbody></table></div><div class="money-table-footer">${rows.length} ${rows.length===1?'movimiento':'movimientos'} · ${mode==='all'?'Esta lista reúne distintos tipos de movimientos; no se suman como un único resultado.':'Los totales corresponden a los filtros seleccionados.'}</div>`;
}

function moneyOptions(options, selected) { return Object.entries(options).map(([v,label])=>`<option value="${v}" ${selected===v?'selected':''}>${moneyEsc(label)}</option>`).join(''); }
function moneyForm(kind='expense', recordId=null, focusFile=false, group=null) {
  const record = recordId ? moneyRecord(recordId) : null;
  if(moneyState.data.review) return moneyReviewDetails(record);
  const d = record?.data || {kind,title:'',amount:0,date:moneyToday(),payments:[],repeat:'none',group:group||'capital'};
  const isDoc=['expense','income'].includes(kind);
  if(record?.included_in_opening&&record.data.history)return moneyReviewDetails(record);
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
      <details><summary>Datos de factura, período y repetición</summary><label>Documento<select id="mf_stage" class="form-select">${moneyOptions({document:'Gasto o ingreso confirmado',forecast:'Previsión · importe por confirmar'},d.stage||'document')}</select></label><div class="form-row"><label>Proveedor / cliente<input id="mf_party" class="form-input" maxlength="180" value="${moneyEsc(d.party)}"></label><label>Número de factura<input id="mf_number" class="form-input" maxlength="100" value="${moneyEsc(d.number)}" placeholder="Opcional"></label></div><div class="form-row"><label>Desde<input id="mf_start" class="form-input" type="date" value="${moneyEsc(d.period_start)}"></label><label>Hasta<input id="mf_end" class="form-input" type="date" value="${moneyEsc(d.period_end)}"></label></div><div class="form-row"><label>Vencimiento<input id="mf_due" class="form-input" type="date" value="${moneyEsc(d.due)}"></label><label>Categoría<input id="mf_category" class="form-input" maxlength="80" value="${moneyEsc(d.category)}" placeholder="Software, oficina…"></label></div><label>¿Se repite?<select id="mf_repeat" class="form-select">${moneyOptions({none:'No · según consumo o puntual',monthly:'Mensual · preparar como pendiente'},d.repeat)}</select></label><p class="money-muted">Repetir nunca confirma un pago. Café y Dropbox quedan sin repetición.</p></details>`:
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
      stage:val('mf_stage')||form.record?.data.stage||'document',repeat:val('mf_repeat')||'none',source:val('mf_source')||null,target:val('mf_target')||null,
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
 document.getElementById('ma_rows').innerHTML=`<div class="table-wrapper money-sheet-wrap"><table class="money-sheet"><thead><tr><th>Fecha original</th><th>Concepto</th><th>Tipo / estado</th><th class="num">Importe</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${moneyEsc(x.fecha)}</td><td><strong>${moneyEsc(x.title)}</strong><small>${moneyEsc(x.cliente_nombre||x.numero||'')}</small><details><summary>Notas originales</summary><p>${moneyEsc(x.notas||'Sin notas')}</p></details></td><td>${x.kind==='expense'?'Gasto':'Factura'}<small>${moneyEsc(x.estado||x.tipo||'')}</small></td><td class="num">${formatMoney(x.total??x.importe)}</td></tr>`).join('')||'<tr><td colspan="4">Sin registros para este filtro.</td></tr>'}</tbody></table></div>`;
}
function moneyReviewDetails(record){
 if(!record)return toast('V2 está en revisión. La carga real sigue en las secciones originales.');
 const d=record.data,h=d.history||{};createModal('moneyReview','Detalle del movimiento',`<h3>${moneyEsc(d.title)} · ${moneyEuro(d.amount)}</h3><p>${moneyEsc(d.notes)}</p><p>${moneyEsc(d.date)}${d.period_start?' · Período '+moneyEsc(d.period_start)+' / '+moneyEsc(d.period_end):''}</p>${(d.payments||[]).map(p=>`<p>${moneyEsc(p.date)} · ${moneyEsc(MONEY_ACCOUNTS[p.account])} · ${moneyEuro(p.amount)}</p>`).join('')}<p>${moneyEsc(h.reason||(!['income','expense'].includes(d.kind)?'Movimiento confirmado':moneyPaid(d)?'Pago confirmado.':'Pendiente de pago o cobro.'))}</p>${h.basis==='registered_month'?'<p>Se conserva el mes original para el resumen histórico. No consta el día efectivo del pago; no se ha inventado.</p>':''}${(h.sources||[]).map(src=>`<details><summary>Ver registro original</summary><pre class="money-json">${moneyEsc(JSON.stringify(src.original,null,2))}</pre></details>`).join('')}`);
}
function moneyMonthlySummary(){document.getElementById('moneyMonthSummary').innerHTML=moneyDashboardHTML();}

function moneySetPaid(paid){document.getElementById("mf_status").value=paid?"paid":"pending";document.getElementById("mf_paid_fields").hidden=!paid;document.getElementById("mf_pending_btn").classList.toggle("active",!paid);document.getElementById("mf_paid_btn").classList.toggle("active",paid);}

async function moneyClosedFile(id){const input=document.getElementById('mc_file');if(!input.files[0])return toast('Selecciona un archivo','error');const button=document.getElementById('mc_save');button.disabled=true;try{const form=new FormData();form.append('file',input.files[0]);const response=await fetch('/api/finance/records/'+id+'/files',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('vocai_token')},body:form});const result=await response.json();if(!response.ok)throw new Error(result.error);closeModal('moneyClosed');toast('Adjunto guardado','success');await renderMoney(document.getElementById('pageContent'),moneyState.view);}catch(e){toast(e.message,'error');}finally{button.disabled=false;}}

function moneyOriginalMonth(){
 const el=document.getElementById('moneyOriginalMonth');if(!el)return;
 if(moneyState.data.baseline.history_import){el.innerHTML='<p class="money-muted">Histórico integrado. Cada detalle conserva el registro original y su corrección.</p>';return;}
 if(moneyState.historyError){el.innerHTML='<div class="money-notice">No se pudo cargar el histórico. Recarga la sección para volver a intentarlo.</div>';return;}
 const originals=moneyState.originals||{expenses:[],invoices:[]};
 const query=moneyState.search.toLowerCase(),month=moneyState.month;
 const rows=[...originals.expenses.map(x=>({...x,kind:'expense',title:x.nombre})),...originals.invoices.map(x=>({...x,kind:'income',title:x.concepto}))].filter(x=>(!month||String(x.fecha).startsWith(month))&&(moneyState.filter==='all'||moneyState.filter===x.kind)&&[x.title,x.cliente_nombre,x.numero,x.notas].join(' ').toLowerCase().includes(query)).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
 el.innerHTML=`<details class="money-panel" ><summary><strong>Registros originales del mes · ${rows.length}</strong></summary><p class="money-muted">Referencia completa de la versión anterior. Puede incluir documentos revisados arriba, borradores y previsiones. No se vuelve a sumar a los importes de caja ni acredita quién pagó.</p><div class="table-wrapper money-sheet-wrap"><table class="money-sheet"><thead><tr><th>Fecha original</th><th>Concepto</th><th>Estado original</th><th class="num">Importe</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${moneyEsc(x.fecha)}</td><td><strong>${moneyEsc(x.title)}</strong><details><summary>Ver notas</summary><p>${moneyEsc(x.notas||'Sin notas')}</p></details></td><td>${moneyEsc(x.estado||x.tipo||'')}</td><td class="num">${formatMoney(x.total??x.importe)}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function moneyStartupDetails(){
 const rows=moneyState.data.records.filter(r=>!r.voided&&r.data.history?.classification==='startup').sort((a,b)=>a.data.date.localeCompare(b.data.date));
 return `<div class="money-table-heading"><h3>Inversión inicial · ${rows.length} registros</h3></div><div class="table-wrapper money-sheet-wrap"><table class="money-sheet"><thead><tr><th>Fecha registrada</th><th>Concepto</th><th class="num">Importe</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${moneyEsc(r.data.date)}</td><td>${moneyEsc(r.data.title)}</td><td class="num">${moneyEuro(r.data.amount)}</td><td><button class="money-link" onclick="moneyForm('expense','${r.id}')">Ver detalle</button></td></tr>`).join('')}</tbody></table></div>`;
}
