const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// Asistentes personales de clientes: conectores, gasto de IA del mes y cuota fija (db/migration_asistentes.sql).
const CAMPOS = ['cliente', 'nombre', 'estado', 'equipo', 'conectores', 'clave_api', 'gasto_mes_usd', 'gasto_actualizado', 'cuota_fija_eur', 'notas'];

function limpiar(body) {
  const fila = {};
  for (const campo of CAMPOS) if (body[campo] !== undefined) fila[campo] = body[campo];
  return fila;
}

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('assistants').select('*').order('cliente');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('assistants').insert([limpiar(req.body)]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const fila = { ...limpiar(req.body), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('assistants').update(fila).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('assistants').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
