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
function moneyDashboardCategory(key) {
  const category=moneyDashboardModel().categories.find(c=>c.key===key);
  if(category)moneyInspect('business','expense',category.ids,category.label);
}
function moneySheetPending(value) {moneyState.sheetPending=value;moneyMonthlySummary();}
function moneySheetToggle(id,button) {
  const detail=document.getElementById('sheet-'+id),open=button.getAttribute('aria-expanded')!=='true';
  detail.hidden=!open;button.setAttribute('aria-expanded',String(open));
}
function moneySheetAction(name,...args) {return moneyEsc(name+'('+args.map(x=>JSON.stringify(x)).join(',')+')');}
function moneySheetPaymentList(payments) {
  return payments.length?`<ul class="fin-payment-list">${payments.map(p=>`<li><span>${moneyEsc(MONEY_ACCOUNTS[p.account]||'Cuenta sin identificar')}</span><span>${p.estimated?'Mes registrado: '+moneyMonthName(p.date.slice(0,7)):moneyBriefDate(p.date)}</span><b>${moneyEuro(p.amount)}</b></li>`).join('')}</ul>`:'<p>Todavía no hay cobros ni pagos registrados.</p>';
}
function moneySheetTable(sheet,kind,cashView) {
  const income=kind!=='expense',refund=kind==='refund',title=refund?'Reembolsos de gastos':income?'Ingresos':'Gastos';
  const all=cashView?sheet.cash[kind]:sheet.groups[kind],rows=!cashView&&moneyState.sheetPending?all.filter(x=>x.pending>0):all;
  const totals=cashView?{amount:sheet.cashTotals[kind]}:sheet.totals[kind];
  const amountLabel=cashView?(income?'Cobrado en el mes':'Pagado en el mes'):'Importe del mes';
  const footer=cashView?`<td class="num" data-label="${amountLabel}">${moneyEuro(totals.amount)}</td>`:`<td class="num" data-label="${amountLabel}">${moneyEuro(totals.amount)}</td><td class="num" data-label="${income?'Cobrado':'Pagado'}">${moneyEuro(totals.paid)}</td><td class="num" data-label="Pendiente">${moneyEuro(totals.pending)}</td>`;
  return `<section class="fin-sheet fin-sheet-${kind}" aria-label="${title} del mes"><header class="fin-sheet-heading"><div><h3>${title} <span>${all.length}</span></h3><p>${refund?'Devoluciones de proveedores; separadas de las ventas.':cashView?'Dinero movido en este mes, aunque el servicio sea de otro período.':income?'Servicios que corresponden a este mes.':'Gastos que corresponden a este mes.'}</p></div>${!cashView?`<div class="fin-sheet-due"><span>${income?'Por cobrar':'Por pagar'}</span><strong>${moneyEuro(totals.pending)}</strong></div>`:''}</header>
    <div class="fin-sheet-scroll"><table><thead><tr><th scope="col">${income&&!refund?'Cliente / concepto':'Concepto'}</th><th scope="col" class="num">${amountLabel}</th>${cashView?'':`<th scope="col" class="num">${income?'Cobrado':'Pagado'}</th><th scope="col" class="num">Pendiente</th>`}<th scope="col">Estado / detalle</th></tr></thead><tbody>
    ${rows.length?rows.map(item=>{
      const {row}=item,d=row.data,id=row.id,paidWord=income?'Cobrado':'Pagado';
      const status=cashView?paidWord:item.adjustment?item.adjustmentLabel:item.pending?(item.paid?(income?'Cobro parcial':'Pago parcial'):income?'Por cobrar':'Por pagar'):paidWord;
      const canPay=!cashView&&item.pending>0&&!moneyState.data.review;
      const secondary=cashView?'Servicio: '+moneyMonthName(item.serviceMonth):d.number?'Factura '+d.number:income&&!refund?'Ingreso registrado · sin nº de factura':FinanceReport.category(row).label;
      return `<tr class="fin-sheet-row"><td><button class="fin-sheet-name" aria-expanded="false" aria-controls="sheet-${moneyEsc(id)}" onclick="${moneyEsc('moneySheetToggle('+JSON.stringify(id)+',this)')}"><strong>${moneyEsc(d.party||d.title)}</strong>${d.party&&d.party!==d.title?`<span>${moneyEsc(d.title)}</span>`:''}<small>${moneyEsc(secondary)}</small>${cashView?`<small>${moneyEsc([...new Set(item.payments.map(p=>(p.estimated?'Mes registrado: '+moneyMonthName(p.date.slice(0,7)):moneyBriefDate(p.date))+' · '+(MONEY_ACCOUNTS[p.account]||'Cuenta sin identificar')))].join(' / '))}</small>`:''}</button></td><td class="num" data-label="${amountLabel}"><strong>${moneyEuro(item.amount)}</strong>${!cashView&&item.withholding?`<small>IRPF: −${moneyEuro(item.withholding)}</small>`:''}</td>${cashView?'':`<td class="num" data-label="${income?'Cobrado':'Pagado'}">${moneyEuro(item.paid)}${item.paidOutsideMonth?`<small>${moneyEuro(item.paidOutsideMonth)} fuera de ${moneyMonthName(sheet.month,true)}</small>`:''}${item.adjustment?`<small>Compensado: ${moneyEuro(item.adjustment)}</small>`:''}</td><td class="num ${item.pending?'fin-pending-number':''}" data-label="Pendiente">${moneyEuro(item.pending)}</td>`}<td><span class="fin-sheet-status ${!cashView&&item.pending?'pending':'settled'}">${moneyEsc(status)}</span>${canPay?`<button class="fin-sheet-pay" onclick="${moneySheetAction('moneyPayment',id)}">${income?'Registrar cobro':'Registrar pago'} →</button>`:''}</td></tr>
      <tr class="fin-sheet-detail" id="sheet-${moneyEsc(id)}" hidden><td colspan="${cashView?3:5}"><div class="fin-sheet-detail-inner"><div><h4>${cashView?'Movimientos de este mes':'Cobros y pagos de este concepto'}</h4>${moneySheetPaymentList(item.payments)}${item.adjustment?`<p>${moneyEsc(item.adjustmentLabel)}: ${moneyEuro(item.adjustment)}. No es una entrada o salida de efectivo.</p>`:''}</div><div><p><b>Período:</b> ${moneyEsc(d.period_start?moneyServicePeriod(d):moneyMonthName(FinanceReport.accountingDate(row).slice(0,7)))}</p>${!cashView&&item.withholding?`<p>Total ${moneyEuro(item.amount)} − IRPF ${moneyEuro(item.withholding)} = ${moneyEuro(item.target)} a liquidar.</p>`:''}<button class="btn btn-secondary btn-sm" onclick="${moneySheetAction('moneyForm',d.kind,id)}">Abrir registro y adjuntos ↗</button></div></div></td></tr>`;
    }).join(''):`<tr><td colspan="${cashView?3:5}" class="fin-sheet-empty">${all.length?'Todos los conceptos de este bloque están saldados.':'No hay '+title.toLowerCase()+' registrados para esta vista.'}</td></tr>`}
    </tbody><tfoot><tr><th scope="row">Total del mes${!cashView&&moneyState.sheetPending?'<small>Incluye también lo saldado</small>':''}</th>${footer}<td></td></tr></tfoot></table></div>
    ${!cashView&&(totals.adjustment||totals.withholding)?`<footer class="fin-sheet-footnote">${totals.adjustment?`${moneyEuro(totals.adjustment)} liquidados por compensación o cierre inicial, sin nuevo movimiento de dinero. `:''}${totals.withholding?`El pendiente descuenta ${moneyEuro(totals.withholding)} de IRPF.`:''}</footer>`:''}
  </section>`;
}
function moneyDashboardHTML() {
  const m=moneyDashboardModel(),sheet=FinanceReport.monthSheet(moneyState.data.records,m.month,moneyToday()),cashView=moneyState.reportMode==='cash',mode=cashView?'cash':'business';
  const income=cashView?sheet.cashTotals.income:sheet.totals.income.amount,expense=cashView?sheet.cashTotals.expense:sheet.totals.expense.amount,refund=cashView?sheet.cashTotals.refund:sheet.totals.refund.amount,result=cashView?sheet.cashResult:sheet.result;
  const partial=!moneyState.data.baseline.history_import&&m.month<=moneyState.data.baseline.cutoff.slice(0,7);
  const kpi=(kind,label,value,note,button,filter)=>`<article class="fin-card fin-kpi fin-${kind}"><div class="fin-kpi-label"><span>${label}</span>${moneyIcon(kind==='result'?'chart':kind)}</div><strong>${typeof value==='string'?value:moneyEuro(value)}</strong><p>${note}</p><button onclick="${moneySheetAction('moneyInspect',mode,filter,filter==='all'?null:(cashView?sheet.cash[filter]:sheet.groups[filter]).map(x=>x.row.id))}">${button} ${moneyIcon('arrow')}</button></article>`;
  return `<div class="fin-dashboard fin-month-sheet">
    ${moneyMonthHeading(moneyMonthName(m.month),'Cada concepto en su mes; sus cobros y pagos, al detalle.')}
    <div class="fin-mode-row"><div class="fin-segment" aria-label="Qué muestra el resumen"><button class="${cashView?'':'active'}" onclick="moneySetReport('business')">Ingresos y gastos del mes</button><button class="${cashView?'active':''}" onclick="moneySetReport('cash')">Dinero cobrado y pagado</button></div></div>
    <div class="fin-kpis fin-month-kpis">
      ${kpi('income',cashView?'Cobros de clientes':'Ingresos del mes',income,cashView?'Recibidos por VOCAI y los socios':`${moneyEuro(sheet.totals.income.pending)} pendientes de cobro`,cashView?'Ver cobros':'Ver ingresos','income')}
      ${kpi('expense',cashView?'Pagos realizados':'Gastos del mes',expense,cashView?'Pagados por VOCAI y los socios':`${moneyEuro(sheet.totals.expense.pending)} pendientes de pago`,cashView?'Ver pagos':'Ver gastos','expense')}
      ${kpi('result',cashView?'Diferencia de cobros y pagos':'Balance del mes',partial?'Por conciliar':result,`${cashView?'Cobros':'Ingresos'}${refund?' + reembolsos':''} − ${cashView?'pagos':'gastos'}${cashView?'':' · con IVA'}`,'Ver cálculo','all')}
    </div>
    <div class="fin-sheet-toolbar"><p>${cashView?'Aquí ves lo que realmente se cobró o pagó en '+moneyMonthName(m.month)+'.':'Cobrado, pagado y pendiente: situación al '+moneyBriefDate(moneyToday())+'. Los pagos posteriores al mes también se muestran.'}</p>${cashView?'':`<div class="fin-segment" aria-label="Filtrar estado"><button class="${moneyState.sheetPending?'':'active'}" onclick="moneySheetPending(false)">Todos</button><button class="${moneyState.sheetPending?'active':''}" onclick="moneySheetPending(true)">Solo pendientes</button></div>`}</div>
    ${partial?'<p class="fin-sheet-note">Mes pendiente de revisión: el histórico está incompleto.</p>':''}
    ${cashView&&m.current.assigned?`<p class="fin-sheet-note">${moneyEuro(m.current.assigned)} compensados con Santiago, sin cobro de efectivo. Se ven en «Ingresos y gastos del mes».</p>`:''}
    ${moneySheetTable(sheet,'income',cashView)}
    ${moneySheetTable(sheet,'expense',cashView)}
    ${(cashView?sheet.cash.refund:sheet.groups.refund).length?moneySheetTable(sheet,'refund',cashView):''}
    ${!cashView?`<div class="fin-sheet-equation"><span>Ingresos <b>${moneyEuro(income)}</b></span>${refund?`<span>+ Reembolsos <b>${moneyEuro(refund)}</b></span>`:''}<span>− Gastos <b>${moneyEuro(expense)}</b></span><strong>${partial?'Por conciliar':'= '+moneyEuro(result)}</strong></div><p class="fin-sheet-note">Importes registrados con IVA; este balance no equivale al beneficio neto. Las previsiones no se suman. ${partial?'Histórico pendiente de completar. ':''}Abre una fila para ver quién cobró o pagó.</p>`:''}
    ${sheet.forecasts.length?`<details class="fin-sheet-extra"><summary>Previsiones por confirmar <span>${sheet.forecasts.length}</span><b>${moneyEuro(sheet.forecasts.reduce((s,x)=>s+x.amount,0))}</b></summary><p>Estimaciones, separadas de los importes confirmados. Revisa si ya existe un cargo antes de confirmarlas.</p>${sheet.forecasts.map(({row,amount})=>`<button class="fin-forecast-item" onclick="${moneySheetAction('moneyForm',row.data.kind,row.id)}"><span>${row.data.kind==='income'?'Ingreso':'Gasto'} · ${moneyEsc(row.data.title)}</span><b>${moneyEuro(amount)} ↗</b></button>`).join('')}</details>`:''}
    ${m.current.issues.length?`<details class="fin-sheet-extra"><summary>Registros por revisar <span>${m.current.issues.length}</span></summary>${m.current.issues.map(x=>`<button class="fin-forecast-item" onclick="${moneySheetAction('moneyForm',moneyRecord(x.id).data.kind,x.id)}">${moneyEsc(x.title)} · ${moneyEuro(x.amount)}</button>`).join('')}</details>`:''}
    <div class="fin-sheet-current"><div><h3>Dinero en VOCAI ahora</h3><p>Saldo registrado al ${moneyBriefDate(m.cash.asOf)}; no es el cierre de ${moneyMonthName(m.month,true)}.</p></div><span>Banco <b>${moneyEuro(m.cash.bank)}</b></span><span>Efectivo <b>${moneyEuro(m.cash.cash)}</b></span><button class="btn btn-secondary btn-sm" onclick="moneyView('home')">Ver saldos →</button></div>
  </div>`;
}
