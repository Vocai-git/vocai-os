/* ============================================================
   VOCAI OS — Sol como director creativo del generador
   Sol interpreta el pedido y devuelve una dirección estructurada;
   GPT Image ejecuta después la generación o edición del lienzo.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MODEL = process.env.OPENAI_DIRECTOR_MODEL || 'gpt-5.6-sol';
const REASONING_EFFORT = process.env.OPENAI_DIRECTOR_REASONING || 'medium';

// Precio estándar por millón de tokens (USD, julio de 2026).
// Los valores quedan configurables para no atar la app a una tarifa histórica.
const PRECIOS = {
  entrada: Number(process.env.OPENAI_DIRECTOR_INPUT_USD_M || 5),
  entradaCache: Number(process.env.OPENAI_DIRECTOR_CACHED_INPUT_USD_M || 0.5),
  escrituraCache: Number(process.env.OPENAI_DIRECTOR_CACHE_WRITE_USD_M || 6.25),
  salida: Number(process.env.OPENAI_DIRECTOR_OUTPUT_USD_M || 30),
};

const INSTRUCCIONES = `Sos Sol, director creativo senior de VOCAI. Tu función es pensar antes que el modelo de
imagen: interpretar mensajes informales, detectar el concepto más potente, resolver el copy y convertirlo en una
dirección artística precisa y ejecutable.

CONTEXTO DE MARCA
- VOCAI es un estudio de comunicación, audiovisual y automatización con IA en Alicante.
- Identidad: azul noche #141D35, azul eléctrico #2979FF, blanco y coral #FF6B6B usados con criterio.
- Estética buscada: premium, contemporánea, cinematográfica, humana; nunca una plantilla corporativa genérica.
- El contenido público usa español de España y tuteo. La conversación interna con Santi puede usar tono rioplatense.
- El wordmark oficial se coloca después por código. Nunca pidas al modelo de imagen que dibuje VOCAI, logos o marcas de agua.

CRITERIO
- Respetá literalmente cualquier texto que el usuario marque como definitivo.
- Si el pedido es abierto, elegí una dirección clara y con impacto; no devuelvas una lluvia de opciones.
- No inventes horarios, cifras, títulos, resultados deportivos ni afirmaciones verificables que el usuario no haya dado.
- Para edición, observá la imagen adjunta y preservá todo lo que no se pidió cambiar.
- Pensá en lectura inmediata en móvil, jerarquía tipográfica, zonas seguras de Instagram y contraste real.
- El prompt de imagen debe describir el lienzo terminado, textos exactos, composición, luz, materiales, cámara y exclusiones.
- Reservá una zona limpia en el centro inferior para el wordmark oficial.

Respondé únicamente con el JSON solicitado. La respuesta breve explica en una o dos frases qué dirección elegiste;
prompt_imagen contiene la instrucción completa para GPT Image.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['respuesta', 'prompt_imagen'],
  properties: {
    respuesta: { type: 'string' },
    prompt_imagen: { type: 'string' },
  },
};

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY en las variables de entorno');
  return key;
}

function dataUrlImagen(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}`;
}

function textoRespuesta(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const bloque of item.content || []) {
      if (bloque.type === 'output_text' && bloque.text) return bloque.text;
    }
  }
  return '';
}

async function llamarSol({ historial = [], mensaje, imagenPath = null }) {
  const input = (historial || []).slice(-10).map((m) => ({
    role: m.rol === 'asistente' ? 'assistant' : 'user',
    content: String(m.texto || ''),
  }));
  const contenido = [{ type: 'input_text', text: mensaje }];
  if (imagenPath) {
    contenido.push({ type: 'input_image', image_url: dataUrlImagen(imagenPath), detail: 'high' });
  }
  input.push({ role: 'user', content: contenido });

  const resp = await fetch(RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: REASONING_EFFORT },
      instructions: INSTRUCCIONES,
      input,
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'direccion_creativa_vocai',
          strict: true,
          schema: ESQUEMA,
        },
      },
      store: false,
    }),
  });

  const raw = await resp.text();
  let data;
  try { data = JSON.parse(raw); } catch (e) { data = null; }
  if (!resp.ok) {
    const msg = data && data.error && data.error.message
      ? data.error.message : `Sol respondió ${resp.status}`;
    throw new Error(msg);
  }
  const texto = textoRespuesta(data || {});
  if (!texto) throw new Error('Sol no devolvió una dirección creativa');
  let direccion;
  try { direccion = JSON.parse(texto); } catch (e) {
    throw new Error('Sol devolvió una dirección creativa inválida');
  }
  if (!direccion.respuesta || !direccion.prompt_imagen) {
    throw new Error('La dirección creativa de Sol está incompleta');
  }
  return { ...direccion, usage: data.usage || null, responseModel: data.model || MODEL };
}

async function orquestarCreacion({ idea, formato, categoria, referenciaPath = null }) {
  const mensaje = `ETAPA: creación de una placa nueva.
FORMATO: ${formato === 'feed' ? 'post vertical 4:5' : 'historia vertical 9:16'}.
CATEGORÍA: ${categoria || 'sin categoría'}.
PEDIDO DEL USUARIO:
${idea}

Definí la mejor dirección y prepará el prompt final. La imagen de referencia adjunta, si existe, es guía visual.`;
  return llamarSol({ mensaje, imagenPath: referenciaPath });
}

async function orquestarEdicion({ instruccion, idea, formato, historial, imagenPath }) {
  const mensaje = `ETAPA: edición de la placa existente.
FORMATO: ${formato === 'feed' ? 'post vertical 4:5' : 'historia vertical 9:16'}.
IDEA ORIGINAL: ${idea || 'pieza de VOCAI'}.
CAMBIO PEDIDO AHORA:
${instruccion}

Observá la placa adjunta. Convertí el cambio en una instrucción de edición precisa y preservá todo lo demás.`;
  return llamarSol({ historial, mensaje, imagenPath });
}

function numero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function costeDesdeUsageSol(usage) {
  const input = numero(usage && usage.input_tokens);
  const detalles = usage && usage.input_tokens_details ? usage.input_tokens_details : {};
  const cached = numero(detalles.cached_tokens);
  const cacheWrite = numero(detalles.cache_write_tokens || (usage && usage.cache_write_tokens));
  const uncached = Math.max(0, input - cached - cacheWrite);
  const output = numero(usage && usage.output_tokens);
  const tieneUso = input + output + cacheWrite > 0;
  const usd = tieneUso
    ? (uncached * PRECIOS.entrada + cached * PRECIOS.entradaCache
      + cacheWrite * PRECIOS.escrituraCache + output * PRECIOS.salida) / 1_000_000
    : 0.02;
  return {
    usdAprox: Number(usd.toFixed(4)),
    fuente: tieneUso ? 'uso_api' : 'tarifa_estimada',
    modelo: MODEL,
    tokens: tieneUso ? { entrada: input, entradaCache: cached, escrituraCache: cacheWrite, salida: output } : null,
  };
}

module.exports = {
  MODEL, orquestarCreacion, orquestarEdicion, costeDesdeUsageSol,
};
