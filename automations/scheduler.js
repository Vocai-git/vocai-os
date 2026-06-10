/* ============================================================
   VOCAI OS — Scheduler de automatizaciones
   Corre el Radar IA cada 3 días. Vive dentro del proceso del
   server: mientras VOCAI OS está online, el cron está activo.
   ============================================================ */

const cron = require('node-cron');
const { runRadarIA, avisarErrorTelegram } = require('./radar-ia');
const { correrPublicaciones } = require('./publisher');
const { metaConfigurado } = require('../config/meta');
const { copyRecurringExpenses } = require('./copy-recurring-expenses');
const { runMetricas } = require('./metricas');

function iniciarScheduler() {
  // ── Radar IA — todos los días a las 09:00 ─────────────────
  if (process.env.XAI_API_KEY) {
    cron.schedule('0 9 * * *', async () => {
      console.log('[Scheduler] Disparando Radar IA...');
      try {
        const r = await runRadarIA();
        console.log(`[Scheduler] Radar IA OK — ${r.total} temas.`);
      } catch (err) {
        console.error('[Scheduler] Radar IA ERROR:', err.message);
        await avisarErrorTelegram(err);
      }
    }, { timezone: 'Europe/Madrid' });
    console.log('[Scheduler] Radar IA agendado — todos los días, 09:00 Europe/Madrid.');
  } else {
    console.log('[Scheduler] Sin XAI_API_KEY — Radar IA no se agenda.');
  }

  // ── Publicación automática — cada 15 min revisa si hay piezas listas ─
  // Una pieza se publica cuando su publish_at <= ahora y estado = 'lista'.
  if (metaConfigurado()) {
    cron.schedule(`*/15 * * * *`, async () => {
      try {
        const r = await correrPublicaciones();
        if (r.publicadas || r.errores) {
          console.log(`[Scheduler] Publicaciones — ${r.publicadas} OK, ${r.errores} con error.`);
        }
      } catch (err) {
        console.error('[Scheduler] Publicaciones ERROR:', err.message);
      }
    }, { timezone: 'Europe/Madrid' });
    console.log('[Scheduler] Publicación automática agendada — cada 15 min (chequea publish_at).');
  } else {
    console.log('[Scheduler] Sin credenciales Meta — publicación automática no agendada.');
  }

  // ── Métricas de marketing — todos los días a las 08:30 ──────
  // Lee Meta Insights de cada pieza publicada + snapshot de la
  // cuenta de IG. Corre antes del Radar (09:00) para que el día
  // arranque con los datos frescos en el módulo Analítica.
  if (metaConfigurado()) {
    cron.schedule('30 8 * * *', async () => {
      console.log('[Scheduler] Actualizando métricas de marketing...');
      try {
        const r = await runMetricas();
        console.log(`[Scheduler] Métricas OK — ${r.actualizadas} piezas, ${r.vinculadas} vinculadas, ${r.errores} errores.`);
      } catch (err) {
        console.error('[Scheduler] Métricas ERROR:', err.message);
      }
    }, { timezone: 'Europe/Madrid' });
    console.log('[Scheduler] Métricas de marketing agendadas — todos los días, 08:30 Europe/Madrid.');
  } else {
    console.log('[Scheduler] Sin credenciales Meta — métricas de marketing no agendadas.');
  }

  // ── Copia de gastos recurrentes — día 1 de cada mes, 00:05 ───
  // Toma los gastos del mes anterior con tipo='recurrente' y los
  // duplica en el mes nuevo (con fecha = día 1). Idempotente.
  cron.schedule('5 0 1 * *', async () => {
    console.log('[Scheduler] Copiando gastos recurrentes al nuevo mes...');
    try {
      const r = await copyRecurringExpenses();
      console.log(`[Scheduler] Recurrentes ${r.from} → ${r.to}: ${r.copiados} copiados, ${r.omitidos} omitidos (ya existían), ${r.total} totales en origen.`);
    } catch (err) {
      console.error('[Scheduler] Copia de recurrentes ERROR:', err.message);
    }
  }, { timezone: 'Europe/Madrid' });
  console.log('[Scheduler] Copia de gastos recurrentes agendada — día 1 de cada mes, 00:05 Europe/Madrid.');
}

module.exports = { iniciarScheduler };
