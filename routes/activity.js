const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

async function logActivity(usuario, accion, modulo, detalle = '') {
  await supabase.from('activity_log').insert([{
    usuario, accion, modulo, detalle, fecha: new Date().toISOString()
  }]);
}

router.get('/', auth, async (req, res) => {
  const { limit = 50 } = req.query;
  const { data, error } = await supabase.from('activity_log').select('*').order('fecha', { ascending: false }).limit(parseInt(limit));
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
module.exports.logActivity = logActivity;
