/* ============================================================
   VOCAI OS — Marketing · Biblioteca de ejemplos
   Recibe el veredicto del humano sobre una pieza generada
   (queda / la rehago) y lo guarda en la biblioteca de copy.
   ============================================================ */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const storage = require('../config/storage');
const biblioteca = require('../config/biblioteca');

const MOTIVOS = ['copy', 'imagen', 'tono'];

// Registro de ejemplo a partir de la metadata de la pieza.
function registroPlaca(m, formato) {
  return {
    tipo: 'placa', formato: formato || m.formato || '',
    categoria: m.categoria || '', idea: m.idea || '',
    titulo: m.titulo || '', subtitulo: m.subtitulo || '', copy: m.copy || '',
  };
}
function registroCarrusel(m) {
  return {
    tipo: 'carrusel', formato: 'carrusel',
    categoria: m.categoria || '', idea: m.idea || '',
    titulo: (m.slides && m.slides[0] && m.slides[0].titulo) || '',
    copy: m.copy || '',
  };
}

// GET /api/marketing-biblioteca/resumen  → cuántos ejemplos hay
router.get('/resumen', auth, async (req, res) => {
  try { res.json(await biblioteca.resumen()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marketing-biblioteca/feedback  → veredicto de una pieza
router.post('/feedback', auth, async (req, res) => {
  const { tipo, ref, formato, veredicto } = req.body || {};
  const motivo = MOTIVOS.includes(req.body.motivo) ? req.body.motivo : '';
  if (!ref) return res.status(400).json({ error: 'Falta la pieza' });
  if (veredicto !== 'queda' && veredicto !== 'rehago') {
    return res.status(400).json({ error: 'Veredicto inválido' });
  }
  if (veredicto === 'rehago' && !motivo) {
    return res.status(400).json({ error: 'Indicá qué falla: copy, imagen o tono' });
  }

  try {
    let registro;
    if (tipo === 'carrusel') {
      const m = await storage.leerJson(`carruseles/${ref}/meta.json`);
      if (!m) return res.status(404).json({ error: 'No se encontró el carrusel' });
      registro = registroCarrusel(m);
    } else {
      const prefijo = formato === 'feed' ? 'feed' : 'muestras';
      const base = String(ref).replace(/\.png$/i, '');
      const m = await storage.leerJson(`${prefijo}/${base}.json`);
      if (!m) return res.status(404).json({ error: 'No se encontró la placa' });
      registro = registroPlaca(m, formato);
    }
    if (veredicto === 'rehago') registro.motivo = motivo;
    const libro = veredicto === 'queda' ? 'aprobados' : 'rechazados';
    const total = await biblioteca.agregar(libro, registro);
    res.json({ ok: true, libro, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
