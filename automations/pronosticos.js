/* ============================================================
   VOCAI OS — Pronósticos de reels
   Juego del equipo: cada día cada uno ordena los 3 reels del día
   según cuál va a tener mejor engagement. A las 48 h de publicado
   cada reel se guarda una foto de sus métricas (IG + TikTok) y se
   puntúa por pares: 1 punto por cada comparación acertada, de 0 a 3
   por red y por día. Ordenando al azar el promedio es 1,5.
   ============================================================ */

const { supabase } = require('../config/supabase');
const meta = require('../config/meta');
const tiktok = require('../config/tiktok');
const { insightsDeMedia } = require('./metricas');

const HORAS_MEDICION = 48;
const MIN_CIERRE = 15;
const LETRAS = ['A', 'B', 'C'];
const REDES = ['ig', 'tt'];
const ID_RED = { ig: 'ig_media_id', tt: 'tt_video_id' };

// La cuenta de IG del juego no es la de VOCAI: tiene su propio ID y,
// si el token de VOCAI no la alcanza, su propio token.
function igCfg() {
  return {
    token:  process.env.PRONOS_IG_TOKEN || process.env.META_ACCESS_TOKEN || '',
    igUser: process.env.PRONOS_IG_USER_ID || '',
  };
}

function igConfigurado() {
  const c = igCfg();
  return !!(c.token && c.igUser);
}

// ── Publicaciones recientes (para vincular cada clip) ───────
async function reelsRecientesIG() {
  const { token, igUser } = igCfg();
  const d = await meta.graphGet(`${igUser}/media`, {
    fields: 'id,caption,media_product_type,timestamp,permalink',
    limit: '25', access_token: token,
  });
  return (d.data || [])
    .filter(m => m.media_product_type === 'REELS')
    .map(m => ({ id: m.id, texto: (m.caption || '').slice(0, 90), fecha: m.timestamp, link: m.permalink }));
}

async function videosRecientesTT() {
  const videos = await tiktok.listarVideos();
  return videos.map(v => ({
    id: v.id, texto: (v.title || '').slice(0, 90),
    fecha: new Date(v.create_time * 1000).toISOString(), link: v.share_url,
  }));
}

// ── Cierre de la votación ───────────────────────────────────
// 15 min después de la primera publicación conocida: el botón
// "Ya publicamos" o la fecha real del primer reel vinculado.
// null = todavía no se publicó nada → sigue abierta.
function cierreDe(tanda, clips) {
  const ts = [tanda.publicado_at]
    .concat(clips.flatMap(c => [c.ig_publicado_at, c.tt_publicado_at]))
    .filter(Boolean)
    .map(t => new Date(t).getTime());
  return ts.length ? Math.min(...ts) + MIN_CIERRE * 60 * 1000 : null;
}

// ── Puntaje ─────────────────────────────────────────────────
// Tasa de engagement. IG: sobre alcance. TikTok: sobre views,
// porque su API no da alcance ni guardados.
function tasa(red, m) {
  if (!m) return null;
  if (red === 'ig') {
    return m.alcance ? (m.me_gusta + m.comentarios + m.guardados + m.compartidos) / m.alcance : 0;
  }
  return m.reproducciones ? (m.me_gusta + m.comentarios + m.compartidos) / m.reproducciones : 0;
}

// Tasas de los 3 clips en una red, o null si falta medir alguno.
function tasasDe(red, clips) {
  if (clips.length !== 3) return null;
  const out = {};
  for (const c of clips) {
    const t = tasa(red, c[red + '_metricas']);
    if (t === null) return null;
    out[c.letra] = t;
  }
  return out;
}

function ordenReal(tasas) {
  return LETRAS.slice().sort((x, y) => tasas[y] - tasas[x]);
}

// orden = ['B', 'A', 'C'] (del 1º al 3º). Un punto por cada par bien
// ordenado; medio punto si en la realidad empataron.
function puntosPorPares(orden, tasas) {
  let pts = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const a = tasas[orden[i]], b = tasas[orden[j]];
      if (a > b) pts += 1;
      else if (a === b) pts += 0.5;
    }
  }
  return pts;
}

// ── Medición a las 48 h (cron cada hora) ────────────────────
async function pendientes(red) {
  const limite = new Date(Date.now() - HORAS_MEDICION * 3600 * 1000).toISOString();
  const { data, error } = await supabase.from('pronos_clips').select('*')
    .not(ID_RED[red], 'is', null)
    .is(red + '_medido_at', null)
    .lte(red + '_publicado_at', limite);
  if (error) throw new Error(error.message);
  return data || [];
}

async function guardarMedicion(clip, red, metricas) {
  const { error } = await supabase.from('pronos_clips').update({
    [red + '_metricas']: metricas,
    [red + '_medido_at']: new Date().toISOString(),
  }).eq('id', clip.id);
  if (error) throw new Error(error.message);
}

async function runMedicionPronosticos() {
  let medidos = 0, errores = 0;

  if (igConfigurado()) {
    const { token } = igCfg();
    for (const c of await pendientes('ig')) {
      try {
        const ins = await insightsDeMedia(c.ig_media_id, 'reel', token);
        await guardarMedicion(c, 'ig', {
          alcance: ins.reach || 0,
          reproducciones: ins.views || 0,
          me_gusta: ins.likes || 0,
          comentarios: ins.comments || 0,
          guardados: ins.saved || 0,
          compartidos: ins.shares || 0,
        });
        medidos++;
      } catch (err) {
        errores++;
        console.error(`[Pronosticos] IG "${c.titulo}": ${err.message}`);
      }
    }
  }

  if (await tiktok.tiktokConectado()) {
    const pend = await pendientes('tt');
    if (pend.length) {
      try {
        const videos = await tiktok.consultarVideos(pend.map(c => c.tt_video_id));
        for (const c of pend) {
          const v = videos.find(x => x.id === c.tt_video_id);
          if (!v) {
            errores++;
            console.error(`[Pronosticos] TikTok "${c.titulo}": el video ya no aparece en la cuenta.`);
            continue;
          }
          await guardarMedicion(c, 'tt', {
            reproducciones: v.view_count || 0,
            me_gusta: v.like_count || 0,
            comentarios: v.comment_count || 0,
            compartidos: v.share_count || 0,
          });
          medidos++;
        }
      } catch (err) {
        errores++;
        console.error('[Pronosticos] TikTok:', err.message);
      }
    }
  }

  return { medidos, errores };
}

module.exports = {
  LETRAS, REDES, ID_RED,
  igConfigurado, reelsRecientesIG, videosRecientesTT,
  cierreDe, tasasDe, ordenReal, puntosPorPares,
  runMedicionPronosticos,
};
