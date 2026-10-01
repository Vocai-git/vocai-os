/* ============================================================
   VOCAI OS — Pronósticos de reels (API)
   Tandas diarias de 3 clips, votos ocultos hasta el cierre,
   vínculo con los reels publicados en IG/TikTok, tabla de
   posiciones y conexión de TikTok por OAuth.
   Lógica de cierre y puntaje: automations/pronosticos.js.
   ============================================================ */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const tiktok = require('../config/tiktok');
const P = require('../automations/pronosticos');

const secretoState = () => process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_KEY;

function hoyMadrid() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
}

// Si falta la migración, decirlo claro en vez del error crudo de Supabase.
function mensajeError(err) {
  const msg = err.message || String(err);
  if (/pronos_/.test(msg) && /(does not exist|schema cache)/.test(msg)) {
    return 'Falta crear las tablas: correr db/migration_pronosticos.sql en el SQL Editor de Supabase.';
  }
  return msg;
}

// Nombres del equipo (cuentas de VOCAI OS), cacheados 10 min.
let _equipo = null, _equipoAt = 0;
async function nombresEquipo() {
  if (_equipo && Date.now() - _equipoAt < 10 * 60 * 1000) return _equipo;
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);
  const out = {};
  for (const u of data.users) {
    const base = u.user_metadata?.nombre || u.email.split('@')[0];
    out[u.id] = base.charAt(0).toUpperCase() + base.slice(1);
  }
  _equipo = out;
  _equipoAt = Date.now();
  return out;
}

async function cargarTanda(id) {
  const [{ data: t, error: e1 }, { data: clips, error: e2 }] = await Promise.all([
    supabase.from('pronos_tandas').select('*').eq('id', id).maybeSingle(),
    supabase.from('pronos_clips').select('*').eq('tanda_id', id).order('letra'),
  ]);
  if (e1 || e2) throw new Error((e1 || e2).message);
  return t ? { t, clips: clips || [] } : null;
}

// Estado de una tanda tal como la ve quien consulta. Mientras está
// abierta solo se sabe QUIÉN votó, nunca QUÉ votó (salvo el propio).
function armarTanda(t, clips, votos, userId, ahora) {
  const cierre = P.cierreDe(t, clips);
  const abierta = cierre === null || ahora < cierre;

  const resultados = {};
  for (const red of P.REDES) {
    const tasas = P.tasasDe(red, clips);
    if (tasas) resultados[red] = { tasas, orden: P.ordenReal(tasas) };
  }
  const vinculadas = P.REDES.filter(red => clips.length === 3 && clips.every(c => c[P.ID_RED[red]]));
  const terminada = !abierta && vinculadas.length > 0 && vinculadas.every(red => resultados[red]);

  // Un voto guardado después del cierre no cuenta (pasa si el reel se
  // vinculó tarde y el cierre se calculó recién ahí).
  const aTiempo = v => cierre === null || new Date(v.updated_at).getTime() <= cierre;
  const mio = votos.find(v => v.user_id === userId);

  return {
    id: t.id,
    fecha: t.fecha,
    publicado_at: t.publicado_at,
    cierre: cierre ? new Date(cierre).toISOString() : null,
    estado: abierta ? 'abierta' : terminada ? 'terminada' : 'midiendo',
    clips: clips.map(c => ({
      letra: c.letra,
      titulo: c.titulo,
      ig: { id: c.ig_media_id, link: c.ig_link, publicado_at: c.ig_publicado_at, medido_at: c.ig_medido_at, metricas: c.ig_metricas },
      tt: { id: c.tt_video_id, link: c.tt_link, publicado_at: c.tt_publicado_at, medido_at: c.tt_medido_at, metricas: c.tt_metricas },
    })),
    mi_voto: mio ? mio.orden : null,
    votaron: votos.map(v => v.user_id),
    votos: abierta ? [] : votos.map(v => ({
      user_id: v.user_id,
      orden: v.orden,
      a_tiempo: aTiempo(v),
      puntos: Object.fromEntries(P.REDES.map(red => [
        red, aTiempo(v) && resultados[red] ? P.puntosPorPares(v.orden, resultados[red].tasas) : null,
      ])),
    })),
    resultados,
  };
}

// Promedios por persona sobre todas las tandas con resultados.
function armarRanking(tandas) {
  const acc = {};
  for (const t of tandas) {
    for (const v of t.votos) {
      for (const red of P.REDES) {
        if (v.puntos[red] === null) continue;
        const r = acc[v.user_id] || (acc[v.user_id] = { user_id: v.user_id, tandas: new Set(), ig: [], tt: [], primeros: 0 });
        r[red].push(v.puntos[red]);
        r.tandas.add(t.id);
        if (v.orden[0] === t.resultados[red].orden[0]) r.primeros++;
      }
    }
  }
  const prom = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  return Object.values(acc).map(r => {
    const todos = r.ig.concat(r.tt);
    return {
      user_id: r.user_id,
      dias: r.tandas.size,
      ig: prom(r.ig),
      tt: prom(r.tt),
      total: prom(todos),
      mediciones: todos.length,
      primeros_pct: todos.length ? r.primeros / todos.length : null,
    };
  }).sort((a, b) => (b.total - a.total) || (b.primeros_pct - a.primeros_pct));
}

// ── GET /api/pronosticos → todo el juego ────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [r1, r2, r3] = await Promise.all([
      supabase.from('pronos_tandas').select('*').order('fecha', { ascending: false }),
      supabase.from('pronos_clips').select('*').order('letra'),
      supabase.from('pronos_votos').select('*'),
    ]);
    const err = r1.error || r2.error || r3.error;
    if (err) throw new Error(err.message);

    const ahora = Date.now();
    const tandas = r1.data.map(t => armarTanda(
      t,
      r2.data.filter(c => c.tanda_id === t.id),
      r3.data.filter(v => v.tanda_id === t.id),
      req.user.id,
      ahora,
    ));

    res.json({
      hoy: hoyMadrid(),
      yo: req.user.id,
      nombres: await nombresEquipo(),
      tandas,
      ranking: armarRanking(tandas),
      conexiones: {
        ig: P.igConfigurado(),
        tiktok_configurado: tiktok.tiktokConfigurado(),
        tiktok_conectado: await tiktok.tiktokConectado(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: mensajeError(err) });
  }
});

// ── POST /api/pronosticos/tandas → tanda de hoy ─────────────
router.post('/tandas', auth, async (req, res) => {
  const titulos = (req.body.titulos || []).map(s => String(s || '').trim());
  if (titulos.length !== 3 || titulos.some(t => !t)) {
    return res.status(400).json({ error: 'Poné el nombre de los 3 clips' });
  }
  try {
    const { data: t, error } = await supabase.from('pronos_tandas')
      .insert([{ fecha: hoyMadrid(), creado_por: req.user.email }]).select().single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'La tanda de hoy ya está cargada' });
      throw new Error(error.message);
    }
    const { error: e2 } = await supabase.from('pronos_clips')
      .insert(P.LETRAS.map((letra, i) => ({ tanda_id: t.id, letra, titulo: titulos[i] })));
    if (e2) {
      await supabase.from('pronos_tandas').delete().eq('id', t.id);
      throw new Error(e2.message);
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: mensajeError(err) });
  }
});

// ── PUT /api/pronosticos/tandas/:id/voto → { orden: ['B','A','C'] } ─
router.put('/tandas/:id/voto', auth, async (req, res) => {
  const orden = req.body.orden;
  const valido = Array.isArray(orden) && orden.length === 3 &&
    new Set(orden).size === 3 && orden.every(l => P.LETRAS.includes(l));
  if (!valido) return res.status(400).json({ error: 'Ordená los 3 clips del 1º al 3º' });
  try {
    const x = await cargarTanda(req.params.id);
    if (!x) return res.status(404).json({ error: 'Tanda no encontrada' });
    const cierre = P.cierreDe(x.t, x.clips);
    if (cierre !== null && Date.now() >= cierre) {
      return res.status(400).json({ error: 'La votación ya cerró (15 min después de publicar)' });
    }
    const { error } = await supabase.from('pronos_votos').upsert({
      tanda_id: x.t.id, user_id: req.user.id, orden, updated_at: new Date().toISOString(),
    }, { onConflict: 'tanda_id,user_id' });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: mensajeError(err) });
  }
});

// ── POST /api/pronosticos/tandas/:id/publicado → arranca los 15 min ─
router.post('/tandas/:id/publicado', auth, async (req, res) => {
  const { error } = await supabase.from('pronos_tandas')
    .update({ publicado_at: new Date().toISOString() })
    .eq('id', req.params.id).is('publicado_at', null);
  if (error) return res.status(500).json({ error: mensajeError(error) });
  res.json({ ok: true });
});

// ── Publicaciones recientes de las dos cuentas ──────────────
async function publicacionesRecientes(redes) {
  const out = { ig: [], tt: [], errores: [] };
  if (redes.includes('ig') && P.igConfigurado()) {
    try { out.ig = await P.reelsRecientesIG(); } catch (err) { out.errores.push('Instagram: ' + err.message); }
  }
  if (redes.includes('tt') && await tiktok.tiktokConectado()) {
    try { out.tt = await P.videosRecientesTT(); } catch (err) { out.errores.push('TikTok: ' + err.message); }
  }
  return out;
}

router.get('/publicaciones', auth, async (req, res) => {
  try {
    res.json(await publicacionesRecientes(P.REDES));
  } catch (err) {
    res.status(500).json({ error: mensajeError(err) });
  }
});

// ── PUT /api/pronosticos/tandas/:id/vincular ────────────────
// Body: { A: { ig: '<media id>', tt: '<video id>' }, B: {...}, C: {...} }
// Vacío = desvincular. Cambiar el vínculo borra la medición anterior.
router.put('/tandas/:id/vincular', auth, async (req, res) => {
  const sel = req.body || {};
  try {
    const x = await cargarTanda(req.params.id);
    if (!x) return res.status(404).json({ error: 'Tanda no encontrada' });

    for (const red of P.REDES) {
      const ids = P.LETRAS.map(l => (sel[l] || {})[red]).filter(Boolean);
      if (new Set(ids).size !== ids.length) {
        return res.status(400).json({ error: 'Una misma publicación quedó elegida para dos clips' });
      }
    }

    const recientes = await publicacionesRecientes(P.REDES);
    for (const c of x.clips) {
      const cambios = {};
      for (const red of P.REDES) {
        const nuevo = (sel[c.letra] || {})[red] || null;
        if ((c[P.ID_RED[red]] || null) === nuevo) continue;
        let p = null;
        if (nuevo) {
          p = recientes[red].find(r => r.id === nuevo);
          if (!p) return res.status(400).json({ error: 'No encontré esa publicación entre las últimas de la cuenta' });
        }
        Object.assign(cambios, {
          [P.ID_RED[red]]: p ? p.id : null,
          [red + '_link']: p ? p.link : null,
          [red + '_publicado_at']: p ? p.fecha : null,
          [red + '_metricas']: null,
          [red + '_medido_at']: null,
        });
      }
      if (!Object.keys(cambios).length) continue;
      const { error } = await supabase.from('pronos_clips').update(cambios).eq('id', c.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: mensajeError(err) });
  }
});

// ── Conexión de TikTok (OAuth) ──────────────────────────────
router.post('/tiktok/url', auth, (req, res) => {
  if (!tiktok.tiktokConfigurado()) {
    return res.status(400).json({ error: 'Faltan TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET y TIKTOK_REDIRECT_URI en Railway' });
  }
  const state = jwt.sign({ u: req.user.id }, secretoState(), { expiresIn: '10m' });
  res.json({ url: tiktok.urlAutorizacion(state) });
});

// TikTok vuelve acá después de que la cuenta acepta. Sin header de
// auth (es una redirección del navegador): el state firmado prueba
// que la conexión la pidió alguien logueado en VOCAI OS.
router.get('/tiktok/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  try {
    if (error) throw new Error(error_description || error);
    jwt.verify(String(state || ''), secretoState());
    await tiktok.canjearCodigo(String(code || ''));
    res.redirect('/app#pronosticos');
  } catch (err) {
    console.error('[Pronosticos] TikTok callback:', err.message);
    const msg = String(mensajeError(err)).replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
    res.status(400).send(`<p>No se pudo conectar TikTok: ${msg}</p><p><a href="/app#pronosticos">Volver a VOCAI OS</a></p>`);
  }
});

module.exports = router;
