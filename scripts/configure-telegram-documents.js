'use strict';
// Secrets come only from the server environment; never pass them on the CLI.
const PATH = '/api/telegram/documents/webhook';

async function telegramRequest(token, method, body) {
  let response, payload;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}), redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    payload = await response.json();
  } catch (_) { throw new Error('No se pudo contactar con Telegram. No se muestran credenciales ni respuestas privadas.'); }
  if (!response.ok || !payload?.ok) throw new Error('Telegram rechazó la operación. Revisa el token y los permisos del bot.');
  return payload.result;
}

async function configure(env, args, request = telegramRequest) {
  if (args.some(arg => !['--check', '--apply', '--replace'].includes(arg)) || (args.includes('--check') && args.includes('--apply'))) {
    throw new Error('Uso: node scripts/configure-telegram-documents.js --check | --apply [--replace]');
  }
  const names = ['TELEGRAM_DOCUMENTS_BOT_TOKEN', 'TELEGRAM_DOCUMENTS_BOT_USERNAME', 'TELEGRAM_DOCUMENTS_WEBHOOK_SECRET', 'TELEGRAM_DOCUMENTS_WEBHOOK_URL'];
  const missing = names.filter(name => !env[name]);
  if (missing.length) throw new Error('Faltan variables: ' + missing.join(', '));
  const token = env[names[0]], username = env[names[1]], secret = env[names[2]];
  const botId = Number(token.split(':')[0]);
  if (!/^\d{5,16}:[A-Za-z0-9_-]{20,100}$/.test(token) || !Number.isSafeInteger(botId) || botId <= 0) throw new Error('El token configurado no tiene un formato válido.');
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) throw new Error('Revisa el nombre de usuario del bot, sin @ ni enlaces.');
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error('El secreto del webhook debe tener entre 32 y 256 caracteres seguros.');
  let url;
  try { url = new URL(env[names[3]]); } catch (_) { throw new Error('La URL del webhook no es válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== PATH || !url.hostname.includes('.') || /^(localhost|127\.|0\.|\[)/i.test(url.hostname)) {
    throw new Error('Configura una URL HTTPS pública que termine en ' + PATH + ', sin credenciales ni parámetros.');
  }
  if (env.FINANCE_V2 !== 'true' || env.FINANCE_V2_LIVE !== 'true') throw new Error('Activa FINANCE_V2 y FINANCE_V2_LIVE antes de conectar Telegram.');
  const me = await request(token, 'getMe');
  if (!me?.is_bot || me.username?.toLowerCase() !== username.toLowerCase()) throw new Error('El token corresponde a otro bot. Revisa TELEGRAM_DOCUMENTS_BOT_USERNAME.');
  const before = await request(token, 'getWebhookInfo');
  const matches = info => info.url === url.href && info.max_connections === 2 && Array.isArray(info.allowed_updates) && info.allowed_updates.length === 1 && info.allowed_updates[0] === 'message';
  if (!args.includes('--apply')) return { bot: '@' + me.username, configured: matches(before), pendingUpdates: before.pending_update_count || 0, deliveryErrorReported: !!before.last_error_date, applied: false };
  if (before.url && before.url !== url.href && !args.includes('--replace')) throw new Error('Este bot ya tiene otro webhook. Usa un bot exclusivo; --replace solo si autorizaste reemplazarlo.');
  await request(token, 'setWebhook', { url: url.href, secret_token: secret, allowed_updates: ['message'], max_connections: 2, drop_pending_updates: false });
  const after = await request(token, 'getWebhookInfo');
  if (!matches(after)) throw new Error('No se pudo verificar la configuración final del webhook.');
  return { bot: '@' + me.username, configured: true, pendingUpdates: after.pending_update_count || 0, applied: true };
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  configure(process.env, process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
module.exports = { configure };
