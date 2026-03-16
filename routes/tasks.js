const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { logActivity } = require('./activity');

router.get('/', auth, async (req, res) => {
  const { responsable, estado, proyecto_id } = req.query;
  let query = supabase.from('tasks').select('*, projects(nombre)').order('fecha_limite');
  if (responsable) query = query.eq('responsable', responsable);
  if (estado) query = query.eq('estado', estado);
  if (proyecto_id) query = query.eq('proyecto_id', proyecto_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('tasks').insert([req.body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'crear', 'tareas', `Tarea creada: ${data.titulo}`);
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('tasks').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('tasks').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
