/* ============================================================
   VOCAI OS — Inventario de contenido de Instagram
   Trae de la Graph API TODO lo publicado en la cuenta (feed +
   reels + carruseles), con sus métricas, y lo guarda en
   ig_media_inventory. A diferencia de metricas.js (que sólo mira
   las piezas del calendario), esto captura TAMBIÉN los reels que
   se suben a mano — que son los que más importan para analizar
   retención. La clasificación de IA la agrega clasificar-contenido.js.

   Límite conocido de la API: NO existe la curva de retención
   segundo a segundo (eso vive sólo en la app de Instagram). Lo
   que sí da y guardamos: tiempo MEDIO visto y tiempo TOTAL visto.
   ============================================================ */

const { supabase } = require('../config/supabase');
const meta = require('../config/meta');

// Cuántas páginas de 50 medias traer como máximo (evita bucles largos).
const MAX_PAGINAS = 12;

// La Graph API rechaza la request entera si un metric no aplica al
// tipo de media, así que se prueban sets de mayor a menor detalle.
const SETS_REELS = [
  'reach,plays,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time',
  'reach,plays,likes,comments,saved,shares,ig_reels_avg_watch_time,ig_reels_video_view_total_time',
  'reach,plays,ig_reels_avg_watch_time',
  'reach,plays',
  'reach',
];
const SETS_FEED = [
  'reach,likes,comments,saved,shares,views',
  'reach,likes,comments,saved,shares',
  'reach,likes,comments',
  'reach',
];

// Insights de un media — devuelve un objeto plano { metric: valor }.
async function insightsDeMedia(mediaId, productType, token) {
  const sets = productType === 'REELS' ? SETS_REELS : SETS_FEED;
  for (const metric of sets) {
    try {
      const d = await meta.graphGet(`${mediaId}/insights`, { metric, access_token: token });
      const out = {};
      for (const m of d.data || []) {
        out[m.name] = (m.values && m.values[0] && m.values[0].value) ??
                      (m.total_value && m.total_value.value) ?? 0;
      }
      return out;
    } catch (err) {
      if (metric === sets[sets.length - 1]) throw err;   // se acabaron los sets
    }
  }
  return {};
}

// Trae todos los medias de la cuenta (paginado).
async function traerMedias(token, igUser) {
  const medias = [];
  let after = null;
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const params = {
      fields: 'id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url',
      limit: '50', access_token: token,
    };
    if (after) params.after = after;
    const d = await meta.graphGet(`${igUser}/media`, params);
    (d.data || []).forEach(m => medias.push(m));
    after = d.paging && d.paging.cursors && d.paging.cursors.after;
    if (!after || !(d.paging && d.paging.next)) break;
  }
  return medias;
}

// Mapea las métricas crudas de la API a las columnas de la tabla.
function filaMetricas(ins) {
  const likes = ins.likes || 0, comments = ins.comments || 0;
  const saved = ins.saved || 0, shares = ins.shares || 0;
  const interacciones = ins.total_interactions || (likes + comments + saved + shares);
  return {
    alcance: ins.reach || 0,
    reproducciones: ins.plays || ins.views || 0,
    me_gusta: likes,
    comentarios: comments,
    guardados: saved,
    compartidos: shares,
    interacciones,
    avg_watch_time_ms: ins.ig_reels_avg_watch_time || 0,
    total_watch_time_ms: ins.ig_reels_video_view_total_time || 0,
  };
}

// ── Corrida completa ────────────────────────────────────────
async function runInventario() {
  if (!meta.metaConfigurado()) {
    console.log('[Inventario] Sin credenciales Meta — no se sincroniza el inventario.');
    return { total: 0, reels: 0, actualizadas: 0, errores: 0 };
  }
  const { token, igUser } = meta.cfg();

  let medias;
  try {
    medias = await traerMedias(token, igUser);
  } catch (err) {
    throw new Error('Trayendo el inventario de IG: ' + err.message);
  }

  let actualizadas = 0, errores = 0, reels = 0;
  for (const m of medias) {
    if (m.media_product_type === 'REELS') reels++;
    let ins = {};
    try {
      ins = await insightsDeMedia(m.id, m.media_product_type, token);
    } catch (err) {
      // Un media sin insights (muy viejo, story caducada, ad) no frena la corrida.
      errores++;
      console.error(`[Inventario] Insights fallaron para ${m.id}: ${err.message}`);
    }
    // OJO: no se incluyen los campos de clasificación IA en el upsert —
    // así una sync de métricas NO pisa lo que clasificar-contenido.js escribió.
    const fila = {
      ig_media_id: m.id,
      media_type: m.media_type || null,
      media_product_type: m.media_product_type || null,
      caption: m.caption || null,
      permalink: m.permalink || null,
      thumbnail_url: m.thumbnail_url || null,
      published_at: m.timestamp || null,
      ...filaMetricas(ins),
      fetched_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('ig_media_inventory').upsert(fila, { onConflict: 'ig_media_id' });
    if (error) { errores++; console.error(`[Inventario] Upsert falló para ${m.id}: ${error.message}`); }
    else actualizadas++;
  }

  console.log(`[Inventario] ${actualizadas}/${medias.length} medias sincronizados (${reels} reels), ${errores} errores.`);
  return { total: medias.length, reels, actualizadas, errores };
}

module.exports = { runInventario };
