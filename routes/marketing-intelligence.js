const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// GET /api/marketing-intelligence  → banco de temas (más nuevos primero)
router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('content_topics')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/marketing-intelligence  → crear tema
router.post('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('content_topics')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PUT /api/marketing-intelligence/:id  → actualizar tema
router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('content_topics')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/marketing-intelligence/:id  → eliminar tema
router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase
    .from('content_topics')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
