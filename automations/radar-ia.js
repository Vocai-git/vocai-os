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

const TIPO_EMOJI = { herramienta: '🛠', caso: '📈', debate: '💬', hype: '🔥', espana: '🇪🇸' };

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
`Buscá las 5 a 7 novedades de IA más relevantes de los últimos 3 días.
Incluí siempre al menos una sobre marketing + IA en España: eventos,
congresos, ferias o novedades del sector allá.

Priorizá estas fuentes:
- Medios: Xataka, El País (sección Tecnología), TechCrunch, The Verge, MIT Technology Review.
- Cuentas de X: @elonmusk, @sama, @OpenAI, @AnthropicAI, @GoogleDeepMind.

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

async function digest(items) {
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  let texto = `📡 <b>RADAR IA</b> · ${fecha} · ${items.length} temas nuevos\n\n`;
  items.forEach((it, i) => {
    const em = TIPO_EMOJI[it.tipo] || '•';
    texto += `${i + 1}. ${em} <b>${escHtml(it.titulo)}</b>\n`;
    if (it.descripcion) texto += `${escHtml(corto(it.descripcion, 14))}\n`;
    const partes = [];
    if (it.fecha) partes.push(escHtml(it.fecha));
    if (it.fuente_url) {
      partes.push(`<a href="${escHtml(it.fuente_url)}">${escHtml(it.fuente || 'Fuente')} ↗</a>`);
    } else if (it.fuente) {
      partes.push(escHtml(it.fuente));
    }
    texto += partes.join(' · ') + `\n\n`;
  });
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

// ── Orquestador ─────────────────────────────────────────────
async function runRadarIA() {
  console.log('[Radar IA] Buscando novedades con Grok (web + X)...');
  const items = await buscarNovedades();
  console.log(`[Radar IA] ${items.length} novedades encontradas.`);

  const n = await guardar(items);
  console.log(`[Radar IA] ${n} guardadas en content_topics.`);

  await digest(items);
  console.log('[Radar IA] Digest enviado por Telegram.');

  return { total: items.length };
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

module.exports = { runRadarIA };

// Ejecutar directo:  node automations/radar-ia.js  [--digest-test]
if (require.main === module) {
  const tarea = process.argv.includes('--digest-test') ? pruebaDigest() : runRadarIA();
  tarea
    .then(() => { console.log('[Radar IA] OK'); process.exit(0); })
    .catch(err => { console.error('[Radar IA] ERROR:', err.message); process.exit(1); });
}
