/* ============================================================
   VOCAI OS — Métricas de marketing (Meta Insights)
   Cierra el loop del departamento: lee de la Graph API el
   rendimiento de cada pieza publicada (alcance, me gusta,
   guardados, compartidos…) y un snapshot diario de la cuenta
   de IG (seguidores, alcance del día). Guarda todo en Supabase
   (content_metrics + account_metrics) para el módulo Analítica.
   ============================================================ */

const { supabase } = require('../config/supabase');
const meta = require('../config/meta');
const { captionDePieza } = require('./publisher');

// Solo se piden métricas de piezas de los últimos N días — los
// totales de piezas más viejas ya no cambian de forma relevante.
const DIAS_VENTANA = 60;

// ── Insights de un media de Instagram ───────────────────────
// La Graph API rechaza la request entera si un metric no aplica
// al tipo de media, así que se prueban sets de mayor a menor.
const SETS_FEED = [
  'reach,likes,comments,saved,shares,views',
  'reach,likes,comments,saved,shares',
  'reach',
];
const SETS_STORY = ['reach,views', 'reach'];

async function insightsDeMedia(mediaId, formato, token) {
  const sets = formato === 'story' ? SETS_STORY : SETS_FEED;
  for (const metricas of sets) {
    try {
      const d = await meta.graphGet(`${mediaId}/insights`, {
        metric: metricas, access_token: token,
      });
      const out = {};
      for (const m of d.data || []) {
        out[m.name] = (m.values && m.values[0] && m.values[0].value) ||
                      (m.total_value && m.total_value.value) || 0;
      }
      return out;
    } catch (err) {
      // probar el set siguiente; si era el último, propagar
      if (metricas === sets[sets.length - 1]) throw err;
    }
  }
  return {};
}

// ── Vincular piezas viejas sin ig_media_id ──────────────────
// Las piezas publicadas antes de que el publisher guardara el ID
// se matchean contra los últimos medias de la cuenta por caption.
async function vincularMediaIds(token, igUser) {
  const { data: sueltas } = await supabase
    .from('content_pieces').select('*')
    .eq('estado', 'publicada')
    .is('ig_media_id', null);
  if (!sueltas || !sueltas.length) return 0;

  const d = await meta.graphGet(`${igUser}/media`, {
    fields: 'id,caption,timestamp', limit: '50', access_token: token,
  });
  const medias = d.data || [];
  const clave = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase();

  let vinculadas = 0;
  for (const pieza of sueltas) {
    const k = clave(captionDePieza(pieza));
    if (!k) continue;
    const m = medias.find(x => clave(x.caption) === k);
    if (!m) continue;
    const { error } = await supabase.from('content_pieces')
      .update({ ig_media_id: m.id }).eq('id', pieza.id);
    if (!error) vinculadas++;
  }
  return vinculadas;
}

// ── Snapshot diario de la cuenta ────────────────────────────
async function snapshotCuenta(token, igUser) {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const fila = { fecha: hoy };

  const perfil = await meta.graphGet(igUser, {
    fields: 'followers_count', access_token: token,
  });
  fila.seguidores = perfil.followers_count || 0;

  try {
    const d = await meta.graphGet(`${igUser}/insights`, {
      metric: 'reach', period: 'day', access_token: token,
    });
    const serie = (d.data || []).find(x => x.name === 'reach');
    const vals = (serie && serie.values) || [];
    fila.alcance_dia = vals.length ? (vals[vals.length - 1].value || 0) : 0;
  } catch { /* reach diario no disponible — el snapshot de seguidores vale igual */ }

  try {
    const d = await meta.graphGet(`${igUser}/insights`, {
      metric: 'profile_views', period: 'day', metric_type: 'total_value',
      access_token: token,
    });
    const serie = (d.data || [])[0];
    fila.visitas_perfil = (serie && serie.total_value && serie.total_value.value) || 0;
  } catch { /* métrica opcional */ }

  await supabase.from('account_metrics').upsert(fila, { onConflict: 'fecha' });
  return fila;
}

// ── Corrida completa ────────────────────────────────────────
async function runMetricas() {
  if (!meta.metaConfigurado()) {
    console.log('[Metricas] Sin credenciales Meta — no se actualizan métricas.');
    return { actualizadas: 0, vinculadas: 0, errores: 0 };
  }
  const { token, igUser } = meta.cfg();

  let vinculadas = 0;
  try {
    vinculadas = await vincularMediaIds(token, igUser);
    if (vinculadas) console.log(`[Metricas] ${vinculadas} piezas viejas vinculadas a su media de IG.`);
  } catch (err) {
    console.error('[Metricas] Error vinculando piezas viejas:', err.message);
  }

  const desde = new Date(Date.now() - DIAS_VENTANA * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { data: piezas, error } = await supabase
    .from('content_pieces').select('*')
    .eq('estado', 'publicada')
    .not('ig_media_id', 'is', null)
    .gte('fecha', desde);
  if (error) throw new Error('Leyendo piezas publicadas: ' + error.message);

  let actualizadas = 0, errores = 0;
  for (const pieza of piezas || []) {
    try {
      const ins = await insightsDeMedia(pieza.ig_media_id, pieza.formato, token);
      const fila = {
        pieza_id: pieza.id,
        ig_media_id: pieza.ig_media_id,
        alcance: ins.reach || 0,
        reproducciones: ins.views || 0,
        me_gusta: ins.likes || 0,
        comentarios: ins.comments || 0,
        guardados: ins.saved || 0,
        compartidos: ins.shares || 0,
        interacciones: (ins.likes || 0) + (ins.comments || 0) + (ins.saved || 0) + (ins.shares || 0),
        fetched_at: new Date().toISOString(),
      };
      const { error: e2 } = await supabase
        .from('content_metrics').upsert(fila, { onConflict: 'pieza_id' });
      if (e2) throw new Error(e2.message);
      actualizadas++;
    } catch (err) {
      errores++;
      console.error(`[Metricas] Error en "${pieza.titulo}": ${err.message}`);
    }
  }

  try {
    const snap = await snapshotCuenta(token, igUser);
    console.log(`[Metricas] Snapshot de cuenta — ${snap.seguidores} seguidores.`);
  } catch (err) {
    errores++;
    console.error('[Metricas] Error en el snapshot de cuenta:', err.message);
  }

  return { actualizadas, vinculadas, errores };
}

module.exports = { runMetricas };
