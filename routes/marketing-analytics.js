const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { runMetricas } = require('../automations/metricas');

// "2026-06" → ["2026-06-01", "2026-07-01"]
function rangoDelMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const desde = `${y}-${String(m).padStart(2, '0')}-01`;
  const hasta = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [desde, hasta];
}

function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Piezas de un mes con sus métricas adjuntas en pieza.metrics.
async function piezasConMetricas(mes) {
  const [desde, hasta] = rangoDelMes(mes);
  const { data: piezas, error } = await supabase
    .from('content_pieces').select('*')
    .gte('fecha', desde).lt('fecha', hasta)
    .order('fecha', { ascending: true });
  if (error) throw new Error(error.message);

  const ids = (piezas || []).map(p => p.id);
  let metricas = [];
  if (ids.length) {
    const { data } = await supabase
      .from('content_metrics').select('*').in('pieza_id', ids);
    metricas = data || [];
  }
  const porPieza = {};
  metricas.forEach(m => { porPieza[m.pieza_id] = m; });
  return (piezas || []).map(p => ({ ...p, metrics: porPieza[p.id] || null }));
}

function totales(piezas) {
  const t = { piezas: 0, alcance: 0, interacciones: 0, guardados: 0 };
  piezas.forEach(p => {
    if (!p.metrics) return;
    t.piezas++;
    t.alcance += p.metrics.alcance || 0;
    t.interacciones += p.metrics.interacciones || 0;
    t.guardados += p.metrics.guardados || 0;
  });
  return t;
}

// GET /api/marketing-analytics?mes=YYYY-MM
// → piezas del mes con métricas + serie diaria de la cuenta +
//   totales del mes anterior (para comparar).
router.get('/', auth, async (req, res) => {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '')
      ? req.query.mes
      : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);

    const piezas = await piezasConMetricas(mes);

    const [desde, hasta] = rangoDelMes(mes);
    const { data: cuenta } = await supabase
      .from('account_metrics').select('*')
      .gte('fecha', desde).lt('fecha', hasta)
      .order('fecha', { ascending: true });

    const piezasPrev = await piezasConMetricas(mesAnterior(mes));

    res.json({
      mes,
      piezas,
      cuenta: cuenta || [],
      totales: totales(piezas),
      mesAnterior: { mes: mesAnterior(mes), ...totales(piezasPrev) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing-analytics/refrescar → corre el fetch de métricas YA.
// Puede tardar unos segundos (una llamada a la Graph API por pieza).
router.post('/refrescar', auth, async (req, res) => {
  try {
    const r = await runMetricas();
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
