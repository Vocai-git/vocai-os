/* ============================================================
   VOCAI OS — Refresco de la base GeoIP en runtime.
   La base embebida de geoip-lite viene vieja y mapea mal
   algunos rangos (ej. Digi España figura como Rumanía). Con
   MAXMIND_LICENSE_KEY seteada, al arrancar el server se baja
   la base fresca de MaxMind en segundo plano y se recarga sin
   cortar nada. No puede ir en postinstall: el build de Railway
   corre npm install antes de copiar el código.
   ============================================================ */

const { spawn } = require('child_process');
const path = require('path');

function refrescar() {
  if (!process.env.MAXMIND_LICENSE_KEY) return;
  const script = path.join(__dirname, '..', 'scripts', 'update-geoip.js');
  const hijo = spawn(process.execPath, [script], { stdio: 'ignore' });
  hijo.on('exit', (code) => {
    if (code !== 0) {
      console.log('[GeoIP] No se pudo actualizar la base — se sigue con la embebida.');
      return;
    }
    try {
      require('geoip-lite').reloadDataSync();
      console.log('[GeoIP] Base de MaxMind actualizada y recargada.');
    } catch (e) {
      console.log('[GeoIP] Base bajada pero falló la recarga:', e.message);
    }
  });
  hijo.on('error', () => console.log('[GeoIP] No se pudo lanzar la actualización.'));
}

module.exports = { refrescar };
