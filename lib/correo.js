'use strict';
// Correos que manda el panel (los códigos y avisos de la caja negra de los asistentes).
// Salen por la API de Gmail, por HTTPS y sin librerías, desde la cuenta que se conectó una vez con
// `node scripts/conectar-correo.js`. Variables en Railway:
//   CORREO_CLIENT_ID · CORREO_CLIENT_SECRET · CORREO_REFRESH_TOKEN   la sesión de esa cuenta (solo permiso de enviar)
//   CORREO_REMITENTE   la dirección que ve quien recibe. Tiene que ser esa cuenta o un alias suyo de «Enviar como»
//   CORREO_NOMBRE      opcional; por defecto «VOCAI»
let acceso = { token: '', vence: 0 };

const configurado = () => Boolean(process.env.CORREO_CLIENT_ID && process.env.CORREO_CLIENT_SECRET && process.env.CORREO_REFRESH_TOKEN && process.env.CORREO_REMITENTE);
const b64url = texto => Buffer.from(texto, 'utf8').toString('base64url');
const cabecera = texto => `=?UTF-8?B?${Buffer.from(texto, 'utf8').toString('base64')}?=`;

async function token() {
  if (acceso.token && acceso.vence - Date.now() > 60_000) return acceso.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.CORREO_REFRESH_TOKEN, client_id: process.env.CORREO_CLIENT_ID, client_secret: process.env.CORREO_CLIENT_SECRET }),
    signal: AbortSignal.timeout(20_000),
  });
  const t = await res.json().catch(() => ({}));
  if (!t.access_token) throw new Error(`Google no renovó la sesión del correo (${t.error || res.status}). Hay que volver a conectarlo.`);
  acceso = { token: t.access_token, vence: Date.now() + (t.expires_in || 3000) * 1000 };
  return acceso.token;
}

/** Manda un correo de texto. Lanza un error si no sale. */
async function enviar({ para, asunto, texto }) {
  if (!configurado()) throw new Error('El panel no tiene configurado el envío de correos.');
  if (/[\r\n]/.test(`${para}${asunto}`)) throw new Error('Destinatario o asunto no válidos.');
  const mime = [
    `From: ${cabecera(process.env.CORREO_NOMBRE || 'VOCAI')} <${process.env.CORREO_REMITENTE}>`,
    `To: ${para}`,
    `Subject: ${cabecera(asunto)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(texto, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(mime) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`El correo no salió (${res.status}${e.error?.message ? `: ${e.error.message}` : ''}).`);
  }
}

module.exports = { enviar, configurado };
