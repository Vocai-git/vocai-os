const express = require('express');
const router = express.Router();
const { supabaseAnon } = require('../config/supabase');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Credenciales inválidas' });

  res.json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      nombre: data.user.user_metadata?.nombre || data.user.email.split('@')[0]
    }
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) await supabaseAnon.auth.signOut();
  res.json({ ok: true });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ error: 'Sesión expirada' });
  res.json({ token: data.session.access_token, refresh_token: data.session.refresh_token });
});

module.exports = router;
