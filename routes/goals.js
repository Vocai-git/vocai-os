const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

router.get('/', auth, async (req, res) => {
  const { mes } = req.query;
  const mesActual = mes || new Date().toISOString().slice(0, 7);
  const { data, error } = await supabase.from('goals').select('*').eq('mes', mesActual).single();
  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });

  // Get actual revenue for that month
  const [year, month] = mesActual.split('-');
  const from = `${year}-${month}-01`;
  const to = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
  const { data: invoices } = await supabase.from('invoices').select('importe, estado').gte('fecha', from).lte('fecha', to).eq('estado', 'cobrada');
  const actual = (invoices || []).reduce((sum, i) => sum + (i.importe || 0), 0);

  res.json({ goal: data || null, actual, mes: mesActual });
});

router.post('/', auth, async (req, res) => {
  const mes = req.body.mes || new Date().toISOString().slice(0, 7);
  const { data: existing } = await supabase.from('goals').select('id').eq('mes', mes).single();
  let result;
  if (existing) {
    const { data, error } = await supabase.from('goals').update(req.body).eq('id', existing.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    result = data;
  } else {
    const { data, error } = await supabase.from('goals').insert([{ ...req.body, mes }]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    result = data;
  }
  res.json(result);
});

module.exports = router;
