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

router.delete('/bulk-completed', auth, async (req, res) => {
  const { periodo } = req.query; // 30, 90, 365, all
  let query = supabase.from('tasks').delete().eq('estado', 'completada');
  if (periodo && periodo !== 'all') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(periodo));
    query = query.lte('updated_at', cutoff.toISOString());
  }
  const { data, error } = await query.select();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'limpiar', 'tareas', `${data.length} tareas completadas eliminadas`);
  res.json({ ok: true, eliminadas: data.length });
});

router.delete('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('tasks').delete().eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Tarea no encontrada o sin permisos para eliminar' });
  await logActivity(req.user.email, 'eliminar', 'tareas', `Tarea eliminada: ${data[0].titulo}`);
  res.json({ ok: true });
});

module.exports = router;
