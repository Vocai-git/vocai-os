const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const claude = require('../config/claude');

// GET /api/marketing-planning?mes=YYYY-MM
// Devuelve el plan del mes + el mix de pilares calculado del calendario.
router.get('/', auth, async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);

  const { data: plan, error } = await supabase
    .from('content_months').select('*').eq('mes', mes).single();
  if (error && error.code !== 'PGRST116')
    return res.status(500).json({ error: error.message });

  // Mix: piezas del mes agrupadas por pilar
  const [year, month] = mes.split('-');
  const from = `${year}-${month}-01`;
  const to = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
  const { data: piezas } = await supabase
    .from('content_pieces').select('pilar').gte('fecha', from).lte('fecha', to);

  const mix = { ia: 0, estudio: 0, casos: 0, personas: 0 };
  (piezas || []).forEach(p => { if (mix[p.pilar] !== undefined) mix[p.pilar]++; });

  res.json({ plan: plan || null, mix, total: (piezas || []).length, mes });
});

// POST /api/marketing-planning  → crear o actualizar el plan del mes
router.post('/', auth, async (req, res) => {
  const mes = req.body.mes || new Date().toISOString().slice(0, 7);
  const { data: existing } = await supabase
    .from('content_months').select('id').eq('mes', mes).single();

  let result;
  if (existing) {
    const { data, error } = await supabase
      .from('content_months')
      .update({ ...req.body, mes, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    result = data;
  } else {
    const { data, error } = await supabase
      .from('content_months').insert([{ ...req.body, mes }]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    result = data;
  }
  res.json(result);
});

/* ── Planificador de historias con IA ─────────────────────────
   POST /proponer → la IA arma un plan de N historias para el mes
   (título + fecha + pilar + categoría + diseño) usando los
   objetivos del mes y el banco de temas del Radar. NO guarda nada:
   devuelve la propuesta para que el humano la edite y confirme.
   ============================================================ */

const PILARES = ['ia', 'estudio', 'casos', 'personas'];
const CATEGORIAS = ['novedad', 'educativo', 'caso', 'interno'];
const DISENOS = ['clasico', 'brutal', 'aurora'];

router.post('/proponer', auth, async (req, res) => {
  const mes = req.body.mes || new Date().toISOString().slice(0, 7);
  const cantidad = Math.min(Math.max(parseInt(req.body.cantidad) || 20, 1), 40);
  const indicaciones = (req.body.indicaciones || '').trim();

  const [year, month] = mes.split('-');
  const from = `${year}-${month}-01`;
  const ultimoDia = new Date(year, parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(ultimoDia).padStart(2, '0')}`;

  try {
    const [{ data: plan }, { data: existentes }, { data: temas }] = await Promise.all([
      supabase.from('content_months').select('*').eq('mes', mes).single(),
      supabase.from('content_pieces').select('fecha,titulo,formato')
        .gte('fecha', from).lte('fecha', to).eq('formato', 'story'),
      supabase.from('content_topics').select('titulo,pilar,angulo,fuente')
        .eq('estado', 'nuevo').order('created_at', { ascending: false }).limit(40),
    ]);

    const hoy = new Date().toISOString().slice(0, 10);
    const desde = (hoy > from && hoy <= to) ? hoy : from;

    const system = `Eres el planificador editorial de VOCAI, empresa de IA y automatización en Alicante con estudio de grabación propio. Tagline: "La voz de tu negocio". Lógica de marca: el estudio es la puerta, la IA es el destino.

REGLAS INNEGOCIABLES:
- Copy en español de España con TUTEO ("haces", "ven", "automatiza"). Nunca voseo.
- Títulos cortos y punchy para una placa de historia de Instagram: máximo 8 palabras, sin emojis, sin comillas.
- Copy honesto: nunca prometer algo que VOCAI no hace. El único caso real citable es Pizzería Popular España (Santi gestionó su cuenta de 0 a 22K seguidores en 3 años) — no inventes otros casos ni cifras.
- Pilares: ia (autoridad, "automatiza tu negocio"), estudio (atracción, "ven a grabar a Alicante"), casos (conversión), personas (conexión, Santi y Agus).
- Mix por defecto si el humano no pide otro: aprox 40% ia, 25% estudio, 15% casos, 20% personas.
- Categorías de placa: novedad (noticias de IA), educativo (tips/errores/cómo funciona), caso (casos reales), interno (VOCAI por dentro, el estudio, las personas).
- Diseños disponibles: clasico (con imagen de fondo, versátil), brutal (tipografía gigante, para títulos fuertes y polémicos), aurora (sin imagen, gradiente de marca, para frases directas). Varía entre los tres.

Respondes ÚNICAMENTE con un array JSON válido, sin markdown, sin texto antes ni después. Cada elemento: {"fecha":"YYYY-MM-DD","titulo":"...","pilar":"ia|estudio|casos|personas","categoria":"novedad|educativo|caso|interno","diseno":"clasico|brutal|aurora","angulo":"1 frase con el enfoque de la pieza"}`;

    const temasTxt = (temas || []).length
      ? 'BANCO DE TEMAS del Radar (usa los que sirvan como novedades):\n' +
        temas.map(t => `- [${t.pilar || 'ia'}] ${t.titulo}${t.angulo ? ' · ' + t.angulo : ''}`).join('\n')
      : 'No hay temas en el banco — propón temas propios de los pilares.';
    const ocupadasTxt = (existentes || []).length
      ? 'Historias YA planificadas este mes (no las dupliques, reparte alrededor):\n' +
        existentes.map(p => `- ${p.fecha}: ${p.titulo}`).join('\n')
      : 'No hay historias planificadas este mes todavía.';
    const planTxt = plan && (plan.objetivos || plan.foco)
      ? `Objetivos del mes: ${plan.objetivos || '—'}\nFoco del mes: ${plan.foco || '—'}\nPuntual del mes: ${plan.puntual || '—'}`
      : 'No hay objetivos cargados para este mes — usa el mix por defecto.';

    const pedido = `Planifica ${cantidad} historias de Instagram para VOCAI entre ${desde} y ${to} (inclusive). Reparte las fechas de forma pareja (1-2 por día como máximo, cubre las semanas completas).

${planTxt}

${ocupadasTxt}

${temasTxt}
${indicaciones ? `\nIndicaciones del humano (mandan sobre todo lo demás): ${indicaciones}` : ''}

Devuelve el array JSON de ${cantidad} piezas.`;

    const { texto } = await claude.chat({ system, messages: [{ role: 'user', content: pedido }] });

    // Parsear el array JSON (tolerar fences de markdown por si acaso)
    const limpio = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const ini = limpio.indexOf('['), fin = limpio.lastIndexOf(']');
    if (ini < 0 || fin < ini) throw new Error('La IA no devolvió un plan válido. Probá de nuevo.');
    let piezas = JSON.parse(limpio.slice(ini, fin + 1));

    piezas = (Array.isArray(piezas) ? piezas : []).map(p => ({
      fecha: (typeof p.fecha === 'string' && p.fecha >= from && p.fecha <= to) ? p.fecha : desde,
      titulo: String(p.titulo || '').trim().slice(0, 120),
      pilar: PILARES.includes(p.pilar) ? p.pilar : 'ia',
      categoria: CATEGORIAS.includes(p.categoria) ? p.categoria : 'educativo',
      diseno: DISENOS.includes(p.diseno) ? p.diseno : 'clasico',
      angulo: String(p.angulo || '').trim().slice(0, 300),
    })).filter(p => p.titulo);

    if (!piezas.length) throw new Error('La IA no devolvió piezas. Probá de nuevo.');
    res.json({ mes, piezas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /cargar → inserta las piezas confirmadas por el humano en
   content_pieces como ideas (formato story, estado idea). El marcador
   [gen:categoria,diseno] en notas guarda la config para que el botón
   "Producir" del calendario precargue el Generador. */
router.post('/cargar', auth, async (req, res) => {
  const entrada = Array.isArray(req.body.piezas) ? req.body.piezas : [];
  const filas = entrada
    .filter(p => p && p.titulo && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha || ''))
    .map(p => ({
      fecha: p.fecha,
      titulo: String(p.titulo).trim().slice(0, 120),
      formato: 'story',
      pilar: PILARES.includes(p.pilar) ? p.pilar : 'ia',
      estado: 'idea',
      notas: `[gen:${CATEGORIAS.includes(p.categoria) ? p.categoria : 'educativo'},` +
             `${DISENOS.includes(p.diseno) ? p.diseno : 'clasico'}]` +
             (p.angulo ? ' ' + String(p.angulo).trim().slice(0, 300) : ''),
    }));
  if (!filas.length) return res.status(400).json({ error: 'No hay piezas válidas para cargar' });

  const { data, error } = await supabase.from('content_pieces').insert(filas).select('id');
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, creadas: (data || []).length });
});

module.exports = router;
