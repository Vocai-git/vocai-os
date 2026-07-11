/* ============================================================
   VOCAI — Radar IA · Motor de research
   Busca novedades de IA con Grok (web + X), las filtra, las
   guarda en el banco de temas y manda un digest por Telegram.
   Parte 1 de 2 — el monitoreo de YouTube va aparte.
   ============================================================ */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../config/supabase');

const XAI_KEY  = process.env.XAI_API_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;

const TIPO_EMOJI = { herramienta: '🛠', caso: '📈', debate: '💬', hype: '🔥', espana: '🇪🇸', youtube: '📺' };

// Secciones del digest — orden + título por categoría. Si una sección no tiene
// items ese día, no aparece.
const SECCIONES = [
  { tipo: 'herramienta', titulo: '🛠 HERRAMIENTAS NUEVAS' },
  { tipo: 'caso',        titulo: '📈 CASOS REALES' },
  { tipo: 'hype',        titulo: '🔥 TENDENCIA / LO QUE PEGA' },
  { tipo: 'debate',      titulo: '💬 DEBATES DEL SECTOR' },
  { tipo: 'espana',      titulo: '🇪🇸 EVENTOS EN ESPAÑA' },
];

// Whitelist de medios confiables — solo se aceptan URLs de estos dominios.
// Cualquier otra fuente que Grok devuelva se descarta en el filtro.
const MEDIOS_TRUSTED = [
  'xataka.com', 'elpais.com', 'techcrunch.com', 'theverge.com',
  'technologyreview.com', 'wired.com', 'arstechnica.com',
];

// Referentes de X/Twitter — sus cuentas son fuente confiable.
const REFERENTES_X = [
  'elonmusk', 'sama', 'openai', 'anthropicai', 'googledeepmind',
];

// Referentes de YouTube — qué canales monitoreamos cada día.
// El channel_id (UC...) se resuelve la primera vez scrapeando el canal y queda
// cacheado en memoria. Si la lista cambia, editar acá.
const REFERENTES_YT = [
  { nombre: 'Jon Hernández',      handle: 'la_inteligencia_artificial' },
  { nombre: 'Imperio Agéntico',   handle: 'bencord' },
  { nombre: 'Dot CSV',            handle: 'DotCSV' },
  { nombre: 'Xavier Mitjana',     handle: 'XavierMitjana' },
  { nombre: 'Matt Wolfe',         handle: 'mreflow' },
];
const cacheChannelId = {};   // handle → channel_id (en memoria)

const PROMPT_SISTEMA =
`Sos el analista de research de VOCAI, una empresa de IA y automatización para
negocios (pymes, comercios, restaurantes). Tu trabajo es encontrar novedades de
IA que se conviertan en MATERIAL DE CONTENIDO para redes — para una audiencia de
dueños de negocios, no técnicos.

Buscás 5 tipos de info:
1. herramienta — una herramienta o función nueva de IA, concreta y usable por un negocio.
2. caso — un negocio real que aplicó IA o automatización, y su resultado.
3. debate — una duda, miedo o discusión sobre la IA en el mundo de los negocios.
4. hype — un tema de IA que está caliente o viral ahora mismo.
5. espana — un evento (congreso, feria, charla) o una novedad del sector marketing + IA en España.

FILTRO OBLIGATORIO: cada item tiene que poder convertirse en una pieza de
contenido (un reel o un carrusel). Si no podés explicar en una línea cómo se
convierte, NO lo incluyas. Descartá noticias de la industria tech que no sean
accionables: rondas de inversión, papers académicos, valoraciones de empresas.

Respondés SOLO con un JSON array válido, sin markdown ni texto extra.`;

const PROMPT_USUARIO =
`Buscá las 4 a 6 novedades de IA más relevantes de las últimas 24 horas.
Incluí siempre al menos una sobre marketing + IA en España: eventos,
congresos, ferias o novedades del sector allá.

REGLA OBLIGATORIA DE FUENTES — solo aceptamos estas, las demás se descartan:
- Medios trusted: Xataka, El País (Tecnología), TechCrunch, The Verge,
  MIT Technology Review, Wired, Ars Technica.
- Cuentas de X verificadas: @elonmusk, @sama, @OpenAI, @AnthropicAI, @GoogleDeepMind.
Si la noticia no está publicada en uno de esos medios o cuentas, NO la incluyas.
La fuente_url tiene que ser del dominio exacto del medio (ej. techcrunch.com,
no techcrunch.news ni news-techcrunch.com). NO inventes URLs.

Cada item, un objeto con:
- titulo: titular corto y claro
- descripcion: qué pasó, máximo 12 palabras
- fecha: la fecha de la noticia, formato AAAA-MM-DD
- tipo: uno de "herramienta", "caso", "debate", "hype", "espana"
- angulo_contenido: en una frase, cómo convertirlo en un reel o carrusel para VOCAI
- fuente: el nombre del medio o referente de donde salió
- fuente_url: el link directo

Devolvé solo el JSON array.`;

// ── 1. Buscar novedades con Grok ────────────────────────────
async function buscarNovedades() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240000); // 4 min
  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4.3',
        stream: false,
        input: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user',   content: PROMPT_USUARIO },
        ],
        tools: [{ type: 'web_search' }, { type: 'x_search' }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`xAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const msg = (data.output || []).find(o => o.type === 'message');
    if (!msg) throw new Error('xAI: respuesta sin mensaje');
    const txt = (msg.content || []).find(c => c.type === 'output_text')?.text || '';
    const limpio = txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(limpio);
  } finally {
    clearTimeout(timer);
  }
}

// Valida que una URL pertenezca a un medio trusted o a un referente de X/YouTube.
// Si no, devuelve false y el item se descarta antes de guardarlo o publicarlo.
function fuenteConfiable(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (MEDIOS_TRUSTED.some(d => host === d || host.endsWith('.' + d))) return true;
    if (host === 'twitter.com' || host === 'x.com') {
      const m = u.pathname.match(/^\/([^/?#]+)/);
      if (m && REFERENTES_X.includes(m[1].toLowerCase())) return true;
    }
    if (host === 'youtube.com' || host === 'youtu.be') return true;
    return false;
  } catch { return false; }
}

// ── 2. Guardar en el banco de temas ─────────────────────────
async function guardar(items) {
  const filas = items.map(it => ({
    titulo:        it.titulo,
    descripcion:   it.descripcion || '',
    fecha_noticia: it.fecha || null,
    tipo:          it.tipo || null,
    angulo:        it.angulo_contenido || '',
    fuente:        it.fuente || 'Radar IA',
    fuente_url:    it.fuente_url || null,
    pilar:         'ia',
    estado:        'nuevo',
  }));
  const { error } = await supabase.from('content_topics').insert(filas);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return filas.length;
}

// ── 3. Digest liviano por Telegram ──────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function corto(s, n) {
  const p = String(s || '').trim().split(/\s+/);
  return p.length <= n ? String(s || '') : p.slice(0, n).join(' ') + '…';
}

function renderItem(it, i) {
  const em = TIPO_EMOJI[it.tipo] || '•';
  let t = `${i + 1}. ${em} <b>${escHtml(it.titulo)}</b>\n`;
  if (it.descripcion) t += `${escHtml(corto(it.descripcion, 14))}\n`;
  const partes = [];
  if (it.fecha) partes.push(escHtml(it.fecha));
  if (it.fuente_url) {
    partes.push(`<a href="${escHtml(it.fuente_url)}">${escHtml(it.fuente || 'Fuente')} ↗</a>`);
  } else if (it.fuente) {
    partes.push(escHtml(it.fuente));
  }
  return t + partes.join(' · ') + '\n\n';
}

async function digest(novedades, yt = []) {
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const total = novedades.length + yt.length;
  let texto = `📡 <b>RADAR IA</b> · ${fecha} · ${total} ${total === 1 ? 'tema' : 'temas'}\n\n`;

  // Render por categoría: solo aparece la sección si tiene items ese día.
  let n = 0;
  for (const sec of SECCIONES) {
    const items = novedades.filter(it => it.tipo === sec.tipo);
    if (!items.length) continue;
    texto += `<b>${sec.titulo}</b>\n\n`;
    items.forEach(it => { texto += renderItem(it, ++n); });
  }

  // Items con tipo no estándar — los renderizo aparte para no perderlos.
  const otros = novedades.filter(it => !SECCIONES.some(s => s.tipo === it.tipo));
  if (otros.length) {
    texto += `<b>• OTROS</b>\n\n`;
    otros.forEach(it => { texto += renderItem(it, ++n); });
  }

  if (yt.length) {
    texto += `<b>📺 REFERENTES YOUTUBE</b>\n\n`;
    yt.forEach(it => { texto += renderItem(it, ++n); });
  }

  texto += `→ Detalle completo en el dashboard · Marketing · Inteligencia`;

  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TG_CHAT, text: texto, parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

// Aviso de error por Telegram — si el radar falla, te enterás en vez de
// quedarte sin saber por qué no llegó el digest.
async function avisarErrorTelegram(err) {
  if (!TG_TOKEN || !TG_CHAT) return;
  const texto = `⚠️ <b>Radar IA falló</b>\n\n<code>${escHtml(err.message || String(err))}</code>` +
                `\n\nIntentá disparar el Radar manualmente desde el dashboard ` +
                `(Marketing · Inteligencia · "Correr Radar ahora").`;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto, parse_mode: 'HTML' }),
    });
  } catch (e) { /* ya estamos en el manejador de error, no doble-fallar */ }
}

// ── 4. Monitoreo de YouTube ─────────────────────────────────
// Resuelve handle de YouTube → channel_id (UC...). Scrapea la página del canal
// una sola vez y cachea en memoria. Si falla, devuelve null y se ignora ese ref.
async function resolverChannelId(handle) {
  if (cacheChannelId[handle]) return cacheChannelId[handle];
  try {
    const res = await fetch(`https://www.youtube.com/@${handle}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = /"channelId":"(UC[\w-]{20,})"/.exec(html) ||
              /"externalId":"(UC[\w-]{20,})"/.exec(html);
    if (!m) return null;
    cacheChannelId[handle] = m[1];
    return m[1];
  } catch (e) {
    return null;
  }
}

// Lee el RSS de un canal y devuelve los videos publicados después de `desde` (Date).
async function videosRecientesYT(channelId, desde) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!res.ok) return [];
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  const videos = [];
  for (const e of entries) {
    const body = e[1];
    const tit = /<title>([\s\S]*?)<\/title>/.exec(body);
    const lnk = /<link rel="alternate" href="([^"]+)"/.exec(body);
    const pub = /<published>([^<]+)<\/published>/.exec(body);
    const dsc = /<media:description>([\s\S]*?)<\/media:description>/.exec(body);
    if (!tit || !pub) continue;
    const fecha = new Date(pub[1]);
    if (fecha < desde) continue;
    videos.push({
      titulo: tit[1].trim(),
      url:    lnk ? lnk[1] : '',
      fecha:  pub[1],
      descripcion: dsc ? dsc[1].trim().slice(0, 400) : '',
    });
  }
  return videos;
}

// Toma los videos crudos y pide a Gemini que extraiga título corto +
// resumen + ángulo de contenido para VOCAI. Devuelve items con la misma forma
// que las novedades de Grok para que entren al mismo flujo.
async function analizarVideosYT(crudos) {
  if (!crudos.length) return [];
  const sys =
`Sos el analista de research de VOCAI. Te paso una lista de videos publicados
por los referentes de IA en YouTube en las últimas 24 horas. Por cada video,
devolvé un análisis para que sirva como input de contenido VOCAI.

Devolvé SOLO un JSON array, sin markdown. Cada item:
{ "titulo": "...", "descripcion": "...", "angulo_contenido": "...", "fecha": "AAAA-MM-DD" }

Reglas:
- titulo: el título original del video (no lo cambies).
- descripcion: en una línea, qué cuenta el video. Máximo 14 palabras.
- angulo_contenido: en una frase, cómo se puede convertir en pieza VOCAI.
- fecha: la fecha del video (AAAA-MM-DD).
- Si un video NO sirve como insumo de contenido (ej: directo de horas sin tema claro,
  shorts intrascendente), descártalo.`;

  const lista = crudos.map((v, i) =>
    `[${i}] (${v.referente}) "${v.titulo}" — ${v.descripcion.slice(0, 200)}` +
    ` · ${v.fecha} · ${v.url}`).join('\n');

  // Llamamos a Gemini con fetch directo (misma API que usa config/gemini.js).
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ parts: [{ text: 'Videos:\n' + lista }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '').join('').trim();
  let arr;
  try { arr = JSON.parse(txt); } catch { return []; }
  if (!Array.isArray(arr)) return [];

  // Reasocio cada análisis con el crudo (por título) para no perder la URL.
  return arr.map(a => {
    const c = crudos.find(x => x.titulo === a.titulo) || {};
    return {
      titulo: a.titulo || c.titulo,
      descripcion: a.descripcion || '',
      fecha: a.fecha || (c.fecha ? c.fecha.slice(0, 10) : ''),
      tipo: 'youtube',
      angulo_contenido: a.angulo_contenido || '',
      fuente: c.referente || 'YouTube',
      fuente_url: c.url || '',
    };
  });
}

async function monitorearYoutube() {
  const desde = new Date(Date.now() - 30 * 60 * 60 * 1000);  // últimas 30h por margen
  const todos = [];
  for (const ref of REFERENTES_YT) {
    const id = await resolverChannelId(ref.handle);
    if (!id) {
      console.warn(`[YouTube] No se pudo resolver channel_id de @${ref.handle}`);
      continue;
    }
    try {
      const vids = await videosRecientesYT(id, desde);
      vids.forEach(v => todos.push({ ...v, referente: ref.nombre }));
    } catch (err) {
      console.error(`[YouTube] ${ref.nombre}: ${err.message}`);
    }
  }
  if (!todos.length) {
    console.log('[YouTube] Sin videos nuevos en las últimas 24h.');
    return [];
  }
  console.log(`[YouTube] ${todos.length} videos detectados, analizando con Gemini...`);
  return await analizarVideosYT(todos);
}

// ── Orquestador ─────────────────────────────────────────────
async function runRadarIA() {
  console.log('[Radar IA] Buscando novedades con Grok (web + X)...');
  const crudas = await buscarNovedades();
  console.log(`[Radar IA] ${crudas.length} novedades de Grok (crudas).`);

  // Filtro de confiabilidad — solo medios trusted o referentes X/YouTube.
  const novedades = [];
  const descartadas = [];
  for (const it of crudas) {
    if (fuenteConfiable(it.fuente_url)) novedades.push(it);
    else descartadas.push(it);
  }
  if (descartadas.length) {
    console.log(`[Radar IA] ${descartadas.length} descartadas por fuente no confiable:`);
    descartadas.forEach(d => console.log(`  · "${d.titulo}" — ${d.fuente_url || '(sin URL)'}`));
  }
  console.log(`[Radar IA] ${novedades.length} novedades confiables.`);

  let yt = [];
  try {
    yt = await monitorearYoutube();
    console.log(`[Radar IA] ${yt.length} videos de YouTube analizados.`);
  } catch (err) {
    console.error('[Radar IA] YouTube falló (sigo sin él):', err.message);
  }

  // Opción B: si no hay nada confiable, no se manda digest (evita ruido).
  if (!novedades.length && !yt.length) {
    console.log('[Radar IA] Sin novedades confiables hoy — no se manda digest.');
    return { total: 0, grok: 0, youtube: 0, descartadas: descartadas.length };
  }

  const items = [...novedades, ...yt];
  const n = await guardar(items);
  console.log(`[Radar IA] ${n} guardadas en content_topics.`);

  await digest(novedades, yt);
  console.log('[Radar IA] Digest enviado por Telegram.');

  return { total: items.length, grok: novedades.length, youtube: yt.length, descartadas: descartadas.length };
}

// Reenvía el digest con los últimos temas guardados, sin buscar (para testing).
async function pruebaDigest() {
  const { data, error } = await supabase
    .from('content_topics')
    .select('*').order('created_at', { ascending: false }).limit(7);
  if (error) throw new Error(error.message);
  const items = (data || []).map(t => ({
    titulo: t.titulo, descripcion: t.descripcion, fecha: t.fecha_noticia,
    tipo: t.tipo, fuente: t.fuente, fuente_url: t.fuente_url,
  }));
  await digest(items);
  console.log('[Radar IA] Digest de prueba enviado.');
}

module.exports = { runRadarIA, avisarErrorTelegram };

// Ejecutar directo:  node automations/radar-ia.js  [--digest-test]
if (require.main === module) {
  const tarea = process.argv.includes('--digest-test') ? pruebaDigest() : runRadarIA();
  tarea
    .then(() => { console.log('[Radar IA] OK'); process.exit(0); })
    .catch(err => { console.error('[Radar IA] ERROR:', err.message); process.exit(1); });
}
