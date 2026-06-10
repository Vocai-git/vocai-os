/* ============================================================
   VOCAI OS — Tracker de la web pública (vocai.es)
   Analítica propia, cookieless. La web manda un beacon por
   visita y por evento de conversión; acá se filtran bots, se
   anonimiza el visitante (hash diario, sin guardar la IP) y
   se guarda en web_hits. El módulo Analítica lo consume vía
   la función SQL web_resumen.
   ============================================================ */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const BOT_RE = /bot|crawl|spider|slurp|preview|lighthouse|pingdom|monitor|headless/i;
const EVENTOS_VALIDOS = ['click-whatsapp', 'reserva-estudio', 'contacto-enviado', 'click-instagram'];

const clean = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

// Hash anónimo del visitante: misma persona = mismo hash durante el día,
// y al día siguiente cambia. No se guarda IP ni nada reversible.
function hashVisitante(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const salt = process.env.JWT_SECRET || 'vocai';
  return crypto.createHash('sha256')
    .update(`${ip}|${ua}|${dia}|${salt}`).digest('hex').slice(0, 16);
}

// POST /api/track — beacon público desde vocai.es (sin auth).
router.post('/', async (req, res) => {
  try {
    const ua = req.headers['user-agent'] || '';
    if (BOT_RE.test(ua)) return res.json({ ok: true });   // bots: ni guardarlos

    const b = req.body || {};
    const tipo = b.tipo === 'evento' ? 'evento' : 'pageview';
    const fila = {
      tipo,
      evento: tipo === 'evento'
        ? (EVENTOS_VALIDOS.includes(b.evento) ? b.evento : 'otro')
        : null,
      origen: tipo === 'evento' ? clean(b.origen, 40) : null,
      path: clean(b.path, 200),
      referrer: clean(b.referrer, 300),
      utm_source: clean(b.utm_source, 60),
      utm_medium: clean(b.utm_medium, 60),
      utm_campaign: clean(b.utm_campaign, 60),
      dispositivo: /mobile|android|iphone|ipad/i.test(ua) ? 'movil' : 'desktop',
      visitante: hashVisitante(req),
    };
    await supabase.from('web_hits').insert([fila]);
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });   // el tracker nunca le devuelve error a la web
  }
});

// GET /api/track/resumen?mes=YYYY-MM — agregado para el módulo Analítica.
router.get('/resumen', auth, async (req, res) => {
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '')
    ? req.query.mes
    : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);
  const [y, m] = mes.split('-').map(Number);
  const desde = `${y}-${String(m).padStart(2, '0')}-01`;
  const hasta = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase.rpc('web_resumen', { p_desde: desde, p_hasta: hasta });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ mes, ...(data || {}) });
});

module.exports = router;
