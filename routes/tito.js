const express = require('express');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');

const ASSISTANT_URL = (process.env.VOCAI_ASSISTANT_URL || 'http://localhost:3001').replace(/\/$/, '');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

async function proxy(path, options = {}) {
  const url = `${ASSISTANT_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json();
  return { status: res.status, data };
}

router.get('/contadores', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/casos/_metadata/contadores');
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/casos', auth, async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const { status, data } = await proxy(`/api/casos${qs ? '?' + qs : ''}`);
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/casos/:id', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/casos/${req.params.id}`);
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/casos/:id', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/casos/${req.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(req.body)
    });
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/aprendizaje/contadores', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/aprendizaje/contadores');
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/aprendizaje/sugerencias', auth, async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const { status, data } = await proxy(`/api/aprendizaje/sugerencias${qs ? '?' + qs : ''}`);
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/aprendizaje/sugerencias/:id', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/aprendizaje/sugerencias/${req.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(req.body)
    });
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/aprendizaje/conocimiento', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/aprendizaje/conocimiento');
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/aprendizaje/conocimiento/:id', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/aprendizaje/conocimiento/${req.params.id}`, { method: 'DELETE' });
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/atencion-humana', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/casos?requiere_humano=true&estado=pendiente&limit=50');
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/resumen', auth, async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const { status, data } = await proxy(`/api/stats/resumen${qs ? '?' + qs : ''}`);
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/volumen-diario', auth, async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const { status, data } = await proxy(`/api/stats/volumen-diario${qs ? '?' + qs : ''}`);
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/distribucion-motivos', auth, async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const { status, data } = await proxy(`/api/stats/distribucion-motivos${qs ? '?' + qs : ''}`);
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/comparativa-mensual', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/stats/comparativa-mensual');
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CHATS EN VIVO ─────────────────────────────────────────────

router.post('/chats/iniciar', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/chats/iniciar', { method: 'POST', body: JSON.stringify(req.body) });
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/chats', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/chats/');
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/chats/bot-status', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/chats/bot-status');
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/chats/bot-status', auth, async (req, res) => {
  try {
    const { status, data } = await proxy('/api/chats/bot-status', { method: 'PATCH', body: JSON.stringify(req.body) });
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/chats/:id/mensajes', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/chats/${req.params.id}/mensajes`);
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/chats/:id/modo-manual', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/chats/${req.params.id}/modo-manual`, { method: 'PATCH', body: JSON.stringify(req.body) });
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/chats/:id/enviar', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/chats/${req.params.id}/enviar`, { method: 'POST', body: JSON.stringify(req.body) });
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Enviar archivo/imagen/audio: reenvía el multipart al assistant
router.post('/chats/:id/enviar-media', auth, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'archivo requerido' });
    const form = new FormData();
    form.append('archivo', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    if (req.body.caption) form.append('caption', req.body.caption);

    const r = await fetch(`${ASSISTANT_URL}/api/chats/${req.params.id}/enviar-media`, { method: 'POST', body: form });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Datos del contacto de una conversación
router.get('/chats/:id/contacto', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/chats/${req.params.id}/contacto`);
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Guardar como contacto
router.post('/chats/:id/contacto', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/chats/${req.params.id}/contacto`, { method: 'POST', body: JSON.stringify(req.body) });
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Renombrar a la persona
router.patch('/chats/:id', auth, async (req, res) => {
  try {
    const { status, data } = await proxy(`/api/chats/${req.params.id}`, { method: 'PATCH', body: JSON.stringify(req.body) });
    res.status(status).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
