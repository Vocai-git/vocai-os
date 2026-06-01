const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { chat } = require('../config/claude');
const { REGLAS_MARCA } = require('../config/gemini');

/* ============================================================
   Asistente conversacional del dashboard — la cara del
   Gerente general de marketing. Lee el contexto en vivo
   (planificación + calendario) y puede ejecutar cambios sobre
   el calendario editorial (content_pieces).
   ============================================================ */

const PILARES = ['ia', 'estudio', 'casos', 'personas'];
const FORMATOS = ['reel', 'carrusel', 'story', 'post', 'otro'];
const ESTADOS = ['idea', 'produccion', 'lista', 'publicada'];

// ── Contexto de marca (estático) ────────────────────────────
const CONTEXTO_MARCA =
`Eres el asistente del dashboard de VOCAI — empresa de IA y automatización en
Alicante, con estudio de grabación propio. Tagline: "La voz de tu negocio".
Sos, en la práctica, la cara conversacional del Gerente general de marketing:
ayudás a planificar, ajustar el calendario editorial y decidir con criterio.

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

EJECUCIÓN:
- Tenés herramientas para LEER y para MODIFICAR el calendario.
- Cuando el usuario te pide un cambio concreto ("movéme esto", "creá una pieza"),
  ejecutá la herramienta correspondiente y después confirmá en una línea qué hiciste.
- Cuando el usuario te pide opinión o recomendación, NO toques nada: respondé.
- Si un pedido es ambiguo o destructivo (borrar varias piezas), preguntá antes.

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
];

// ── Ejecutor de tools ───────────────────────────────────────
function rangoMes(mes) {
  const [year, month] = mes.split('-');
  const from = `${year}-${month}-01`;
  const to = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
  return { from, to };
}

async function ejecutarTool(mesFoco, nombre, input) {
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
    case 'crear_pieza': {
      const { data, error } = await supabase
        .from('content_pieces').insert([input]).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, pieza: data };
    }
    case 'editar_pieza': {
      const { id, ...campos } = input;
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
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

// ── Armado del contexto en vivo para el system prompt ───────
async function contextoEnVivo(mes) {
  const { from, to } = rangoMes(mes);
  const [plan, piezas] = await Promise.all([
    supabase.from('content_months').select('*').eq('mes', mes).maybeSingle(),
    supabase.from('content_pieces').select('fecha,titulo,formato,pilar,estado')
      .gte('fecha', from).lte('fecha', to).order('fecha', { ascending: true }),
  ]);
  const p = plan.data;
  const lista = piezas.data || [];
  const mix = PILARES.map(pil => `${pil}: ${lista.filter(x => x.pilar === pil).length}`).join(' · ');

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
  txt += `\n\nUsá las herramientas para ver el detalle completo (con ids) o para modificar.`;
  return txt;
}

// ── POST /api/asistente/chat ────────────────────────────────
// body: { messages: [{role, content}], mes: 'YYYY-MM' }
router.post('/chat', auth, async (req, res) => {
  try {
    const { messages, mes, seccion } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'Faltan mensajes.' });
    }
    const mesFoco = mes || new Date().toISOString().slice(0, 7);
    const ubicacion = seccion ? `\n\nUBICACIÓN ACTUAL: el usuario está viendo la sección "${seccion}" del dashboard. Tenelo en cuenta si su pedido es ambiguo (ej. "esto", "acá").` : '';
    const reglasContenido = `\n\n── REGLAS DE MARCA PARA TODO EL CONTENIDO PÚBLICO QUE ESCRIBAS (guiones, copys, títulos) ──\n${REGLAS_MARCA}`;
    const system = CONTEXTO_MARCA + ubicacion + await contextoEnVivo(mesFoco) + reglasContenido;

    const { texto, acciones } = await chat({
      system,
      messages,
      tools: TOOLS,
      ejecutarTool: (nombre, input) => ejecutarTool(mesFoco, nombre, input),
    });

    res.json({ texto, acciones });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
