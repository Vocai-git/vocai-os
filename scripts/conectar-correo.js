'use strict';
// Conecta la cuenta de Google desde la que el panel manda correos (los códigos y avisos de la caja negra).
// Se corre una vez, en una PC con navegador:
//   node scripts/conectar-correo.js "C:\ruta\client_secret_….json"
// El client_secret es el de un cliente OAuth «App de escritorio» de Google Cloud, con la API de Gmail habilitada.
// Se abre el navegador: hay que entrar con la cuenta que va a enviar (la de avisos, o una que tenga esa dirección
// como alias de «Enviar como») y pulsar «Permitir». Solo se pide permiso para ENVIAR correos, no para leerlos.
// Deja las cuatro variables en correo.private.txt (no entra al repositorio): se copian a Railway y se borra el archivo.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');

const ALCANCE = 'https://www.googleapis.com/auth/gmail.send openid email';
const b64url = b => b.toString('base64url');

(async () => {
  const json = process.argv[2];
  if (!json || !fs.existsSync(json)) throw new Error('Pasa la ruta del client_secret_….json.');
  const c = JSON.parse(fs.readFileSync(json, 'utf8')).installed;
  if (!c?.client_id || !c?.client_secret) throw new Error('El archivo no es un cliente OAuth «App de escritorio».');
  const verificador = b64url(crypto.randomBytes(32));
  const estado = b64url(crypto.randomBytes(16));
  let vuelta;
  const codigo = await new Promise((resolver, rechazar) => {
    const servidor = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') return res.writeHead(404).end();
      const ok = u.searchParams.get('state') === estado && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<p style="font:20px sans-serif">${ok ? 'Listo: ya puedes cerrar esta pestaña.' : 'No se ha podido conectar.'}</p>`);
      servidor.close();
      ok ? resolver(u.searchParams.get('code')) : rechazar(new Error(`Google no aprobó: ${u.searchParams.get('error') || 'estado distinto'}`));
    });
    servidor.listen(0, '127.0.0.1', () => {
      vuelta = `http://127.0.0.1:${servidor.address().port}`;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [k, v] of Object.entries({ client_id: c.client_id, redirect_uri: vuelta, response_type: 'code', scope: ALCANCE, access_type: 'offline', prompt: 'consent select_account', state: estado, code_challenge: b64url(crypto.createHash('sha256').update(verificador).digest()), code_challenge_method: 'S256' })) url.searchParams.set(k, v);
      console.log(`Se abre el navegador. Entra con la cuenta que va a enviar los correos y pulsa «Permitir».\nSi no se abre, copia este enlace:\n${url}`);
      if (process.platform === 'win32') execFile('rundll32', ['url.dll,FileProtocolHandler', url.toString()]);
      else if (process.platform === 'darwin') execFile('open', [url.toString()]);
    });
  });
  const t = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: codigo, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: vuelta, code_verifier: verificador }),
  })).json();
  if (!t.refresh_token) throw new Error(`Google no dio la sesión: ${t.error_description || t.error || 'sin refresh_token'}`);
  const quien = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
  const archivo = path.resolve(__dirname, '..', 'correo.private.txt');
  fs.writeFileSync(archivo, [`CORREO_CLIENT_ID=${c.client_id}`, `CORREO_CLIENT_SECRET=${c.client_secret}`, `CORREO_REFRESH_TOKEN=${t.refresh_token}`, `CORREO_REMITENTE=${quien.email || ''}`, ''].join('\n'), { mode: 0o600 });
  console.log(`\nConectada: ${quien.email}\nLas cuatro variables están en ${archivo}.\n1. Cópialas a Railway → vocai-os → Variables. Si los correos tienen que salir de un alias (por ejemplo avisos@…), pon ese alias en CORREO_REMITENTE.\n2. Borra el archivo.`);
})().catch(e => { console.error(`\nNo se pudo: ${e.message}`); process.exitCode = 1; });
