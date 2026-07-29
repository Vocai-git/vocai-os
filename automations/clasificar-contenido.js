/* ============================================================
   VOCAI OS — Clasificador de contenido (Gemini)
   Lee el inventario de IG y etiqueta cada media con una taxonomía
   cerrada (ángulo, gancho, tono, pilar) + un tema libre corto y un
   resumen de una frase. Eso es lo que hace comparable el análisis:
   permite agrupar "qué ángulos funcionan" y "qué temas interesan".

   Clasifica SÓLO lo nuevo (clasificado_at IS NULL) salvo que se
   pida re-clasificar. Va en lotes para ahorrar llamadas/coste.
   ============================================================ */

const { supabase } = require('../config/supabase');
const gemini = require('../config/gemini');

const LOTE = 12;   // medias por llamada a Gemini

// ── Taxonomía cerrada (mantener sincronizada con la vista) ───
const ANGULOS = ['educativo', 'problema-solucion', 'detras-de-escena', 'dato-resultado',
                 'contraintuitivo', 'testimonial', 'oferta-servicio', 'inspiracional',
                 'novedad', 'otro'];
const GANCHOS = ['pregunta', 'dato-impactante', 'afirmacion-fuerte', 'historia',
                 'promesa', 'curiosidad', 'negacion', 'otro'];
const TONOS   = ['informativo', 'cercano', 'provocador', 'aspiracional', 'humoristico', 'serio'];
const PILARES = ['ia', 'estudio', 'casos', 'personas'];

const SYS =
`Eres analista de contenido de VOCAI — empresa de IA y automatización en Alicante
con estudio de grabación propio (pilares de contenido: ia, estudio, casos, personas).

Te paso una lista de publicaciones de Instagram (cada una con su id, el tipo de
media y el texto del posteo). Clasificas CADA una para poder analizar después qué
funciona. Devuelves SÓLO un JSON, sin markdown, con esta forma exacta:

{ "items": [ { "id": "...", "pilar": "...", "angulo": "...", "gancho": "...",
               "tema": "...", "tono": "...", "resumen": "..." } ] }

Reglas de cada campo (usa EXACTAMENTE uno de los valores permitidos):
- "pilar": ${PILARES.join(' | ')}.
- "angulo": ${ANGULOS.join(' | ')}.
- "gancho": ${GANCHOS.join(' | ')} — el recurso con el que abre el texto.
- "tono": ${TONOS.join(' | ')}.
- "tema": TEXTO LIBRE corto en minúsculas, 2 a 4 palabras, el asunto concreto
  (ej: "automatización whatsapp", "grabación podcast", "chatbot atención").
  Normalízalo: mismo asunto = mismas palabras, para poder agrupar.
- "resumen": 1 frase corta (máx 15 palabras) de qué va la pieza.

Si una pieza no tiene texto (o casi), infiere del tipo de media y marca lo que
no puedas deducir como "otro". Devuelve un item por CADA id que te paso, con su id.`;

// Clasifica un lote de medias. Devuelve un mapa { id: clasificacion }.
async function clasificarLote(medias) {
  const payload = medias.map(m => ({
    id: m.ig_media_id,
    tipo: m.media_product_type || m.media_type || 'FEED',
    texto: (m.caption || '').slice(0, 600),
  }));
  const txt = await gemini.llamarTexto({
    sys: SYS,
    user: 'Publicaciones a clasificar:\n' + JSON.stringify(payload, null, 2),
    json: true,
  });
  let data;
  try {
    data = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
  } catch (e) {
    throw new Error('Gemini no devolvió un JSON válido de clasificación');
  }
  const out = {};
  for (const it of (data.items || [])) {
    if (!it || !it.id) continue;
    out[String(it.id)] = {
      pilar:   PILARES.includes(it.pilar) ? it.pilar : 'ia',
      angulo:  ANGULOS.includes(it.angulo) ? it.angulo : 'otro',
      gancho:  GANCHOS.includes(it.gancho) ? it.gancho : 'otro',
      tono:    TONOS.includes(it.tono) ? it.tono : 'informativo',
      tema:    (it.tema || '').toString().trim().toLowerCase().slice(0, 60) || 'sin tema',
      resumen: (it.resumen || '').toString().trim().slice(0, 200),
    };
  }
  return out;
}

// ── Corrida completa ────────────────────────────────────────
// soloNuevas=true → sólo las que no tienen clasificado_at.
async function runClasificacion({ soloNuevas = true } = {}) {
  let q = supabase.from('ig_media_inventory')
    .select('ig_media_id, media_type, media_product_type, caption')
    .order('published_at', { ascending: false });
  if (soloNuevas) q = q.is('clasificado_at', null);

  const { data: medias, error } = await q;
  if (error) throw new Error('Leyendo el inventario: ' + error.message);
  if (!medias || !medias.length) return { clasificadas: 0, errores: 0 };

  let clasificadas = 0, errores = 0;
  for (let i = 0; i < medias.length; i += LOTE) {
    const lote = medias.slice(i, i + LOTE);
    let mapa;
    try {
      mapa = await clasificarLote(lote);
    } catch (err) {
      errores += lote.length;
      console.error(`[Clasificar] Lote ${i / LOTE + 1} falló: ${err.message}`);
      continue;
    }
    for (const m of lote) {
      const c = mapa[m.ig_media_id];
      if (!c) { errores++; continue; }
      const { error: e2 } = await supabase.from('ig_media_inventory')
        .update({ ...c, clasificado_at: new Date().toISOString() })
        .eq('ig_media_id', m.ig_media_id);
      if (e2) { errores++; console.error(`[Clasificar] Update ${m.ig_media_id}: ${e2.message}`); }
      else clasificadas++;
    }
  }

  console.log(`[Clasificar] ${clasificadas} piezas clasificadas, ${errores} errores.`);
  return { clasificadas, errores };
}

module.exports = { runClasificacion, ANGULOS, GANCHOS, TONOS, PILARES };
