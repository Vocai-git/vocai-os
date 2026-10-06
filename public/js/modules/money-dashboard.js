/* Finance overview. All amounts come from the reviewed ledger. */
function moneyMonthName(month,short=false) {
  if(!/^\d{4}-\d{2}$/.test(month||''))return '';
  return new Intl.DateTimeFormat('es-ES',{month:short?'short':'long',...(short?{}:{year:'numeric'}),timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
}
function moneyBriefDate(date) {
  return date?new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'Sin vencimiento';
}
function moneyIcon(name) {
  const paths={income:'M7 17 17 7M7 7h10v10',expense:'M7 7l10 10M7 17h10V7',wallet:'M3 6h16v14H3zM3 6V3h13v3M15 11h6v5h-6z',chart:'M4 20V10m8 10V4m8 16v-7',arrow:'M5 12h14m-5-5 5 5-5 5',clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',check:'m5 12 4 4L19 6',file:'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h5'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.file}"/></svg>`;
}
function moneyDashboardModel() {
  const {records,baseline,summary}=moneyState.data;
  return FinanceReport.dashboard(records,baseline,summary||{},moneyState.month,moneyToday());
}
function moneyChooseChartMonth(month) {moneyState.month=month;moneyDraw(document.getElementById('pageContent'));}
function moneyDashboardCategory(key) {
  const category=moneyDashboardModel().categories.find(c=>c.key===key);
  if(category)moneyInspect('business','expense',category.ids,category.label);
}
function moneyDashboardDues(kind) {
  moneyState.dueTab=kind;moneyMonthlySummary();
}
function moneyDashboardDueRows(model,kind) {
  if(kind==='income')return model.pending.income;
  // A presentation queue, not a new liability or a payment: forecasts remain
  // separate in the monthly engine and only cover the selected month.
  return [...model.pending.expense.map(row=>({...row,forecast:false})),...model.forecastExpense.items.map(row=>({...row,forecast:true,forecastMonth:model.month}))]
    .sort((a,b)=>(a.due||'9999-12-31').localeCompare(b.due||'9999-12-31')||Number(a.forecast)-Number(b.forecast)||(a.date||'').localeCompare(b.date||''));
}
function moneyDashboardPayableBreakdown(model) {
  return `Confirmado: <b>${moneyEuro(model.pending.expenseTotal)}</b> · Previsto en ${moneyMonthName(model.month)}: <b>${moneyEuro(model.forecastExpense.amount)}</b>`;
}
function moneyDashboardDueList(kind) {
  const m=moneyDashboardModel(),rows=moneyDashboardDueRows(m,kind);
  createModal('moneyDues',kind==='income'?'Clientes pendientes de cobro':'Pagos por atender',`<div class="fin-due-modal">${kind==='expense'?`<p>${moneyDashboardPayableBreakdown(m)}</p><p>Los previstos necesitan confirmación antes de registrarlos como pagados.</p>`:''}${rows.length?rows.map(row=>moneyDashboardDueRow(row,kind)).join(''):`<p>${kind==='income'?'No hay pendientes confirmados.':'No hay pagos confirmados ni previstos para mostrar.'}</p>`}</div>`);
}
function moneyDashboardDueRow(row,kind) {
  const title=row.party||row.title||'Sin concepto';
  const when=row.forecast?(row.due?'Fecha prevista: '+moneyBriefDate(row.due):'Previsión de '+moneyMonthName(row.forecastMonth)):(row.due?(row.overdue?'Venció ':'Vence ')+moneyBriefDate(row.due):'Sin vencimiento indicado');
  const status=row.forecast?'Previsto · por confirmar':row.overdue?(kind==='income'?'Vencido':'Confirmado · vencido'):kind==='income'?'Por cobrar':'Confirmado · por pagar';
  return `<button class="fin-due-row" onclick="moneyForm('${kind}','${row.id}')"><span class="fin-avatar">${moneyEsc(title.slice(0,1).toUpperCase())}</span><span class="fin-due-name"><strong>${moneyEsc(title)}</strong><small>${row.party?moneyEsc(row.title)+' · ':''}${moneyEsc(when)}</small></span><span class="fin-due-amount">${moneyEuro(row.amount)}<small>${status}</small></span></button>`;
}
function moneyDashboardChart(m,cashView) {
  const keys=cashView?['collected','paid']:['revenue','expense'];
  const max=Math.max(100,...m.trend.flatMap(t=>keys.map(k=>t[k]||0))),rough=max/4,power=10**Math.floor(Math.log10(rough)),step=[1,2,2.5,5,10].find(n=>n>=rough/power)*power,scale=step*4;
  return `<div class="fin-chart" role="group" aria-label="Evolución mensual de ${cashView?'cobros y pagos':'ingresos y gastos'}"><div class="fin-chart-axis">${[1,.75,.5,.25,0].map(v=>`<span>${new Intl.NumberFormat('es-ES',{maximumFractionDigits:0}).format(scale*v/100)+' €'}</span>`).join('')}</div><div class="fin-chart-plot"><div class="fin-chart-grid" aria-hidden="true">${Array(5).fill('<i></i>').join('')}</div><div class="fin-chart-months">${m.trend.map(t=>`<button class="fin-chart-month ${t.month===m.month?'selected':''}" onclick="moneyChooseChartMonth('${t.month}')" aria-label="${moneyMonthName(t.month)}: ${cashView?'cobros':'ingresos'} ${moneyEuro(t[keys[0]])}, ${cashView?'pagos':'gastos'} ${moneyEuro(t[keys[1]])}"><span class="fin-chart-bars"><i class="fin-bar-income" style="height:${Math.max(0,t[keys[0]]/scale*100)}%"></i><i class="fin-bar-expense" style="height:${Math.max(0,t[keys[1]]/scale*100)}%"></i></span><span class="fin-chart-month-label">${moneyMonthName(t.month,true).replace('.','')}</span><span class="fin-chart-tooltip"><b>${moneyMonthName(t.month)}</b><span>${cashView?'Cobros':'Ingresos'} ${moneyEuro(t[keys[0]])}</span><span>${cashView?'Pagos':'Gastos'} ${moneyEuro(t[keys[1]])}</span></span></button>`).join('')}</div></div></div>`;
}
function moneyDashboardHTML() {
  const m=moneyDashboardModel(),r=m.current,cashView=moneyState.reportMode==='cash',mode=cashView?'cash':'business';
  const baseline=moneyState.data.baseline,partial=!baseline.history_import&&m.month<=baseline.cutoff.slice(0,7);
  const open=m.month>=moneyToday().slice(0,7),uncertain=partial||r.forecast>0||r.issues.length>0;
  const income=cashView?r.collected:r.revenue,expense=cashView?r.paid:r.expense,result=income-expense;
  const dueKind=moneyState.dueTab||'income',dues=moneyDashboardDueRows(m,dueKind),payables=moneyDashboardDueRows(m,'expense'),dueTotal=dues.reduce((sum,row)=>sum+row.amount,0);
  const currentCashDate=moneyState.data.review?m.cash.asOf:moneyToday();
  const otherMonthsPaid=moneyState.data.records.reduce((sum,row)=>{
    if(row.data.kind!=='expense'||FinanceReport.accountingDate(row).startsWith(m.month))return sum;
    const payment=FinanceReport.entry(row,m.month,'cash');return sum+(payment.included?payment.amount:0);
  },0);
  const expenseRows=moneyState.data.records.map(row=>({row,e:FinanceReport.entry(row,m.month,mode)})).filter(x=>x.e.included&&x.row.data.kind==='expense').sort((a,b)=>String(b.e.date||'').localeCompare(String(a.e.date||''))).slice(0,4);
  return `<div class="fin-dashboard">
    <div class="fin-period"><div><h2>${moneyMonthName(m.month)}</h2><span class="fin-status"><i></i>${m.month>moneyToday().slice(0,7)?'Mes futuro':open?'Mes en curso':'Histórico · cierre sin confirmar'}</span></div><div class="fin-period-tools"><button class="fin-text-button" onclick="moneyInspect('${mode}')">Ver movimientos ${moneyIcon('arrow')}</button><div class="money-month-control"><button aria-label="Mes anterior" onclick="moneyShiftMonth(-1)">‹</button><input id="moneyMonth" aria-label="Mes" type="month" value="${m.month}" onchange="moneyState.month=this.value||moneyToday().slice(0,7);moneyDraw(document.getElementById('pageContent'))"><button aria-label="Mes siguiente" onclick="moneyShiftMonth(1)">›</button></div></div></div>
    <div class="fin-mode-row"><div class="fin-segment" aria-label="Qué muestra el resumen"><button class="${!cashView?'active':''}" onclick="moneySetReport('business')">Resultado del negocio</button><button class="${cashView?'active':''}" onclick="moneySetReport('cash')">Cobros y pagos</button></div><span>${cashView?'Clientes y gastos · según la fecha del pago':'Ingresos y gastos · según el período del servicio'}</span></div>
    <div class="fin-kpis">
      <article class="fin-card fin-kpi fin-income"><div class="fin-kpi-label"><span>${cashView?'Cobrado':'Ingresos del mes'}</span>${moneyIcon('income')}</div><strong>${moneyEuro(income)}</strong><p>${cashView?'Recibido por VOCAI y los socios':r.assigned?`${moneyEuro(r.assigned)} compensados con Santiago · sin cobro`:'Incluye servicios aún por cobrar'}</p><button onclick="moneyInspect('${mode}','income')">${cashView?'Ver cobros':'Ver ingresos'} ${moneyIcon('arrow')}</button></article>
      <article class="fin-card fin-kpi fin-expense"><div class="fin-kpi-label"><span>${cashView?'Pagado':'Gastos confirmados'}</span>${moneyIcon('expense')}</div><strong>${moneyEuro(expense)}</strong><p>${cashView?'Desde cuentas de VOCAI y personales':r.forecast?`${moneyEuro(r.forecast)} previstos, sin confirmar`:'Imputados a este mes'}</p><button onclick="moneyInspect('${mode}','expense')">${cashView?'Ver pagos':'Ver gastos'} ${moneyIcon('arrow')}</button></article>
      <article class="fin-card fin-kpi fin-result"><div class="fin-kpi-label"><span>${cashView?'Diferencia de cobros y pagos':open||uncertain?'Resultado provisional':'Resultado registrado'}</span>${moneyIcon('chart')}</div><strong>${partial?'Por conciliar':moneyEuro(result)}</strong><p>${!cashView&&r.forecast?`Si se confirman las previsiones: <b>${moneyEuro(result-r.forecast)}</b>`:cashView?'Cobrado menos pagado':'Ingresos menos gastos confirmados'}</p><button onclick="moneyInspect('${mode}')">Ver cálculo ${moneyIcon('arrow')}</button></article>
      <article class="fin-card fin-kpi fin-available"><div class="fin-kpi-label"><span>Disponible en VOCAI</span>${moneyIcon('wallet')}</div><strong>${moneyEuro(m.cash.total)}</strong><div class="fin-account-line"><span>Banco <b>${moneyEuro(m.cash.bank)}</b></span><span>Efectivo <b>${moneyEuro(m.cash.cash)}</b></span></div><small>${moneyState.data.review?'Saldo revisado':'Según movimientos'} al ${moneyBriefDate(m.cash.asOf)}</small></article>
    </div>
    ${otherMonthsPaid?`<div class="money-ledger-note"><p><strong>${moneyEuro(otherMonthsPaid)} pagados en ${moneyMonthName(m.month,true)} corresponden a otros meses.</strong> ${cashView?'Están incluidos en «Pagado».':'Se cuentan como gasto en el mes trabajado o del servicio; aquí aparecen en «Cobros y pagos».'}</p></div>`:''}
    ${r.forecast?`<div class="fin-forecast-strip">${moneyIcon('clock')}<span><strong>${m.forecastExpense.items.length} gastos por confirmar</strong> · ${moneyEuro(r.forecast)} previstos. El resultado del mes aún puede cambiar.</span><button onclick="moneyInspect('forecast','expense')">Revisar ${moneyIcon('arrow')}</button></div>`:''}
    <div class="fin-main-grid">
      <article class="fin-card fin-evolution"><header class="fin-card-heading"><div><h3>Evolución del negocio</h3><p>Últimos seis meses · pulsa un mes para abrirlo</p></div><div class="fin-chart-legend"><span><i></i>${cashView?'Cobros':'Ingresos'}</span><span><i></i>${cashView?'Pagos':'Gastos'}</span></div></header>${moneyDashboardChart(m,cashView)}<footer>${open?'El mes en curso muestra sólo lo registrado hasta ahora.':'Importes de cada mes según los registros revisados.'}</footer></article>
      <article class="fin-card fin-dues"><header class="fin-card-heading"><div><h3>Cobros y pagos pendientes</h3><p>Situación ${moneyState.data.review?'revisada':'actual'} · ${moneyBriefDate(currentCashDate)}</p></div>${moneyIcon('clock')}</header><div class="fin-due-tabs"><button class="${dueKind==='income'?'active':''}" onclick="moneyDashboardDues('income')">Por cobrar <span>${m.pending.income.length}</span></button><button class="${dueKind==='expense'?'active':''}" onclick="moneyDashboardDues('expense')">Por pagar <span>${payables.length}</span></button></div><div class="fin-due-total">${moneyEuro(dueTotal)}<span>${dueKind==='income'?'Pendiente de clientes':'Confirmado + previsto'}</span>${dueKind==='expense'?`<span>${moneyDashboardPayableBreakdown(m)}</span>`:''}</div><div class="fin-due-list">${dues.length?dues.slice(0,3).map(row=>moneyDashboardDueRow(row,dueKind)).join(''):`<div class="fin-empty">${moneyIcon('check')}<span>${dueKind==='income'?'Sin cobros pendientes de VOCAI':'Sin pagos confirmados ni previstos para mostrar'}</span></div>`}</div><footer><button onclick="moneyDashboardDueList('${dueKind}')">Ver detalle ${moneyIcon('arrow')}</button>${dueKind==='expense'&&m.forecastExpense.amount?'<span>Los previstos requieren confirmación.</span>':''}</footer></article>
    </div>
    <div class="fin-bottom-grid">
      <article class="fin-card fin-categories"><header class="fin-card-heading"><div><h3>En qué se gasta</h3><p>Gastos confirmados del período</p></div><strong>${moneyEuro(r.expense)}</strong></header><div class="fin-category-list">${m.categories.length?m.categories.map((c,i)=>`<button class="fin-category" onclick="moneyDashboardCategory(decodeURIComponent('${encodeURIComponent(c.key).replace(/'/g,'%27')}'))"><span><span class="fin-category-dot" style="opacity:${Math.max(.4,1-i*.12)}"></span><b>${moneyEsc(c.label)}</b><strong>${moneyEuro(c.amount)}</strong><small>${Math.round(c.amount/r.expense*100)}%</small></span><i class="fin-category-track"><i style="width:${c.amount/r.expense*100}%;opacity:${Math.max(.4,1-i*.12)}"></i></i></button>`).join(''):'<p class="fin-empty-text">No hay gastos confirmados en este mes.</p>'}</div></article>
      <article class="fin-card fin-recent"><header class="fin-card-heading"><div><h3>${cashView?'Últimos gastos pagados':'Detalle de gastos del mes'}</h3><p>${cashView?'Fecha del pago y cuenta de origen':'Abre un registro para ver su factura y sus pagos'}</p></div><button class="fin-text-button" onclick="moneyInspect('${mode}','expense')">Ver todos ${moneyIcon('arrow')}</button></header><div class="fin-recent-list">${expenseRows.length?expenseRows.map(({row,e})=>`<button class="fin-recent-row" onclick="moneyForm('expense','${row.id}')"><span class="fin-document-icon">${moneyIcon('file')}</span><span><strong>${moneyEsc(row.data.title||'Gasto')}</strong><small>${cashView?moneyBriefDate(e.date):moneyMonthName(m.month,true)} · ${moneyEsc(FinanceReport.category(row).label)}</small></span><b>${moneyEuro(e.amount)}</b>${moneyIcon('arrow')}</button>`).join(''):'<p class="fin-empty-text">No hay gastos registrados en esta vista.</p>'}</div></article>
    </div>
    ${r.assigned?`<div class="fin-assignment-note">${moneyIcon('file')}<p><strong>${moneyEuro(r.assigned)} de ingresos compensados con Santiago.</strong> Reducen los adelantos que VOCAI le debe. El cobro personal se lleva por separado y no vuelve a sumarse en VOCAI.</p></div>`:''}
    ${r.issues.map(issue=>`<div class="fin-forecast-strip">${moneyIcon('file')}<span><strong>Revisar ${moneyEsc(issue.title)}</strong> · ${moneyEuro(issue.amount)} excluidos del resultado.</span><button onclick="moneyForm('expense','${issue.id}')">Ver detalle ${moneyIcon('arrow')}</button></div>`).join('')}
    <div class="fin-data-note">${partial?'Mes pendiente de revisión. ':''}${r.registered_dates?'Histórico: los pagos sin día exacto conservan su mes registrado. ':''}Aportes, inversión y devoluciones se consultan en Movimientos.</div>
  </div>`;
}
