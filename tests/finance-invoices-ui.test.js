'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const FinanceTax = require('../public/js/finance-tax');
const source = fs.readFileSync(require.resolve('../public/js/modules/money-invoices'), 'utf8');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const customer = () => ({ name: 'Cliente de prueba', tax_id: 'TEST-ID', address: 'Calle de prueba', postal_code: '00000', city: 'Ciudad ficticia', country: 'País de prueba', email: '' });
const documentFixture = (extra = {}) => ({ date: '2026-10-07', due: null, period_start: null, period_end: null, customer: customer(), lines: [{ description: 'Servicio de prueba', detail: '', quantity: 1000, unit_price: 10000 }], vat_rate: 2100, irpf_rate: 0, tax_note: '', notes: '', theme: 'dark', totals: { base: 10000, vat: 2100, irpf: 0, gross: 12100, net: 12100 }, ...extra });
const invoiceFixture = (extra = {}) => ({ id: 'invoice-one', document: documentFixture(), status: 'draft', number: null, version: 1, record_id: null, record_version: null, new_record_id: 'reserved-income', ...extra });
const recordFixture = (extra = {}) => ({ id: 'income-one', version: 4, data: { kind: 'income', title: 'Servicio de prueba', party: 'Cliente de prueba', date: '2026-10-07', amount: 12100, vat: FinanceTax.calculate(10000, 'added', 2100), payments: [], ...extra } });
function setup(invoices = [], records = []) {
  const nodes = { moneyBody: { innerHTML: '' } }, calls = { get: [], post: [], put: [], modals: [], closed: [], toast: [], pay: [], form: [], fetch: [], blobs: [], revoked: [] }, listeners = {}; let serial = 0;
  const settings = { issuer: { ...customer(), name: 'Empresa de prueba', website: '', iban: '', payment_method: '' }, version: 1, series: [{ year: 2026, last_number: 0, last_date: null }], configured: true };
  const ctx = { window: { addEventListener: (name, fn) => { listeners[name] = fn; } }, FinanceTax, Intl, Date, BigInt, JSON,
    moneyState: { view: 'invoices', data: { records, review: false, files: [] } }, moneyToday: () => '2026-10-07', moneyEsc: escape, moneyEuro: n => (n / 100).toFixed(2), moneyPaid: d => (d.payments || []).reduce((sum, p) => sum + p.amount, 0),
    crypto: { randomUUID: () => 'invoice-new-' + ++serial }, confirm: () => true,
    document: { getElementById: id => nodes[id], querySelectorAll: () => [] },
    createModal: (...args) => calls.modals.push(args), closeModal: id => calls.closed.push(id), toast: (...args) => calls.toast.push(args),
    moneyForm: (...args) => calls.form.push(args), moneyPayment: id => calls.pay.push(id), moneyView: view => { ctx.moneyState.view = view; ctx.moneyInvoicesPaint(); },
    localStorage: { getItem: () => 'fixture-session' }, URL: { createObjectURL: blob => { calls.blobs.push(blob); return 'blob:fixture-' + calls.blobs.length; }, revokeObjectURL: url => calls.revoked.push(url) }
  };
  ctx.API = {
    get: async path => { calls.get.push(path); if (path === '/finance/invoices') return { invoices: invoices.slice(), settings }; if (path === '/finance') return ctx.moneyState.data; if (path === '/clients') return [{ id: 'client-one', nombre: 'Nombre conocido', empresa: 'Empresa conocida', email: 'cliente@example.test' }]; return invoices.find(i => i.id === path.split('/').at(-1)); },
    post: async (path, payload) => {
      calls.post.push({ path, payload });
      if (path.endsWith('/issue')) {
        const index = invoices.findIndex(i => i.id === path.split('/').at(-2)), old = invoices[index];
        if (old.status === 'issued') return old;
        if (!old.record_id) records.push(recordFixture({ amount: old.document.totals.gross, payments: [] }));
        const invoice = { ...old, version: old.version + 1, status: 'issued', number: '2026-001', record_id: old.record_id || 'income-one', issuer_snapshot: settings.issuer };
        invoices[index] = invoice; return invoice;
      }
      const existing = invoices.find(i => i.id === payload.id); if (existing) return existing;
      const invoice = invoiceFixture({ id: payload.id, document: payload.document, record_id: payload.record_id, record_version: payload.record_version }); invoices.push(invoice); return invoice;
    },
    put: async (path, payload) => { calls.put.push({ path, payload }); if (path.endsWith('/settings')) { Object.assign(settings, { issuer: payload.issuer, version: settings.version + 1 }); return settings; } const index = invoices.findIndex(i => i.id === path.split('/').at(-1)); const invoice = { ...invoices[index], version: payload.version + 1, document: payload.document, record_id: payload.record_id, record_version: payload.record_version }; invoices[index] = invoice; return invoice; }
  };
  ctx.fetch = async (url, options) => { calls.fetch.push({ url, options }); return { ok: true, headers: { get: () => 'application/pdf' }, blob: async () => ({ size: 200, type: 'application/pdf' }) }; };
  vm.createContext(ctx); vm.runInContext(source, ctx); ctx.mi = vm.runInContext('mi', ctx);
  ctx.mi().invoices = invoices.slice(); ctx.mi().settings = settings; ctx.mi().loaded = true;
  const complete = () => { const f = ctx.mi().editor.fields; f.customer = customer(); f.lines = [{ description: 'Servicio de prueba', detail: '', quantity: '1', unit_price: '100' }]; ctx.mi().editor.dirty = true; };
  return { ctx, nodes, calls, settings, invoices, records, listeners, complete };
}

test('invoice preview totals use integer line rounding then aggregate VAT and IRPF', () => {
  const { ctx } = setup();
  const totals = ctx.moneyInvoiceCalculate([{ quantity: 1500, unit_price: 1 }, { quantity: 1500, unit_price: 1 }], 2100, 1500);
  assert.deepEqual(JSON.parse(JSON.stringify(totals)), { base: 4, vat: 1, irpf: 1, gross: 5, net: 4 });
  assert.equal(ctx.moneyInvoiceDecimal('1,005', 3, 'Cantidad'), 1005);
  assert.equal(ctx.moneyInvoiceCalculate([{ quantity: 1005, unit_price: 10010 }], 0, 0).base, 10060);
  assert.throws(() => ctx.moneyInvoiceDecimal('1.234,56', 2, 'Precio'), /sin separador de miles/);
  assert.throws(() => ctx.moneyInvoiceCalculate([{ quantity: 0, unit_price: 10 }], 0, 0), /cantidades/);
  assert.throws(() => ctx.moneyInvoiceCalculate([{ quantity: 1000, unit_price: 1000000001 }], 0, 0), /límite/);
});

test('partial drafts persist without fiscal invention, official number, income or payment', async () => {
  const { ctx, calls, records } = setup(); ctx.moneyInvoiceNew();
  assert.equal(ctx.mi().editor.fields.vatRate, '21'); assert.equal(ctx.mi().editor.fields.vatEnabled, true); assert.equal(ctx.mi().editor.fields.irpfEnabled, false);
  assert.equal(await ctx.moneyInvoiceSave(), true);
  const payload = calls.post[0].payload;
  assert.equal(calls.post[0].path, '/finance/invoices'); assert.equal(payload.document.customer.tax_id, ''); assert.equal(payload.document.totals.net, 0);
  assert.equal(payload.document.lines[0].quantity, 1000); assert.equal(ctx.mi().editor.invoice.number, null); assert.equal(records.length, 0);
  assert.ok(calls.post.every(c => !c.path.includes('/records')));
});

test('known clients prefill only known name and email, leaving fiscal data for review', async () => {
  const { ctx } = setup(); await ctx.moneyInvoicesLoad(); ctx.moneyInvoiceNew(); ctx.moneyInvoicePickClient('0');
  const c = ctx.mi().editor.fields.customer;
  assert.equal(c.name, 'Empresa conocida'); assert.equal(c.email, 'cliente@example.test');
  for (const key of ['tax_id', 'address', 'postal_code', 'city', 'country']) assert.equal(c[key], '');
});

test('period requires both dates and field limits agree with server validation', async () => {
  const { ctx, calls } = setup(); ctx.moneyInvoiceNew(); ctx.moneyInvoiceEdit('period_start', '2026-09-01');
  assert.equal(await ctx.moneyInvoiceSave(), false); assert.match(ctx.mi().editor.error, /inicio y el final/); assert.equal(calls.post.length, 0);
  ctx.moneyInvoiceEdit('period_end', '2026-09-30'); assert.equal(await ctx.moneyInvoiceSave(), true);
  const html = ctx.moneyInvoiceEditorHTML(); assert.match(html, /maxlength="500" placeholder="Texto que deba aparecer/);
  assert.match(html, /maxlength="254" oninput="moneyInvoiceEdit\('customer.email'/);
  ctx.moneyInvoiceSettings(); const settings = calls.modals.at(-1)[2];
  assert.match(settings, /id="mis_iban"[^>]*maxlength="40"/); assert.match(settings, /id="mis_payment_method"[^>]*maxlength="180"/);
});

test('from existing income reuses its base, taxes, version and payments, never recording another income', async () => {
  const record = recordFixture({ irpf: FinanceTax.withholding(FinanceTax.calculate(10000, 'added', 2100), 1500), payments: [{ id: 'payment-one', amount: 5000, date: '2026-10-07', account: 'santi' }] });
  const { ctx, calls, records } = setup([], [record]), before = JSON.stringify(records);
  await ctx.moneyInvoiceFromRecord(record.id);
  assert.equal(ctx.mi().editor.fields.lines[0].unit_price, '100.00'); assert.equal(ctx.mi().editor.fields.irpfRate, '15');
  assert.equal(ctx.mi().editor.record_id, record.id); assert.equal(ctx.mi().editor.record_version, 4);
  await ctx.moneyInvoiceSave();
  assert.equal(calls.post[0].payload.record_id, record.id); assert.equal(calls.post[0].payload.record_version, 4); assert.equal(calls.post[0].payload.document.totals.net, 10600);
  assert.equal(JSON.stringify(records), before); assert.equal(calls.pay.length, 0);
});

test('legacy totals do not invent VAT and proven internal references are distinguished from official numbers', async () => {
  const legacy = recordFixture({ vat: undefined, number: 'VOCAI-2026-001', history: { sources: [{ table: 'invoices', original: { numero: 'VOCAI-2026-001' } }] } });
  const { ctx } = setup([], [legacy]); await ctx.moneyInvoiceFromRecord(legacy.id);
  assert.equal(ctx.mi().editor.fields.vatEnabled, false); assert.equal(ctx.mi().editor.fields.lines[0].unit_price, '121.00'); assert.match(ctx.mi().editor.prefillNote, /no tenía desglose/);
  assert.match(ctx.moneyInvoiceEditorHTML(), /Referencia anterior: VOCAI-2026-001/);
  assert.equal(ctx.moneyInvoiceRecordEligible(recordFixture({ number: '2026-010' })), false);
  assert.equal(ctx.moneyInvoiceRecordEligible(recordFixture({ number: 'VOCAI-2026-010' })), false);
});

test('opening an already linked income opens its existing invoice and cannot create another draft', async () => {
  const existing = invoiceFixture({ record_id: 'income-one' }), { ctx, calls } = setup([existing], [recordFixture()]);
  await ctx.moneyInvoiceFromRecord('income-one');
  assert.equal(ctx.mi().editor.invoice.id, existing.id); assert.equal(ctx.mi().editor.saved, true); assert.equal(calls.post.length, 0);
});

test('a failed lookup from an existing income reports the error without opening another invoice', async () => {
  const invoice = invoiceFixture({ record_id: 'income-one' }), { ctx, calls } = setup([invoice], [recordFixture()]), get = ctx.API.get;
  ctx.API.get = async path => { if (path.endsWith('/invoice-one')) throw new Error('No se pudo leer la factura'); return get(path); };
  await ctx.moneyInvoiceFromRecord('income-one');
  assert.equal(ctx.mi().editor, null); assert.equal(ctx.mi().busy, false); assert.match(calls.toast.at(-1)[0], /No se pudo leer/); assert.equal(calls.post.length, 0);
});

test('emission first saves and asks for confirmation; only confirmation issues and never collects', async () => {
  const { ctx, calls, complete, nodes, records } = setup(); ctx.moneyInvoiceNew(); complete();
  await ctx.moneyInvoiceIssueDialog();
  assert.equal(calls.post.length, 1); assert.equal(calls.post[0].path, '/finance/invoices');
  assert.equal(calls.modals.at(-1)[0], 'moneyInvoiceIssue'); assert.match(calls.modals.at(-1)[2], /Emitir no registra un cobro/);
  nodes.mi_issue_confirm = {}; nodes.mi_issue_error = {};
  await ctx.moneyInvoiceIssue();
  assert.equal(calls.post[1].path.endsWith('/issue'), true); assert.equal(ctx.mi().editor.invoice.number, '2026-001'); assert.equal(records.length, 1); assert.equal(records[0].data.payments.length, 0); assert.equal(calls.pay.length, 0);
  await ctx.moneyInvoiceOpenIncome(true); assert.deepEqual(calls.pay, ['income-one']);
});

test('missing numbering or fiscal details keep the saved draft and explain why issuance cannot continue', async () => {
  const { ctx, calls, complete, settings } = setup(); ctx.moneyInvoiceNew(); complete(); settings.series = [];
  await ctx.moneyInvoiceIssueDialog(); assert.equal(ctx.mi().editor.saved, true); assert.match(ctx.mi().editor.error, /numeración de 2026/); assert.equal(calls.modals.length, 0);
  settings.series = [{ year: 2026 }]; ctx.moneyInvoiceEdit('customer.tax_id', ''); await ctx.moneyInvoiceIssueDialog();
  assert.match(ctx.mi().editor.error, /NIF \/ CIF/); assert.ok(calls.post.every(c => !c.path.endsWith('/issue')));
});

test('a different gross or net prevents issuing against an existing income', async () => {
  const { ctx, calls } = setup([], [recordFixture()]); await ctx.moneyInvoiceFromRecord('income-one');
  ctx.mi().editor.fields.customer = customer(); ctx.moneyInvoiceLineEdit(0, 'unit_price', '200'); await ctx.moneyInvoiceIssueDialog();
  assert.match(ctx.mi().editor.error, /totales no coinciden/); assert.ok(calls.post.every(c => !c.path.endsWith('/issue')));
});

test('forecasts cannot be invoiced and linked dates and service periods must stay coherent', async () => {
  const record = recordFixture({ period_start: '2026-09-01', period_end: '2026-09-30', due: '2026-10-20' }), { ctx, calls } = setup([], [record]);
  assert.equal(ctx.moneyInvoiceRecordEligible(recordFixture({ stage: 'forecast' })), false);
  ctx.moneyInvoiceNew(); ctx.moneyInvoiceSelectRecord(record.id);
  assert.equal(ctx.mi().editor.fields.period_start, '2026-09-01'); assert.equal(ctx.mi().editor.fields.due, '2026-10-20'); assert.equal(ctx.mi().editor.record_version, 4);
  await ctx.moneyInvoiceFromRecord(record.id); ctx.mi().editor.fields.customer = customer(); ctx.moneyInvoiceEdit('date', '2026-10-06');
  await ctx.moneyInvoiceIssueDialog(); assert.match(ctx.mi().editor.error, /fecha, el vencimiento y el período/); assert.ok(calls.post.every(c => !c.path.endsWith('/issue')));
});

test('uncertain draft saves retry the same identifier and block changed payloads', async () => {
  const { ctx, calls, complete, invoices } = setup(), post = ctx.API.post; let fail = true;
  ctx.API.post = async (path, payload) => { const result = await post(path, payload); if (fail) { fail = false; throw new Error('Sin conexión'); } return result; };
  ctx.moneyInvoiceNew(); complete(); await ctx.moneyInvoiceSave(); const id = ctx.mi().editor.invoice.id;
  ctx.moneyInvoiceEdit('notes', 'cambio'); await ctx.moneyInvoiceSave(); assert.equal(calls.post.length, 1); assert.match(ctx.mi().editor.error, /guardado sin confirmar/);
  ctx.moneyInvoiceEdit('notes', ''); await ctx.moneyInvoiceSave();
  assert.equal(calls.post.length, 2); assert.equal(calls.post[1].payload.id, id); assert.equal(invoices.length, 1);
});

test('PDF preview uses authenticated binary fetch and cleans up its private object URL', async () => {
  const invoice = invoiceFixture(), { ctx, calls } = setup([invoice]); await ctx.moneyInvoicePDFAt(0);
  assert.equal(calls.fetch[0].url, '/api/finance/invoices/invoice-one/pdf'); assert.equal(calls.fetch[0].options.headers.Authorization, 'Bearer fixture-session');
  assert.doesNotMatch(calls.fetch[0].url, /fixture-session/); assert.match(calls.modals[0][2], /src="blob:fixture-1"/); assert.match(calls.modals[0][2], /Borrador sin emitir/);
  assert.equal(calls.post.length, 0); assert.equal(calls.pay.length, 0);
  ctx.moneyInvoiceClosePDF(); assert.deepEqual(calls.revoked, ['blob:fixture-1']); assert.equal(ctx.mi().pdfURL, null);
});

test('PDF errors and changed versions do not expose raw non-PDF content or stale downloads', async () => {
  const invoice = invoiceFixture(), { ctx, calls } = setup([invoice]); ctx.fetch = async () => ({ ok: true, headers: { get: () => 'text/html' } });
  await ctx.moneyInvoicePDFAt(0); assert.equal(calls.modals.length, 0); assert.match(ctx.mi().error, /no contiene un PDF/);
  ctx.API.get = async () => ({ ...invoice, version: 2 }); await ctx.moneyInvoicePDFAt(0); assert.equal(calls.modals.length, 0); assert.match(ctx.mi().error, /factura cambió/);
});

test('settings persist issuer fields and version without changing existing invoice snapshots', async () => {
  const existing = invoiceFixture({ status: 'issued', issuer_snapshot: { name: 'Emisor anterior' } }), { ctx, calls, nodes, invoices } = setup([existing]);
  ctx.moneyInvoiceSettings(); nodes.mis_name = { value: 'Emisor actualizado' }; nodes.mis_save = {}; nodes.mis_error = {};
  await ctx.moneyInvoiceSettingsSave(); assert.equal(calls.put[0].path, '/finance/invoices/settings'); assert.equal(calls.put[0].payload.version, 1); assert.equal(calls.put[0].payload.issuer.name, 'Emisor actualizado'); assert.equal(invoices[0].issuer_snapshot.name, 'Emisor anterior');
});

test('issued editor is read-only and untrusted invoice/customer text is escaped', () => {
  const invoice = invoiceFixture({ status: 'issued', number: '<img src=x>', document: documentFixture({ customer: { ...customer(), name: '<script>bad</script>' } }) }), { ctx } = setup([invoice]);
  assert.doesNotMatch(ctx.moneyInvoicesListHTML(), /<script>|<img src=x>/); assert.match(ctx.moneyInvoicesListHTML(), /&lt;script/);
  ctx.moneyInvoiceSetEditor(invoice); const html = ctx.moneyInvoiceEditorHTML(); assert.match(html, /fieldset disabled/); assert.doesNotMatch(html, /onclick="moneyInvoiceIssueDialog/);
  ctx.moneyInvoiceEdit('notes', 'attempt'); assert.equal(ctx.mi().editor.fields.notes, '');
});

test('income form guard disables issued fields while retaining notes and separate payment handling', async () => {
  const invoice = invoiceFixture({ status: 'issued', record_id: 'income-one' }), record = recordFixture(), { ctx, nodes } = setup([invoice], [record]);
  ctx.moneyState.form = { id: record.id }; nodes.mf_amount = { disabled: false }; nodes.mf_irpf_rate = { disabled: false }; nodes.mf_repeat = { disabled: false }; nodes.mf_notes = { disabled: false };
  await ctx.moneyInvoiceGuardForm(record); assert.equal(nodes.mf_amount.disabled, true); assert.equal(nodes.mf_irpf_rate.disabled, true); assert.equal(nodes.mf_repeat.disabled, true); assert.equal(nodes.mf_notes.disabled, false);
});
