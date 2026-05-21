const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// GET /api/marketing-planning?mes=YYYY-MM
// Devuelve el plan del mes + el mix de pilares calculado del calendario.
router.get('/', auth, async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);

  const { data: plan, error } = await supabase
    .from('content_months').select('*').eq('mes', mes).single();
  if (error && error.code !== 'PGRST116')
    return res.status(500).json({ error: error.message });

  // Mix: piezas del mes agrupadas por pilar
  const [year, month] = mes.split('-');
  const from = `${year}-${month}-01`;
  const to = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
  const { data: piezas } = await supabase
    .from('content_pieces').select('pilar').gte('fecha', from).lte('fecha', to);

  const mix = { ia: 0, estudio: 0, casos: 0, personas: 0 };
  (piezas || []).forEach(p => { if (mix[p.pilar] !== undefined) mix[p.pilar]++; });

  res.json({ plan: plan || null, mix, total: (piezas || []).length, mes });
});

// POST /api/marketing-planning  → crear o actualizar el plan del mes
router.post('/', auth, async (req, res) => {
  const mes = req.body.mes || new Date().toISOString().slice(0, 7);
  const { data: existing } = await supabase
    .from('content_months').select('id').eq('mes', mes).single();

  let result;
  if (existing) {
    const { data, error } = await supabase
      .from('content_months')
      .update({ ...req.body, mes, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    result = data;
  } else {
    const { data, error } = await supabase
      .from('content_months').insert([{ ...req.body, mes }]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    result = data;
  }
  res.json(result);
});

module.exports = router;
