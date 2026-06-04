/* ============================================================
   VOCAI OS — Cliente de Claude (Anthropic Messages API)
   Motor del asistente conversacional del dashboard.
   Habla por fetch directo (sin SDK), igual que config/gemini.js.
   La key vive en .env (ANTHROPIC_API_KEY) — nunca en el código.
   ============================================================ */

const API_URL = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';
const MODELO = 'claude-sonnet-4-6';
// Tope alto: el asistente a veces emite/edita artículos de blog completos
// (body markdown largo) dentro de un tool_use. 2048 los cortaba. Es solo un
// techo — las respuestas cortas de chat no consumen más por subirlo.
const MAX_TOKENS = 8192;
// Tope de vueltas del loop de tools: evita que un bucle de tool-use
// se dispare sin control. 6 alcanza para varias acciones encadenadas.
const MAX_TURNS = 6;

function key() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('Falta ANTHROPIC_API_KEY en el .env');
  return k;
}

// Estados transitorios: la API de Anthropic devuelve 500/502/503/529 de forma
// intermitente bajo carga (su "Internal server error" va y viene). Reintentamos
// con backoff antes de rendirnos — el mismo request suele salir bien al 2º intento.
const TRANSITORIOS = [429, 500, 502, 503, 529];
const ESPERAS = [0, 1500, 4000, 8000]; // ms antes de cada intento

async function llamar(body) {
  let res, ultimoTxt = '';
  for (let i = 0; i < ESPERAS.length; i++) {
    if (ESPERAS[i]) await new Promise(r => setTimeout(r, ESPERAS[i]));
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key(),
        'anthropic-version': VERSION,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    ultimoTxt = await res.text();
    if (!TRANSITORIOS.includes(res.status)) break;       // error real: no reintentar
    if (i < ESPERAS.length - 1) {
      console.log(`[Claude] HTTP ${res.status} — transitorio, reintento ${i + 1}/${ESPERAS.length - 1}…`);
    }
  }
  if (TRANSITORIOS.includes(res.status)) {
    throw new Error('Claude está sobrecargado en este momento. Esperá un momento y volvé a intentar.');
  }
  throw new Error(`Claude ${res.status}: ${ultimoTxt}`);
}

/* ── Chat con tool-use ────────────────────────────────────────
   Corre el loop completo: pide a Claude, si pide herramientas las
   ejecuta vía `ejecutarTool` y le devuelve el resultado, hasta que
   Claude responde texto final o se agota MAX_TURNS.

   Parámetros:
   · system        → string, system prompt (contexto de marca + datos en vivo).
   · messages      → historial [{ role:'user'|'assistant', content }].
   · tools         → array de tool definitions (formato Anthropic). Opc.
   · ejecutarTool  → async (nombre, input) => resultado serializable. Opc.

   Devuelve { texto, acciones } donde `acciones` lista las herramientas
   que se ejecutaron (para mostrarle al usuario qué tocó el asistente).
   ============================================================ */
async function chat({ system, messages, tools = [], ejecutarTool = null }) {
  const historial = [...messages];
  const acciones = [];

  for (let turno = 0; turno < MAX_TURNS; turno++) {
    const body = {
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system,
      messages: historial,
    };
    if (tools.length) body.tools = tools;

    const data = await llamar(body);
    const bloques = data.content || [];

    // Si no pidió herramientas, devolvemos el texto final.
    if (data.stop_reason !== 'tool_use') {
      const texto = bloques.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      return { texto, acciones };
    }

    // Pidió herramientas: las ejecutamos y le devolvemos los resultados.
    historial.push({ role: 'assistant', content: bloques });
    const resultados = [];
    for (const b of bloques) {
      if (b.type !== 'tool_use') continue;
      let resultado, esError = false;
      try {
        resultado = ejecutarTool ? await ejecutarTool(b.name, b.input) : { error: 'sin ejecutor' };
      } catch (err) {
        resultado = { error: err.message };
        esError = true;
      }
      acciones.push({ tool: b.name, input: b.input, ok: !esError });
      resultados.push({
        type: 'tool_result',
        tool_use_id: b.id,
        content: JSON.stringify(resultado),
        is_error: esError,
      });
    }
    historial.push({ role: 'user', content: resultados });
  }

  return { texto: 'No pude cerrar la respuesta (demasiadas vueltas). Probá de nuevo más concreto.', acciones };
}

module.exports = { chat, MODELO };
