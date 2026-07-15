/* ============================================================
   VOCAI OS — Actualiza la base GeoIP de geoip-lite (MaxMind).
   Corre solo en postinstall (build de Railway y npm install
   local). La base embebida del paquete viene vieja y mapea mal
   algunos rangos (ej. Digi España figura como Rumanía); con la
   clave gratuita de MaxMind en MAXMIND_LICENSE_KEY se baja la
   base fresca. Sin clave no hace nada y se usa la embebida.
   ============================================================ */

const { execSync } = require('child_process');
const path = require('path');

const key = process.env.MAXMIND_LICENSE_KEY;
if (!key) {
  console.log('GeoIP: sin MAXMIND_LICENSE_KEY — se usa la base embebida del paquete');
  process.exit(0);
}

try {
  const updater = path.join(__dirname, '..', 'node_modules', 'geoip-lite', 'scripts', 'updatedb.js');
  execSync(`node "${updater}" license_key=${key}`, { stdio: 'inherit', timeout: 300000 });
  console.log('GeoIP: base de MaxMind actualizada');
} catch {
  console.log('GeoIP: falló la actualización — se sigue con la base embebida');
}
