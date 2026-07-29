/* ============================================================
   VOCAI OS — Análisis de contenido
   Sobre el inventario real de IG (ig_media_inventory), calcula qué
   funciona: agregados por ángulo, tema, gancho y formato + ranking
   de retención de reels + conclusiones accionables generadas por IA.
   ============================================================ */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const gemini = require('../config/gemini');
const { runInventario } = require('../automations/inventario-ig');
const { runClasificacion } = require('../automations/clasificar-contenido');

// Formatos que analizamos (stories caducan, ads no son orgánico).
const FORMATOS_ORGANICOS = ['REELS', 'FEED', 'CAROUSEL', 'CAROUSEL_ALBUM'];

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// Tasa de interacción de una pieza: interacciones / alcance (en %).
function tasaInteraccion(m) {
  return m.alcance > 0 ? (m.interacciones / m.alcance) * 100 : 0;
}

// Retención media aproximada en %: sólo si conocemos la duración del reel.
function retencionPct(m) {
  if (!m.duracion_seg || !m.avg_watch_time_ms) return null;
  return Math.min(100, (m.avg_watch_time_ms / 1000 / m.duracion_seg) * 100);
}

// Agrega un conjunto de medias por un campo de clasificación.
function agregarPor(medias, campo) {
  const g = {};
  for (const m of medias) {
    const k = (m[campo] || 'otro');
    if (!g[k]) g[k] = { clave: k, n: 0, alcance: 0, interacciones: 0, guardados: 0,
                        compartidos: 0, sumaTasa: 0, sumaWatch: 0, nReels: 0 };
    const a = g[k];
    a.n++;
    a.alcance += num(m.alcance);
    a.interacciones += num(m.interacciones);
    a.guardados += num(m.guardados);
    a.compartidos += num(m.compartidos);
    a.sumaTasa += tasaInteraccion(m);
    if (m.media_product_type === 'REELS' && m.avg_watch_time_ms) {
      a.sumaWatch += num(m.avg_watch_time_ms); a.nReels++;
    }
  }
  return Object.values(g).map(a => ({
    clave: a.clave,
    n: a.n,
    alcanceMedio: Math.round(a.alcance / a.n),
    interaccionMedia: Math.round(a.interacciones / a.n),
    guardadosMedios: Math.round(a.guardados / a.n),
    tasaInteraccion: +(a.sumaTasa / a.n).toFixed(2),
    watchMedioSeg: a.nReels ? +(a.sumaWatch / a.nReels / 1000).toFixed(1) : null,
  })).sort((x, y) => y.tasaInteraccion - x.tasaInteraccion);
}

// Lee el inventario dentro de una ventana de días.
async function leerInventario(dias) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('ig_media_inventory').select('*')
    .gte('published_at', desde)
    .order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).filter(m => FORMATOS_ORGANICOS.includes(m.media_product_type));
}

// GET /api/analisis-contenido?dias=90
router.get('/', auth, async (req, res) => {
  try {
    const dias = Math.min(365, Math.max(7, parseInt(req.query.dias, 10) || 90));
    const medias = await leerInventario(dias);
    const reels = medias.filter(m => m.media_product_type === 'REELS');

    // Ranking de retención de reels (por tiempo medio visto).
    const rankingReels = [...reels]
      .filter(m => m.avg_watch_time_ms)
      .sort((a, b) => b.avg_watch_time_ms - a.avg_watch_time_ms)
      .slice(0, 20)
      .map(m => ({
        ig_media_id: m.ig_media_id,
        caption: (m.caption || '').slice(0, 120),
        permalink: m.permalink,
        thumbnail_url: m.thumbnail_url,
        angulo: m.angulo, tema: m.tema, gancho: m.gancho,
        alcance: m.alcance, reproducciones: m.reproducciones,
        watchMedioSeg: +(m.avg_watch_time_ms / 1000).toFixed(1),
        retencionPct: retencionPct(m),
      }));

    const totalPiezas = medias.length;
    const sinClasificar = medias.filter(m => !m.clasificado_at).length;

    res.json({
      dias,
      resumen: {
        piezas: totalPiezas,
        reels: reels.length,
        sinClasificar,
        alcanceTotal: medias.reduce((s, m) => s + num(m.alcance), 0),
        interaccionesTotal: medias.reduce((s, m) => s + num(m.interacciones), 0),
      },
      porAngulo:  agregarPor(medias, 'angulo'),
      porTema:    agregarPor(medias, 'tema').slice(0, 15),
      porGancho:  agregarPor(medias, 'gancho'),
      porFormato: agregarPor(medias, 'media_product_type'),
      porPilar:   agregarPor(medias, 'pilar'),
      rankingReels,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analisis-contenido/sincronizar
// Trae el inventario fresco de la Graph API y clasifica lo nuevo.
router.post('/sincronizar', auth, async (req, res) => {
  try {
    const inv = await runInventario();
    let clas = { clasificadas: 0, errores: 0 };
    try { clas = await runClasificacion({ soloNuevas: true }); }
    catch (e) { console.error('[Analisis] Clasificación falló:', e.message); }
    res.json({ ok: true, inventario: inv, clasificacion: clas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analisis-contenido/conclusiones
// Genera conclusiones accionables con IA sobre los agregados del período.
router.post('/conclusiones', auth, async (req, res) => {
  try {
    const dias = Math.min(365, Math.max(7, parseInt(req.body && req.body.dias, 10) || 90));
    const medias = await leerInventario(dias);
    if (medias.length < 3) {
      return res.status(400).json({ error: 'Muy poco contenido para sacar conclusiones (mínimo 3 piezas con datos).' });
    }

    const resumen = {
      piezas: medias.length,
      porAngulo:  agregarPor(medias, 'angulo'),
      porGancho:  agregarPor(medias, 'gancho'),
      porFormato: agregarPor(medias, 'media_product_type'),
      porTema:    agregarPor(medias, 'tema').slice(0, 10),
      topReels:   [...medias].filter(m => m.media_product_type === 'REELS' && m.avg_watch_time_ms)
                    .sort((a, b) => b.avg_watch_time_ms - a.avg_watch_time_ms).slice(0, 5)
                    .map(m => ({ tema: m.tema, angulo: m.angulo, gancho: m.gancho,
                                 watchSeg: +(m.avg_watch_time_ms / 1000).toFixed(1), alcance: m.alcance })),
    };

    const sys =
`Eres analista de contenido de VOCAI (IA y automatización, Alicante, con estudio de
grabación). Te paso datos AGREGADOS del rendimiento del contenido en Instagram de
los últimos ${dias} días. "tasaInteraccion" es interacciones/alcance en %.
"watchMedioSeg" es el tiempo medio que la gente ve un reel (proxy de retención; la
API no da la curva segundo a segundo).

Saca conclusiones ACCIONABLES, concretas y honestas — nada de generalidades. Si la
muestra es chica, dilo. Apóyate en los números (cítalos). Español de España, tuteo,
directo, sin floreo corporativo.

Devuelve SÓLO un JSON, sin markdown:
{
  "hallazgos": ["3-5 frases: qué ángulo/gancho/tema/formato rinde más y cuál menos, con el dato"],
  "recomendaciones": ["3-5 frases: qué producir más, qué formato, qué gancho probar"],
  "que_evitar": ["1-3 frases: qué está rindiendo mal y conviene dejar de hacer"]
}`;

    const txt = await gemini.llamarTexto({
      sys, user: 'Datos:\n' + JSON.stringify(resumen, null, 2), json: true,
    });
    let conclusiones;
    try {
      conclusiones = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
    } catch (e) {
      throw new Error('La IA no devolvió conclusiones en JSON válido');
    }

    await supabase.from('content_insights').insert({
      ventana_dias: dias, n_piezas: medias.length, conclusiones,
    });
    res.json({ ok: true, generado_at: new Date().toISOString(), n_piezas: medias.length, conclusiones });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analisis-contenido/conclusiones → la última generada.
router.get('/conclusiones', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('content_insights').select('*')
      .order('generado_at', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    res.json(data && data[0] ? data[0] : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
