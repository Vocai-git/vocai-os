const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { logActivity } = require('./activity');

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(nombre), tasks(id, titulo, estado, responsable, prioridad, fecha_limite)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(nombre), tasks(*)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Proyecto no encontrado' });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('projects').insert([req.body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'crear', 'proyectos', `Proyecto creado: ${data.nombre}`);
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('projects').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'editar', 'proyectos', `Proyecto actualizado: ${data.nombre}`);
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Comments
router.get('/:id/comments', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('project_comments')
    .select('*')
    .eq('project_id', req.params.id)
    .order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/:id/comments', auth, async (req, res) => {
  const { data, error } = await supabase.from('project_comments').insert([{
    project_id: req.params.id,
    usuario: req.user.email,
    texto: req.body.texto
  }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = router;
