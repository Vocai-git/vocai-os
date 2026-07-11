/* ============================================================
   VOCAI OS — Publicador de piezas del calendario
   Toma una pieza de content_pieces, resuelve su imagen
   (placa o carrusel del Generador) y la publica en IG + FB.
   ============================================================ */

const { supabase } = require('../config/supabase');
const meta = require('../config/meta');
const storage = require('../config/storage');

// Extrae la media asociada a una pieza desde el campo notas.
function mediaDePieza(notas) {
  const txt = notas || '';
  const tag = /\[media:([^\]]+)\]/.exec(txt);
  let ref = tag ? tag[1].trim() : '';
  if (!ref) {
    // compatibilidad con piezas viejas (sin marcador [media:])
    const car = /\/generador\/carruseles\/carrusel-[\w.-]+/.exec(txt);
    const his = /\/generador\/muestras\/[\w.-]+\.png/.exec(txt);
    ref = car ? car[0] : (his ? his[0] : '');
  }
  if (!ref) return null;
  const car = /\/carruseles\/(carrusel-[\w.-]+)/.exec(ref);
  if (car) return { tipo: 'carrusel', id: car[1] };
  if (/\.png(\?|$)/i.test(ref)) {
    return { tipo: 'imagen', ruta: ref.split('?')[0].replace(/^.*(\/generador\/)/, '$1') };
  }
  return null;
}

// URLs públicas (absolutas) de las imágenes de una pieza — desde Supabase Storage.
async function urlsDePieza(pieza) {
  const m = mediaDePieza(pieza.notas);
  if (!m) return null;
  if (m.tipo === 'imagen') {
    // m.ruta = /generador/muestras/pieza-X.png  →  muestras/pieza-X.png
    const sp = m.ruta.replace(/^\/generador\//, '');
    return { tipo: 'imagen', urls: [storage.urlPublica(sp)] };
  }

  // carrusel: leer meta.json de Storage para saber cuántas slides tiene
  const info = await storage.leerJson(`carruseles/${m.id}/meta.json`);
  if (!info) return null;
  const n = (info.slides || []).length;
  if (!n) return null;
  const urls = [];
  for (let i = 1; i <= n; i++) {
    urls.push(storage.urlPublica(`carruseles/${m.id}/slide-${i}.png`));
  }
  return { tipo: 'carrusel', urls };
}

// Texto del posteo. El copy del Generador viaja en las notas, después del
// marcador [media:...]; si hay un copy real, ese es el caption.
function captionDePieza(pieza) {
  let copy = (pieza.notas || '').replace(/\[media:[^\]]+\]\s*/g, '').trim();
  // descartar las descripciones genéricas viejas (no son un copy real)
  if (/^(Placa|Carrusel) del Generador\b/.test(copy)) copy = '';
  if (copy) return copy;
  let txt = pieza.titulo || '';
  if (pieza.cta) txt += '\n\n' + pieza.cta;
  return txt;
}

// Publica una pieza. Devuelve { ok, igId, fbId, error }.
// Los IDs que devuelve la Graph API se guardan en la pieza — son la
// llave para pedirle métricas (insights) después.
async function publicarPieza(pieza) {
  if (!meta.metaConfigurado()) {
    return { ok: false, error: 'Faltan las credenciales de Meta en el .env' };
  }
  const media = await urlsDePieza(pieza);
  if (!media) {
    return { ok: false, error: 'La pieza no tiene una imagen del Generador asociada' };
  }
  const { token, igUser, fbPage } = meta.cfg();
  const caption = captionDePieza(pieza);

  try {
    let igId = null, fbId = null, fbError = null;
    if (pieza.formato === 'story') {
      // historia → Instagram Story (una imagen)
      const r = await meta.publicarHistoriaInstagram(media.urls[0], token, igUser);
      igId = r && r.id || null;
    } else {
      if (media.tipo === 'carrusel') {
        const r = await meta.publicarCarruselInstagram(media.urls, caption, token, igUser);
        igId = r && r.id || null;
      } else {
        const r = await meta.publicarImagenInstagram(media.urls[0], caption, token, igUser);
        igId = r && r.id || null;
      }
      // FB va aparte: si falla, el post de IG ya salió — marcar error acá
      // haría que un reintento duplique la publicación en Instagram.
      try {
        const f = await meta.publicarFacebook(media.urls, caption, token, fbPage);
        fbId = f && (f.post_id || f.id) || null;
      } catch (e) {
        fbError = e.message;
        console.error(`[Publisher] FB falló para "${pieza.titulo}" (IG ya publicado): ${fbError}`);
      }
    }
    return { ok: true, igId, fbId, fbError };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Reclama una pieza para publicarla (estado → 'publicando') de forma atómica.
// Devuelve true si esta corrida la tomó; false si otra ya la está publicando.
// Evita la doble publicación cuando dos corridas del cron se solapan.
async function reclamarPieza(id, desdeEstado) {
  let q = supabase.from('content_pieces')
    .update({ estado: 'publicando', updated_at: new Date().toISOString() })
    .eq('id', id)
    .neq('estado', 'publicando');
  if (desdeEstado) q = q.eq('estado', desdeEstado);
  const { data, error } = await q.select('id');
  return !error && !!(data && data.length);
}

// Marca el estado de una pieza en Supabase (+ campos extra, ej. ig_media_id).
async function marcarEstado(id, estado, extra) {
  const base = { estado, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('content_pieces')
    .update({ ...base, ...(extra || {}) }).eq('id', id);
  if (error && extra) {
    // si las columnas nuevas todavía no están migradas, no perder el estado
    await supabase.from('content_pieces').update(base).eq('id', id);
  }
}

// Campos extra a guardar según el resultado de la publicación.
function idsDeResultado(r) {
  const extra = {};
  if (r.igId) extra.ig_media_id = r.igId;
  if (r.fbId) extra.fb_post_id = r.fbId;
  return Object.keys(extra).length ? extra : null;
}

// Publica una pieza por id (uso manual desde el dashboard).
async function publicarPiezaPorId(id) {
  const { data: pieza, error } = await supabase
    .from('content_pieces').select('*').eq('id', id).single();
  if (error || !pieza) throw new Error('No se encontró la pieza');
  const tomada = await reclamarPieza(id);
  if (!tomada) throw new Error('La pieza ya se está publicando');
  const r = await publicarPieza(pieza);
  await marcarEstado(id, r.ok ? 'publicada' : 'error', r.ok ? idsDeResultado(r) : null);
  if (!r.ok) throw new Error(r.error);
  return { ok: true };
}

// Publicación automática: piezas con publish_at <= ahora y estado 'lista'.
// Si publish_at es null, la pieza no se autopublica (es manual desde el dashboard).
let corridaEnCurso = false;   // una corrida lenta (carruseles) no debe solaparse con el próximo tick
async function correrPublicaciones() {
  if (!meta.metaConfigurado()) {
    console.log('[Publisher] Sin credenciales Meta — no se publica.');
    return { publicadas: 0, errores: 0 };
  }
  if (corridaEnCurso) {
    console.log('[Publisher] Corrida anterior todavía en curso — se saltea este tick.');
    return { publicadas: 0, errores: 0 };
  }
  corridaEnCurso = true;
  try {
    const ahora = new Date().toISOString();
    const { data: piezas, error } = await supabase
      .from('content_pieces').select('*')
      .not('publish_at', 'is', null)
      .lte('publish_at', ahora)
      .eq('estado', 'lista');
    if (error) {
      console.error('[Publisher] Error leyendo el calendario:', error.message);
      return { publicadas: 0, errores: 0 };
    }

    let pub = 0, err = 0;
    for (const pieza of piezas || []) {
      if (!mediaDePieza(pieza.notas)) continue;   // sin imagen → se ignora
      const tomada = await reclamarPieza(pieza.id, 'lista');
      if (!tomada) continue;                       // otra corrida ya la tiene
      const r = await publicarPieza(pieza);
      await marcarEstado(pieza.id, r.ok ? 'publicada' : 'error', r.ok ? idsDeResultado(r) : null);
      if (r.ok) { pub++; console.log(`[Publisher] Publicada: ${pieza.titulo}`); }
      else { err++; console.error(`[Publisher] Error en "${pieza.titulo}": ${r.error}`); }
    }
    return { publicadas: pub, errores: err };
  } finally {
    corridaEnCurso = false;
  }
}

module.exports = { publicarPieza, publicarPiezaPorId, correrPublicaciones, captionDePieza };
