const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// Asistentes personales de clientes: conectores, gasto del mes y cuota fija (db/migration_asistentes.sql).
// El gasto lo informa cada asistente con su propia clave (POST /reporte, db/migration_asistentes_reporte.sql);
// mientras un asistente no tenga clave, el gasto es el que se escribe a mano en la ficha.
const CAMPOS = ['cliente', 'nombre', 'estado', 'equipo', 'conectores', 'clave_api', 'gasto_mes_usd', 'gasto_actualizado', 'cuota_fija_eur', 'notas'];
const SERVICIOS = ['anthropic', 'elevenlabs'];

function limpiar(body) {
  const fila = {};
  for (const campo of CAMPOS) if (body[campo] !== undefined) fila[campo] = body[campo];
  return fila;
}

const huella = clave => crypto.createHash('sha256').update(clave).digest('hex');
const enMadrid = formato => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, formato);
const mesActual = () => enMadrid(7);
const hoy = () => enMadrid(10);
// ElevenLabs no devuelve dinero, solo caracteres: se valoran con el precio del plan (USD por 1000 caracteres).
const precioVoz = () => Number(process.env.ELEVENLABS_USD_POR_1000) || 0;
const cantidad = (v, tope) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= tope ? n : null; };

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('assistants').select('*').order('cliente');
  if (error) return res.status(500).json({ error: error.message });
  const { data: usos, error: errorUsos } = await supabase.from('assistant_usage').select('*').eq('mes', mesActual());
  if (errorUsos) return res.status(500).json({ error: errorUsos.message });
  res.json(data.map(({ reporte_huella, ...a }) => {
    if (!reporte_huella) return { ...a, reporta: false, desglose: [] };
    // Con reporte automático manda lo informado para este mes (0 si todavía no informó nada).
    const desglose = usos.filter(u => u.assistant_id === a.id).map(u => ({ servicio: u.servicio, usd: Number(u.usd), unidades: Number(u.unidades), actualizado: u.updated_at }));
    return { ...a, reporta: true, desglose, gasto_mes_usd: desglose.reduce((s, u) => s + u.usd, 0), gasto_actualizado: desglose.length ? desglose.map(u => u.actualizado).sort().pop().slice(0, 10) : null };
  }));
});

// Reporte de un asistente: total acumulado del mes por servicio. Sin sesión de usuario; se identifica
// con su clave propia, que solo sirve para esto. Enviar dos veces lo mismo no duplica nada.
router.post('/reporte', async (req, res) => {
  const clave = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (clave.length < 30) return res.status(401).json({ error: 'Clave requerida' });
  const { data: asistente } = await supabase.from('assistants').select('id').eq('reporte_huella', huella(clave)).maybeSingle();
  if (!asistente) return res.status(401).json({ error: 'Clave no válida' });

  const mes = String(req.body?.mes || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return res.status(400).json({ error: 'Mes no válido' });
  const filas = [];
  for (const servicio of SERVICIOS) {
    const dato = req.body?.servicios?.[servicio];
    if (!dato) continue;
    const unidades = cantidad(dato.unidades ?? 0, 1e12);
    const usd = servicio === 'elevenlabs' ? (unidades === null ? null : unidades / 1000 * precioVoz()) : cantidad(dato.usd, 1e6);
    if (unidades === null || usd === null) return res.status(400).json({ error: `Dato no válido en ${servicio}` });
    filas.push({ assistant_id: asistente.id, mes, servicio, usd: usd.toFixed(4), unidades: Math.round(unidades), updated_at: new Date().toISOString() });
  }
  if (!filas.length) return res.status(400).json({ error: 'Sin servicios que informar' });

  const { error } = await supabase.from('assistant_usage').upsert(filas, { onConflict: 'assistant_id,mes,servicio' });
  if (error) return res.status(500).json({ error: error.message });
  if (mes === mesActual()) {
    const { data: todas } = await supabase.from('assistant_usage').select('usd').eq('assistant_id', asistente.id).eq('mes', mes);
    const total = (todas || []).reduce((s, u) => s + Number(u.usd), 0);
    await supabase.from('assistants').update({ gasto_mes_usd: total.toFixed(2), gasto_actualizado: hoy() }).eq('id', asistente.id);
  }
  res.json({ ok: true });
});

router.post('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('assistants').insert([limpiar(req.body)]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  const { reporte_huella, ...a } = data;
  res.status(201).json(a);
});

// Genera la clave de reporte de un asistente. Se muestra una sola vez (aquí se guarda solo su huella);
// generar otra deja sin efecto la anterior.
router.post('/:id/clave', auth, async (req, res) => {
  const clave = 'vocai_' + crypto.randomBytes(30).toString('base64url');
  const { data, error } = await supabase.from('assistants').update({ reporte_huella: huella(clave), updated_at: new Date().toISOString() }).eq('id', req.params.id).select('id').maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Asistente no encontrado' });
  res.json({ clave });
});

router.put('/:id', auth, async (req, res) => {
  const fila = { ...limpiar(req.body), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('assistants').update(fila).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  const { reporte_huella, ...a } = data;
  res.json(a);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('assistants').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
