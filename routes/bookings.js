const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { logActivity } = require('./activity');

const PACKS = {
  basico: { nombre: 'Básico', precio: 90, tipo: 'hora' },
  plus: { nombre: 'Plus', precio: 190, tipo: 'sesion' },
  graba: { nombre: 'Graba', precio: 349, tipo: 'mes' },
  crea: { nombre: 'Crea', precio: 850, tipo: 'mes' },
  domina: { nombre: 'Domina', precio: 1400, tipo: 'mes' }
};

router.get('/packs', auth, (req, res) => res.json(PACKS));

router.get('/', auth, async (req, res) => {
  const { fecha, estado } = req.query;
  let query = supabase.from('studio_bookings').select('*, clients(nombre)').order('fecha').order('hora');
  if (fecha) query = query.eq('fecha', fecha);
  if (estado) query = query.eq('estado', estado);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const body = { ...req.body };
  if (body.pack && PACKS[body.pack]) {
    body.precio = PACKS[body.pack].precio;
  }
  const { data, error } = await supabase.from('studio_bookings').insert([body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'crear', 'estudio', `Reserva creada: ${data.fecha} ${data.hora}`);
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('studio_bookings').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('studio_bookings').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
