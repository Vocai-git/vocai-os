/* ============================================================
   VOCAI OS — Radar IA · disparo manual desde el dashboard
   El Radar también corre por cron (todos los días, 09:00 Madrid).
   Este endpoint lo dispara a mano cuando el cron falló o cuando
   se quiere forzar una corrida.
   ============================================================ */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { runRadarIA, avisarErrorTelegram } = require('../automations/radar-ia');

// POST /api/radar/run  →  corre el Radar ahora. Devuelve { ok, total } o { error }.
router.post('/run', auth, async (req, res) => {
  if (!process.env.XAI_API_KEY) {
    return res.status(400).json({ error: 'Falta XAI_API_KEY en el .env' });
  }
  try {
    const r = await runRadarIA();
    res.json({ ok: true, total: r.total });
  } catch (err) {
    await avisarErrorTelegram(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
