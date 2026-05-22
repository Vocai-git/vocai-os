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

// Texto del posteo.
function captionDePieza(pieza) {
  let txt = pieza.titulo || '';
  if (pieza.cta) txt += '\n\n' + pieza.cta;
  return txt;
}

// Publica una pieza. Devuelve { ok, error }.
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
    if (pieza.formato === 'story') {
      // historia → Instagram Story (una imagen)
      await meta.publicarHistoriaInstagram(media.urls[0], token, igUser);
    } else if (media.tipo === 'carrusel') {
      await meta.publicarCarruselInstagram(media.urls, caption, token, igUser);
      await meta.publicarFacebook(media.urls, caption, token, fbPage);
    } else {
      await meta.publicarImagenInstagram(media.urls[0], caption, token, igUser);
      await meta.publicarFacebook(media.urls, caption, token, fbPage);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Marca el estado de una pieza en Supabase.
async function marcarEstado(id, estado) {
  await supabase.from('content_pieces')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id);
}

// Publica una pieza por id (uso manual desde el dashboard).
async function publicarPiezaPorId(id) {
  const { data: pieza, error } = await supabase
    .from('content_pieces').select('*').eq('id', id).single();
  if (error || !pieza) throw new Error('No se encontró la pieza');
  const r = await publicarPieza(pieza);
  await marcarEstado(id, r.ok ? 'publicada' : 'error');
  if (!r.ok) throw new Error(r.error);
  return { ok: true };
}

// Publicación automática: piezas con fecha <= hoy y estado 'lista'.
async function correrPublicaciones() {
  if (!meta.metaConfigurado()) {
    console.log('[Publisher] Sin credenciales Meta — no se publica.');
    return { publicadas: 0, errores: 0 };
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: piezas, error } = await supabase
    .from('content_pieces').select('*')
    .lte('fecha', hoy).eq('estado', 'lista');
  if (error) {
    console.error('[Publisher] Error leyendo el calendario:', error.message);
    return { publicadas: 0, errores: 0 };
  }

  let pub = 0, err = 0;
  for (const pieza of piezas || []) {
    if (!mediaDePieza(pieza.notas)) continue;   // sin imagen → se ignora
    const r = await publicarPieza(pieza);
    await marcarEstado(pieza.id, r.ok ? 'publicada' : 'error');
    if (r.ok) { pub++; console.log(`[Publisher] Publicada: ${pieza.titulo}`); }
    else { err++; console.error(`[Publisher] Error en "${pieza.titulo}": ${r.error}`); }
  }
  return { publicadas: pub, errores: err };
}

module.exports = { publicarPieza, publicarPiezaPorId, correrPublicaciones };
