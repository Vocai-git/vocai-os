/* ============================================================
   VOCAI OS — Scheduler de automatizaciones
   Corre el Radar IA cada 3 días. Vive dentro del proceso del
   server: mientras VOCAI OS está online, el cron está activo.
   ============================================================ */

const cron = require('node-cron');
const { runRadarIA } = require('./radar-ia');
const { correrPublicaciones } = require('./publisher');
const { metaConfigurado } = require('../config/meta');

function iniciarScheduler() {
  // ── Radar IA — cada 3 días a las 09:00 ────────────────────
  if (process.env.XAI_API_KEY) {
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
  } else {
    console.log('[Scheduler] Sin XAI_API_KEY — Radar IA no se agenda.');
  }

  // ── Publicación automática — todos los días a una hora fija ─
  if (metaConfigurado()) {
    const hora = parseInt(process.env.PUBLISH_HOUR || '10', 10);
    cron.schedule(`0 ${hora} * * *`, async () => {
      console.log('[Scheduler] Disparando publicaciones del día...');
      try {
        const r = await correrPublicaciones();
        console.log(`[Scheduler] Publicaciones — ${r.publicadas} OK, ${r.errores} con error.`);
      } catch (err) {
        console.error('[Scheduler] Publicaciones ERROR:', err.message);
      }
    }, { timezone: 'Europe/Madrid' });
    console.log(`[Scheduler] Publicación automática agendada — todos los días ${hora}:00 Europe/Madrid.`);
  } else {
    console.log('[Scheduler] Sin credenciales Meta — publicación automática no agendada.');
  }
}

module.exports = { iniciarScheduler };
