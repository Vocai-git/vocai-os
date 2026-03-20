const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('my_events')
    .select('*')
    .eq('user_id', req.user.id)
    .order('fecha')
    .order('hora');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const body = { ...req.body, user_id: req.user.id };
  const { data, error } = await supabase.from('my_events').insert([body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('my_events')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('my_events')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;
