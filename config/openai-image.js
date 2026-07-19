/* ============================================================
   VOCAI OS — Generación de placas completas con GPT Image
   La API devuelve el lienzo entero. El coste se calcula con el
   uso real cuando está disponible y, si no, con una estimación.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images';
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

// Precios estándar de GPT Image 2 por millón de tokens (USD, julio de 2026).
// Pueden sobreescribirse sin cambiar código si OpenAI actualiza la tarifa.
const PRECIOS = {
  textoEntrada: Number(process.env.OPENAI_IMAGE_TEXT_INPUT_USD_M || 5),
  imagenEntrada: Number(process.env.OPENAI_IMAGE_INPUT_USD_M || 8),
  imagenSalida: Number(process.env.OPENAI_IMAGE_OUTPUT_USD_M || 30),
};

// Respaldo cuando la respuesta no incluye usage. Se basa en la tarifa de
// salida high publicada y se ajusta al área del lienzo solicitado.
const COSTE_FALLBACK_USD = {
  historia: { generar: 0.196, editar: 0.212 },
  feed:     { generar: 0.138, editar: 0.150 },
};

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY en las variables de entorno');
  return key;
}

async function leerRespuesta(resp) {
  const raw = await resp.text();
  let data;
  try { data = JSON.parse(raw); } catch (e) { data = null; }
  if (!resp.ok) {
    const msg = data && data.error && data.error.message
      ? data.error.message : `OpenAI respondió ${resp.status}`;
    throw new Error(msg);
  }
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error('OpenAI no devolvió la imagen generada');
  return { buffer: Buffer.from(b64, 'base64'), usage: data.usage || null };
}

async function generarImagenOpenAI({ prompt, size }) {
  const resp = await fetch(`${OPENAI_IMAGES_URL}/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size,
      quality: 'high',
      background: 'opaque',
      output_format: 'png',
      n: 1,
    }),
  });
  return leerRespuesta(resp);
}

async function editarImagenOpenAI({ imagePaths, prompt, size }) {
  const form = new FormData();
  form.append('model', MODEL);
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('quality', 'high');
  form.append('output_format', 'png');
  (imagePaths || []).forEach((imagePath) => {
    const ext = path.extname(imagePath).toLowerCase();
    const tipo = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.webp' ? 'image/webp' : 'image/png';
    form.append('image[]', new Blob([fs.readFileSync(imagePath)], { type: tipo }),
      path.basename(imagePath));
  });
  const resp = await fetch(`${OPENAI_IMAGES_URL}/edits`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey()}` },
    body: form,
  });
  return leerRespuesta(resp);
}

function numero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function costeDesdeUsage(usage, { formato, accion }) {
  const detalle = usage && usage.input_tokens_details ? usage.input_tokens_details : {};
  const textoEntrada = numero(detalle.text_tokens);
  const imagenEntrada = numero(detalle.image_tokens);
  const salida = numero(usage && usage.output_tokens);
  const tieneUso = textoEntrada + imagenEntrada + salida > 0;
  const usd = tieneUso
    ? (textoEntrada * PRECIOS.textoEntrada
      + imagenEntrada * PRECIOS.imagenEntrada
      + salida * PRECIOS.imagenSalida) / 1_000_000
    : (COSTE_FALLBACK_USD[formato] || COSTE_FALLBACK_USD.historia)[accion];
  return {
    usdAprox: Number(usd.toFixed(4)),
    fuente: tieneUso ? 'uso_api' : 'tarifa_estimada',
    modelo: MODEL,
    tokens: tieneUso ? { textoEntrada, imagenEntrada, imagenSalida: salida } : null,
  };
}

module.exports = {
  MODEL, generarImagenOpenAI, editarImagenOpenAI, costeDesdeUsage,
};
