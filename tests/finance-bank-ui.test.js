'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const FinanceBank = require('../public/js/finance-bank');
const source = fs.readFileSync(require.resolve('../public/js/modules/money-bank'), 'utf8');
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fixtureRecords = () => [
  { id: 'income-one', version: 1, data: { kind: 'income', date: '2026-10-06', title: 'Cliente prueba', amount: 20000, payments: [{ id: 'payment-one', date: '2026-10-06', amount: 20000, account: 'bank' }] } },
  { id: 'expense-one', version: 1, data: { kind: 'expense', date: '2026-10-06', title: 'Proveedor prueba', amount: 5000, payments: [{ id: 'payment-two', date: '2026-10-06', amount: 5000, account: 'bank' }] } },
  { id: 'capital-one', version: 1, data: { kind: 'contribution', date: '2026-10-06', title: 'Aporte prueba', amount: 100000, source: 'santi', target: 'bank', group: 'capital' } },
  { id: 'personal', version: 1, data: { kind: 'expense', date: '2026-10-06', title: 'Personal', amount: 5000, payments: [{ id: 'personal-payment', date: '2026-10-06', amount: 5000, account: 'santi' }] } }
];
const fixtureSheets = () => [{ name: 'Extracto', rows: [['Fecha movimiento', 'Concepto', 'Importe'], ['06/10/2026', 'Cliente prueba', '200,00'], ['06/10/2026', 'Proveedor prueba', '-50,00'], ['06/10/2026', 'Aporte prueba', '1.000,00']] }];
function setup(records = fixtureRecords()) {
  const nodes = { moneyBody: { innerHTML: '' } }, requests = [], notices = [], listeners = {};
  const ctx = {
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } }, FinanceBank,
    moneyState: { view: 'bank', month: '2026-10', data: { records, review: false } },
    moneyEsc: escape, moneyEuro: n => (n / 100).toFixed(2), moneyToday: () => '2026-10-06',
    document: { getElementById: id => nodes[id] ||= { innerHTML: '', value: '' } },
    confirm: () => true, toast: text => notices.push(text), moneyRecord: id => records.find(r => r.id === id),
    moneyForm: (...args) => notices.push(args), createModal: () => {}, closeModal: () => {},
    localStorage: { getItem: () => 'fixture-token' }, FormData: class { constructor() { this.parts = new Map(); } append(k, v) { this.parts.set(k, v); } get(k) { return this.parts.get(k); } },
    API: { get: async url => { requests.push(['GET', url]); return []; }, post: async (url, data) => { requests.push(['POST', url, data]); return FinanceBank.compare(data.rows, records, data.config, data.decisions); } }
  };
  vm.createContext(ctx); vm.runInContext(source, ctx); ctx.mb = vm.runInContext('mb', ctx);
  ctx.mb().month = '2026-10';
  const prepare = () => { const s = ctx.mb(); s.parsed = { filename: 'prueba.csv', sheets: fixtureSheets() }; s.file = { name: 'prueba.csv', size: 200 }; s.config = { ...FinanceBank.inferConfig(s.parsed.sheets, s.month), openingBalance: 10000, closingBalance: 125000 }; ctx.moneyBankNormalize(); return s; };
  return { ctx, nodes, requests, notices, listeners, prepare };
}

test('bank UI compares existing payments and contributions without creating financial records', async () => {
  const { ctx, prepare, requests, nodes } = setup(), before = JSON.stringify(ctx.moneyState.data.records), s = prepare();
  assert.equal(s.normalized.errors.length, 0);
  await ctx.moneyBankCompare();
  assert.equal(s.comparison.totals.matchedCount, 0);
  assert.equal(s.comparison.totals.bankIn, 120000);
  assert.equal(s.comparison.totals.bankOut, 5000);
  assert.equal(ctx.moneyBankSuggestions().length, 3);
  await ctx.moneyBankConfirmAll();
  assert.equal(s.comparison.totals.matchedCount, 3);
  assert.equal(s.comparison.ready, true);
  assert.equal(JSON.stringify(ctx.moneyState.data.records), before);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(r => r[1] === '/finance/bank-reviews/compare'));
  assert.match(nodes.moneyBody.innerHTML, /Listo para guardar/);
  await ctx.moneyBankUnlink(0);
  assert.equal(s.comparison.totals.matchedCount, 2);
  assert.equal(s.comparison.ready, false);
});

test('normalization errors prevent comparison and are shown alongside original file rows', async () => {
  const { ctx, prepare, requests, nodes } = setup(), s = prepare();
  s.parsed.sheets[0].rows[1][2] = 'importe ilegible';
  ctx.moneyBankNormalize(); ctx.moneyBankPaint(); await ctx.moneyBankCompare();
  assert.ok(s.normalized.errors.length);
  assert.equal(requests.length, 0);
  assert.match(nodes.moneyBody.innerHTML, /Revisa estas filas antes de comparar/);
  assert.match(nodes.moneyBody.innerHTML, /moneyBankCompare\(\)" disabled/);
});

test('different amounts cannot be linked and ambiguous candidates are never batch confirmed', async () => {
  const records = fixtureRecords(); records.push({ ...records[0], id: 'income-duplicate' });
  const { ctx, prepare } = setup(records), s = prepare(); await ctx.moneyBankCompare();
  const ambiguous = s.comparison.bankRows.find(row => row.description === 'Cliente prueba');
  assert.equal(ambiguous.status, 'ambiguous');
  await ctx.moneyBankConfirmAll();
  assert.equal(s.comparison.totals.matchedCount, 2);
  const rowIndex = s.comparison.bankRows.findIndex(row => row.description === 'Cliente prueba');
  const differentAmount = s.comparison.ledgerItems.findIndex(item => item.amount < 0);
  await ctx.moneyBankConfirm(rowIndex, differentAmount);
  assert.equal(s.comparison.totals.matchedCount, 2);
  assert.match(ctx.moneyBankComparisonHTML(), /Varias coincidencias/);
});

test('review save uses its own endpoint and version; ready is not presented as saved before the response', async () => {
  const { ctx, prepare, requests, nodes } = setup(), s = prepare(); await ctx.moneyBankCompare(); await ctx.moneyBankConfirmAll();
  s.review = { id: 'review-test', version: 3, name: 'prueba.csv', month: s.month };
  ctx.API.put = async (url, body) => { requests.push(['PUT', url, body]); return { review: { ...s.review, version: 4, config: s.config, rows: s.rows, decisions: s.decisions, notes: body.notes }, comparison: s.comparison }; };
  s.notes = 'Confirmado con el extracto';
  assert.doesNotMatch(ctx.moneyBankComparisonHTML(), />Extracto revisado</);
  await ctx.moneyBankSave();
  const put = requests.find(r => r[0] === 'PUT');
  assert.equal(put[1], '/finance/bank-reviews/review-test');
  assert.equal(put[2].version, 3);
  assert.equal(put[2].decisions.length, 3);
  assert.equal(s.review.version, 4); assert.equal(s.dirty, false);
  assert.match(nodes.moneyBody.innerHTML, />Extracto revisado</);
  assert.ok(requests.some(r => r[1] === '/finance/bank-reviews?month=2026-10'));
  assert.ok(requests.every(r => !r[1].includes('/finance/records')));
});

test('concurrency errors retain unsaved decisions and offer reloading instead of overwriting', async () => {
  const { ctx, prepare, nodes } = setup(), s = prepare(); await ctx.moneyBankCompare(); await ctx.moneyBankConfirmAll();
  s.review = { id: 'review-test', version: 1, name: 'prueba.csv' };
  ctx.API.put = async () => { const e = new Error('Cambió la revisión'); e.status = 409; throw e; };
  await ctx.moneyBankSave();
  assert.equal(s.decisions.length, 3); assert.equal(s.dirty, true);
  assert.match(nodes.moneyBody.innerHTML, /Otra persona pudo cambiar/);
  assert.match(nodes.moneyBody.innerHTML, /Volver a abrir la revisión guardada/);
});

test('invalid balances block saving and zero balances are retained as real values', async () => {
  const { ctx, prepare, requests } = setup(), s = prepare(); await ctx.moneyBankCompare();
  await ctx.moneyBankSetBalance('openingBalance', 'texto');
  assert.equal(s.balanceError, true); const before = requests.length; await ctx.moneyBankSave(); assert.equal(requests.length, before);
  await ctx.moneyBankSetBalance('openingBalance', '0'); assert.equal(s.config.openingBalance, 0); assert.equal(s.balanceError, false);
  assert.equal(ctx.moneyBankBalance('-12,50'), -1250); assert.equal(ctx.moneyBankBalance(''), null);
});

test('new files and months protect unsaved work and do not inherit a prior split-column mapping', async () => {
  const { ctx, prepare } = setup(), s = prepare(); s.split = true; s.dirty = true;
  ctx.confirm = () => false; ctx.moneyBankNew(); assert.ok(s.parsed); assert.equal(s.split, true);
  ctx.confirm = () => true; ctx.moneyBankNew(); assert.equal(s.parsed, null); assert.equal(s.split, null);
  assert.throws(() => ctx.moneyBankFileCheck({ name: 'test.pdf', size: 100 }), /CSV o XLSX/);
  assert.throws(() => ctx.moneyBankFileCheck({ name: 'test.csv', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
});

test('bank description and filenames are escaped in rendered UI', async () => {
  const { ctx, prepare, nodes } = setup(), s = prepare(); s.parsed.filename = '<img src=x onerror=alert(1)>.csv'; s.parsed.sheets[0].rows[1][1] = '<script>alert(1)</script>';
  ctx.moneyBankNormalize(); ctx.moneyBankPaint();
  assert.doesNotMatch(nodes.moneyBody.innerHTML, /<img src=x|<script>alert/);
  assert.match(nodes.moneyBody.innerHTML, /&lt;img/); assert.match(nodes.moneyBody.innerHTML, /&lt;script/);
});

test('month selection loads its own saved reviews rather than filtering a global recent page', async () => {
  const { ctx, requests, nodes } = setup();
  await ctx.moneyBankRender(nodes.moneyBody); ctx.moneyBankMonth('2026-04');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(requests.some(r => r[1] === '/finance/bank-reviews?month=2026-04'));
});

test('offline preview explicitly disables bank uploads and writes', () => {
  const { ctx, prepare } = setup(); ctx.window.moneyBankPreview = true;
  assert.match(ctx.moneyBankUploadHTML(), /moneyBankSelectFile\(this.files\[0\]\)" disabled/);
  const s = prepare(); s.comparison = FinanceBank.compare(s.rows, ctx.moneyState.data.records, s.config, []);
  assert.match(ctx.moneyBankComparisonHTML(), /moneyBankSave\(\)" disabled/);
});

test('upload parses first; saving retains the source and repeat-file responses open the existing review', async () => {
  const { ctx, requests, notices } = setup(), file = { name: 'archivo.csv', size: 240 }, uploads = [];
  ctx.fetch = async (url, options) => {
    uploads.push({ url, options });
    if (url.endsWith('/parse')) return { ok: true, json: async () => ({ filename: file.name, hash: 'fixture-hash', sheets: fixtureSheets() }) };
    const s = ctx.mb();
    return { ok: true, json: async () => ({ duplicate: true, review: { id: 'existing-review', month: s.month, name: file.name, version: 2, config: s.config, rows: s.rows, decisions: [], notes: 'Revisión previa' }, comparison: FinanceBank.compare(s.rows, ctx.moneyState.data.records, s.config, []) }) };
  };
  await ctx.moneyBankSelectFile(file);
  assert.equal(uploads.length, 1); assert.equal(uploads[0].url, '/api/finance/bank-reviews/parse');
  assert.equal(ctx.mb().review, null); assert.equal(ctx.mb().comparison, null);
  await ctx.moneyBankCompare(); await ctx.moneyBankSave();
  assert.equal(uploads[1].url, '/api/finance/bank-reviews');
  assert.equal(uploads[1].options.body.get('file'), file);
  assert.equal(JSON.parse(uploads[1].options.body.get('config')).month, '2026-10');
  assert.equal(JSON.parse(uploads[1].options.body.get('decisions')).length, 0);
  assert.equal(ctx.mb().review.id, 'existing-review'); assert.equal(ctx.mb().notes, 'Revisión previa');
  assert.ok(notices.some(n => /ya estaba guardado/.test(n)));
  assert.ok(requests.every(r => !r[1].includes('/finance/records')));
});

test('saved column mapping can be revised without replacing the original or financial records', async () => {
  const { ctx, prepare, requests, nodes } = setup(), s = prepare(); await ctx.moneyBankCompare(); await ctx.moneyBankConfirmAll();
  const review = JSON.parse(JSON.stringify({ id: 'saved-review', version: 2, month: s.month, name: 'original.csv', config: s.config, rows: s.rows, decisions: s.decisions, notes: 'Notas conservadas' }));
  ctx.moneyBankLoad({ review, comparison: s.comparison });
  ctx.API.get = async url => { requests.push(['GET', url]); return url.endsWith('/columns') ? { filename: review.name, sheets: fixtureSheets() } : []; };
  const before = JSON.stringify(ctx.moneyState.data.records);
  await ctx.moneyBankRemap();
  assert.equal(s.remapping, true); assert.equal(s.comparison, null); assert.equal(s.decisions.length, 0);
  assert.equal(review.decisions.length, 3); assert.equal(review.version, 2);
  assert.match(nodes.moneyBody.innerHTML, /Guardar columnas y volver a revisar/);
  ctx.moneyBankMonth('2026-09'); assert.equal(s.month, '2026-10');
  ctx.moneyBankConfig('description', '1'); assert.equal(s.config.description, 1);
  ctx.API.post = async (url, body) => {
    requests.push(['POST', url, body]);
    return { review: { ...review, config: body.config, rows: s.rows, decisions: [], version: 3 }, comparison: FinanceBank.compare(s.rows, ctx.moneyState.data.records, body.config, []) };
  };
  await ctx.moneyBankApplyColumns();
  const call = requests.find(r => r[1].endsWith('/remap'));
  assert.equal(call[2].version, 2); assert.equal(call[2].config.month, '2026-10');
  assert.deepEqual(Object.keys(call[2]).sort(), ['config', 'version']);
  assert.equal(s.remapping, false); assert.equal(s.review.version, 3); assert.equal(s.notes, 'Notas conservadas');
  assert.equal(s.comparison.totals.matchedCount, 0); assert.equal(JSON.stringify(ctx.moneyState.data.records), before);
});

test('invalid saved-column changes are blocked; conflicting changes keep the pending correction', async () => {
  const { ctx, prepare, requests } = setup(), s = prepare(); await ctx.moneyBankCompare();
  ctx.moneyBankLoad({ review: { id: 'saved-review', version: 1, month: s.month, name: 'original.csv', config: s.config, rows: s.rows, decisions: [] }, comparison: s.comparison });
  ctx.API.get = async () => ({ filename: 'original.csv', sheets: fixtureSheets() });
  await ctx.moneyBankRemap(); ctx.moneyBankConfig('amount', '1');
  const before = requests.length; await ctx.moneyBankApplyColumns(); assert.equal(requests.length, before);
  ctx.moneyBankConfig('amount', '2');
  ctx.API.post = async () => { const e = new Error('Cambió la revisión'); e.status = 409; throw e; };
  await ctx.moneyBankApplyColumns(); assert.equal(s.remapping, true); assert.equal(s.dirty, true); assert.equal(s.review.version, 1);
  assert.match(s.error, /Otra persona pudo cambiar/);
});

test('confirm, confirm all, unlink and balance changes use current server records instead of an older finance snapshot', async () => {
  const { ctx, prepare, requests } = setup(), s = prepare();
  const serverRecords = fixtureRecords();
  serverRecords.forEach(record => { record.version = 2; record.data.title += ' actualizado'; });
  ctx.API.post = async (url, body) => { requests.push(['POST', url, body]); return FinanceBank.compare(body.rows, serverRecords, body.config, body.decisions); };
  await ctx.moneyBankCompare();
  assert.equal(s.comparison.bankRows[0].status, 'suggested');
  await ctx.moneyBankConfirm(0);
  assert.equal(s.comparison.bankRows[0].status, 'matched');
  await ctx.moneyBankConfirmAll(); assert.equal(s.comparison.totals.matchedCount, 3);
  await ctx.moneyBankUnlink(1); assert.equal(s.comparison.totals.matchedCount, 2);
  await ctx.moneyBankSetBalance('openingBalance', '100');
  assert.equal(s.comparison.totals.matchedCount, 2);
  assert.ok(s.comparison.bankRows.every(row => row.status !== 'stale'));
  assert.ok(ctx.moneyState.data.records.every(record => record.version === 1));
  assert.equal(requests.length, 5);
  assert.ok(requests.every(request => request[1] === '/finance/bank-reviews/compare'));
  serverRecords[0].version = 3;
  await ctx.moneyBankSetBalance('closingBalance', '1250');
  assert.equal(s.comparison.bankRows[0].status, 'stale', 'a real change after confirmation still invalidates the link');
});

test('failed server comparisons retain confirmed links and prior balances without optimistic changes', async () => {
  const { ctx, prepare } = setup(), s = prepare(); await ctx.moneyBankCompare(); await ctx.moneyBankConfirm(0);
  const decisions = JSON.stringify(s.decisions), config = JSON.stringify(s.config), comparison = s.comparison;
  ctx.API.post = async () => { throw new Error('No se pudo conectar con VOCAI'); };
  await ctx.moneyBankConfirmAll();
  await ctx.moneyBankUnlink(0);
  await ctx.moneyBankSetBalance('openingBalance', '500');
  assert.equal(JSON.stringify(s.decisions), decisions);
  assert.equal(JSON.stringify(s.config), config);
  assert.equal(s.comparison, comparison);
  assert.match(s.error, /No se pudo conectar/);
  assert.equal(s.busy, false);
});

test('automatic recompare serializes review actions and cannot overwrite another review', async () => {
  const { ctx, prepare, nodes, requests } = setup(), s = prepare(); await ctx.moneyBankCompare();
  s.loaded = true; s.loadedMonth = s.month; s.recordRevision = 'outdated';
  let resolve;
  ctx.API.post = (url, body) => { requests.push(['POST', url, body]); return new Promise(done => { resolve = () => done(FinanceBank.compare(body.rows, ctx.moneyState.data.records, body.config, body.decisions)); }); };
  const rendering = ctx.moneyBankRender(nodes.moneyBody);
  assert.equal(s.busy, true);
  const before = requests.length;
  await ctx.moneyBankConfirmAll(); await ctx.moneyBankConfirm(0); await ctx.moneyBankSetBalance('openingBalance', '50');
  ctx.moneyBankChoose(0); ctx.moneyBankMonth('2026-09');
  assert.equal(requests.length, before); assert.equal(s.chooseIndex, undefined); assert.equal(s.month, '2026-10');
  assert.match(ctx.moneyBankBalancesHTML(), /moneyBankSetBalance\('openingBalance',this.value\)" disabled/);
  const nextComparison = { ...s.comparison, marker: 'another-review' };
  ctx.moneyBankLoad({ review: { id: 'other', month: '2026-09', config: { ...s.config, month: '2026-09' }, rows: [], decisions: [] }, comparison: nextComparison });
  resolve(); await rendering;
  assert.equal(s.month, '2026-09'); assert.equal(s.comparison, nextComparison); assert.equal(s.review.id, 'other');
});

test('opening a server-added movement refreshes finance data and preserves the bank review', async () => {
  const { ctx, prepare, requests, notices } = setup(), s = prepare();
  const serverRecords = fixtureRecords(); serverRecords[0].id = 'remote-income'; serverRecords[0].version = 2;
  ctx.API.post = async (url, body) => FinanceBank.compare(body.rows, serverRecords, body.config, body.decisions);
  await ctx.moneyBankCompare();
  s.notes = 'Avance conservado'; s.dirty = true;
  const comparison = s.comparison, rows = s.rows, config = s.config;
  ctx.API.get = async url => { requests.push(['GET', url]); return { records: serverRecords, review: false }; };
  const index = s.comparison.ledgerItems.findIndex(item => item.recordId === 'remote-income');
  assert.equal(ctx.moneyState.data.records.some(record => record.id === 'remote-income'), false);
  await ctx.moneyBankOpenRecord(index);
  assert.deepEqual(notices.at(-1), ['income', 'remote-income']);
  assert.equal(ctx.moneyState.data.records[0].version, 2);
  assert.equal(requests.at(-1)[1], '/finance');
  assert.equal(s.notes, 'Avance conservado'); assert.equal(s.dirty, true);
  assert.equal(s.comparison, comparison); assert.equal(s.rows, rows); assert.equal(s.config, config);
  assert.equal(ctx.moneyState.view, 'bank'); assert.equal(ctx.moneyState.month, '2026-10');
});

test('failure to refresh a movement shows an error and does not open its stale form', async () => {
  const { ctx, prepare, notices } = setup(), s = prepare(); await ctx.moneyBankCompare();
  const data = ctx.moneyState.data, comparison = s.comparison;
  ctx.API.get = async () => { throw new Error('No se pudo cargar el movimiento'); };
  await ctx.moneyBankOpenRecord(0);
  assert.equal(notices.length, 0); assert.equal(ctx.moneyState.data, data); assert.equal(s.comparison, comparison);
  assert.match(s.error, /No se pudo cargar/); assert.equal(s.busy, false);
});
