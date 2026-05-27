const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { copyRecurringExpenses } = require('../automations/copy-recurring-expenses');

// Copia manual: para forzar la copia o hacer catch-up de un mes que no se generó.
// Si no se especifican from/to, usa mes anterior → mes actual.
router.post('/copy-recurring', auth, async (req, res) => {
  try {
    const { from, to } = req.body || {};
    const result = await copyRecurringExpenses({ from, to });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  const { mes, year, categoria, responsable, tipo } = req.query;
  let query = supabase.from('expenses').select('*').order('fecha', { ascending: false });
  if (mes) {
    const [y, m] = mes.split('-').map(Number);
    const from = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    query = query.gte('fecha', from).lte('fecha', to);
  } else if (year) {
    query = query.gte('fecha', `${year}-01-01`).lte('fecha', `${year}-12-31`);
  }
  if (categoria) query = query.eq('categoria', categoria);
  if (responsable) query = query.eq('responsable', responsable);
  if (tipo) query = query.eq('tipo', tipo);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const importe = req.body.importe || 0;
  const iva = req.body.iva || 0;
  const irpf = req.body.irpf || 0;
  const body = {
    nombre: req.body.nombre,
    categoria: req.body.categoria,
    importe,
    iva,
    irpf,
    total: req.body.total != null ? req.body.total : (importe + iva - irpf),
    fecha: req.body.fecha,
    responsable: req.body.responsable || 'Agus',
    recurrente: req.body.recurrente || false,
    tipo: req.body.tipo || 'recurrente',
    notas: req.body.notas || ''
  };
  console.log('[Expenses] POST body:', JSON.stringify(body));
  const { data, error } = await supabase.from('expenses').insert([body]).select().single();
  if (error) { console.log('[Expenses] POST error:', error.message); return res.status(400).json({ error: error.message }); }
  console.log('[Expenses] POST result responsable:', data.responsable);
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const importe = req.body.importe || 0;
  const iva = req.body.iva || 0;
  const irpf = req.body.irpf || 0;
  const body = {
    nombre: req.body.nombre,
    categoria: req.body.categoria,
    importe,
    iva,
    irpf,
    total: req.body.total != null ? req.body.total : (importe + iva - irpf),
    fecha: req.body.fecha,
    responsable: req.body.responsable || 'Agus',
    recurrente: req.body.recurrente || false,
    tipo: req.body.tipo || 'recurrente',
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
