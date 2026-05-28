/* ============================================================
   VOCAI OS — Cliente de Gemini
   Dos especialistas separados:
   · generarTexto       → idea → { titulo, subtitulo }
   · generarPromptImagen→ idea → prompt técnico para Nano Banana
   Más: generarImagen / editarImagen (Nano Banana Pro).
   La key vive en .env (GEMINI_API_KEY) — nunca en el código.
   ============================================================ */

const fs = require('fs');
const biblioteca = require('./biblioteca');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Modelos de texto en orden de preferencia: si el primario está
// sobrecargado (429/502/503), se cae automáticamente al siguiente.
const MODELOS_TEXTO = ['gemini-2.5-flash', 'gemini-2.0-flash'];

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

// ── Reglas de copy de marca (spec VOCAI) ─────────────────────
// Tono, lista negra, lista blanca y textos bloqueados. Se inyectan
// en todos los especialistas de texto para que el copy suene a VOCAI.
const REGLAS_MARCA =
`IDIOMA — REGLA INNEGOCIABLE:
Español de España, con TUTEO. Usa las formas de "tú": "Resuelve", "Automatiza",
"Agenda", "Escríbenos", "Ahorra", "Tienes", "Puedes".
PROHIBIDO el voseo argentino. NUNCA escribas "Resolvé", "Automatizá", "Agendá",
"Escribinos", "vos", "tenés", "podés", "querés", "bajás", "liberá". Si se te
escapa una sola forma de voseo, el texto está MAL: reescríbelo entero en tuteo.

TONO:
Directo y afirmativo. Frases cortas, una idea por frase, cero relleno. Si el
texto lo podría firmar cualquier agencia de IA genérica, está mal: tiene que
sonar a VOCAI — experto, concreto, sin floreo corporativo.

NUNCA ESCRIBAS (lista negra — si aparece, descártalo y reescribe):
1. Motivacional vacío: "tu éxito", "potencia tu negocio", "el futuro es ahora",
   "piensa en grande".
2. Preguntas sin sustancia: "¿Estás preparado?", "¿Listo para...?".
3. Lenguaje gurú: "mindset", "cerebro digital", "sinergia", "chispa humana".
4. Términos inventados sin sentido: "inteligencia híbrida", "estrategias audibles".
5. Promesas mágicas: "resultados en 30 días", "automatiza todo tu negocio".
6. Tono corporativo: "en VOCAI ofrecemos", "soluciones a medida".
7. Posicionarte como agencia de marketing: "tu contenido que convierte".
8. Tecnicismo crudo en el título: "LLM", "RAG", "n8n".
9. Slogans de relleno sin un dato o un caso que los respalde.

SÍ DECIR (lista blanca):
- Qué hace VOCAI, concreto: automatizar lo repetitivo, bajar costes, grabar en
  un estudio físico.
- El problema real del cliente, nombrado.
- Números, ahorros o antes/después SOLO si están en la fuente. No los inventes.
- El estudio físico de Alicante como gancho tangible.

TEXTOS BLOQUEADOS (úsalos literal, no los reescribas):
- "Hacemos crecer tu empresa con IA" — descriptor de IA.
- "Estudio de grabación en Alicante" — descriptor del estudio.
- "La voz de tu negocio" — es el tagline: acompaña al logo, NUNCA es título.
- "VOCAI" — el wordmark de la marca.

CHEQUEO OBLIGATORIO ANTES DE DEVOLVER:
Relee lo que escribiste dos veces:
1. ¿Hay alguna forma de voseo? Si la hay, reescríbelo en tuteo de España.
2. ¿Hay algún patrón de la lista negra? Si lo hay, descártalo y reescribe.
No devuelvas nada sin pasar este chequeo.`;

// Contexto por categoría — orienta la fórmula de titular.
const CONTEXTO_CATEGORIA = {
  novedad:   'Es una NOVEDAD: algo nuevo que VOCAI lanza o anuncia.',
  educativo: 'Es una placa EDUCATIVA: enseña algo concreto de IA o ' +
             'automatización aplicada. Suelen pegar las fórmulas 2 y 4.',
  caso:      'Es un CASO REAL: un resultado o ejemplo concreto. Usá la ' +
             'fórmula 6 si hay un dato con fuente.',
  interno:   'Es PUERTAS ADENTRO: el estudio, la oficina, el detrás de ' +
             'escena en Alicante. Suele pegar la fórmula 5.',
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

// Convierte una respuesta fallida de Gemini en un Error legible para el usuario.
async function errorGemini(res, etiqueta) {
  if ([429, 502, 503].includes(res.status)) {
    return new Error('Gemini está sobrecargado en este momento. ' +
      'Esperá un minuto y volvé a intentar.');
  }
  return new Error(`Gemini ${etiqueta} ${res.status}: ${await res.text()}`);
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
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
    body: JSON.stringify(body),
  };
  // Probar el modelo primario; si sigue sobrecargado, caer al de respaldo.
  let res;
  for (let i = 0; i < MODELOS_TEXTO.length; i++) {
    res = await fetchConReintentos(`${BASE}/${MODELOS_TEXTO[i]}:generateContent`, opts);
    if (res.ok || ![429, 502, 503].includes(res.status)) break;
    if (i < MODELOS_TEXTO.length - 1) {
      console.log(`[Gemini] ${MODELOS_TEXTO[i]} sobrecargado — probando ${MODELOS_TEXTO[i + 1]}`);
    }
  }
  if (!res.ok) throw await errorGemini(res, 'texto');
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '').join('').trim();
  if (!txt) throw new Error('Gemini no devolvió respuesta');
  return txt;
}

// ── Especialista 1 · Copy: idea → { titulo, subtitulo } ──────
// modoLibre=true: el especialista respeta la idea al pie, sin lista negra ni
// regla de oro. Útil para teasers, contraejemplos o frases bloqueadas a propósito.
async function generarTexto(idea, categoria = '', modoLibre = false, referenciaPath = null) {
  const hayRef = referenciaPath && fs.existsSync(referenciaPath);
  const bloqueRef = hayRef ? `

IMAGEN DE REFERENCIA: te adjuntaron una imagen. Estudiala. Si la idea hace
referencia a ella (ej: "con esa frase", "como la imagen que te adjunto",
"lo que pone ahí"), extrae de la imagen lo que la idea pida — texto, frase,
dato. Si la imagen contiene texto y la idea lo pide como título, devuelve
ese texto literal en el campo "titulo".` : '';
  let sys;
  if (modoLibre) {
    sys =
`Eres el copywriter de VOCAI — empresa de IA y automatización en Alicante, con
estudio de grabación propio.

Te dan una IDEA en español para una placa de Instagram. Devuelves TÍTULO y
SUBTÍTULO.

MODO LIBRE — respetas al pie lo que el usuario pide en la idea. Si pide una
frase literal, devuélvela tal cual. Si pide un tono específico (misterio,
ironía, pregunta, contraintuitivo), respétalo. NO filtres contra ninguna lista
negra. NO apliques la regla de oro "se entiende solo". NO impongas fórmulas
de título. NO impongas estructura. La responsabilidad del copy en este modo
es del usuario, no tuya.

IDIOMA: español de España con TUTEO ("tú", "tienes", "puedes"). Es lo único
innegociable.

SUBTÍTULO: si la idea pide subtítulo vacío o no aporta nada, devuelve "".${bloqueRef}

Devuelve SOLO un JSON { "titulo": "...", "subtitulo": "..." }, sin markdown.`;
  } else {
  const ctx = CONTEXTO_CATEGORIA[categoria];
  const bloqueCtx = ctx ? `\nCONTEXTO DE ESTA PLACA: ${ctx}\n` : '';
  const ejemplos = await biblioteca.bloqueEjemplos();
  sys =
`Eres el copywriter de VOCAI — empresa de IA y automatización en Alicante, con
estudio de grabación propio.

Te dan una IDEA en español para una placa de Instagram. Escribes dos campos:
el TÍTULO y el SUBTÍTULO. El kicker (la etiqueta de categoría) lo pone el
sistema aparte — tú NO lo escribes.
${bloqueCtx}
TÍTULO:
- El mensaje principal de la placa. 4 a 9 palabras, máximo ~60 caracteres.
- Una sola idea. Capitalización normal (solo la primera letra y los nombres
  propios en mayúscula) — NUNCA Mayúscula En Cada Palabra.
- REGLA DE ORO: el título tiene que entenderse leído solo. Si aislado no dice
  nada concreto, está mal. "¿Estás preparado?" leído solo = nada → RECHAZADO.
  "Hacemos crecer tu empresa con IA" leído solo = se entiende → OK.

SUBTÍTULO:
- Aterriza el título. 6 a 14 palabras, máximo ~90 caracteres.
- Agrega información — NO repite el título con otras palabras.
- Si de verdad no aporta nada, devuelve "".

FÓRMULAS DE TÍTULO (elige una según la idea, no improvises la estructura):
1. Descriptor bloqueado → placa de presentación o "qué es VOCAI".
2. Problema concreto del cliente. Ej: "Pierdes horas en algo que la IA hace
   en 3 segundos".
3. Qué hacemos + resultado tangible. Ej: "Donde tu negocio empieza a moverse solo".
4. Afirmación contraintuitiva. Ej: "No necesitas IA. Necesitas resolver un problema".
5. El estudio como lugar físico. Ej: "Ven, te sientas, grabas".
6. Dato o caso real — SOLO si la idea trae una fuente concreta.

CTA: no va en el título. Si la placa lleva llamada a la acción, va en el subtítulo.

${REGLAS_MARCA}${ejemplos}${bloqueRef}

Devuelve SOLO un JSON { "titulo": "...", "subtitulo": "..." }, sin markdown.`;
  }

  const txt = await llamarTexto({ sys, user: `Idea: ${idea}`, json: true,
    imagenPath: hayRef ? referenciaPath : null });
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

// ── Especialista · Copy: idea → texto del posteo (caption) ───
async function generarCopy(idea, modoLibre = false, referenciaPath = null) {
  const hayRef = referenciaPath && fs.existsSync(referenciaPath);
  const bloqueRef = hayRef ? `

IMAGEN DE REFERENCIA: te adjuntaron una imagen. Estudiala. Si la idea hace
referencia a ella (ej: "esa frase", "como la imagen", "lo que pone ahí"),
extrae de la imagen lo que la idea pida y úsalo en el copy.` : '';
  let sys;
  if (modoLibre) {
    sys =
`Eres el copywriter de VOCAI — empresa de IA y automatización en Alicante, con
estudio de grabación propio.

Te dan una IDEA. Escribes el COPY del posteo de Instagram (lo que va debajo
de la imagen).

MODO LIBRE — respetas al pie lo que el usuario pide en la idea. Longitud,
tono, forma, frases literales: todo se respeta. NO impongas estructura
gancho/desarrollo/CTA si la idea pide otra cosa. NO impongas hashtags si la
idea no los pide. NO filtres contra lista negra. La responsabilidad del copy
en este modo es del usuario, no tuya.

IDIOMA: español de España con TUTEO ("tú", "tienes", "puedes"). Es lo único
innegociable.${bloqueRef}

Devuelve SOLO el texto del copy, listo para pegar. Sin comillas, sin etiquetas.`;
  } else {
    const ejemplos = await biblioteca.bloqueEjemplos();
    sys =
`Eres el copywriter de VOCAI — empresa de IA y automatización en Alicante, con
estudio de grabación propio.

Te dan una IDEA. Escribes el COPY: el texto que acompaña al posteo de Instagram
(feed o carrusel), el que va debajo de la imagen.

Estructura — tres bloques en este orden:
- GANCHO: 1 frase. Una afirmación concreta o un problema real. Nunca una
  pregunta vacía.
- DESARROLLO: 2 a 4 líneas cortas, una idea por línea. Qué hace VOCAI y qué
  gana el cliente: tareas que se eliminan, costes que bajan, tiempo que se libera.
- CTA: 1 frase, una sola acción concreta ("Escríbenos.", "Agenda una visita a
  nuestro estudio en Alicante.").

Longitud total: 40 a 80 palabras. Cierra con 4 a 6 hashtags sobrios.
- Hashtags SÍ: #VOCAI #Alicante #Automatización #InteligenciaArtificial.
- Hashtags NO: #Innovacion #EstrategiaIA #mindset ni genéricos de relleno.

EMOJIS:
Usa 2 a 3 emojis estratégicos en todo el copy. Uno al final del GANCHO para
frenar el scroll; uno en el CTA si aporta; ninguno o uno suelto en el
DESARROLLO solo si refuerza el mensaje. NUNCA pongas más de 3 emojis en total.
- Lista blanca (coherentes con VOCAI): 🎙️ ⚡ 🤖 🚀 💡 ✨ 📈 🔥 🛠️ 🎯.
- Lista negra (motivacional vacío o decorativo): 😍 🎉 🥳 ❤️ 👏 🙌 ✅ 👇 👀.
- NUNCA emojis al inicio del copy ni intercalados como adorno.

${REGLAS_MARCA}${ejemplos}${bloqueRef}

Devuelve SOLO el texto del copy, listo para pegar. Sin comillas, sin etiquetas.`;
  }
  const txt = await llamarTexto({ sys, user: `Idea: ${idea}`,
    imagenPath: hayRef ? referenciaPath : null });
  return txt.trim();
}

// ── Especialista 2 · Prompt engineer para Nano Banana ────────
async function generarPromptImagen(idea, estiloSlug, referenciaPath = null, aspecto = '9:16') {
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

Te dan una IDEA en español para la ILUSTRACIÓN DE FONDO de una placa de
Instagram (vertical, formato ${aspecto}). Tu trabajo NO es copiar la idea ni escribirla: es
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
* ${aspecto} vertical composition.
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
  const ejemplos = await biblioteca.bloqueEjemplos();
  const sys =
`Eres el director creativo de carruseles de VOCAI — empresa de IA y automatización
en Alicante, con estudio de grabación propio.

Te dan una IDEA en español. La conviertes en un CARRUSEL de Instagram: 4 a 8 slides
que se leen en secuencia. REGLA NÚMERO UNO: que NO sea monótono. Cada slide tiene
que sorprender — varía el layout, el ritmo y la cantidad de texto. Está prohibido
que todos los slides se vean igual.${bloqueRef}

Estructura:
- Slide 1: PORTADA. El gancho que frena el scroll.
- Slides del medio: CONTENIDO. Una idea por slide.
- Última slide: CIERRE. Remate + llamada a la acción.

LAYOUTS para los slides de CONTENIDO (elige el que mejor le quede a cada idea y
NUNCA repitas el mismo layout dos veces seguidas):
- "imagen-fondo": imagen a sangre completa con el texto encima. Para ideas
  visuales y potentes.
- "split": imagen arriba, texto sobre fondo de marca abajo. Editorial y ordenado.
- "texto-pleno": SIN imagen, una idea grande sola sobre fondo de marca. Para
  conceptos o frases que pegan más solas. Da respiro al carrusel.
- "dato": SIN imagen, un número o cifra GIGANTE como protagonista. Úsalo SOLO si
  hay un dato concreto (un porcentaje, una cantidad, un "3x").
- "cita": SIN imagen, una frase tipo cita destacada. Para una afirmación fuerte.

La PORTADA usa siempre "portada" y el CIERRE siempre "cierre" — esos los fijo yo.
Un buen carrusel MEZCLA: algunos slides con imagen, otros sin imagen.

Devuelve SOLO un JSON con esta forma exacta:
{ "slides": [ { "tipo": "...", "layout": "...", "titulo": "...", "cuerpo": "...", "dato": "...", "prompt_imagen": "..." } ] }

Campos:
- "tipo": "portada" la primera, "cierre" la última, "contenido" el resto.
- "layout": uno de la lista (para contenido). Portada → "portada", cierre → "cierre".
- "titulo": texto principal del slide, en español de España con tuteo, corto y
  directo. Capitalización normal — NUNCA Mayúscula En Cada Palabra. En layout
  "dato" el titulo es el rótulo corto que acompaña al número.
- "cuerpo": texto de apoyo o desarrollo en español de España con tuteo, una o
  dos líneas. En el cierre va la llamada a la acción. Si de verdad no hace falta, "".
- "dato": SOLO para layout "dato" — la cifra protagonista, cortísima (ej "85%",
  "3x", "+40"). En los demás layouts, "".
- "prompt_imagen": SOLO para layouts con imagen (portada, imagen-fondo, split,
  cierre). En texto-pleno, dato y cita va "". Cuando lleva imagen es un prompt en
  inglés para Nano Banana Pro:
  * Empieza con este estilo, tal cual: ${estiloDesc}
  * Una escena visual concreta y específica, conceptual, nunca literal.
  * Coherencia visual entre TODAS las slides con imagen.
  * Paleta: deep navy blue (#141d35) dominant background, electric blue (#2979FF)
    and coral red (#FF6B6B) accents.
  * Vertical 4:5 composition. Keep one area calm and darker for text.
  * Terminá con: Absolutely no text, no letters, no numbers, no words.

El texto de los slides (titulo, cuerpo, dato) cumple estas reglas de marca:

${REGLAS_MARCA}${ejemplos}

Responde SOLO el JSON, sin markdown.`;

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
        imageConfig: { aspectRatio: aspecto, imageSize: '2K' },
      },
    }),
  });
  if (!res.ok) throw await errorGemini(res, 'imagen');
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData || p.inline_data);
  if (!img) throw new Error('Gemini no devolvió una imagen');
  const b64 = (img.inlineData || img.inline_data).data;
  fs.writeFileSync(savePath, Buffer.from(b64, 'base64'));
}

// ── Nano Banana Pro: editar una imagen existente ────────────
async function editarImagen(imagenPath, instruccion, savePath, aspecto = '9:16') {
  const b64in = fs.readFileSync(imagenPath).toString('base64');
  const prompt =
    `You are editing this existing image. Apply ONLY the following targeted ` +
    `change, keeping the rest of the image unchanged: ${instruccion}. ` +
    `CRITICAL: preserve the rest of the image — composition, colors, subjects, ` +
    `lighting, mood, style — exactly as it is. Modify only what the change ` +
    `explicitly mentions; nothing else. Do NOT regenerate the image from ` +
    `scratch. The user wants a surgical correction on this existing image, ` +
    `not a new image. The change must be visible but localized to what was asked. ` +
    `This is a background illustration: absolutely no text, no letters, no numbers, ` +
    `no words. Output a clean ${aspecto} vertical image.`;
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
        imageConfig: { aspectRatio: aspecto, imageSize: '2K' },
      },
    }),
  });
  if (!res.ok) throw await errorGemini(res, 'edición');
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData || p.inline_data);
  if (!img) throw new Error('Gemini no devolvió la imagen editada');
  fs.writeFileSync(savePath, Buffer.from((img.inlineData || img.inline_data).data, 'base64'));
}

// ── Especialista · Blog: tema → post largo SEO en markdown ───
async function generarBlog(tema, { keyword = '', pilar = '', angulo = '' } = {}) {
  const sys =
`Eres el redactor de blog de VOCAI — empresa de IA y automatización en Alicante,
con estudio de grabación propio. Tagline: "La voz de tu negocio".

Te dan un TEMA y escribes un artículo de blog completo, optimizado para SEO,
para publicar en vocai.es/blog.

${REGLAS_MARCA}

ESTRUCTURA Y SEO:
- Long-form real: entre 600 y 1000 palabras.
- "body_md" en MARKDOWN. NO incluyas un "# H1" (el título va aparte). Usa
  varios "## H2" y, si hace falta, "### H3". Párrafos cortos, alguna lista.
- Naturalidad: la keyword aparece en el título, en el primer párrafo y en
  algún H2, sin forzar (nada de keyword stuffing).
- Cierra con un párrafo que invite a contactar a VOCAI, sin sonar a panfleto.

TONO: experto, directo, cercano. Cero relleno corporativo. Aportar valor real
y concreto (ejemplos, pasos, casos), no generalidades.

Devuelve SOLO un JSON, sin markdown alrededor, con estos campos:
{
  "titulo": "título del artículo (H1), 6-12 palabras",
  "slug": "slug-url-en-minusculas-con-guiones",
  "meta_description": "resumen para Google, máximo 160 caracteres",
  "excerpt": "1-2 frases para el listado del blog",
  "keyword": "keyword SEO objetivo",
  "body_md": "cuerpo del artículo en markdown"
}`;

  const userBits = [`Tema: ${tema}`];
  if (keyword) userBits.push(`Keyword SEO objetivo: ${keyword}`);
  if (pilar)   userBits.push(`Pilar de contenido: ${pilar}`);
  if (angulo)  userBits.push(`Ángulo / enfoque: ${angulo}`);

  const txt = await llamarTexto({ sys, user: userBits.join('\n'), json: true });
  let post;
  try {
    post = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
  } catch (e) {
    throw new Error('El blog no vino en JSON válido');
  }
  return {
    titulo: (post.titulo || '').trim(),
    slug: (post.slug || '').trim(),
    meta_description: (post.meta_description || '').trim(),
    excerpt: (post.excerpt || '').trim(),
    keyword: (post.keyword || keyword || '').trim(),
    body_md: (post.body_md || '').trim(),
  };
}

module.exports = {
  generarTexto, generarCopy, generarPromptImagen, generarCarrusel,
  generarImagen, editarImagen, generarBlog, ESTILOS_ILUSTRACION,
};
