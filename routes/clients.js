const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { logActivity } = require('./activity');

router.get('/', auth, async (req, res) => {
  const { estado, responsable, search } = req.query;
  let query = supabase.from('clients').select('*').order('nombre');
  if (estado) query = query.eq('estado', estado);
  if (responsable) query = query.eq('responsable', responsable);
  if (search) query = query.ilike('nombre', `%${search}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('clients').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('clients').insert([req.body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'crear', 'clientes', `Cliente creado: ${data.nombre}`);
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('clients').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'editar', 'clientes', `Cliente actualizado: ${data.nombre}`);
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'eliminar', 'clientes', `Cliente eliminado: ${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
