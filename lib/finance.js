'use strict';

// All money is integer cents. Documents describe a purchase/sale; only actual
// payments move cash or a partner's operating balance. Contributions stay apart.
const ACCOUNTS = ['bank', 'cash', 'santi', 'agus'];
const PARTNERS = ['santi', 'agus'];
const KINDS = ['expense', 'income', 'transfer', 'contribution', 'settlement'];
const GROUPS = ['startup', 'capital'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function check(ok, message) { if (!ok) { const e = new Error(message); e.status = 400; throw e; } }
function date(value, label) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${label}: fecha no válida`);
  const d = new Date(value + 'T12:00:00Z');
  check(!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value, `${label}: fecha no válida`);
  return value;
}
function text(value, max, label, required = false) {
  check(value == null || typeof value === 'string', `${label}: texto no válido`);
  const result = (value || '').trim();
  check(result.length <= max && (!required || result.length > 0), `${label}: revisa el texto`);
  return result;
}
function money(value) { check(Number.isSafeInteger(value) && value > 0 && value <= 1000000000, 'El importe debe ser positivo y tener como máximo dos decimales'); return value; }
function todayMadrid() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function validate(input, cutoff, today = todayMadrid()) {
  check(input && typeof input === 'object' && !Array.isArray(input), 'Registro no válido');
  check(KINDS.includes(input.kind), 'Tipo no válido');
  const row = {
    kind: input.kind, title: text(input.title, 180, 'Concepto', true),
    amount: money(input.amount), date: date(input.date, 'Fecha del documento'),
    party: text(input.party, 180, 'Cliente o proveedor'), number: text(input.number, 100, 'Número de factura'),
    notes: text(input.notes, 4000, 'Notas'), category: text(input.category, 80, 'Categoría'),
    period_start: input.period_start ? date(input.period_start, 'Inicio del período') : null,
    period_end: input.period_end ? date(input.period_end, 'Fin del período') : null,
    due: input.due ? date(input.due, 'Vencimiento') : null,
    repeat: input.repeat === 'monthly' ? 'monthly' : 'none',
    group: input.group || null, source: input.source || null, target: input.target || null,
    payments: [],
  };
  check(!row.period_start || !row.period_end || row.period_start <= row.period_end, 'El período termina antes de empezar');
  check(!input.repeat || ['monthly', 'none'].includes(input.repeat), 'Repetición no válida');
  const isDocument = ['expense', 'income'].includes(row.kind);
  if (isDocument) {
    check(!row.source && !row.target && !row.group, 'Una factura no es una transferencia ni una aportación');
    check(Array.isArray(input.payments || []), 'Pagos no válidos');
    check((input.payments || []).length <= 100, 'Demasiados pagos');
    const ids = new Set();
    row.payments = (input.payments || []).map(p => {
      check(p && UUID.test(p.id) && !ids.has(p.id), 'Identificador de pago duplicado o no válido'); ids.add(p.id);
      check(ACCOUNTS.includes(p.account), 'Indica desde dónde se pagó o dónde se cobró');
      const when = date(p.date, 'Fecha de pago');
      check(when >= cutoff, 'Ese pago pertenece al histórico ya conciliado. Revisa el cierre antes de añadirlo otra vez');
      check(when <= today, 'Un pago futuro debe quedar pendiente');
      return { id: p.id, amount: money(p.amount), date: when, account: p.account };
    });
    check(paid(row) <= row.amount, 'Los pagos superan el total del documento');
  } else {
    check(!(input.payments || []).length, 'Este movimiento no admite pagos adjuntos');
    check(row.repeat === 'none', 'Las transferencias y aportes no se repiten automáticamente');
    check(row.date >= cutoff && row.date <= today, 'Registra solo movimientos reales posteriores al cierre');
    check(ACCOUNTS.includes(row.source) && ACCOUNTS.includes(row.target) && row.source !== row.target, 'Selecciona origen y destino distintos');
    if (row.kind === 'contribution') {
      check(PARTNERS.includes(row.source) && ['bank', 'cash'].includes(row.target) && GROUPS.includes(row.group), 'El aporte va de un socio a VOCAI y necesita un bloque');
    } else if (row.kind === 'settlement') {
      check(PARTNERS.includes(row.source) && PARTNERS.includes(row.target) && GROUPS.includes(row.group), 'La compensación de aportes es entre socios y necesita un bloque');
    } else {
      check(!row.group && (['bank', 'cash'].includes(row.source) || ['bank', 'cash'].includes(row.target)), 'Una transferencia debe incluir una cuenta de VOCAI');
    }
  }
  return row;
}
function paid(doc) { return (doc.payments || []).reduce((n, p) => n + p.amount, 0); }
function summarize(baseline, records) {
  const result = {
    cash: { ...baseline.cash }, operating: { ...baseline.operating },
    groups: JSON.parse(JSON.stringify(baseline.groups)), pending_income: 0, pending_expense: 0,
  };
  const accountMove = (account, delta) => {
    if (PARTNERS.includes(account)) result.operating[account] -= delta;
    else result.cash[account] += delta;
  };
  for (const record of records) {
    if (record.voided || record.included_in_opening) continue;
    const d = record.data;
    if (d.kind === 'expense' || d.kind === 'income') {
      result['pending_' + d.kind] += d.amount - paid(d);
      for (const p of d.payments) accountMove(p.account, (d.kind === 'expense' ? -1 : 1) * p.amount);
    } else if (d.kind === 'transfer') {
      accountMove(d.source, -d.amount); accountMove(d.target, d.amount);
    } else if (d.kind === 'contribution') {
      result.cash[d.target] += d.amount;
      result.groups[d.group][d.source] += d.amount;
    } else if (d.kind === 'settlement') {
      result.groups[d.group].settled += (d.source === 'agus' ? 1 : -1) * d.amount;
    }
  }
  for (const g of Object.values(result.groups)) {
    g.total = g.santi + g.agus;
    // Exact halves can be half a cent; retain precision until display.
    g.each = g.total / 2;
    g.agus_to_santi = (g.santi - g.agus) / 2 - g.settled;
  }
  return result;
}
function nextMonth(value) {
  const [y, m, day] = value.split('-').map(Number);
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}
function nextDocument(d) {
  check(['income', 'expense'].includes(d.kind) && d.repeat === 'monthly', 'Este documento no tiene repetición mensual');
  let periodEnd = d.period_end ? nextMonth(d.period_end) : null;
  if (d.period_start && d.period_end && d.period_start.endsWith('-01') && d.period_start.slice(0,7) === d.period_end.slice(0,7)) {
    const [y,m,day] = d.period_end.split('-').map(Number);
    if (day === new Date(Date.UTC(y,m,0)).getUTCDate()) periodEnd = new Date(Date.UTC(y,m+1,0)).toISOString().slice(0,10);
  }
  return { ...d, date: nextMonth(d.date), due: d.due ? nextMonth(d.due) : null,
    period_start: d.period_start ? nextMonth(d.period_start) : null,
    period_end: periodEnd,
    payments: [], number: '', notes: 'Previsión creada desde el mes anterior. Confirmar importe y documento antes de pagar.' };
}
module.exports = { validate, summarize, paid, nextDocument, todayMadrid, UUID };
