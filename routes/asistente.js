const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { chat } = require('../config/claude');

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
- Si un pedido es ambiguo o destructivo (borrar varias piezas), preguntá antes.`;

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
    const { messages, mes } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'Faltan mensajes.' });
    }
    const mesFoco = mes || new Date().toISOString().slice(0, 7);
    const system = CONTEXTO_MARCA + await contextoEnVivo(mesFoco);

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
