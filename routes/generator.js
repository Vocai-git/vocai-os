const express = require('express');
const router = express.Router();
const multer = require('multer');
const OpenAI = require('openai');
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { logActivity } = require('./activity');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GEMINI_MODEL = 'gemini-3-pro-image-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const BUCKET_OUT = 'generaciones';
const MAX_REFS_SENT = 5;

// ============================================================
// CLIENTES listos (con ADN, 1+ pilar y 1+ tipo de diseño)
// ============================================================
router.get('/clientes-ready', auth, async (req, res) => {
  const { data: clientes, error } = await supabase
    .from('clients')
    .select('id, nombre')
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });

  const [adns, pilares, tipos] = await Promise.all([
    supabase.from('clientes_adn_visual').select('cliente_id, logo_url, rubro, paleta, paleta_hex_estructurada'),
    supabase.from('clientes_pilares').select('cliente_id'),
    supabase.from('clientes_tipos_diseno').select('cliente_id')
  ]);
  const adnMap = new Map((adns.data || []).map(a => [a.cliente_id, a]));
  const pilaresSet = new Set((pilares.data || []).map(p => p.cliente_id));
  const tiposSet = new Set((tipos.data || []).map(t => t.cliente_id));

  const ready = clientes
    .filter(c => adnMap.has(c.id) && pilaresSet.has(c.id) && tiposSet.has(c.id))
    .map(c => {
      const a = adnMap.get(c.id);
      const estr = a.paleta_hex_estructurada || {};
      const paletaArr = [estr.fondo, estr.primario, estr.secundario, estr.acento].filter(Boolean);
      return {
        ...c,
        logo_url: a.logo_url,
        rubro: a.rubro,
        paleta: paletaArr.length ? paletaArr : (a.paleta || [])
      };
    });
  res.json(ready);
});

// ============================================================
// PILARES / TIPOS de un cliente
// ============================================================
router.get('/:clienteId/pilares', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('clientes_pilares')
    .select('id, nombre, descripcion')
    .eq('cliente_id', req.params.clienteId)
    .order('orden');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:clienteId/tipos', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('clientes_tipos_diseno')
    .select('id, nombre, descripcion_corta, posicion_logo')
    .eq('cliente_id', req.params.clienteId)
    .order('orden');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============================================================
// GENERAR — flujo completo
// ============================================================
router.post('/generate', auth, upload.array('files', 10), async (req, res) => {
  try {
    const {
      cliente_id,
      pilar_id,
      tipo_diseno_id,
      tipo,
      cantidad,
      brief,
      modo_brief,
      referencias_modo
    } = req.body;

    const cantidadNum = parseInt(cantidad, 10);

    // Validación
    if (!cliente_id || !tipo || !brief) return res.status(400).json({ error: 'Faltan campos requeridos' });
    if (!tipo_diseno_id) return res.status(400).json({ error: 'Tipo de diseño requerido' });
    if (!pilar_id) return res.status(400).json({ error: 'Pilar requerido' });
    if (!['carrusel', 'historia'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (!['topico_corto', 'guion_completo'].includes(modo_brief)) return res.status(400).json({ error: 'Modo de brief inválido' });
    if (!['guardadas', 'nuevas', 'ambas'].includes(referencias_modo)) return res.status(400).json({ error: 'Modo de referencias inválido' });
    if (isNaN(cantidadNum) || cantidadNum < 1 || cantidadNum > 20) return res.status(400).json({ error: 'Cantidad fuera de rango (1-20)' });

    // Traer contexto completo
    const [adnRes, refsRes, clientRes, pilarRes, tipoRes] = await Promise.all([
      supabase.from('clientes_adn_visual').select('*').eq('cliente_id', cliente_id).single(),
      supabase.from('clientes_referencias').select('imagen_url').eq('cliente_id', cliente_id).order('orden'),
      supabase.from('clients').select('id, nombre').eq('id', cliente_id).single(),
      supabase.from('clientes_pilares').select('*').eq('id', pilar_id).single(),
      supabase.from('clientes_tipos_diseno').select('*').eq('id', tipo_diseno_id).single()
    ]);
    if (adnRes.error || !adnRes.data) return res.status(400).json({ error: 'El cliente no tiene ADN cargado' });
    if (tipoRes.error || !tipoRes.data) return res.status(400).json({ error: 'Tipo de diseño no encontrado' });
    if (pilarRes.error || !pilarRes.data) return res.status(400).json({ error: 'Pilar no encontrado' });

    const adn = adnRes.data;
    const cliente = clientRes.data;
    const pilar = pilarRes.data;
    const tipoDiseno = tipoRes.data;
    const refsGuardadas = refsRes.data || [];

    // Referencias base64 para Gemini
    const refsBase64 = await buildReferencesBase64(referencias_modo, refsGuardadas, req.files || []);

    // 1. OpenAI → plan narrativo
    const aiPlan = await generatePlanOpenAI({
      cliente, adn, pilar, tipoDiseno, tipo, cantidad: cantidadNum, brief, modo_brief
    });

    // 2. Crear registro de generación
    const { data: gen, error: genErr } = await supabase
      .from('generaciones')
      .insert({
        cliente_id,
        pilar_id,
        tipo_diseno_id,
        titulo: aiPlan.titulo_carrusel || aiPlan.titulo,
        tipo,
        cantidad: cantidadNum,
        brief,
        modo_brief,
        referencias_modo,
        narrativa: aiPlan,
        created_by: req.user.email
      })
      .select()
      .single();
    if (genErr) throw new Error(genErr.message);

    // 3. Por cada slide → Gemini imagen + subir a Storage
    const totalSlides = aiPlan.slides.length;
    const slidesResults = await Promise.all(aiPlan.slides.map(async (slide) => {
      try {
        const finalPrompt = buildGeminiPrompt({
          slide, totalSlides, tipo, adn, tipoDiseno
        });
        const imgBuf = await generateImageGemini({
          prompt: finalPrompt,
          refs: refsBase64
        });
        const path = `${cliente_id}/${gen.id}/${String(slide.orden).padStart(2, '0')}.png`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET_OUT)
          .upload(path, imgBuf, { contentType: 'image/png' });
        if (upErr) throw new Error(upErr.message);

        const imagen_url = supabase.storage.from(BUCKET_OUT).getPublicUrl(path).data.publicUrl;

        const { data: slideRow, error: slideErr } = await supabase
          .from('generacion_slides')
          .insert({
            generacion_id: gen.id,
            orden: slide.orden,
            imagen_url,
            prompt_usado: finalPrompt,
            copy_slide: slide.copy
          })
          .select()
          .single();
        if (slideErr) throw new Error(slideErr.message);
        return { ...slideRow, rol: slide.rol };
      } catch (err) {
        console.error(`Slide ${slide.orden} falló:`, err.message);
        return {
          orden: slide.orden,
          rol: slide.rol,
          copy_slide: slide.copy,
          error: err.message
        };
      }
    }));

    await logActivity(req.user.email, 'crear', 'generaciones', `Generación: "${gen.titulo}" para ${cliente.nombre} (${tipoDiseno.nombre})`);

    res.json({
      generacion: gen,
      slides: slidesResults.sort((a, b) => a.orden - b.orden)
    });
  } catch (err) {
    console.error('Generator error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// HELPERS
// ============================================================

async function buildReferencesBase64(modo, refsGuardadas, archivosNuevos) {
  const items = [];
  if (modo === 'guardadas' || modo === 'ambas') {
    for (const r of refsGuardadas) {
      items.push({ type: 'url', url: r.imagen_url });
    }
  }
  if (modo === 'nuevas' || modo === 'ambas') {
    for (const f of archivosNuevos) {
      items.push({ type: 'buffer', buffer: f.buffer, mime: f.mimetype });
    }
  }
  const limited = items.slice(0, MAX_REFS_SENT);
  return Promise.all(limited.map(async (item) => {
    if (item.type === 'buffer') {
      return { mime: item.mime, data: item.buffer.toString('base64') };
    }
    const resp = await fetch(item.url);
    const ab = await resp.arrayBuffer();
    const mime = resp.headers.get('content-type') || 'image/jpeg';
    return { mime, data: Buffer.from(ab).toString('base64') };
  }));
}

// ============================================================
// OpenAI — director creativo que devuelve el plan narrativo
// ============================================================
async function generatePlanOpenAI({ cliente, adn, pilar, tipoDiseno, tipo, cantidad, brief, modo_brief }) {
  const paleta = adn.paleta_hex_estructurada || {};

  const systemPrompt = `Sos un director creativo especializado en contenido para Instagram de marcas premium. Tu trabajo es tomar un brief y devolver un JSON estructurado con N slides narrativamente encadenados. Cada slide tiene:
- rol: "hook" (primer slide, engancha), "desarrollo" (slides intermedios) o "cierre-cta" (último slide)
- copy: texto exacto que debe aparecer en la imagen, en español de España, sin errores, sin duplicaciones
- descripcion_visual: qué ilustración/composición específica lleva ese slide DENTRO del tipo de diseño indicado

El estilo visual es SAGRADO — nunca lo describas como genérico, siempre basado en el adn_visual del tipo recibido.

REGLAS DEL COPY:
- Español de España natural, tuteo.
- Sin emojis salvo que el tipo de diseño los permita explícitamente.
- Sin palabras duplicadas, ortografía perfecta, signos de puntuación finales obligatorios.
- El primer slide engancha (hook corto y potente).
- Los del medio desarrollan el pilar con coherencia narrativa.
- El último cierra con una CTA concreta y accionable.

Respondés SIEMPRE con JSON válido exacto con esta estructura:
{
  "titulo_carrusel": "Título corto interno de la pieza (máx 70 caracteres, para historial)",
  "narrativa": "Guion completo en prosa, 2-4 párrafos",
  "slides": [
    { "orden": 1, "rol": "hook", "copy": "texto exacto", "descripcion_visual": "descripción visual específica alineada con adn_visual del tipo" }
  ]
}`;

  const userPrompt = `CLIENTE: ${cliente.nombre}
RUBRO: ${adn.rubro || '(no definido)'}
PÚBLICO OBJETIVO: ${adn.publico_objetivo || '(no definido)'}
TONO DE MARCA: ${adn.tono || '(no definido)'}

ADN GLOBAL DEL CLIENTE
Paleta estructurada (hex):
  · fondo: ${paleta.fondo || '(no definido)'}
  · primario: ${paleta.primario || '(no definido)'}
  · secundario: ${paleta.secundario || '(no definido)'}
  · acento: ${paleta.acento || '(no definido)'}
Tipografía primaria: ${adn.tipografias_primaria || '(no definida)'}
Tipografía secundaria: ${adn.tipografias_secundaria || '(no definida)'}
Formato: ${adn.formato_export || '1080x1350px 4:5 Instagram'}
Reglas globales: ${adn.reglas_globales || '(ninguna)'}

PILAR DE CONTENIDO
Nombre: ${pilar.nombre}
Descripción: ${pilar.descripcion || '(sin descripción)'}

TIPO DE DISEÑO ELEGIDO: "${tipoDiseno.nombre}"
Descripción corta: ${tipoDiseno.descripcion_corta || '(ninguna)'}
Referencias estéticas: ${tipoDiseno.referencias_esteticas || '(ninguna)'}
Sensación: ${tipoDiseno.sensacion || '(ninguna)'}
ADN visual (reglas completas de este tipo):
${tipoDiseno.adn_visual || '(no definido)'}

FORMATO DE SALIDA: ${tipo === 'carrusel' ? 'Carrusel (4:5 Instagram)' : 'Historia (9:16 Instagram)'}
CANTIDAD DE SLIDES: ${cantidad}

BRIEF DEL USUARIO (${modo_brief === 'topico_corto' ? 'tópico corto — desarrollalo' : 'guion completo — adaptalo a slides sin cambiar el contenido'}):
${brief}

Generá exactamente ${cantidad} slides siguiendo la estructura narrativa del pilar y el adn_visual del tipo.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.8,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI no devolvió contenido');
  const parsed = JSON.parse(raw);

  if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    throw new Error('OpenAI no devolvió slides válidos');
  }
  parsed.slides = parsed.slides.slice(0, cantidad).map((s, i, arr) => ({
    orden: s.orden || (i + 1),
    rol: s.rol || (i === 0 ? 'hook' : i === arr.length - 1 ? 'cierre-cta' : 'desarrollo'),
    copy: s.copy || '',
    descripcion_visual: s.descripcion_visual || s.prompt_imagen || ''
  }));
  parsed.titulo_carrusel = parsed.titulo_carrusel || parsed.titulo || 'Generación';
  parsed.narrativa = parsed.narrativa || '';
  return parsed;
}

// ============================================================
// Regla de logo según posicion_logo, orden y formato
// ============================================================
function buildLogoRule({ posicion, orden, total, tipo }) {
  // Historias siempre watermark por default
  if (tipo === 'historia') {
    return 'Include the brand isotype as a subtle watermark at 8% opacity, consistent across all slides.';
  }
  switch (posicion) {
    case 'solo-primero-ultimo':
      if (orden === 1) return 'Include the brand logotype prominently in the composition.';
      if (orden === total) return 'Include the brand isotype (icon only) as a closing element.';
      return 'DO NOT include the brand logo in this slide.';
    case 'watermark':
      return 'Include the brand isotype as a subtle watermark at 8% opacity.';
    case 'todos':
      return 'Include the brand isotype in the composition.';
    case 'nunca':
    default:
      return 'DO NOT include any brand logo or isotype.';
  }
}

// ============================================================
// Prompt final para Gemini — estructura rígida (CAMBIO 5)
// ============================================================
function buildGeminiPrompt({ slide, totalSlides, tipo, adn, tipoDiseno }) {
  const paleta = adn.paleta_hex_estructurada || {};
  const logoRule = buildLogoRule({
    posicion: tipoDiseno.posicion_logo,
    orden: slide.orden,
    total: totalSlides,
    tipo
  });

  const reglasNegativasUniversales = `- DO NOT duplicate words in Spanish. Example: never "todo todo el día", only "todo el día".
- DO NOT omit final periods, question marks or exclamation marks.
- DO NOT alter the exact copy provided — render it letter by letter.
- DO NOT invent text not specified.
- Spelling must be PERFECT in Spanish de España.
- DO NOT generate photographs of people unless the reference images explicitly show photographs of people.
- DO NOT use typography different from the one specified.`;

  return `[IDENTIDAD VISUAL DE MARCA — RESPETAR ESTRICTAMENTE]
${tipoDiseno.adn_visual || '(sin ADN visual definido)'}

[PALETA EXACTA — solo estos colores]
Fondo (obligatorio en toda la imagen): ${paleta.fondo || '(no definido)'}
Primario (tipografía principal): ${paleta.primario || '(no definido)'}
Secundario (acentos): ${paleta.secundario || '(no definido)'}
Dorado (detalles): ${paleta.acento || '(no definido)'}

[TIPOGRAFÍAS]
Protagonista: ${adn.tipografias_primaria || '(no definida)'}
Secundaria: ${adn.tipografias_secundaria || '(no definida)'}

[FORMATO]
${adn.formato_export || '1080x1350px (4:5 Instagram)'}

[POSICIÓN DEL LOGO EN ESTE SLIDE]
${logoRule}

[CONTENIDO DE ESTE SLIDE]
Rol narrativo: ${slide.rol}
Copy exacto a renderizar (letra por letra, sin alterar):
"${slide.copy}"

Descripción visual específica:
${slide.descripcion_visual}

[SENSACIÓN GENERAL]
${tipoDiseno.sensacion || '(sin sensación definida)'}

[REFERENCIAS VISUALES ADJUNTAS]
Match the visual style of the reference images exactly: same typography style, same background color, same composition logic, same icon style. The reference images are the visual bible — deviate only on content, never on style.

[INSTRUCCIONES POSITIVAS DEL TIPO]
${tipoDiseno.prompt_positivo || ''}

[REGLAS NEGATIVAS OBLIGATORIAS]
${tipoDiseno.prompt_negativo ? tipoDiseno.prompt_negativo + '\n' : ''}Reglas universales:
${reglasNegativasUniversales}
${adn.errores_frecuentes ? '\n[ERRORES FRECUENTES A EVITAR]\n' + adn.errores_frecuentes : ''}`;
}

// ============================================================
// Llamada a Gemini (nano-banana pro)
// ============================================================
async function generateImageGemini({ prompt, refs }) {
  const parts = [{ text: prompt }];
  for (const r of refs) {
    parts.push({ inline_data: { mime_type: r.mime, data: r.data } });
  }

  const resp = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const candidateParts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = candidateParts.find(p => p.inline_data || p.inlineData);
  if (!imagePart) {
    const textPart = candidateParts.find(p => p.text);
    throw new Error(`Gemini no devolvió imagen${textPart ? `: ${textPart.text.slice(0, 160)}` : ''}`);
  }
  const b64 = (imagePart.inline_data || imagePart.inlineData).data;
  return Buffer.from(b64, 'base64');
}

module.exports = router;
