const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { publicarPiezaPorId } = require('../automations/publisher');

// GET /api/marketing-calendar?mes=YYYY-MM&canal=feed|historias  → piezas del mes
router.get('/', auth, async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  const canal = req.query.canal;
  const [year, month] = mes.split('-');
  const from = `${year}-${month}-01`;
  const to = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
  let q = supabase
    .from('content_pieces')
    .select('*')
    .gte('fecha', from)
    .lte('fecha', to);
  if (canal === 'historias') q = q.eq('formato', 'story');
  else if (canal === 'feed') q = q.neq('formato', 'story');
  const { data, error } = await q.order('fecha', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/marketing-calendar  → crear pieza
router.post('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('content_pieces')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PUT /api/marketing-calendar/:id  → actualizar (también mover de día)
router.put('/:id', auth, async (req, res) => {
  const payload = { ...req.body, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('content_pieces')
    .update(payload)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/marketing-calendar/:id/publicar  → publicar ya en IG + FB
router.post('/:id/publicar', auth, async (req, res) => {
  try {
    await publicarPiezaPorId(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/marketing-calendar/:id  → eliminar
router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase
    .from('content_pieces')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
