/* ============================================================
   VOCAI OS — Scheduler de automatizaciones
   Corre el Radar IA cada 3 días. Vive dentro del proceso del
   server: mientras VOCAI OS está online, el cron está activo.
   ============================================================ */

const cron = require('node-cron');
const { runRadarIA } = require('./radar-ia');

function iniciarScheduler() {
  if (!process.env.XAI_API_KEY) {
    console.log('[Scheduler] Sin XAI_API_KEY — Radar IA no se agenda.');
    return;
  }

  // Cada 3 días (días 3, 6, 9... del mes) a las 09:00 hora de España.
  cron.schedule('0 9 */3 * *', async () => {
    console.log('[Scheduler] Disparando Radar IA...');
    try {
      const r = await runRadarIA();
      console.log(`[Scheduler] Radar IA OK — ${r.total} temas.`);
    } catch (err) {
      console.error('[Scheduler] Radar IA ERROR:', err.message);
    }
  }, { timezone: 'Europe/Madrid' });

  console.log('[Scheduler] Radar IA agendado — cada 3 días, 09:00 Europe/Madrid.');
}

module.exports = { iniciarScheduler };
