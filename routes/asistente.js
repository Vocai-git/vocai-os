const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { chat } = require('../config/claude');
const { REGLAS_MARCA, generarBlog } = require('../config/gemini');

// Slug a partir del título: minúsculas, sin acentos, guiones. (Mismo criterio
// que routes/marketing-web.js — duplicado a propósito para no acoplar.)
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/* ============================================================
   Asistente conversacional del dashboard — la cara del
   Gerente general de marketing. Lee el contexto en vivo
   (planificación + calendario) y puede ejecutar cambios sobre
   el calendario editorial (content_pieces).
   ============================================================ */

const PILARES = ['ia', 'estudio', 'casos', 'personas'];
const FORMATOS = ['reel', 'carrusel', 'story', 'post', 'otro'];
const ESTADOS = ['idea', 'produccion', 'lista'];
const ESTADOS_BLOG = ['borrador', 'en_revision', 'publicado'];

// ── Contexto de marca (estático) ────────────────────────────
const CONTEXTO_MARCA =
`Eres el Copiloto de Marketing de VOCAI — empresa de IA y automatización en
Alicante, con estudio de grabación propio. Tagline: "La voz de tu negocio".
Conectás Planificación, Calendario, Inteligencia, Analítica, Generador y Web/Blog.
Ayudás a decidir con criterio y entendés la sección que el usuario está mirando.

CÓMO HABLÁS:
- Español rioplatense con el usuario (es interno), directo y sin floreos.
- Veredicto primero, justificación después. Cero halagos automáticos.
- Si una idea está mal, lo decís crudo con el motivo.
- Sos concreto: si proponés un cambio, decí exactamente cuál.

QUÉ OFRECE VOCAI — Y QUIÉN DEFINE EL CATÁLOGO:
- Servicios base: IA y automatización · estudio de grabación · marketing. Una de
  las actividades vivas es IMPULSAR LA MARCA PERSONAL de clientes y fundadores
  (usar el estudio + el contenido + la IA para construir autoridad de una persona).
- El usuario con el que hablás es INTERNO y es quien define la oferta de VOCAI.
  Si te dice que VOCAI ofrece o impulsa algo (un servicio, una actividad, una
  línea nueva), lo ayudás a trabajarlo: NO le discutís si "está en la marca" ni
  te negás. El catálogo lo decide él, no vos.
- Las REGLAS DE MARCA gobiernan CÓMO se escribe el contenido público (tono,
  idioma, lista negra), NUNCA qué vende VOCAI. Nunca uses las reglas de marca
  para vetar un servicio o una actividad que el usuario te indica.

LOS 4 PILARES DE CONTENIDO:
- ia        → IA y automatización (el núcleo de VOCAI).
- estudio   → el estudio de grabación / la oficina física de Alicante (el gancho).
- casos     → casos y resultados reales.
- personas  → el equipo, el detrás de escena, lo humano.

REGLAS DE EQUILIBRIO DEL CALENDARIO (para aconsejar):
- No conviene repetir el mismo pilar en piezas seguidas.
- Cada semana debería tocar algo del pilar "ia" (es el núcleo).
- Ojo si un mes no tiene ningún "caso" real: la autoridad se construye con casos.
- El estudio es la puerta, la IA es el destino: no comuniques a VOCAI como agencia
  de marketing.

MODOS DE TRABAJO:
- CONSULTA: analizá y respondé. Solo podés leer.
- PROPUESTA: armá una recomendación o borrador para revisión. Solo podés leer.
- ACCIÓN APROBADA: podés crear o editar ideas y borradores, porque el usuario activó
  ese modo y confirmó el pedido en la interfaz. Confirmá exactamente qué cambiaste.
- Publicar, despublicar y eliminar están bloqueados por el servidor en todos los modos.
- Si falta información para una escritura segura, preguntá antes de actuar.

GUIONES Y CONTENIDO:
- Además de la estrategia, SÍ escribís los guiones de las piezas cuando te los piden.
- Adaptá el guion al formato de la pieza:
  · reel / story → guion hablado a cámara. Gancho fuerte en los primeros 3 segundos,
    desarrollo en 2-4 bloques cortos, y un cierre con CTA. Sumá indicaciones visuales
    breves entre [corchetes] (plano, acción, texto en pantalla) si ayudan a grabarlo.
  · carrusel → el texto slide por slide (portada con gancho, contenido, cierre con CTA).
  · post → el copy del posteo (gancho, desarrollo, CTA, hashtags sobrios).
- Mantené los guiones realistas para el estudio de Alicante: pensados para grabarse,
  no genéricos.
- Si el usuario te pide el guion de una pieza que ya existe en el calendario, podés
  guardarlo en el campo "notas" de esa pieza con editar_pieza. Si te pide crear piezas
  con guion, creálas y dejá el guion en sus notas. Si solo quiere verlo, mostralo en el chat.

BLOG DE VOCAI.ES — PODÉS PREPARAR BORRADORES:
- Podés leer, escribir y editar borradores del blog de vocai.es.
- Cuando el usuario te diga "hacé/escribime un blog sobre X", usá "redactar_post":
  el redactor escribe el artículo completo (título, slug, meta description, excerpt,
  keyword y cuerpo en markdown, optimizado para SEO) y queda guardado como BORRADOR.
  Después confirmá en pocas líneas: título, sobre qué va, y que quedó en borrador.
  Pasale SIEMPRE el link de vista previa (el campo "preview_url" que devuelve la
  herramienta) para que vea cómo quedaría en la web antes de publicar, y ofrecé
  revisarlo/editarlo o publicarlo.
- Si el usuario ya te dio el texto o lo escribiste vos en el chat, usá "crear_post".
- Para retocar un artículo (cambiar título, reescribir una parte, ajustar el SEO),
  leelo con "ver_post" si hace falta y guardá con "editar_post".
- PUBLICAR, DESPUBLICAR y BORRAR son acciones manuales fuera del Copiloto. Si el usuario
  las pide, explicá que debe realizarlas desde la interfaz correspondiente.
- Por defecto los artículos nacen en BORRADOR: el usuario revisa y recién después publica.
- El contenido del blog es PÚBLICO → español de España con tuteo, reglas de marca al pie.

IDIOMA — DOS REGISTROS DISTINTOS, NO LOS MEZCLES:
- CUANDO HABLÁS CON EL USUARIO (análisis, recomendaciones, confirmaciones): español
  rioplatense, vos. Es interno.
- CUANDO ESCRIBÍS CONTENIDO PÚBLICO (guiones, copys, títulos): español de España con
  TUTEO ("tú", "tienes", "puedes"). NUNCA voseo. Es lo que ve la audiencia. Seguí al
  pie las reglas de marca que están más abajo para todo el contenido que produzcas.`;

// ── Tools (formato Anthropic) ───────────────────────────────
const TOOLS = [
  {
    name: 'ver_calendario',
    description: 'Lee las piezas del calendario editorial de un mes. Devuelve la lista con id, fecha, título, formato, pilar y estado.',
    input_schema: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'Mes en formato YYYY-MM. Si se omite, usa el mes en foco.' } },
    },
  },
  {
    name: 'ver_planificacion',
    description: 'Lee los objetivos, foco y notas de la planificación de un mes.',
    input_schema: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'Mes YYYY-MM. Si se omite, usa el mes en foco.' } },
    },
  },
  {
    name: 'ver_radar',
    description: 'Lee los temas y oportunidades guardados en Inteligencia/Radar. Devuelve título, pilar, ángulo, fuente y estado.',
    input_schema: {
      type: 'object',
      properties: {
        estado: { type: 'string', description: 'Filtro opcional por estado del tema.' },
        limite: { type: 'number', description: 'Cantidad máxima de temas. Por defecto 30; máximo 60.' },
      },
    },
  },
  {
    name: 'ver_analitica',
    description: 'Lee las piezas publicadas de un mes con sus métricas para detectar formatos, pilares y contenidos que funcionaron.',
    input_schema: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'Mes YYYY-MM. Si se omite, usa el mes en foco.' } },
    },
  },
  {
    name: 'crear_pieza',
    description: 'Crea una pieza nueva en el calendario editorial.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD.' },
        titulo: { type: 'string' },
        formato: { type: 'string', enum: FORMATOS },
        pilar: { type: 'string', enum: PILARES },
        estado: { type: 'string', enum: ESTADOS },
        cta: { type: 'string' },
        notas: { type: 'string' },
      },
      required: ['fecha', 'titulo'],
    },
  },
  {
    name: 'editar_pieza',
    description: 'Modifica una pieza existente (título, formato, pilar, estado, fecha, cta, notas). Mover de día = cambiar la fecha.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de la pieza a modificar.' },
        fecha: { type: 'string', description: 'Nueva fecha YYYY-MM-DD (para mover de día).' },
        titulo: { type: 'string' },
        formato: { type: 'string', enum: FORMATOS },
        pilar: { type: 'string', enum: PILARES },
        estado: { type: 'string', enum: ESTADOS },
        cta: { type: 'string' },
        notas: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'borrar_pieza',
    description: 'Elimina una pieza del calendario por su id. Usar con cuidado.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  // ── Blog de vocai.es (tabla blog_posts) ──────────────────────
  {
    name: 'ver_blog',
    description: 'Lista los artículos del blog. Devuelve id, título, slug, pilar, estado y fecha. Filtrá por estado si te lo piden (borrador, en_revision, publicado).',
    input_schema: {
      type: 'object',
      properties: { estado: { type: 'string', enum: ESTADOS_BLOG, description: 'Filtro opcional por estado.' } },
    },
  },
  {
    name: 'ver_post',
    description: 'Lee un artículo completo del blog por su id (incluye el cuerpo en markdown). Útil antes de editarlo o para mostrárselo al usuario.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'redactar_post',
    description: 'Escribe un artículo de blog COMPLETO y optimizado para SEO a partir de un tema, y lo guarda como BORRADOR en el blog. El redactor genera título, slug, meta description, excerpt, keyword y el cuerpo en markdown (600-1000 palabras, tuteo de España, reglas de marca). Usá esto cuando el usuario te pida "hacé/escribí un blog sobre X". Devuelve el post creado con su id. NO lo publica: queda en borrador para revisar.',
    input_schema: {
      type: 'object',
      properties: {
        tema: { type: 'string', description: 'De qué trata el artículo (lo más concreto posible).' },
        keyword: { type: 'string', description: 'Keyword SEO objetivo, si el usuario la indicó.' },
        pilar: { type: 'string', enum: PILARES, description: 'Pilar de contenido al que pertenece.' },
        angulo: { type: 'string', description: 'Enfoque o ángulo específico, opcional.' },
      },
      required: ['tema'],
    },
  },
  {
    name: 'crear_post',
    description: 'Crea un artículo de blog con contenido que vos ya escribiste (cuando el usuario te pasó el texto o lo redactaste en el chat). Si solo te dieron un tema, usá redactar_post en su lugar. Queda en borrador salvo que indiques estado.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        body_md: { type: 'string', description: 'Cuerpo del artículo en markdown (sin el H1).' },
        meta_description: { type: 'string', description: 'Resumen para Google, máx 160 caracteres.' },
        excerpt: { type: 'string', description: '1-2 frases para el listado del blog.' },
        keyword: { type: 'string' },
        pilar: { type: 'string', enum: PILARES },
        cover_image: { type: 'string', description: 'URL de la imagen de portada, opcional.' },
        slug: { type: 'string', description: 'Slug URL, opcional (se deriva del título si no se pasa).' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'editar_post',
    description: 'Modifica un artículo existente por su id (título, cuerpo, meta, excerpt, keyword, pilar, portada, slug). Pasá solo los campos que cambian. Para reescribir el cuerpo, mandá el body_md completo nuevo.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        titulo: { type: 'string' },
        body_md: { type: 'string' },
        meta_description: { type: 'string' },
        excerpt: { type: 'string' },
        keyword: { type: 'string' },
        pilar: { type: 'string', enum: PILARES },
        cover_image: { type: 'string' },
        slug: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'publicar_post',
    description: 'Publica un artículo: pasa a estado "publicado" y queda VISIBLE en vocai.es/blog. Hacelo solo cuando el usuario lo pide explícitamente.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'despublicar_post',
    description: 'Saca un artículo de vocai.es/blog: vuelve a estado "borrador". Deja de ser visible al público.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'borrar_post',
    description: 'Elimina un artículo del blog por su id de forma permanente. Destructivo: confirmá con el usuario antes de usarlo.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
];

const TOOLS_LECTURA = new Set([
  'ver_calendario', 'ver_planificacion', 'ver_radar', 'ver_analitica',
  'ver_blog', 'ver_post',
]);
const TOOLS_BORRADOR = new Set([
  'crear_pieza', 'editar_pieza', 'redactar_post', 'crear_post', 'editar_post',
]);
const TOOLS_BLOQUEADAS = new Set([
  'borrar_pieza', 'publicar_post', 'despublicar_post', 'borrar_post',
]);

function toolsParaModo(modo) {
  const permitidas = modo === 'accion'
    ? new Set([...TOOLS_LECTURA, ...TOOLS_BORRADOR])
    : TOOLS_LECTURA;
  return TOOLS.filter(tool => permitidas.has(tool.name));
}

// ── Ejecutor de tools ───────────────────────────────────────
function rangoMes(mes) {
  const [year, month] = mes.split('-');
  const from = `${year}-${month}-01`;
  const to = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
  return { from, to };
}

async function ejecutarTool(mesFoco, nombre, input, { permitirEscritura = false } = {}) {
  if (TOOLS_BLOQUEADAS.has(nombre)) {
    throw new Error('Esta acción requiere intervención manual y está bloqueada para el Copiloto.');
  }
  if (TOOLS_BORRADOR.has(nombre) && !permitirEscritura) {
    throw new Error('La escritura requiere el modo Acción aprobada.');
  }
  if (!TOOLS_LECTURA.has(nombre) && !TOOLS_BORRADOR.has(nombre)) {
    throw new Error(`Herramienta no autorizada: ${nombre}`);
  }
  const mes = input.mes || mesFoco;
  switch (nombre) {
    case 'ver_calendario': {
      const { from, to } = rangoMes(mes);
      const { data, error } = await supabase
        .from('content_pieces').select('*')
        .gte('fecha', from).lte('fecha', to)
        .order('fecha', { ascending: true });
      if (error) throw new Error(error.message);
      return { mes, piezas: data || [] };
    }
    case 'ver_planificacion': {
      const { data, error } = await supabase
        .from('content_months').select('*').eq('mes', mes).maybeSingle();
      if (error) throw new Error(error.message);
      return data || { mes, vacio: true };
    }
    case 'ver_radar': {
      const limite = Math.min(Math.max(Number(input.limite) || 30, 1), 60);
      let q = supabase.from('content_topics')
        .select('id,titulo,descripcion,fecha_noticia,tipo,pilar,angulo,fuente,fuente_url,estado,created_at')
        .order('created_at', { ascending: false })
        .limit(limite);
      if (input.estado) q = q.eq('estado', input.estado);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { temas: data || [] };
    }
    case 'ver_analitica': {
      const { from, to } = rangoMes(mes);
      const piezasRes = await supabase.from('content_pieces')
        .select('id,fecha,titulo,formato,pilar,estado')
        .eq('estado', 'publicada')
        .gte('fecha', from).lte('fecha', to)
        .order('fecha', { ascending: true });
      if (piezasRes.error) throw new Error(piezasRes.error.message);
      const piezas = piezasRes.data || [];
      if (!piezas.length) return { mes, piezas: [] };
      const metricasRes = await supabase.from('content_metrics').select('*')
        .in('pieza_id', piezas.map(p => p.id));
      if (metricasRes.error) throw new Error(metricasRes.error.message);
      const porPieza = Object.fromEntries((metricasRes.data || []).map(m => [m.pieza_id, m]));
      return { mes, piezas: piezas.map(p => ({ ...p, metrics: porPieza[p.id] || null })) };
    }
    case 'crear_pieza': {
      const row = {
        fecha: input.fecha,
        titulo: input.titulo,
        formato: FORMATOS.includes(input.formato) ? input.formato : 'otro',
        pilar: PILARES.includes(input.pilar) ? input.pilar : 'ia',
        estado: ESTADOS.includes(input.estado) ? input.estado : 'idea',
        cta: input.cta || null,
        notas: input.notas || null,
      };
      const { data, error } = await supabase
        .from('content_pieces').insert([row]).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, pieza: data };
    }
    case 'editar_pieza': {
      const { id } = input;
      const campos = {};
      ['fecha', 'titulo', 'cta', 'notas'].forEach(k => {
        if (input[k] !== undefined) campos[k] = input[k];
      });
      if (input.formato !== undefined && FORMATOS.includes(input.formato)) campos.formato = input.formato;
      if (input.pilar !== undefined && PILARES.includes(input.pilar)) campos.pilar = input.pilar;
      if (input.estado !== undefined && ESTADOS.includes(input.estado)) campos.estado = input.estado;
      campos.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('content_pieces').update(campos).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, pieza: data };
    }
    case 'borrar_pieza': {
      const { error } = await supabase
        .from('content_pieces').delete().eq('id', input.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Blog ──────────────────────────────────────────────────
    case 'ver_blog': {
      let q = supabase.from('blog_posts')
        .select('id,titulo,slug,pilar,estado,updated_at,publicado_at')
        .order('updated_at', { ascending: false });
      if (input.estado) q = q.eq('estado', input.estado);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { posts: data || [] };
    }
    case 'ver_post': {
      const { data, error } = await supabase
        .from('blog_posts').select('*').eq('id', input.id).single();
      if (error) throw new Error(error.message);
      return { post: data };
    }
    case 'redactar_post': {
      // El redactor (Gemini) escribe el artículo largo; acá solo lo guardamos.
      const art = await generarBlog(input.tema, {
        keyword: input.keyword || '',
        pilar: input.pilar || '',
        angulo: input.angulo || '',
      });
      const row = {
        slug: art.slug ? slugify(art.slug) : slugify(art.titulo),
        titulo: art.titulo || 'Sin título',
        meta_description: art.meta_description || null,
        keyword: art.keyword || input.keyword || null,
        excerpt: art.excerpt || null,
        body_md: art.body_md || null,
        pilar: input.pilar || null,
        autor: 'VOCAI',
        estado: 'borrador',
      };
      const { data, error } = await supabase
        .from('blog_posts').insert([row]).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, post: data, url: `vocai.es/blog/${data.slug}`, preview_url: `https://www.vocai.es/blog/preview/${data.id}` };
    }
    case 'crear_post': {
      const row = {
        slug: input.slug ? slugify(input.slug) : slugify(input.titulo),
        titulo: input.titulo || 'Sin título',
        meta_description: input.meta_description || null,
        keyword: input.keyword || null,
        excerpt: input.excerpt || null,
        body_md: input.body_md || null,
        cover_image: input.cover_image || null,
        pilar: input.pilar || null,
        autor: 'VOCAI',
        estado: 'borrador',
      };
      const { data, error } = await supabase
        .from('blog_posts').insert([row]).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, post: data, url: `vocai.es/blog/${data.slug}`, preview_url: `https://www.vocai.es/blog/preview/${data.id}` };
    }
    case 'editar_post': {
      const { id, ...campos } = input;
      if (campos.slug) campos.slug = slugify(campos.slug);
      campos.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('blog_posts').update(campos).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, post: data };
    }
    case 'publicar_post': {
      const upd = {
        estado: 'publicado',
        publicado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('blog_posts').update(upd).eq('id', input.id).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, post: data, url: `vocai.es/blog/${data.slug}` };
    }
    case 'despublicar_post': {
      const upd = { estado: 'borrador', updated_at: new Date().toISOString() };
      const { data, error } = await supabase
        .from('blog_posts').update(upd).eq('id', input.id).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, post: data };
    }
    case 'borrar_post': {
      const { error } = await supabase
        .from('blog_posts').delete().eq('id', input.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

// ── Armado del contexto en vivo para el system prompt ───────
async function contextoEnVivo(mes) {
  const { from, to } = rangoMes(mes);
  const [plan, piezas, blog] = await Promise.all([
    supabase.from('content_months').select('*').eq('mes', mes).maybeSingle(),
    supabase.from('content_pieces').select('fecha,titulo,formato,pilar,estado')
      .gte('fecha', from).lte('fecha', to).order('fecha', { ascending: true }),
    supabase.from('blog_posts').select('estado'),
  ]);
  const p = plan.data;
  const lista = piezas.data || [];
  const mix = PILARES.map(pil => `${pil}: ${lista.filter(x => x.pilar === pil).length}`).join(' · ');
  const posts = blog.data || [];
  const blogResumen = `${posts.length} (${posts.filter(x => x.estado === 'publicado').length} publicados · ${posts.filter(x => x.estado !== 'publicado').length} en borrador)`;

  let txt = `\n\n── ESTADO EN VIVO (mes en foco: ${mes}) ──\n`;
  if (p) {
    txt += `Planificación:\n- Objetivos: ${p.objetivos || '—'}\n- Foco: ${p.foco || '—'}\n- Puntual: ${p.puntual || '—'}\n`;
  } else {
    txt += `Planificación: no hay objetivos cargados para este mes.\n`;
  }
  txt += `Calendario: ${lista.length} piezas. Mix por pilar → ${mix}.\n`;
  if (lista.length) {
    txt += lista.map(x => `  · ${x.fecha} [${x.pilar}/${x.formato}/${x.estado}] ${x.titulo}`).join('\n');
  }
  txt += `\nBlog (vocai.es): ${blogResumen}.\n`;
  txt += `\n\nUsá las herramientas para ver el detalle completo (con ids) o para modificar.`;
  return txt;
}

const CONTEXTO_SECCION = {
  'marketing-planning': 'Ayudá a convertir objetivos mensuales y contexto real en una estrategia semanal ejecutable. No dupliques el Generador.',
  'marketing-calendar': 'Evaluá ritmo, fechas, mezcla de pilares, estados y carga de producción. Priorizá claridad operativa.',
  'marketing-intelligence': 'Trabajá sobre Radar y oportunidades: priorizá eventos futuros cerca de Alicante cuando corresponda y evaluá relevancia, evidencia y posibilidad real de asistir o producir contenido.',
  'marketing-analytics': 'Interpretá resultados con prudencia. Diferenciá datos observados de hipótesis y terminá con un ajuste concreto.',
  'marketing-generator': 'Ayudá a producir una pieza particular: formato, audiencia, hook, estructura, CTA y material necesario.',
  'marketing-web': 'Ayudá a revisar y preparar contenido web o artículos en borrador. SEO al servicio de claridad y negocio, nunca publicación automática.',
};

// ── POST /api/asistente/chat ────────────────────────────────
// body: { messages: [{role, content}], mes: 'YYYY-MM' }
router.post('/chat', auth, async (req, res) => {
  try {
    const { messages, mes, seccion, modulo, modo = 'consulta' } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'Faltan mensajes.' });
    }
    if (!CONTEXTO_SECCION[modulo]) {
      return res.status(400).json({ error: 'El Copiloto solo está disponible dentro de Marketing.' });
    }
    if (!['consulta', 'propuesta', 'accion'].includes(modo)) {
      return res.status(400).json({ error: 'Modo del Copiloto inválido.' });
    }
    const mesFoco = mes || new Date().toISOString().slice(0, 7);
    const ubicacion = `\n\nUBICACIÓN ACTUAL: sección "${seccion || modulo}". ${CONTEXTO_SECCION[modulo]}`;
    const instruccionModo = `\n\nMODO ACTIVO: ${modo.toUpperCase()}. ${modo === 'accion'
      ? 'La interfaz confirmó este pedido. Podés crear o editar ideas y borradores; nunca publicar ni eliminar.'
      : 'No realices escrituras. Leé lo necesario y respondé con análisis o una propuesta.'}`;
    const reglasContenido = `\n\n── REGLAS DE MARCA PARA TODO EL CONTENIDO PÚBLICO QUE ESCRIBAS (guiones, copys, títulos) ──\n${REGLAS_MARCA}`;
    const system = CONTEXTO_MARCA + ubicacion + instruccionModo + await contextoEnVivo(mesFoco) + reglasContenido;

    const { texto, acciones } = await chat({
      system,
      messages,
      tools: toolsParaModo(modo),
      ejecutarTool: (nombre, input) => ejecutarTool(mesFoco, nombre, input, {
        permitirEscritura: modo === 'accion',
      }),
    });

    res.json({ texto, acciones });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
