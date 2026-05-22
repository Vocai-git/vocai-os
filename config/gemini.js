/* ============================================================
   VOCAI OS — Cliente de Gemini
   Dos especialistas separados:
   · generarTexto       → idea → { titulo, subtitulo }
   · generarPromptImagen→ idea → prompt técnico para Nano Banana
   Más: generarImagen / editarImagen (Nano Banana Pro).
   La key vive en .env (GEMINI_API_KEY) — nunca en el código.
   ============================================================ */

const fs = require('fs');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Estilos de ilustración — base del prompt de imagen.
const ESTILOS_ILUSTRACION = {
  flat:      'Flat vector illustration, bold geometric shapes, solid flat colors, ' +
             'clean minimalist tech-brand style, no realistic shadows, no photographic texture.',
  '3d':      'Soft 3D rendered illustration, glossy smooth rounded shapes, soft studio ' +
             'lighting, modern polished 3D-icon aesthetic.',
  editorial: 'Editorial conceptual illustration with artistic flair, magazine-style, ' +
             'expressive textures and brushwork, sophisticated atmosphere.',
  realista:  'Photorealistic photograph, natural cinematic lighting, real people in ' +
             'authentic everyday situations, warm and human atmosphere, professional ' +
             'photography with shallow depth of field.',
};

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('Falta GEMINI_API_KEY en el .env');
  return k;
}

// fetch a Gemini con reintentos ante sobrecarga temporal (429/502/503).
async function fetchConReintentos(url, opts) {
  const esperas = [0, 4000, 12000];   // ms de espera antes de cada intento
  let res;
  for (let i = 0; i < esperas.length; i++) {
    if (esperas[i]) await new Promise(r => setTimeout(r, esperas[i]));
    res = await fetch(url, opts);
    if (res.ok || ![429, 502, 503].includes(res.status)) return res;
    if (i < esperas.length - 1) {
      console.log(`[Gemini] HTTP ${res.status} — sobrecarga, reintentando...`);
    }
  }
  return res;
}

// Llamada de texto a Gemini, devuelve el string crudo de la respuesta.
async function llamarTexto({ sys, user, json, imagenPath }) {
  const userParts = [{ text: user }];
  if (imagenPath && fs.existsSync(imagenPath)) {
    const b64 = fs.readFileSync(imagenPath).toString('base64');
    const mime = /\.png$/i.test(imagenPath) ? 'image/png'
      : /\.webp$/i.test(imagenPath) ? 'image/webp' : 'image/jpeg';
    userParts.unshift({ inlineData: { mimeType: mime, data: b64 } });
  }
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ parts: userParts }],
  };
  if (json) body.generationConfig = { responseMimeType: 'application/json' };
  const res = await fetchConReintentos(`${BASE}/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini texto ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '').join('').trim();
  if (!txt) throw new Error('Gemini no devolvió respuesta');
  return txt;
}

// ── Especialista 1 · Copy: idea → { titulo, subtitulo } ──────
async function generarTexto(idea) {
  const sys =
`Sos el copywriter de VOCAI — empresa de IA y automatización en Alicante, con
estudio de grabación propio. Tagline: "La voz de tu negocio".

Te dan una IDEA en español para una placa de historia de Instagram (vertical).
Devolvés un JSON con exactamente estos campos:

- "titulo": el texto principal de la placa, en español. Corto, directo, con gancho.
  Máximo 8 palabras. Es lo que más se va a leer. Escribilo en capitalización normal
  (solo la primera letra en mayúscula, y nombres propios) — NUNCA Mayúscula En Cada
  Palabra.
- "subtitulo": una línea de apoyo en español, breve. Si no hace falta, devolvé "".

Respondé SOLO el JSON, sin markdown.`;

  const txt = await llamarTexto({ sys, user: `Idea: ${idea}`, json: true });
  let brief;
  try {
    brief = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
  } catch (e) {
    throw new Error('El texto no vino en JSON válido');
  }
  return {
    titulo: (brief.titulo || '').trim(),
    subtitulo: (brief.subtitulo || '').trim(),
  };
}

// ── Especialista 2 · Prompt engineer para Nano Banana ────────
async function generarPromptImagen(idea, estiloSlug, referenciaPath = null) {
  const estiloDesc = ESTILOS_ILUSTRACION[estiloSlug] || ESTILOS_ILUSTRACION['3d'];
  const hayRef = referenciaPath && fs.existsSync(referenciaPath);
  const bloqueRef = hayRef ? '\n\n' + [
    'IMAGEN DE REFERENCIA: te adjunto una imagen. Estudiala y construí el prompt',
    'para que la imagen final ADOPTE su estilo visual, su paleta de colores, su',
    'clima/mood, su iluminación y su composición. La referencia MANDA sobre el',
    'estilo: si choca con el estilo base o la paleta de abajo, gana la referencia.',
    'No copies el sujeto literal de la referencia — aplicá su LOOK a la escena.',
  ].join(' ') : '';
  const sys =
`Sos un prompt engineer experto en Nano Banana Pro (el modelo de imagen de Gemini),
trabajando para VOCAI — empresa de IA y automatización en Alicante con estudio de
grabación propio.

Te dan una IDEA en español para la ILUSTRACIÓN DE FONDO de una placa de historia
de Instagram (vertical 9:16). Tu trabajo NO es copiar la idea ni escribirla: es
traducirla a un prompt visual profesional, concreto y rico, para que el modelo
genere una imagen potente y de calidad.${bloqueRef}

Devolvés SOLO el prompt final en inglés — sin comillas, sin markdown, sin
explicaciones, sin etiquetas. Reglas para construirlo:

* Empezá con este estilo base, tal cual: ${estiloDesc}
* Pensá una ESCENA visual concreta que represente la idea de forma conceptual y
  atractiva — no literal. Definí: sujeto principal, ambiente, composición, ángulo
  de cámara, iluminación, profundidad. Específico y evocador, nunca genérico.
* No incluyas el texto literal de la idea dentro de la imagen.
* Paleta: deep navy blue (#141d35) dominant background, electric blue (#2979FF)
  and coral red (#FF6B6B) accents.
* Vertical 9:16 composition.
* Keep the lower half of the image calm and darker — text will be placed there.
* Terminá con esta frase exacta: Absolutely no text, no letters, no numbers, no words.`;

  const txt = await llamarTexto({ sys, user: `Idea: ${idea}`, json: false,
    imagenPath: hayRef ? referenciaPath : null });
  const prompt = txt.replace(/^```\w*\s*/i, '').replace(/```\s*$/i, '')
    .replace(/^["']|["']$/g, '').trim();
  if (!prompt) throw new Error('No se pudo generar el prompt de imagen');
  return prompt;
}

// ── Especialista 3 · Carrusel: idea → slides con layout ──────
// Layouts que llevan imagen generada por IA.
const LAYOUTS_CARRUSEL = ['portada', 'imagen-fondo', 'split', 'texto-pleno', 'dato', 'cita', 'cierre'];
const LAYOUTS_CON_IMAGEN = ['portada', 'imagen-fondo', 'split', 'cierre'];

async function generarCarrusel(idea, estiloSlug, referenciaPath = null) {
  const estiloDesc = ESTILOS_ILUSTRACION[estiloSlug] || ESTILOS_ILUSTRACION['3d'];
  const hayRef = referenciaPath && fs.existsSync(referenciaPath);
  const bloqueRef = hayRef ? '\n\n' + [
    'IMAGEN DE REFERENCIA: te adjunto una imagen. Todos los prompt_imagen de los',
    'slides con imagen deben ADOPTAR su estilo visual, su paleta de colores, su',
    'clima e iluminación. La referencia MANDA sobre el estilo: si choca con la',
    'paleta de marca, gana la referencia. No copies su sujeto literal.',
  ].join(' ') : '';
  const sys =
`Sos el director creativo de carruseles de VOCAI — empresa de IA y automatización
en Alicante con estudio de grabación propio. Tagline: "La voz de tu negocio".

Te dan una IDEA en español. La convertís en un CARRUSEL de Instagram: 4 a 8 slides
que se leen en secuencia. REGLA NÚMERO UNO: que NO sea monótono. Cada slide tiene
que sorprender — variá el layout, el ritmo y la cantidad de texto. Está prohibido
que todos los slides se vean igual.${bloqueRef}

Estructura:
- Slide 1: PORTADA. El gancho que frena el scroll.
- Slides del medio: CONTENIDO. Una idea por slide.
- Última slide: CIERRE. Remate + llamada a la acción.

LAYOUTS para los slides de CONTENIDO (elegí el que mejor le quede a cada idea y
NUNCA repitas el mismo layout dos veces seguidas):
- "imagen-fondo": imagen a sangre completa con el texto encima. Para ideas
  visuales y potentes.
- "split": imagen arriba, texto sobre fondo de marca abajo. Editorial y ordenado.
- "texto-pleno": SIN imagen, una idea grande sola sobre fondo de marca. Para
  conceptos o frases que pegan más solas. Da respiro al carrusel.
- "dato": SIN imagen, un número o cifra GIGANTE como protagonista. Usalo SOLO si
  hay un dato concreto (un porcentaje, una cantidad, un "3x").
- "cita": SIN imagen, una frase tipo cita destacada. Para una afirmación fuerte.

La PORTADA usa siempre "portada" y el CIERRE siempre "cierre" — esos los fijo yo.
Un buen carrusel MEZCLA: algunos slides con imagen, otros sin imagen.

Devolvés SOLO un JSON con esta forma exacta:
{ "slides": [ { "tipo": "...", "layout": "...", "titulo": "...", "cuerpo": "...", "dato": "...", "prompt_imagen": "..." } ] }

Campos:
- "tipo": "portada" la primera, "cierre" la última, "contenido" el resto.
- "layout": uno de la lista (para contenido). Portada → "portada", cierre → "cierre".
- "titulo": texto principal del slide, español, corto y directo. Capitalización
  normal — NUNCA Mayúscula En Cada Palabra. En layout "dato" el titulo es el
  rótulo corto que acompaña al número.
- "cuerpo": texto de apoyo o desarrollo en español, una o dos líneas. En el cierre
  va la llamada a la acción. Si de verdad no hace falta, "".
- "dato": SOLO para layout "dato" — la cifra protagonista, cortísima (ej "85%",
  "3x", "+40"). En los demás layouts, "".
- "prompt_imagen": SOLO para layouts con imagen (portada, imagen-fondo, split,
  cierre). En texto-pleno, dato y cita va "". Cuando lleva imagen es un prompt en
  inglés para Nano Banana Pro:
  * Empezá con este estilo, tal cual: ${estiloDesc}
  * Una escena visual concreta y específica, conceptual, nunca literal.
  * Coherencia visual entre TODAS las slides con imagen.
  * Paleta: deep navy blue (#141d35) dominant background, electric blue (#2979FF)
    and coral red (#FF6B6B) accents.
  * Vertical 4:5 composition. Keep one area calm and darker for text.
  * Terminá con: Absolutely no text, no letters, no numbers, no words.

Respondé SOLO el JSON, sin markdown.`;

  const txt = await llamarTexto({ sys, user: `Idea: ${idea}`, json: true,
    imagenPath: hayRef ? referenciaPath : null });
  let data;
  try {
    data = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
  } catch (e) {
    throw new Error('El carrusel no vino en JSON válido');
  }
  const slides = Array.isArray(data.slides) ? data.slides : [];
  if (slides.length < 3) throw new Error('El especialista no devolvió suficientes slides');
  return slides.map((s, i) => {
    const tipo = s.tipo === 'portada' || s.tipo === 'cierre' ? s.tipo
      : (i === 0 ? 'portada' : i === slides.length - 1 ? 'cierre' : 'contenido');
    let layout = LAYOUTS_CARRUSEL.includes(s.layout) ? s.layout : 'imagen-fondo';
    if (tipo === 'portada') layout = 'portada';
    if (tipo === 'cierre')  layout = 'cierre';
    return {
      tipo, layout,
      titulo: (s.titulo || '').trim(),
      cuerpo: (s.cuerpo || s.subtitulo || '').trim(),
      dato: (s.dato || '').trim(),
      prompt_imagen: LAYOUTS_CON_IMAGEN.includes(layout) ? (s.prompt_imagen || '').trim() : '',
    };
  });
}

// ── Nano Banana Pro: prompt → imagen, guardada en savePath ───
// referenciaPath: imagen opcional que guía estilo, clima y composición.
async function generarImagen(prompt, savePath, aspecto = '9:16', referenciaPath = null) {
  let partsReq;
  if (referenciaPath && fs.existsSync(referenciaPath)) {
    const refB64 = fs.readFileSync(referenciaPath).toString('base64');
    const mime = /\.png$/i.test(referenciaPath) ? 'image/png'
      : /\.webp$/i.test(referenciaPath) ? 'image/webp' : 'image/jpeg';
    partsReq = [
      { inlineData: { mimeType: mime, data: refB64 } },
      { text: prompt + ' IMPORTANT: an image is attached as a STYLE REFERENCE. ' +
              'Match its visual style, color palette, lighting, mood and composition ' +
              'closely — the result must clearly belong to the same visual world. ' +
              'Do not reproduce the reference subject literally; apply its look to the ' +
              'scene described above.' },
    ];
  } else {
    partsReq = [{ text: prompt }];
  }
  const res = await fetchConReintentos(`${BASE}/gemini-3-pro-image-preview:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
    body: JSON.stringify({
      contents: [{ parts: partsReq }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: aspecto },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini imagen ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData || p.inline_data);
  if (!img) throw new Error('Gemini no devolvió una imagen');
  const b64 = (img.inlineData || img.inline_data).data;
  fs.writeFileSync(savePath, Buffer.from(b64, 'base64'));
}

// ── Nano Banana Pro: editar una imagen existente ────────────
async function editarImagen(imagenPath, instruccion, savePath) {
  const b64in = fs.readFileSync(imagenPath).toString('base64');
  const prompt =
    `Edit this image as follows: ${instruccion}. ` +
    `Keep the same illustration style and the deep navy blue, electric blue and ` +
    `coral red color palette. Vertical 9:16 composition. ` +
    `Absolutely no text, no letters, no numbers, no words.`;
  const res = await fetchConReintentos(`${BASE}/gemini-3-pro-image-preview:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType: 'image/png', data: b64in } },
        { text: prompt },
      ] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '9:16' },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini edición ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData || p.inline_data);
  if (!img) throw new Error('Gemini no devolvió la imagen editada');
  fs.writeFileSync(savePath, Buffer.from((img.inlineData || img.inline_data).data, 'base64'));
}

module.exports = {
  generarTexto, generarPromptImagen, generarCarrusel,
  generarImagen, editarImagen, ESTILOS_ILUSTRACION,
};
