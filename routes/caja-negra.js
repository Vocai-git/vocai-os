const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const correo = require('../lib/correo');
const { crearCajaNegra } = require('../lib/caja-negra');

// Caja negra de los asistentes (lib/caja-negra.js, db/migration_asistentes_caja.sql).
// Cada asistente se identifica con su clave de reporte, la misma del gasto. El panel no recibe nunca el
// contenido de una caja ni las contraseñas: solo correos, códigos, la copia cerrada de una mitad y el sello.
// CAJA_RECUPERACION_PRIVADA: llave privada de recuperación (PEM en una línea, con \n, o en base64).
// La genera `node scripts/caja-llave.js`. Si se pierde, ninguna contraseña olvidada se puede restablecer.
const huella = clave => crypto.createHash('sha256').update(clave).digest('hex');
function llavePrivada() {
  const v = process.env.CAJA_RECUPERACION_PRIVADA || '';
  if (!v) return null;
  return v.includes('BEGIN') ? v.replace(/\\n/g, '\n') : Buffer.from(v, 'base64').toString('utf8');
}

const caja = crearCajaNegra({
  privada: llavePrivada(),
  enviar: correo.enviar,
  leer: async id => {
    const { data, error } = await supabase.from('assistant_caja').select('datos').eq('assistant_id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? data.datos : null;
  },
  guardar: async (id, datos) => {
    const { error } = await supabase.from('assistant_caja').upsert({ assistant_id: id, estado: datos.estado, datos, updated_at: new Date().toISOString() }, { onConflict: 'assistant_id' });
    if (error) throw new Error(error.message);
  },
});

// Quién llama: el asistente dueño de esa clave.
async function asistente(req, res, next) {
  const clave = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (clave.length < 30) return res.status(401).json({ error: 'Clave requerida' });
  const { data } = await supabase.from('assistants').select('id').eq('reporte_huella', huella(clave)).maybeSingle();
  if (!data) return res.status(401).json({ error: 'Clave no válida' });
  req.asistente = data.id;
  next();
}
// Una operación de la caja como ruta: los rechazos salen con su mensaje; lo inesperado, sin detalles.
const ruta = operacion => async (req, res) => {
  try { res.json(await operacion(req.asistente, req.body || {})); } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    // Un correo que no sale se cuenta tal cual (quien instala tiene que saberlo); lo demás, sin detalles.
    if (/correo/i.test(e.message)) return res.status(502).json({ error: e.message });
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
};

router.post('/alta', asistente, ruta(caja.alta));
router.post('/confirmar', asistente, ruta(caja.confirmar));
router.post('/registrar', asistente, ruta(caja.registrar));
router.post('/restablecer/pedir', asistente, ruta(caja.restablecerPedir));
router.post('/restablecer/confirmar', asistente, ruta(caja.restablecerConfirmar));
router.post('/correo/pedir', asistente, ruta(caja.correoPedir));
router.post('/correo/confirmar', asistente, ruta(caja.correoConfirmar));
router.post('/sello', asistente, ruta(caja.selloGuardar));
router.get('/sello', asistente, ruta(caja.selloLeer));
router.post('/aviso', asistente, ruta(caja.aviso));

// Para la ficha del asistente en el panel (sesión de usuario): estado, correos y último sello.
router.get('/estado/:id', auth, async (req, res) => {
  try { res.json({ ...(await caja.estado(req.params.id)), correo_listo: correo.configurado(), llave_lista: Boolean(caja.publica) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
