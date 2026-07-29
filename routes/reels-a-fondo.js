/* ============================================================
   VOCAI OS — Reels a fondo
   Sirve el análisis granular de reels (curva de retención + caídas
   segundo a segundo + semáforo vs parámetros por tamaño de cuenta).
   Cargado a mano desde las capturas + videos procesados.
   Fuente: data/analisis-reels.json.
   ============================================================ */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'analisis-reels.json');

// GET /api/reels-a-fondo → todo el análisis
router.get('/', auth, async (req, res) => {
  try {
    const raw = fs.readFileSync(DATA, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el análisis de reels: ' + err.message });
  }
});

module.exports = router;
