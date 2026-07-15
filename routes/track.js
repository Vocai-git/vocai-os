/* ============================================================
   VOCAI OS — Tracker de la web pública (vocai.es)
   Analítica propia, cookieless. La web manda un beacon por
   visita y por evento de conversión; acá se filtran bots, se
   anonimiza el visitante (hash diario, sin guardar la IP) y
   se guarda en web_hits. Además se deduce país/ciudad (GeoIP
   local, sin terceros), navegador, SO e idioma. El módulo
   Analítica lo consume vía web_resumen + /api/track/visitas.
   ============================================================ */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// GeoIP local (base MaxMind embebida en el paquete). Si el paquete
// no está instalado, el tracker sigue funcionando sin geo.
let geoip = null;
try { geoip = require('geoip-lite'); } catch { /* sin geo */ }

const BOT_RE = /bot|crawl|spider|slurp|preview|lighthouse|pingdom|monitor|headless/i;
const EVENTOS_VALIDOS = ['click-whatsapp', 'reserva-estudio', 'contacto-enviado', 'click-instagram'];

// Si la visita no trae UTM, la fuente se deduce del referrer. Así la bio
// de Instagram puede ser una URL limpia (www.vocai.es) sin parámetros y
// la visita igual queda etiquetada como "instagram".
const REF_FUENTES = [
  [/instagram\.com/i, 'instagram'],
  [/facebook\.com|fb\.com|fb\.me/i, 'facebook'],
  [/whatsapp\.|wa\.me/i, 'whatsapp'],
  [/youtube\.com|youtu\.be/i, 'youtube'],
  [/google\./i, 'google'],
  [/bing\.com/i, 'bing'],
  [/linkedin\.com|lnkd\.in/i, 'linkedin'],
  [/twitter\.com|x\.com|t\.co/i, 'x'],
  [/tiktok\.com/i, 'tiktok'],
];
function fuenteDeReferrer(ref) {
  for (const [re, f] of REF_FUENTES) if (re.test(ref || '')) return f;
  return null;
}

const clean = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

function ipDe(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim();
}

// Hash anónimo del visitante: misma persona = mismo hash durante el día,
// y al día siguiente cambia. No se guarda IP ni nada reversible.
function hashVisitante(req) {
  const ip = ipDe(req);
  const ua = req.headers['user-agent'] || '';
  const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const salt = process.env.JWT_SECRET || 'vocai';
  return crypto.createHash('sha256')
    .update(`${ip}|${ua}|${dia}|${salt}`).digest('hex').slice(0, 16);
}

// Navegador y SO a partir del user-agent. Los in-app browsers
// (Instagram, Facebook, WhatsApp) van primero porque su UA también
// matchea Safari/Chrome.
function navegadorDe(ua) {
  if (/instagram/i.test(ua)) return 'instagram';
  if (/fban|fbav|fb_iab/i.test(ua)) return 'facebook';
  if (/whatsapp/i.test(ua)) return 'whatsapp';
  if (/edg\//i.test(ua)) return 'edge';
  if (/opr\/|opera/i.test(ua)) return 'opera';
  if (/samsungbrowser/i.test(ua)) return 'samsung';
  if (/firefox\//i.test(ua)) return 'firefox';
  if (/chrome\/|crios\//i.test(ua)) return 'chrome';
  if (/safari\//i.test(ua)) return 'safari';
  return 'otro';
}
function soDe(ua) {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/macintosh|mac os/i.test(ua)) return 'macos';
  if (/linux/i.test(ua)) return 'linux';
  return 'otro';
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
    if (!fila.utm_source && fila.referrer) {
      const f = fuenteDeReferrer(fila.referrer);
      if (f) { fila.utm_source = f; fila.utm_medium = fila.utm_medium || 'referrer'; }
    }

    // Detalle del visitante (v2). Se geolocaliza en memoria y se descarta
    // la IP: a la base solo llegan país y ciudad.
    const extra = {
      navegador: navegadorDe(ua),
      so: soDe(ua),
      idioma: clean((req.headers['accept-language'] || '').split(',')[0].trim(), 12) || null,
      pais: null,
      ciudad: null,
    };
    if (geoip) {
      const geo = geoip.lookup(ipDe(req));
      if (geo) {
        extra.pais = geo.country || null;
        extra.ciudad = clean(geo.city, 60) || null;
      }
    }

    // Insert con las columnas v2; si la migración todavía no corrió en
    // Supabase, reintenta con la fila base para no perder la visita.
    const { error } = await supabase.from('web_hits').insert([{ ...fila, ...extra }]);
    if (error) await supabase.from('web_hits').insert([fila]);
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });   // el tracker nunca le devuelve error a la web
  }
});

function rangoMes(mesQuery) {
  const mes = /^\d{4}-\d{2}$/.test(mesQuery || '')
    ? mesQuery
    : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);
  const [y, m] = mes.split('-').map(Number);
  const desde = `${y}-${String(m).padStart(2, '0')}-01`;
  const hasta = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { mes, desde, hasta };
}

// GET /api/track/resumen?mes=YYYY-MM — agregado para el módulo Analítica.
router.get('/resumen', auth, async (req, res) => {
  const { mes, desde, hasta } = rangoMes(req.query.mes);
  const { data, error } = await supabase.rpc('web_resumen', { p_desde: desde, p_hasta: hasta });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ mes, ...(data || {}) });
});

// Fuente "humana" de un hit: UTM > dominio del referrer > directo.
function fuenteDeHit(h) {
  if (h.utm_source) return h.utm_source;
  if (h.referrer) {
    const m = /^https?:\/\/([^/]+)/.exec(h.referrer);
    if (m) return m[1].replace(/^www\./, '');
  }
  return 'directo';
}

// GET /api/track/visitas?mes=YYYY-MM — detalle para el módulo Analítica:
// últimas visitas una por una + desgloses del mes (páginas, dispositivos,
// países, navegadores, idiomas).
router.get('/visitas', auth, async (req, res) => {
  const { mes, desde, hasta } = rangoMes(req.query.mes);
  const { data, error } = await supabase.from('web_hits')
    .select('*')
    .gte('ts', desde).lt('ts', hasta)
    .order('ts', { ascending: false })
    .limit(5000);
  if (error) return res.status(500).json({ error: error.message });

  const hits = data || [];
  const pageviews = hits.filter(h => h.tipo === 'pageview');
  const cuenta = (arr, fn) => {
    const agg = {};
    for (const h of arr) {
      const k = fn(h);
      if (k) agg[k] = (agg[k] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(agg).sort((a, b) => b[1] - a[1]));
  };

  res.json({
    mes,
    paginas: cuenta(pageviews, h => h.path || '/'),
    dispositivos: cuenta(pageviews, h => h.dispositivo),
    paises: cuenta(pageviews, h => h.pais),
    navegadores: cuenta(pageviews, h => h.navegador),
    idiomas: cuenta(pageviews, h => (h.idioma || '').slice(0, 2).toLowerCase() || null),
    ultimas: hits.slice(0, 60).map(h => ({
      ts: h.ts,
      tipo: h.tipo,
      evento: h.evento,
      origen: h.origen,
      path: h.path,
      fuente: fuenteDeHit(h),
      dispositivo: h.dispositivo,
      pais: h.pais,
      ciudad: h.ciudad,
      navegador: h.navegador,
      so: h.so,
      idioma: h.idioma,
      visitante: h.visitante,
    })),
  });
});

module.exports = router;
