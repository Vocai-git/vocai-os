'use strict';
// Genera la llave de recuperación de la caja negra de los asistentes. Se corre UNA sola vez.
//   node scripts/caja-llave.js
// Deja el valor en caja-recuperacion.private.txt (no entra al repositorio). Ese valor se pega en Railway,
// en la variable CAJA_RECUPERACION_PRIVADA del servicio vocai-os, y se guarda además una copia en un sitio
// seguro fuera de Railway. No se pega en ningún chat.
// Si esta llave se pierde, ninguna contraseña olvidada de ninguna caja se puede restablecer.
// Si se cambia por otra, pasa lo mismo con todas las cajas ya activadas: no se regenera nunca.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const archivo = path.resolve(__dirname, '..', 'caja-recuperacion.private.txt');
if (fs.existsSync(archivo)) {
  console.error(`Ya existe ${archivo}. No genero otra encima: si ya está puesta en Railway, cambiarla rompe el restablecimiento de todas las cajas.`);
  process.exit(1);
}
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
const valor = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8').toString('base64');
fs.writeFileSync(archivo, valor + '\n', { mode: 0o600 });
console.log(`Listo: ${archivo}\n\n1. Abre ese archivo y copia su única línea.\n2. En Railway → vocai-os → Variables: CAJA_RECUPERACION_PRIVADA = (pegar).\n3. Guarda una copia del archivo en un sitio seguro (un gestor de contraseñas) y bórralo de esta carpeta.`);
