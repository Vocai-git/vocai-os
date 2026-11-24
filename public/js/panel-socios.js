// Cuentas con los socios, en el panel nuevo (public/panel-finanzas-socios.html).
// Dos cosas distintas, cada una con su detalle (día, asunto y a qué corresponde):
//   1. Lo que VOCAI le debe a cada socio por gastos de la empresa que pagó de su bolsillo.
//   2. Lo que cada socio aportó al negocio y cuánto falta para quedar 50/50.
// Los datos salen de /api/finance; la cuenta de Santiago, de FinanceBalances (finance-balances.js),
// que es la misma que usa la vista completa. Importes en céntimos enteros.
iniciarCabecera();

const SOCIOS = { santi: 'Santiago', agus: 'Agustín' };
const BLOQUES = { startup: 'Inversión inicial', capital: 'Aporte societario' };

let datos = null;
let socio = 'santi';
let busca = '';
const abiertos = new Set();

const euro = c => {
  const [entero, decimales] = (Math.abs(c) / 100).toFixed(2).split('.');
  return (c < 0 ? '−' : '') + entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decimales + ' €';
};
const mesLargo = m => new Date(m.slice(0, 7) + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
const diaLargo = f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
const registro = id => datos.records.find(r => r.id === id);
const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Una línea del detalle: día, asunto y a qué corresponde.
function linea(r, importe, fecha, aproximada, corresponde) {
  const d = r.data;
  let a = corresponde;
  if (!a && d.period_start && d.period_end) {
    a = d.period_start.slice(0, 7) === d.period_end.slice(0, 7) ? mayuscula(mesLargo(d.period_start)) : `De ${mesLargo(d.period_start)} a ${mesLargo(d.period_end)}`;
  }
  if (!a) { const c = FinanceReport.category(r); a = c.key === 'sin-categoria' ? (d.kind === 'income' ? 'Cobro de cliente' : 'Sin clasificar') : c.label; }
  const asunto = d.party && d.title && !sinAcentos(d.title).includes(sinAcentos(d.party).split(' ')[0]) ? `${d.title} · ${d.party}` : (d.title || d.party || 'Sin concepto');
  // En lo anterior al cierre inicial no consta el día del pago, pero sí el día en que se registró: se muestra, diciéndolo.
  const registrada = (fecha || '').length < 10 && d.date && d.date.startsWith(fecha || '-') ? d.date : '';
  return { importe, fecha: registrada || fecha || '', registrada: !!registrada, aproximada: !registrada && (!!aproximada || (fecha || '').length < 10), asunto: mayuscula(asunto), corresponde: a };
}

// Cuenta corriente de cada socio: pasos que suman o restan hasta lo que VOCAI le debe hoy.
function cuenta(quien) {
  const esperado = datos.summary.operating[quien];
  if (quien === 'santi') {
    const e = FinanceBalances.evidence(datos.records, datos.baseline, datos.summary);
    const textos = {
      expenses: ['Gastos de VOCAI que pagó de su bolsillo', 'Cada gasto de la empresa pagado con dinero personal.'],
      receipts: ['Cobros de clientes que recibió él', 'Dinero de VOCAI que entró en su cuenta personal: se descuenta de lo que se le debe.'],
      assigned: ['Ingresos de Ana que se quedó como compensación', 'Acordado para devolverle parte de lo adelantado.'],
      advances: ['Dinero que le prestó a VOCAI', 'Transferencias suyas a la cuenta o a la caja de la empresa.'],
      refunds: ['Devoluciones que ya le hizo VOCAI', 'Dinero que la empresa ya le devolvió.']
    };
    const pasos = e.steps.filter(p => p.items.length).map(p => ({
      clave: p.key, signo: p.sign, total: p.amount, titulo: textos[p.key][0], ayuda: textos[p.key][1],
      filas: p.items.map(i => linea(registro(i.id), i.amount, i.date, i.estimated, i.basis === 'assignment_period' ? 'Compensación de adelantos' : ''))
    }));
    return { pasos, total: e.current.reconstructed, esperado, cuadra: e.current.verified && !e.gaps.length, saldados: [] };
  }
  // Agustín: sus pagos personales anotados, y aparte lo que ya se dio por saldado en el cierre inicial.
  const pagos = [], saldados = [], prestamos = [], devueltos = [];
  for (const r of datos.records) {
    if (r.voided) continue;
    const d = r.data, h = d.history || {};
    if (d.kind === 'transfer') {
      if (d.source === quien && ['bank', 'cash'].includes(d.target)) prestamos.push(linea(r, d.amount, d.date));
      if (d.target === quien && ['bank', 'cash'].includes(d.source)) devueltos.push(linea(r, d.amount, d.date));
      continue;
    }
    if (d.kind !== 'expense') continue;
    const suyos = (d.payments || []).filter(p => p.account === quien);
    for (const p of suyos) pagos.push(linea(r, p.amount, p.date));
    if (!suyos.length && r.included_in_opening && h.account === quien) saldados.push(linea(r, d.amount, d.date.slice(0, 7), true, 'Saldado en el cierre inicial'));
  }
  const suma = filas => filas.reduce((s, f) => s + f.importe, 0);
  const pasos = [
    { clave: 'expenses', signo: 1, total: suma(pagos), titulo: 'Gastos de VOCAI que pagó de su bolsillo', ayuda: 'Cada gasto de la empresa pagado con dinero personal.', filas: pagos },
    { clave: 'advances', signo: 1, total: suma(prestamos), titulo: 'Dinero que le prestó a VOCAI', ayuda: 'Transferencias suyas a la cuenta o a la caja de la empresa.', filas: prestamos },
    { clave: 'refunds', signo: -1, total: suma(devueltos), titulo: 'Devoluciones que ya le hizo VOCAI', ayuda: 'Dinero que la empresa ya le devolvió.', filas: devueltos }
  ].filter(p => p.filas.length);
  const total = pasos.reduce((s, p) => s + p.signo * p.total, 0);
  return { pasos, total, esperado, cuadra: total === esperado, saldados };
}

async function cargar() {
  try {
    datos = await api('GET', '/finance');
    pintar();
  } catch (e) {
    $('contenido').innerHTML = `<div class="aviso">No se pudieron cargar las cuentas: ${texto(e.message)}</div>`;
  }
}

function pintar() {
  const g = datos.summary.groups, op = datos.summary.operating;
  const aportado = q => Object.values(g).reduce((s, b) => s + b[q], 0);
  const compensar = Object.values(g).reduce((s, b) => s + b.agus_to_santi, 0);
  const tarjeta = q => `
    <button class="socio${socio === q ? ' on' : ''}" data-socio="${q}" aria-pressed="${socio === q}">
      <span class="s-nombre">${SOCIOS[q]}</span>
      <span class="s-dato"><span class="rotulo">VOCAI le debe</span><span class="cifra">${euro(op[q])}</span><span class="pie">Gastos de la empresa que pagó él</span></span>
      <span class="s-dato"><span class="rotulo">Aportó al negocio</span><span class="cifra">${euro(aportado(q))}</span><span class="pie">Inversión inicial y capital</span></span>
    </button>`;
  $('contenido').innerHTML = `
    <section class="socios">${tarjeta('santi')}${tarjeta('agus')}</section>
    <p class="frase arriba">Son dos cuentas distintas: lo que la empresa le debe a cada uno por gastos que adelantó, y lo que cada uno puso para montar el negocio. ${compensar ? `Para quedar 50/50 en los aportes, <strong>${compensar > 0 ? 'Agustín le debe a Santiago' : 'Santiago le debe a Agustín'} ${euro(Math.abs(compensar))}</strong>.` : ''}</p>
    ${deuda()}
    ${aportes()}`;
}

// ── 1. Lo que VOCAI le debe al socio elegido ─────────────────
function deuda() {
  const c = cuenta(socio), q = sinAcentos(busca.trim());
  const coincide = f => !q || sinAcentos(`${f.asunto} ${f.corresponde} ${f.fecha}`).includes(q);
  const grupo = (clave, signo, titulo, ayuda, total, filas) => {
    const vistas = filas.filter(coincide), abierto = q ? vistas.length > 0 : abiertos.has(clave);
    if (q && !vistas.length) return '';
    return `
      <button class="grupo paso${abierto ? ' on' : ''}" data-abrir="${clave}" aria-expanded="${abierto}">
        <span class="flecha"></span>
        <span class="g-nombre"><strong>${titulo}</strong><span class="pie">${ayuda} ${filas.length} ${filas.length === 1 ? 'movimiento' : 'movimientos'}${q ? ` · ${vistas.length} con «${texto(busca.trim())}»` : ''}</span></span>
        <span class="importe ${signo > 0 ? '' : signo < 0 ? 'resta' : 'sin'}">${signo > 0 ? '+ ' : signo < 0 ? '− ' : ''}${euro(total)}</span>
      </button>
      ${abierto ? tabla(vistas) : ''}`;
  };
  const pasos = c.pasos.map(p => grupo(socio + ':' + p.clave, p.signo, p.titulo, p.ayuda, p.total, p.filas)).join('');
  const saldados = c.saldados.length ? grupo(socio + ':saldados', 0, 'Ya saldado antes, no cuenta', 'Gastos que pagó y que se dieron por devueltos en el cierre inicial.', c.saldados.reduce((s, f) => s + f.importe, 0), c.saldados) : '';
  return `
    <div class="cabeza-lista"><h3>Lo que VOCAI le debe a ${SOCIOS[socio]}</h3><span class="pie">Toca un renglón para ver cada movimiento</span></div>
    <div class="filtros"><input id="buscar" type="search" placeholder="Buscar un movimiento: asunto, mes…" aria-label="Buscar un movimiento" value="${texto(busca)}"></div>
    <section class="tabla">
      ${pasos || (q ? '' : '<div class="vacio">Sin movimientos anotados.</div>')}
      ${saldados}
      ${q && !pasos && !saldados ? '<div class="vacio">Ningún movimiento coincide con la búsqueda.</div>' : ''}
      <div class="linea suma"><div><strong>VOCAI le debe hoy a ${SOCIOS[socio]}</strong><div class="pie">${c.cuadra ? 'La suma de los movimientos coincide con el saldo guardado.' : `Atención: los movimientos suman ${euro(c.total)} y el saldo guardado es ${euro(c.esperado)}.`}</div></div><div class="importe">${euro(c.esperado)}</div></div>
    </section>`;
}

function tabla(filas) {
  const orden = [...filas].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.asunto.localeCompare(b.asunto, 'es'));
  return `
    <div class="dentro detalle">
      <div class="mov4 cabeza"><span>Día</span><span>Asunto</span><span>A qué corresponde</span><span class="der">Importe</span></div>
      ${orden.map(f => `
      <div class="mov4">
        <span class="m-dia">${f.fecha.length >= 10 && !f.aproximada ? diaLargo(f.fecha) + (f.registrada ? '<small>fecha de registro</small>' : '') : f.fecha ? `${mayuscula(mesLargo(f.fecha))}<small>día sin anotar</small>` : 'Sin fecha'}</span>
        <span class="m-asunto">${texto(f.asunto)}</span>
        <span class="m-a">${texto(f.corresponde)}</span>
        <span class="m-importe">${euro(f.importe)}</span>
      </div>`).join('')}
    </div>`;
}

// ── 2. Lo que cada socio aportó al negocio ───────────────────
function aportes() {
  const g = datos.summary.groups;
  const vivos = datos.records.filter(r => !r.voided);
  const entregas = vivos.filter(r => r.data.kind === 'contribution');
  const acuerdos = vivos.filter(r => r.data.kind === 'settlement');
  const inicial = vivos.filter(r => r.data.history?.classification === 'startup');
  const bloques = Object.entries(g).map(([clave, b]) => `
    <div class="mov5">
      <span class="m-asunto"><strong>${BLOQUES[clave] || clave}</strong></span>
      <span data-r="Santiago">${euro(b.santi)}</span>
      <span data-r="Agustín">${euro(b.agus)}</span>
      <span data-r="Mitad de cada uno">${euro(b.each)}</span>
      <span data-r="Falta compensar" class="m-importe">${b.agus_to_santi ? `${euro(Math.abs(b.agus_to_santi))}<small>${b.agus_to_santi > 0 ? 'Agustín → Santiago' : 'Santiago → Agustín'}</small>` : 'Nada'}</span>
    </div>`).join('');
  const claveE = 'aportes:entregas', claveI = 'aportes:inicial';
  const filasE = [...entregas, ...acuerdos].map(r => linea(r, r.data.amount, r.data.date, false,
    `${BLOQUES[r.data.group] || ''} · ${r.data.kind === 'settlement' ? `${SOCIOS[r.data.source]} compensa a ${SOCIOS[r.data.target]}` : `de ${SOCIOS[r.data.source]}`}`));
  const filasI = inicial.map(r => linea(r, r.data.amount, r.data.date.slice(0, 7), true, 'Inversión inicial · ' + FinanceReport.category(r).label));
  const desplegable = (clave, titulo, ayuda, filas) => `
    <button class="grupo paso${abiertos.has(clave) ? ' on' : ''}" data-abrir="${clave}" aria-expanded="${abiertos.has(clave)}">
      <span class="flecha"></span>
      <span class="g-nombre"><strong>${titulo}</strong><span class="pie">${ayuda}</span></span>
      <span class="importe">${euro(filas.reduce((s, f) => s + f.importe, 0))}</span>
    </button>
    ${abiertos.has(clave) ? tabla(filas) : ''}`;
  return `
    <div class="cabeza-lista"><h3>Lo que cada uno aportó al negocio</h3><span class="pie">El acuerdo es 50/50</span></div>
    <section class="tabla">
      <div class="mov5 cabeza"><span>Bloque</span><span>Santiago</span><span>Agustín</span><span>Mitad de cada uno</span><span class="der">Falta compensar</span></div>
      ${bloques}
      ${filasE.length ? desplegable(claveE, 'Aportes con fecha', `${filasE.length} ${filasE.length === 1 ? 'aporte anotado' : 'aportes anotados'} con su día.`, filasE) : ''}
      ${filasI.length ? desplegable(claveI, 'En qué se gastó la inversión inicial', `${filasI.length} compras de marzo y abril de 2026. De esos aportes está guardado el total de cada socio, no la fecha de cada entrega.`, filasI) : ''}
    </section>
    <p class="frase abajo">Para registrar un aporte nuevo o una compensación entre socios: <a class="enlace" href="/panel/inversion">Inversión →</a></p>`;
}

// ── Interacción ──────────────────────────────────────────────
$('contenido').addEventListener('click', e => {
  const s = e.target.closest('[data-socio]');
  if (s) { socio = s.dataset.socio; busca = ''; return pintar(); }
  const a = e.target.closest('[data-abrir]');
  if (a && !busca.trim()) { abiertos.has(a.dataset.abrir) ? abiertos.delete(a.dataset.abrir) : abiertos.add(a.dataset.abrir); pintar(); }
});
$('contenido').addEventListener('input', e => {
  if (e.target.id !== 'buscar') return;
  busca = e.target.value;
  const en = e.target.selectionStart;
  pintar();
  const caja = $('buscar');
  caja.focus(); caja.setSelectionRange(en, en);
});

cargar();
