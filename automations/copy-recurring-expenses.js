/* ============================================================
   VOCAI OS — Copia automática de gastos recurrentes
   Copia los gastos con tipo='recurrente' del mes "from" al mes
   "to". Es idempotente: no copia un gasto si ya existe en el
   mes destino otro con mismo nombre + responsable.
   ============================================================ */

const { supabase } = require('../config/supabase');

function rangoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${String(m).padStart(2,'0')}-01`,
    to:   `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
    primerDia: `${y}-${String(m).padStart(2,'0')}-01`
  };
}

function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2,'0')}`;
}

function mesActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
}

async function copyRecurringExpenses({ from, to } = {}) {
  const mesTo = to || mesActual();
  const mesFrom = from || mesAnterior(mesTo);

  const rFrom = rangoMes(mesFrom);
  const rTo   = rangoMes(mesTo);

  // Traemos los gastos recurrentes del mes origen
  const { data: sourceExpenses, error: errFrom } = await supabase
    .from('expenses')
    .select('*')
    .eq('tipo', 'recurrente')
    .gte('fecha', rFrom.from).lte('fecha', rFrom.to);
  if (errFrom) throw new Error('Error leyendo gastos del mes origen: ' + errFrom.message);

  if (!sourceExpenses || sourceExpenses.length === 0) {
    return { from: mesFrom, to: mesTo, copiados: 0, omitidos: 0, total: 0 };
  }

  // Traemos los gastos del mes destino para evitar duplicar
  const { data: targetExpenses, error: errTo } = await supabase
    .from('expenses')
    .select('nombre,responsable')
    .gte('fecha', rTo.from).lte('fecha', rTo.to);
  if (errTo) throw new Error('Error leyendo gastos del mes destino: ' + errTo.message);

  const yaExiste = new Set(
    (targetExpenses || []).map(e => `${(e.nombre||'').toLowerCase().trim()}|${(e.responsable||'').toLowerCase().trim()}`)
  );

  const aInsertar = [];
  let omitidos = 0;
  for (const e of sourceExpenses) {
    const key = `${(e.nombre||'').toLowerCase().trim()}|${(e.responsable||'').toLowerCase().trim()}`;
    if (yaExiste.has(key)) { omitidos++; continue; }
    aInsertar.push({
      nombre: e.nombre,
      categoria: e.categoria,
      importe: e.importe,
      iva: e.iva || 0,
      irpf: e.irpf || 0,
      total: e.total != null ? e.total : e.importe,
      fecha: rTo.primerDia,
      responsable: e.responsable,
      recurrente: true,
      tipo: 'recurrente',
      notas: e.notas || ''
    });
  }

  if (aInsertar.length === 0) {
    return { from: mesFrom, to: mesTo, copiados: 0, omitidos, total: sourceExpenses.length };
  }

  const { error: errIns } = await supabase.from('expenses').insert(aInsertar);
  if (errIns) throw new Error('Error insertando gastos copiados: ' + errIns.message);

  return { from: mesFrom, to: mesTo, copiados: aInsertar.length, omitidos, total: sourceExpenses.length };
}

module.exports = { copyRecurringExpenses, mesAnterior, mesActual };
