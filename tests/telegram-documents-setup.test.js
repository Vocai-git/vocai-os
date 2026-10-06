'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configure } = require('../scripts/configure-telegram-documents');
const env = { FINANCE_V2: 'true', FINANCE_V2_LIVE: 'true', TELEGRAM_DOCUMENTS_BOT_TOKEN: '123456:synthetic-test-token', TELEGRAM_DOCUMENTS_BOT_USERNAME: 'test_documents_bot', TELEGRAM_DOCUMENTS_WEBHOOK_SECRET: 'x'.repeat(48), TELEGRAM_DOCUMENTS_WEBHOOK_URL: 'https://example.invalid/api/telegram/documents/webhook' };
function remote(existing = '') {
  const calls = [];
  const request = async (token, method, body) => {
    calls.push({ method, body });
    if (method === 'getMe') return { is_bot: true, username: env.TELEGRAM_DOCUMENTS_BOT_USERNAME };
    if (method === 'getWebhookInfo') return { url: calls.some(c => c.method === 'setWebhook') ? env.TELEGRAM_DOCUMENTS_WEBHOOK_URL : existing, pending_update_count: 1, max_connections: 2, allowed_updates: ['message'] };
    if (method === 'setWebhook') return true;
    throw new Error('Unexpected method');
  };
  return { request, calls };
}
test('Telegram setup defaults to read-only and never returns credentials', async () => {
  const r = remote(); const result = await configure(env, [], r.request);
  assert.equal(result.applied, false); assert.equal(result.configured, false);
  assert.deepEqual(r.calls.map(c => c.method), ['getMe', 'getWebhookInfo']);
  assert.ok(!JSON.stringify(result).includes(env.TELEGRAM_DOCUMENTS_BOT_TOKEN));
  assert.ok(!JSON.stringify(result).includes(env.TELEGRAM_DOCUMENTS_WEBHOOK_SECRET));
});
test('Telegram setup refuses replacing an existing integration without explicit flag', async () => {
  const r = remote('https://other.invalid/webhook');
  await assert.rejects(configure(env, ['--apply'], r.request), /otro webhook/);
  assert.ok(!r.calls.some(c => c.method === 'setWebhook'));
});
test('Telegram check rejects a matching URL with update types or concurrency misconfigured', async () => {
  for (const overrides of [{allowed_updates:['callback_query']},{max_connections:40}]) {
    const r=remote(env.TELEGRAM_DOCUMENTS_WEBHOOK_URL);
    const result=await configure(env,['--check'],async(token,method,body)=>{const response=await r.request(token,method,body);return method==='getWebhookInfo'?{...response,...overrides}:response;});
    assert.equal(result.configured,false);
    assert.ok(!r.calls.some(c=>c.method==='setWebhook'));
  }
});
test('Telegram setup preserves queued messages and applies narrow update types with a secret', async () => {
  const r = remote(); const result = await configure(env, ['--apply'], r.request);
  assert.equal(result.configured, true);
  assert.deepEqual(r.calls.find(c => c.method === 'setWebhook').body, { url: env.TELEGRAM_DOCUMENTS_WEBHOOK_URL, secret_token: env.TELEGRAM_DOCUMENTS_WEBHOOK_SECRET, allowed_updates: ['message'], max_connections: 2, drop_pending_updates: false });
});
test('Telegram setup rejects insecure URL, username mismatch and missing settings before mutation', async () => {
  const r = remote();
  for (const url of ['http://example.invalid/api/telegram/documents/webhook','https://example.invalid/api/telegram/documents/webhook?secret=x','https://username:pass@example.invalid/api/telegram/documents/webhook']) {
    await assert.rejects(configure({ ...env, TELEGRAM_DOCUMENTS_WEBHOOK_URL: url }, ['--apply'], r.request), /HTTPS/);
  }
  await assert.rejects(configure({}, ['--apply'], r.request), /Faltan variables/);
  await assert.rejects(configure({ ...env, TELEGRAM_DOCUMENTS_BOT_USERNAME: 'another_bot' }, ['--apply'], r.request), /otro bot/);
  assert.ok(!r.calls.some(c => c.method === 'setWebhook'));
});
