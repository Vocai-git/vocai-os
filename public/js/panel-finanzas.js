// Resumen de Finanzas del panel nuevo (public/panel-finanzas.html).
// Los datos salen de /api/finance y las cuentas de FinanceReport (finance-report.js): son los mismos
// números que la vista completa. Importes siempre en céntimos enteros.
iniciarCabecera();

const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const CUENTAS = { bank: 'Banco', cash: 'Efectivo', santi: 'Santiago (personal)', agus: 'Agustín (personal)' };
const SIN_COBRO = ['assigned', 'draft', 'duplicate', 'review'];

let datos = null;
let mes = HOY.slice(0, 7);
let panelHoy = null;            // 'dinero' | 'cobrar' | 'pagar': detalle abierto bajo las cifras de hoy
const abiertos = new Set();     // filas y grupos desplegados
let pago = null;                // registro al que se le está anotando un cobro o pago

const euro = c => {
  const [entero, decimales] = (Math.abs(c) / 100).toFixed(2).split('.');
  return (c < 0 ? '−' : '') + entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decimales + ' €';
};
const nombreMes = (m, corto) => new Date(m + '-15T12:00:00').toLocaleDateString('es-ES', corto ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', '');
const mesVecino = (m, salto) => { const [a, n] = m.split('-').map(Number); return new Date(Date.UTC(a, n - 1 + salto, 1)).toISOString().slice(0, 7); };
const registro = id => datos.records.find(r => r.id === id);
const pagado = d => (d.payments || []).reduce((s, p) => s + p.amount, 0);
const porPagar = d => Math.max(0, d.amount - (d.irpf?.tax || 0));
const nombre = d => d.party || d.title;
// Todo gasto pagado tiene que llevar su factura adjunta. Los anteriores al cierre inicial no se revisan aquí.
const sinFactura = r => r.data.kind === 'expense' && !r.included_in_opening && r.data.stage !== 'forecast'
  && (r.data.payments || []).length > 0 && !datos.files.some(f => f.record_id === r.id);
// El concepto, sin repetir el nombre que ya va en negrita («ManyChat · cuenta VOCAI» → «cuenta VOCAI»).
const detalleDe = d => {
  if (!d.party || !d.title || d.title === d.party) return '';
  const inicio = d.party.split(' ')[0].toLowerCase();
  if (!d.title.toLowerCase().startsWith(inicio)) return d.title;
  return d.title.slice(inicio.length).replace(/^[\s·(-]+|\)$/g, '').trim();
};
// Solo se puede anotar un cobro o pago en un documento confirmado, vivo y posterior al cierre inicial.
const admitePago = r => !datos.review && !r.voided && !r.included_in_opening && r.data.stage !== 'forecast'
  && !SIN_COBRO.includes(r.data.history?.status) && porPagar(r.data) - pagado(r.data) > 0;

async function cargar() {
  try {
    datos = await api('GET', '/finance');
    pintar();
  } catch (e) {
    $('contenido').innerHTML = `<div class="aviso">No se pudieron cargar las cuentas: ${texto(e.message)}</div>`;
  }
}

function pintar() {
  const { records, baseline, summary } = datos;
  const tablero = FinanceReport.dashboard(records, baseline, summary, mes, HOY);
  const hoja = FinanceReport.monthSheet(records, mes, HOY);
  $('alDia').textContent = summary.as_of ? `Último movimiento cargado: ${fechaCorta(summary.as_of)}` : '';
  $('contenido').innerHTML = hoy(tablero, summary) + elMes(tablero, hoja);
}

// ── Cómo estamos hoy ─────────────────────────────────────────
function hoy(tablero, s) {
  const cifra = (clave, rotulo, importe, pie) => `
    <button class="total toca${panelHoy === clave ? ' on' : ''}" data-hoy="${clave}" aria-expanded="${panelHoy === clave}">
      <div class="rotulo">${rotulo}</div><div class="cifra">${euro(importe)}</div><div class="pie">${pie}</div>
    </button>`;
  const p = tablero.pending;
  const cuantos = (n, uno, varios) => n ? `${n} ${n === 1 ? uno : varios} · ver` : 'Nada pendiente';
  return `
    <h2 class="bloque">Cómo estamos hoy</h2>
    <section class="totales hoy">
      ${cifra('dinero', 'Dinero disponible', s.cash.bank + s.cash.cash, `Banco ${euro(s.cash.bank)} · Efectivo ${euro(s.cash.cash)}`)}
      ${cifra('cobrar', 'Falta cobrar', p.incomeTotal, cuantos(p.income.length, 'cliente', 'clientes'))}
      ${cifra('pagar', 'Falta pagar', p.expenseTotal, cuantos(p.expense.length, 'gasto', 'gastos'))}
    </section>
    ${panelHoy ? `<section class="tabla detalle-hoy">${detalleHoy(tablero, s)}</section>` : ''}`;
}

function detalleHoy(tablero, s) {
  if (panelHoy === 'dinero') {
    const deuda = (quien, c) => c > 0 ? `<div class="linea"><div><strong>VOCAI le debe a ${quien}</strong><div class="pie">Gastos de la empresa que pagó de su bolsillo</div></div><div class="importe">${euro(c)}</div></div>` : '';
    return `
      <div class="linea"><div><strong>Banco de VOCAI</strong><div class="pie">Cuadrado con el extracto</div></div><div class="importe">${euro(s.cash.bank)}</div></div>
      <div class="linea"><div><strong>Efectivo de VOCAI</strong><div class="pie">Caja</div></div><div class="importe">${euro(s.cash.cash)}</div></div>
      ${deuda('Santiago', s.operating.santi)}${deuda('Agustín', s.operating.agus)}
      <div class="linea fin"><a class="enlace" href="/panel/finanzas/socios">Ver el detalle de las cuentas con los socios →</a></div>`;
  }
  const cobro = panelHoy === 'cobrar';
  const lista = cobro ? tablero.pending.income : tablero.pending.expense;
  if (!lista.length) return `<div class="vacio"><strong>Nada pendiente</strong>${cobro ? 'No falta cobrar a ningún cliente.' : 'No hay gastos sin pagar.'}</div>`;
  return lista.map(p => {
    const r = registro(p.id);
    return `
      <div class="linea">
        <div><strong>${texto(nombre(r.data))}</strong><div class="pie">${texto([detalleDe(r.data), 'de ' + nombreMes(FinanceReport.accountingDate(r).slice(0, 7))].filter(Boolean).join(' · '))}</div></div>
        <div class="importe">${euro(p.remaining)}</div>
        ${admitePago(r) ? `<button class="boton suave chico" data-pago="${r.id}">${cobro ? 'Registrar cobro' : 'Registrar pago'}</button>` : ''}
      </div>`;
  }).join('');
}

// Una compra que devolvieron entera no es un gasto. Se empareja con su reembolso (mismo proveedor, mismo
// importe, mismo mes) y los dos quedan fuera de los totales; el resultado del mes no cambia.
function reembolsados(hoja) {
  const primera = d => (d.party || d.title || '').trim().split(/\s+/)[0].toLowerCase();
  const ids = new Set();
  let importe = 0;
  for (const dev of hoja.groups.refund) {
    const gasto = hoja.groups.expense.find(f => !ids.has(f.row.id) && f.amount === dev.amount && primera(f.row.data) === primera(dev.row.data));
    if (!gasto) continue;
    ids.add(gasto.row.id); ids.add(dev.row.id); importe += dev.amount;
  }
  return { ids, importe };
}

// ── El mes ───────────────────────────────────────────────────
function elMes(tablero, hoja) {
  const t = hoja.totals, dev = reembolsados(hoja);
  const gastoNeto = t.expense.amount - dev.importe, otrosReembolsos = t.refund.amount - dev.importe;
  // Las barras de cada mes, con la misma regla.
  const barras = tablero.trend.map(m => {
    const h = m.month === mes ? hoja : FinanceReport.monthSheet(datos.records, m.month, HOY), d = m.month === mes ? dev : reembolsados(h);
    return { month: m.month, revenue: h.totals.income.amount + h.totals.refund.amount - d.importe, expense: h.totals.expense.amount - d.importe };
  });
  const anterior = FinanceReport.monthSheet(datos.records, tablero.previousMonth, HOY).result;
  const tope = Math.max(1, ...barras.map(m => Math.max(m.revenue, m.expense)));
  const columnas = barras.map(m => `
    <button class="col${m.month === mes ? ' on' : ''}" data-mes="${m.month}" title="${nombreMes(m.month)}: ingresos ${euro(m.revenue)}, gastos ${euro(m.expense)}">
      <span class="barras"><i class="ing" style="height:${m.revenue / tope * 100}%"></i><i class="gas" style="height:${m.expense / tope * 100}%"></i></span>
      <span class="mes">${nombreMes(m.month, true)}</span>
    </button>`).join('');
  const total = (rotulo, importe, pie, clase) => `<div class="total"><div class="rotulo">${rotulo}</div><div class="cifra ${clase || ''}">${euro(importe)}</div><div class="pie">${pie}</div></div>`;
  const gastos = hoja.groups.expense.filter(f => !dev.ids.has(f.row.id));
  const mayor = gastos.reduce((a, b) => (!a || b.amount > a.amount ? b : a), null);
  const frases = [
    mayor && gastoNeto ? `El gasto más grande del mes fue <strong>${texto(nombre(mayor.row.data))}</strong>: ${euro(mayor.amount)}, el ${Math.round(mayor.amount / gastoNeto * 100)} % de los gastos.` : '',
    otrosReembolsos ? `El resultado incluye ${euro(otrosReembolsos)} de reembolsos.` : '',
    dev.importe ? `No se cuentan ${euro(dev.importe)} de compras que devolvieron.` : ''
  ].filter(Boolean).join(' ');
  return `
    <div class="cabeza-mes">
      <h2 class="bloque">${mayuscula(nombreMes(mes))}</h2>
      <div class="pasos">
        <button data-mes="${mesVecino(mes, -1)}" aria-label="Mes anterior">‹</button>
        <button data-mes="${HOY.slice(0, 7)}"${mes === HOY.slice(0, 7) ? ' disabled' : ''}>Este mes</button>
        <button data-mes="${mesVecino(mes, 1)}" aria-label="Mes siguiente">›</button>
      </div>
    </div>
    <section class="tabla grafico">
      <div class="columnas">${columnas}</div>
      <div class="leyenda"><span><i class="ing"></i>Ingresos</span><span><i class="gas"></i>Gastos</span><span class="pie">Toca un mes para verlo</span></div>
    </section>
    <section class="totales">
      ${total('Ingresos del mes', t.income.amount, t.income.pending ? `Cobrado ${euro(t.income.paid)} · falta ${euro(t.income.pending)}` : 'Todo cobrado')}
      ${total('Gastos del mes', gastoNeto, t.expense.pending ? `Pagado ${euro(t.expense.paid - dev.importe)} · falta ${euro(t.expense.pending)}` : 'Todo pagado')}
      ${total('Resultado del mes', hoja.result, `${mayuscula(nombreMes(tablero.previousMonth, true))}: ${euro(anterior)}`, hoja.result < 0 ? 'mal' : 'bien')}
    </section>
    ${frases ? `<p class="frase">${frases}</p>` : ''}
    ${ingresos(hoja, dev)}
    ${gastosPorTipo(hoja, dev, gastoNeto)}`;
}

function ingresos(hoja, dev) {
  const filas = [...hoja.groups.income, ...hoja.groups.refund.filter(f => !dev.ids.has(f.row.id)).map(f => ({ ...f, reembolso: true }))];
  return `
    <div class="cabeza-lista"><h3>Ingresos</h3><span class="pie">${filas.length ? 'Toca una fila para ver los cobros' : ''}</span></div>
    <section class="tabla">${filas.length ? filas.map(f => fila(f, true)).join('') : '<div class="vacio">Sin ingresos en este mes.</div>'}</section>`;
}

function gastosPorTipo(hoja, dev, total) {
  const grupos = new Map();
  for (const f of hoja.groups.expense) {
    const c = FinanceReport.category(f.row);
    const g = grupos.get(c.key) || { ...c, importe: 0, pendiente: 0, sinFactura: 0, filas: [], devueltos: [] };
    if (dev.ids.has(f.row.id)) g.devueltos.push(f);
    else { g.importe += f.amount; g.pendiente += f.pending; g.filas.push(f); if (sinFactura(f.row)) g.sinFactura++; }
    grupos.set(c.key, g);
  }
  const orden = [...grupos.values()].sort((a, b) => b.importe - a.importe);
  const faltan = orden.reduce((s, g) => s + g.sinFactura, 0);
  const html = orden.map(g => {
    const clave = 'tipo:' + g.key, abierto = abiertos.has(clave);
    return `
      <button class="grupo${abierto ? ' on' : ''}" data-abrir="${clave}" aria-expanded="${abierto}">
        <span class="flecha"></span>
        <span class="g-nombre"><strong>${texto(g.label)}</strong><span class="pie">${g.filas.length} ${g.filas.length === 1 ? 'gasto' : 'gastos'}${g.pendiente ? ` · falta pagar ${euro(g.pendiente)}` : ''}${g.devueltos.length ? ` · ${g.devueltos.length} ${g.devueltos.length === 1 ? 'reembolsado' : 'reembolsados'}` : ''}${g.sinFactura ? ` · <b class="falta">${g.sinFactura} sin factura</b>` : ''}</span></span>
        <span class="g-barra"><i style="width:${total ? g.importe / total * 100 : 0}%"></i></span>
        <span class="g-parte">${total ? Math.round(g.importe / total * 100) : 0} %</span>
        <span class="importe">${euro(g.importe)}</span>
      </button>
      ${abierto ? `<div class="dentro">${g.filas.sort((a, b) => b.amount - a.amount).map(f => fila(f, false)).join('')}${g.devueltos.map(f => fila(f, false, true)).join('')}</div>` : ''}`;
  }).join('');
  return `
    <div class="cabeza-lista"><h3>Gastos</h3><span class="pie">${orden.length ? (faltan ? `<b class="falta">${faltan} sin factura</b> · ` : 'Todos con factura · ') + 'toca un tipo para abrirlo' : ''}</span></div>
    <section class="tabla">${html || '<div class="vacio">Sin gastos en este mes.</div>'}</section>`;
}

// Una fila de ingreso o gasto; al tocarla muestra sus cobros o pagos.
function fila(f, esIngreso, devuelto) {
  const r = f.row, d = r.data, clave = 'fila:' + r.id, abierto = abiertos.has(clave);
  const hecho = esIngreso ? 'Cobrado' : 'Pagado';
  const estado = devuelto ? '<span class="estado inactivo">Reembolsado · no cuenta</span>'
    : d.stage === 'forecast' ? '<span class="estado prospecto">Previsto</span>'
    : f.pending > 0 ? `<span class="estado pausado">Falta ${euro(f.pending)}</span>`
      : `<span class="estado">${hecho}</span>`;
  const parte = f.target ? Math.min(100, (f.paid + f.adjustment) / f.target * 100) : 100;
  const pagos = f.payments.length
    ? f.payments.map(p => `<div class="mov"><span>${fechaCorta(p.date)}${p.estimated ? ' (fecha aproximada)' : ''} · ${CUENTAS[p.account] || 'cuenta sin confirmar'}</span><strong>${euro(p.amount)}</strong></div>`).join('')
    : `<div class="mov"><span class="pie">${f.adjustment ? texto(f.adjustmentLabel) : `Todavía sin ${esIngreso ? 'cobros' : 'pagos'}.`}</span></div>`;
  return `
    <button class="item${abierto ? ' on' : ''}" data-abrir="${clave}" aria-expanded="${abierto}">
      <span class="flecha"></span>
      <span class="i-nombre"><strong>${texto(nombre(d))}</strong><span class="pie">${texto([f.reembolso ? 'Reembolso' : '', detalleDe(d), !esIngreso && f.payments.length ? fechaCorta(f.payments[f.payments.length - 1].date) : ''].filter(Boolean).join(' · '))}</span></span>
      <span class="i-avance">${esIngreso ? `<span class="g-barra"><i class="ing" style="width:${parte}%"></i></span>` : ''}${estado}${!esIngreso && !devuelto && sinFactura(r) ? '<span class="estado baja">Sin factura</span>' : ''}</span>
      <span class="importe${devuelto ? ' tachado' : ''}">${euro(f.amount)}</span>
    </button>
    ${abierto ? `
    <div class="abierto">
      ${pagos}
      ${f.withholding ? `<div class="mov"><span class="pie">Retención de IRPF</span><strong>${euro(f.withholding)}</strong></div>` : ''}
      <div class="acciones">
        ${admitePago(r) ? `<button class="boton chico" data-pago="${r.id}">${esIngreso ? 'Registrar cobro' : 'Registrar pago'}</button>` : ''}
        <a class="enlace" href="/panel/finanzas/completo?ver=records">${!esIngreso && !devuelto && sinFactura(r) ? 'Adjuntar la factura en Movimientos →' : 'Editar en Movimientos →'}</a>
      </div>
    </div>` : ''}`;
}

// ── Interacción ──────────────────────────────────────────────
$('contenido').addEventListener('click', e => {
  const con = atributo => e.target.closest(`[${atributo}]`);
  const b = con('data-pago');
  if (b) return abrirPago(b.dataset.pago);
  const h = con('data-hoy');
  if (h) { panelHoy = panelHoy === h.dataset.hoy ? null : h.dataset.hoy; return pintar(); }
  const m = con('data-mes');
  if (m) { mes = m.dataset.mes; return pintar(); }
  const a = con('data-abrir');
  if (a) { abiertos.has(a.dataset.abrir) ? abiertos.delete(a.dataset.abrir) : abiertos.add(a.dataset.abrir); pintar(); }
});

function abrirPago(id) {
  const r = registro(id);
  if (!r || !admitePago(r)) return;
  const falta = porPagar(r.data) - pagado(r.data), cobro = r.data.kind === 'income', f = $('ficha');
  pago = { r, id: crypto.randomUUID(), falta };
  $('fichaTitulo').textContent = cobro ? 'Registrar cobro' : 'Registrar pago';
  $('fichaDetalle').textContent = `${nombre(r.data)} · falta ${euro(falta)}`;
  $('fichaCuenta').textContent = cobro ? 'Entró en' : 'Salió de';
  f.importe.value = (falta / 100).toFixed(2).replace('.', ',');
  f.fecha.min = datos.baseline.cutoff; f.fecha.max = HOY; f.fecha.value = HOY;
  f.cuenta.value = 'bank';
  $('fichaAviso').hidden = true;
  $('velo').hidden = false;
  f.importe.focus();
}
const cerrarPago = () => { $('velo').hidden = true; pago = null; };
$('btnCancelar').addEventListener('click', cerrarPago);
$('velo').addEventListener('click', e => { if (e.target === $('velo')) cerrarPago(); });

$('ficha').addEventListener('submit', async e => {
  e.preventDefault();
  if (!pago) return;
  const f = $('ficha'), aviso = m => { $('fichaAviso').textContent = m; $('fichaAviso').hidden = false; };
  const escrito = f.importe.value.replace(/[\s€]/g, '');
  const centimos = Math.round(Number(escrito.includes(',') ? escrito.replace(/\./g, '').replace(',', '.') : escrito) * 100);
  if (!Number.isSafeInteger(centimos) || centimos <= 0) return aviso('Escribe un importe válido.');
  if (centimos > pago.falta) return aviso(`El importe supera lo que falta (${euro(pago.falta)}).`);
  if (!f.fecha.value || f.fecha.value > HOY || f.fecha.value < datos.baseline.cutoff) return aviso('La fecha tiene que ser real: ni futura ni anterior al cierre inicial.');
  $('btnGuardar').disabled = true;
  try {
    const d = pago.r.data;
    await api('PUT', '/finance/records/' + pago.r.id, {
      version: pago.r.version,
      data: { ...d, payments: [...d.payments, { id: pago.id, amount: centimos, date: f.fecha.value, account: f.cuenta.value }] }
    });
    cerrarPago();
    await cargar();
  } catch (err) {
    aviso(err.message);
  } finally {
    $('btnGuardar').disabled = false;
  }
});

cargar();
