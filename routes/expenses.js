const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

router.get('/', auth, async (req, res) => {
  const { mes, categoria, responsable } = req.query;
  let query = supabase.from('expenses').select('*').order('fecha', { ascending: false });
  if (mes) {
    const [year, month] = mes.split('-');
    const from = `${year}-${month}-01`;
    const to = new Date(year, month, 0).toISOString().split('T')[0];
    query = query.gte('fecha', from).lte('fecha', to);
  }
  if (categoria) query = query.eq('categoria', categoria);
  if (responsable) query = query.eq('responsable', responsable);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const body = {
    nombre: req.body.nombre,
    categoria: req.body.categoria,
    importe: req.body.importe,
    fecha: req.body.fecha,
    responsable: req.body.responsable || 'Agus',
    recurrente: req.body.recurrente || false,
    notas: req.body.notas || ''
  };
  console.log('[Expenses] POST body:', JSON.stringify(body));
  const { data, error } = await supabase.from('expenses').insert([body]).select().single();
  if (error) { console.log('[Expenses] POST error:', error.message); return res.status(400).json({ error: error.message }); }
  console.log('[Expenses] POST result responsable:', data.responsable);
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const body = {
    nombre: req.body.nombre,
    categoria: req.body.categoria,
    importe: req.body.importe,
    fecha: req.body.fecha,
    responsable: req.body.responsable || 'Agus',
    recurrente: req.body.recurrente || false,
    notas: req.body.notas || ''
  };
  console.log('[Expenses] PUT body:', JSON.stringify(body));
  const { data, error } = await supabase.from('expenses').update(body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('expenses').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
