'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const FinanceTax = require('../public/js/finance-tax');
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fixtureDocument = (extra = {}) => ({ id: 'doc-one', draft_record_id: 'reserved-record', version: 1, name: 'factura.pdf', mime: 'application/pdf', bytes: 100, source: 'manual', status: 'pending', caption: '', record_id: null, created_at: '2026-10-07T10:00:00Z', ...extra });
const fixtureRecord = (extra = {}) => ({ id: 'existing-record', version: 1, data: { kind: 'expense', title: 'Material oficina', party: 'Proveedor de prueba', amount: 12100, date: '2026-10-06', payments: [], repeat: 'none' }, ...extra });
function setup(documents = [fixtureDocument()], records = []) {
  const nodes = { moneyBody: { innerHTML: '' }, pageContent: { innerHTML: '' } }, calls = { get: [], post: [], put: [], del: [], fetch: [], modals: [], toasts: [], closed: [] }; let serial = 0;
  const ctx = {
    window: {}, FinanceTax, URL, Intl, Date, crypto: { randomUUID: () => 'random-' + ++serial },
    formatMoney: n => n.toFixed(2), escHtml: escape, document: { getElementById: id => nodes[id] },
    localStorage: { getItem: () => 'fixture-token' }, FormData: class { constructor() { this.parts = new Map(); } append(k, v) { this.parts.set(k, v); } get(k) { return this.parts.get(k); } },
    confirm: () => true, toast: (...a) => calls.toasts.push(a), closeModal: id => calls.closed.push(id), createModal: (...a) => calls.modals.push(a)
  };
  ctx.API = {
    get: async path => {
      calls.get.push(path);
      if (path === '/finance') return ctx.moneyState.data;
      if (path.endsWith('/telegram')) return { configured: false, pairing: null };
      if (path.includes('?')) { const params = new URL('https://example.test' + path).searchParams, status = params.get('status'); const rows = documents.filter(d => status === 'all' || d.status === status); return { documents: rows.slice(Number(params.get('offset')), Number(params.get('offset')) + Number(params.get('limit'))), total: rows.length }; }
      if (path.endsWith('/file')) return { url: 'https://storage.example.test/private?token=temporary' };
      return { document: documents.find(d => d.id === path.split('/').at(-1)) };
    },
    post: async (path, body) => {
      calls.post.push({ path, body });
      if (path === '/finance/records') { const record = { id: body.id, version: 1, data: body.data }; records.push(record); return record; }
      if (path.endsWith('/record')) {
        const index = documents.findIndex(d => d.id === path.split('/').at(-2)), doc = documents[index];
        let record = records.find(r => r.id === doc.draft_record_id);
        if (doc.status !== 'pending' && !(doc.status === 'linked' && doc.record_id === doc.draft_record_id && JSON.stringify(record?.data) === JSON.stringify(body.data))) { const e = new Error('El documento cambió. Recarga.'); e.status = 409; throw e; }
        if (!record) { record = { id: doc.draft_record_id, data: body.data, version: 1 }; records.push(record); }
        documents[index] = { ...doc, status: 'linked', record_id: record.id, version: doc.version + 1 };
        return { record, document: documents[index], file: { id: 'file-one' } };
      }
      if (path.endsWith('/link')) { const index = documents.findIndex(d => d.id === path.split('/').at(-2)); documents[index] = { ...documents[index], status: 'linked', record_id: body.recordId, version: documents[index].version + 1 }; return { document: documents[index], file: { id: 'file-one' } }; }
      if (path.endsWith('/code')) return { url: 'https://t.me/example_bot?start=fixture', expiresAt: '2026-10-07T12:10:00Z' };
    },
    put: async (path, body) => { calls.put.push({ path, body }); const index = documents.findIndex(d => d.id === path.split('/').at(-1)); documents[index] = { ...documents[index], status: body.status, version: documents[index].version + 1 }; return { document: documents[index] }; },
    del: async path => { calls.del.push(path); return { disconnected: true }; }
  };
  ctx.fetch = async (url, options) => { calls.fetch.push({ url, options }); return { ok: true, json: async () => ({ document: documents[0], duplicate: false }) }; };
  vm.createContext(ctx);
  for (const name of ['money-tax', 'money-documents', 'money']) vm.runInContext(fs.readFileSync(require.resolve('../public/js/modules/' + name), 'utf8'), ctx);
  ctx.moneyState = ctx.window.moneyState; ctx.md = vm.runInContext('md', ctx);
  ctx.moneyState.data = { review: false, records, files: [], baseline: { cutoff: '2026-10-05' }, summary: {} }; ctx.moneyState.view = 'documents'; ctx.moneyState.month = '2026-10';
  ctx.md().documents = documents.slice(); ctx.md().total = documents.length; ctx.md().loaded = true;
  ctx.moneyToday = () => '2026-10-07'; ctx.renderMoney = async () => {};
  const fields = values => Object.entries(values).forEach(([id, value]) => { nodes[id] = { value, innerHTML: '', textContent: '', disabled: false, hidden: false }; });
  const fill = (values = {}) => { fields({ mf_title: 'Factura revisada', mf_amount: '100', mf_tax_mode: 'added', mf_tax_rate: '21', mf_irpf_rate: '', mf_status: 'pending', mf_date: '2026-10-07', mf_stage: 'document', mf_payment_date: '2026-10-07', mf_account: 'bank', mf_save: '', mf_error: '', ...values }); nodes.mf_irpf_enabled = { checked: false }; };
  return { ctx, nodes, calls, documents, records, fields, fill };
}

test('Documentos is before bank and Saldos remains last; the header opens independent uploads', () => {
  const { ctx, nodes } = setup(); ctx.moneyDocumentsRender = () => {};
  ctx.moneyDraw(nodes.pageContent);
  const html = nodes.pageContent.innerHTML;
  assert.ok(html.indexOf('>Documentos</button>') < html.indexOf('>Revisar banco</button>'));
  assert.ok(html.indexOf('>Revisar banco</button>') < html.indexOf('>Saldos</button>'));
  assert.match(html, /onclick="moneyDocumentsAttach\(\)">Adjuntar factura/);
});

test('independent uploads receive a file and caption without creating movements or payments', async () => {
  const { ctx, calls, fields, nodes, records } = setup();
  fields({ md_upload_error: '', md_upload_save: '', md_caption: 'Oficina' }); nodes.md_file = { files: [{ name: 'factura.pdf', type: 'application/pdf', size: 100 }] };
  await ctx.moneyDocumentsUpload();
  assert.equal(calls.fetch.length, 1); assert.equal(calls.fetch[0].url, '/api/finance/documents');
  assert.equal(calls.fetch[0].options.body.get('caption'), 'Oficina'); assert.equal(calls.post.length, 0); assert.equal(records.length, 0);
  assert.ok(calls.closed.includes('moneyDocumentUpload')); assert.match(nodes.moneyBody.innerHTML, /Recibido · por revisar/);
});

test('invalid attachments are blocked and duplicate upload responses preserve the original state', async () => {
  const { ctx, calls, fields, nodes, documents } = setup(); fields({ md_upload_error: '', md_upload_save: '', md_caption: '' });
  for (const file of [{ name: 'x.pdf', type: 'application/pdf', size: 10485761 }, { name: 'x.html', type: 'text/html', size: 10 }, { name: 'x.png', type: 'image/png', size: 0 }]) { nodes.md_file = { files: [file] }; await ctx.moneyDocumentsUpload(); assert.equal(calls.fetch.length, 0); assert.ok(nodes.md_upload_error.textContent); }
  documents[0] = fixtureDocument({ status: 'linked', record_id: 'existing-record' });
  ctx.fetch = async () => ({ ok: true, json: async () => ({ document: documents[0], duplicate: true }) });
  nodes.md_file = { files: [{ name: 'x.pdf', type: 'application/pdf', size: 100 }] }; await ctx.moneyDocumentsUpload();
  assert.equal(ctx.md().status, 'linked'); assert.equal(calls.post.length, 0); assert.ok(calls.toasts.some(a => /ya estaba en la bandeja/.test(a[0])));
});

test('create expense defaults to pending and atomically saves and links through its document', async () => {
  const { ctx, calls, fill, records } = setup(); await ctx.moneyDocumentCreate(0);
  assert.equal(ctx.moneyState.form.id, 'reserved-record');
  const html = calls.modals.at(-1)[2]; assert.match(html, /Documento recibido/); assert.doesNotMatch(html, /id="mf_file"/); assert.match(html, /id="mf_status" type="hidden" value="pending"/);
  assert.equal(calls.post.length, 0); fill(); await ctx.moneySave();
  assert.equal(records.length, 1); assert.equal(records[0].data.amount, 12100); assert.equal(records[0].data.payments.length, 0);
  assert.equal(calls.post.length, 1); assert.equal(calls.post[0].path, '/finance/documents/doc-one/record'); assert.equal(calls.post[0].body.version, 1);
  assert.equal(ctx.md().documents[0].status, 'linked');
});

test('an uncertain atomic save retries the same document and payload without a duplicate expense', async () => {
  const { ctx, calls, fill, nodes, records } = setup(); const post = ctx.API.post; let failed = false;
  ctx.API.post = async (path, body) => { const result = await post(path, body); if (path.endsWith('/record') && !failed) { failed = true; throw new Error('No se pudo confirmar el guardado'); } return result; };
  await ctx.moneyDocumentCreate(0); fill(); await ctx.moneySave();
  assert.equal(records.length, 1); assert.match(nodes.mf_error.textContent, /No se pudo confirmar/);
  await ctx.moneySave();
  assert.equal(records.length, 1); assert.equal(calls.post.filter(c => c.path === '/finance/records').length, 0); assert.equal(calls.put.length, 0);
  assert.equal(calls.post.length, 2); assert.equal(JSON.stringify(calls.post[0].body), JSON.stringify(calls.post[1].body));
  assert.equal(ctx.md().documents[0].status, 'linked');
});

test('if another user links the document while its form is open, saving cannot create an orphan expense', async () => {
  const { ctx, calls, fill, documents, nodes, records } = setup(); await ctx.moneyDocumentCreate(0); fill();
  documents[0] = { ...documents[0], version: 2, status: 'linked', record_id: 'other-record' };
  await ctx.moneySave();
  assert.equal(records.length, 0); assert.equal(calls.post.length, 1); assert.equal(calls.post[0].path, '/finance/documents/doc-one/record');
  assert.match(nodes.mf_error.textContent, /documento cambió/);
});

test('reopening after an uncertain creation finds the reserved record and offers recovery instead of another form', async () => {
  const prior = fixtureRecord({ id: 'reserved-record' }), { ctx, calls, fields, records } = setup([fixtureDocument()], [prior]);
  fields({ md_link_error: '', md_link_save: '' }); await ctx.moneyDocumentCreate(0);
  assert.match(calls.modals.at(-1)[1], /Continuar con el movimiento guardado/); assert.match(calls.modals.at(-1)[3], /Completar vinculación/);
  assert.equal(ctx.moneyState.form, undefined); const before = JSON.stringify(records);
  await ctx.moneyDocumentLink(0);
  assert.equal(JSON.stringify(records), before); assert.equal(calls.post.length, 1); assert.match(calls.post[0].path, /\/link$/);
});

test('linking searches existing concepts, suppliers and amounts and never changes their payments', async () => {
  const record = fixtureRecord({ included_in_opening: true }), { ctx, nodes, fields, calls, records } = setup([fixtureDocument()], [record]);
  fields({ md_search: '', md_choices: '', md_link_error: '' }); await ctx.moneyDocumentChoose(0);
  for (const query of ['material', 'proveedor', '121,00']) { nodes.md_search.value = query; ctx.moneyDocumentChoices(); assert.match(nodes.md_choices.innerHTML, /Material oficina/); }
  const before = JSON.stringify(records); await ctx.moneyDocumentLink(0);
  assert.equal(JSON.stringify(records), before); assert.equal(calls.put.length, 0); assert.equal(calls.post.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.post[0].body)), { version: 1, recordId: 'existing-record' });
});

test('archive and restore affect the document only, and conflicts are visible', async () => {
  const { ctx, calls } = setup(); await ctx.moneyDocumentStatus(0, 'archived');
  assert.equal(calls.put[0].path, '/finance/documents/doc-one'); assert.equal(calls.put[0].body.status, 'archived'); assert.equal(calls.post.length, 0);
  ctx.md().status = 'archived'; await ctx.moneyDocumentsLoad(); await ctx.moneyDocumentStatus(0, 'pending');
  assert.equal(calls.put[1].body.status, 'pending');
  ctx.md().status = 'pending'; await ctx.moneyDocumentsLoad(); ctx.API.put = async () => { const e = new Error('Cambió'); e.status = 409; throw e; };
  await ctx.moneyDocumentStatus(0, 'archived'); assert.match(ctx.md().error, /Actualiza la bandeja/); assert.equal(ctx.md().documents[0].status, 'pending');
});

test('private file access requires the API and renders a safe explicit link rather than a popup', async () => {
  const { ctx, calls } = setup(); await ctx.moneyDocumentViewAt(0);
  assert.equal(calls.get[0], '/finance/documents/doc-one/file'); assert.match(calls.modals[0][2], /https:\/\/storage\.example\.test/); assert.match(calls.modals[0][2], /rel="noopener noreferrer"/);
  ctx.API.get = async () => ({ url: 'javascript:alert(1)' }); const count = calls.modals.length; await ctx.moneyDocumentViewAt(0);
  assert.equal(calls.modals.length, count); assert.match(ctx.md().error, /No se pudo abrir el enlace/);
});

test('filenames and captions are escaped and stale list requests cannot overwrite the selected status', async () => {
  const { ctx, nodes } = setup([fixtureDocument({ name: '<img src=x>.pdf', caption: '<script>alert(1)</script>' })]); ctx.moneyDocumentsPaint();
  assert.doesNotMatch(nodes.moneyBody.innerHTML, /<img src=x|<script>alert/); assert.match(nodes.moneyBody.innerHTML, /&lt;img/);
  let finish; ctx.API.get = async path => path.includes('status=pending') ? new Promise(resolve => { finish = resolve; }) : { documents: [], total: 0 };
  const old = ctx.moneyDocumentsLoad(); ctx.md().status = 'archived'; await ctx.moneyDocumentsLoad(); finish({ documents: [fixtureDocument()], total: 1 }); await old;
  assert.equal(ctx.md().status, 'archived'); assert.equal(ctx.md().documents.length, 0); assert.equal(ctx.md().loading, false);
});

test('a delayed document action cannot replace another form that the user has already opened', async () => {
  const { ctx, calls, documents } = setup(); let finish;
  ctx.API.get = async path => path === '/finance' ? ctx.moneyState.data : new Promise(resolve => { finish = () => resolve({ document: documents[0] }); });
  const creating = ctx.moneyDocumentCreate(0);
  ctx.moneyForm('income'); const chosenForm = ctx.moneyState.form, count = calls.modals.length;
  finish(); await creating;
  assert.equal(ctx.moneyState.form, chosenForm); assert.equal(calls.modals.length, count); assert.equal(ctx.md().busy, false);
});

test('Telegram setup uses one-use links, verifies pairing and disconnects without touching documents', async () => {
  const { ctx, calls, documents } = setup(); ctx.md().telegram = { configured: true, pairing: null };
  await ctx.moneyDocumentsConnect(); assert.equal(calls.post[0].path, '/finance/documents/telegram/code');
  assert.match(calls.modals.at(-1)[2], /t\.me\/example_bot/); assert.match(calls.modals.at(-1)[2], /un solo uso/);
  ctx.API.get = async () => ({ configured: true, pairing: { chatId: 'fixture', connectedAt: '2026-10-07' } });
  await ctx.moneyDocumentsTelegramCheck(); assert.ok(calls.closed.includes('moneyDocumentTelegram'));
  const before = JSON.stringify(documents); await ctx.moneyDocumentsDisconnect();
  assert.equal(calls.del[0], '/finance/documents/telegram'); assert.equal(JSON.stringify(documents), before);
});

test('not configured and read-only states expose no available upload or connect action', async () => {
  const { ctx, nodes, calls } = setup(); ctx.md().telegram = { configured: false, pairing: null }; ctx.moneyDocumentsPaint();
  assert.match(nodes.moneyBody.innerHTML, /todavía no está configurado/); assert.doesNotMatch(ctx.moneyDocumentsTelegramHTML(), /onclick="moneyDocumentsConnect/);
  ctx.moneyState.data.review = true; await ctx.moneyDocumentsConnect(); await ctx.moneyDocumentCreate(0); ctx.moneyDocumentsUploadModal();
  assert.equal(calls.post.length, 0); assert.equal(calls.modals.length, 0); assert.match(ctx.moneyDocumentCard(fixtureDocument(), 0), /moneyDocumentCreate\(0\)" disabled/);
});
