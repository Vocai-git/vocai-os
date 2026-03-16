const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const TEMPLATES = {
  estudio: {
    nombre: 'Propuesta Estudio & Contenido',
    servicios: ['Grabación de podcast', 'Edición de video/audio', 'Producción de reels', 'Diseño de thumbnails'],
    intro: 'Desde VOCAI te ofrecemos un servicio integral de producción de contenido digital.'
  },
  marketing: {
    nombre: 'Propuesta Marketing Digital',
    servicios: ['Gestión de redes sociales', 'Estrategia de contenido', 'Community management', 'Reportes mensuales'],
    intro: 'Desde VOCAI te ayudamos a construir y escalar tu presencia digital de forma profesional.'
  },
  ia: {
    nombre: 'Propuesta Inteligencia Artificial',
    servicios: ['Automatizaciones con n8n', 'Desarrollo de agentes IA', 'Integración con herramientas', 'Formación y soporte'],
    intro: 'Desde VOCAI implementamos soluciones de IA y automatización para optimizar tu negocio.'
  },
  full: {
    nombre: 'Propuesta Servicio Completo',
    servicios: ['Estudio y contenido', 'Marketing digital', 'Automatizaciones IA', 'Soporte prioritario'],
    intro: 'Desde VOCAI te ofrecemos el ecosistema completo: contenido, marketing e inteligencia artificial en una sola agencia.'
  }
};

router.get('/templates', auth, (req, res) => res.json(TEMPLATES));

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('proposals').select('*, clients(nombre)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('proposals').insert([req.body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('proposals').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('proposals').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
