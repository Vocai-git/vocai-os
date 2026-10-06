'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const FinanceTax = require('../public/js/finance-tax');
function harness(records = []) {
  const nodes = {}, calls = { modal: [], post: [], put: [] }; let serial = 0;
  const ctx = {
    window: {}, FinanceTax, document: { getElementById: id => nodes[id] }, Intl, Date,
    crypto: { randomUUID: () => 'test-id-' + ++serial }, formatMoney: n => n.toFixed(2), escHtml: String,
    createModal: (...args) => calls.modal.push(args), closeModal() {}, toast() {},
    API: {
      post: async (path, payload) => { calls.post.push({ path, payload }); return { id: payload.id, data: payload.data, version: 1 }; },
      put: async (path, payload) => { calls.put.push({ path, payload }); return { id: path.split('/').pop(), data: payload.data, version: payload.version + 1 }; }
    }
  };
  vm.createContext(ctx);
  for (const file of ['../public/js/modules/money-tax', '../public/js/modules/money']) vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), ctx);
  ctx.moneyState = ctx.window.moneyState; ctx.moneyState.data = { records, review: false, baseline: { cutoff: '2026-10-05' }, files: [] }; ctx.moneyState.view = 'summary';
  ctx.moneyToday = () => '2026-10-06'; ctx.renderMoney = async () => {};
  const fields = values => Object.entries(values).forEach(([id, value]) => { nodes[id] = { value, innerHTML: '', textContent: '', disabled: false, hidden: false }; });
  const fill = (values = {}) => { fields({ mf_title: 'Servicio de prueba', mf_amount: '100', mf_tax_mode: 'none', mf_tax_rate: '21', mf_date: '2026-10-06', mf_status: 'pending', mf_payment_date: '2026-10-06', mf_account: 'bank', mf_stage: 'document', mf_save: '', mf_error: '', mf_tax_summary: '', mf_tax_rate_field: '', mf_amount_label: '', ...values }); nodes.mf_file = { files: [] }; };
  return { ctx, nodes, calls, fields, fill };
}
const doc = (extra = {}) => ({ id: 'existing-doc', version: 2, included_in_opening: false, data: { kind: 'income', title: 'Servicio previo', amount: 10000, date: '2026-10-06', repeat: 'none', payments: [], ...extra } });

test('adding VAT saves the gross total and a new real payment for exactly that total', async () => {
  const { ctx, fill, calls, nodes } = harness(); ctx.moneyForm('income');
  fill({ mf_amount: '250', mf_tax_mode: 'added', mf_tax_rate: '21', mf_status: 'paid', mf_start: '2026-09-01', mf_end: '2026-09-30' });
  ctx.moneyTaxUpdate();
  assert.equal(nodes.mf_amount_label.textContent, 'Base (€)');
  assert.match(nodes.mf_tax_summary.innerHTML, /250\.00/); assert.match(nodes.mf_tax_summary.innerHTML, /52\.50/); assert.match(nodes.mf_tax_summary.innerHTML, /302\.50/);
  await ctx.moneySave(); const data = calls.post[0].payload.data;
  assert.equal(data.amount, 30250); assert.equal(data.vat.input, 25000); assert.equal(data.vat.base, 25000); assert.equal(data.vat.tax, 5250);
  assert.equal(data.payments[0].amount, 30250); assert.equal(data.payments[0].date, '2026-10-06'); assert.equal(data.payments[0].account, 'bank');
  assert.equal(data.period_start, '2026-09-01'); assert.equal(data.period_end, '2026-09-30');
});

test('included VAT is broken down without charging VAT for a second time', async () => {
  const { ctx, fill, calls, nodes } = harness(); ctx.moneyForm('expense'); fill({ mf_amount: '121,00', mf_tax_mode: 'included', mf_tax_rate: '21' });
  ctx.moneyTaxUpdate(); assert.equal(nodes.mf_amount_label.textContent, 'Total (€)');
  assert.match(nodes.mf_tax_summary.innerHTML, /sin sumar nada/);
  await ctx.moneySave(); const data = calls.post[0].payload.data;
  assert.equal(data.amount, 12100); assert.equal(data.vat.base, 10000); assert.equal(data.vat.tax, 2100); assert.equal(data.payments.length, 0);
});

test('an existing document without VAT keeps its total and existing payments without inventing a tax breakdown', async () => {
  const existing = doc({ payments: [{ id: 'real-payment', amount: 10000, date: '2026-10-06', account: 'bank' }] });
  const { ctx, fill, calls, nodes } = harness([existing]); ctx.moneyForm('income', existing.id);
  assert.match(calls.modal[0][2], /Total sin desglose · conservar/);
  fill({ mf_amount: '100', mf_tax_mode: 'legacy', mf_title: 'Descripción corregida' }); ctx.moneyTaxUpdate();
  assert.match(nodes.mf_tax_summary.innerHTML, /No se deduce ni se añade IVA/);
  await ctx.moneySave(); const data = calls.put[0].payload.data;
  assert.equal(data.amount, 10000); assert.equal(Object.hasOwn(data, 'vat'), false);
  assert.equal(JSON.stringify(data.payments), JSON.stringify(existing.data.payments));
});

test('existing added VAT reopens its base instead of adding tax again to the stored gross amount', () => {
  const vat = FinanceTax.calculate(10000, 'added', 2100), existing = doc({ amount: vat.total, vat });
  const { ctx, calls } = harness([existing]); ctx.moneyForm('income', existing.id);
  const html = calls.modal[0][2];
  assert.match(html, /id="mf_amount_label">Base \(€\)/); assert.match(html, /id="mf_amount"[^>]*value="100\.00"/);
  assert.match(html, /value="added" selected/); assert.doesNotMatch(html, /Total sin desglose/);
});

test('VAT edits preserve previously recorded payments and do not change their dates or accounts', async () => {
  const existing = doc({ payments: [{ id: 'real-payment', amount: 10000, date: '2026-10-05', account: 'santi' }] });
  const { ctx, fill, calls } = harness([existing]); ctx.moneyForm('income', existing.id); fill({ mf_amount: '100', mf_tax_mode: 'added', mf_tax_rate: '21' });
  await ctx.moneySave(); const data = calls.put[0].payload.data;
  assert.equal(data.amount, 12100); assert.equal(JSON.stringify(data.payments), JSON.stringify(existing.data.payments));
  assert.equal(existing.data.amount, 10000); assert.equal(existing.data.vat, undefined);
});

test('VAT rates accept two decimal places and reject malformed rates before saving', async () => {
  const { ctx, fill, calls, nodes } = harness(); ctx.moneyForm('expense');
  for (const rate of ['21,234', '-1', '101', 'abc']) { fill({ mf_tax_mode: 'added', mf_tax_rate: rate }); await ctx.moneySave(); assert.equal(calls.post.length, 0); assert.ok(nodes.mf_error.textContent); }
  fill({ mf_tax_mode: 'added', mf_tax_rate: '10,50' }); await ctx.moneySave();
  assert.equal(calls.post[0].payload.data.amount, 11050); assert.equal(calls.post[0].payload.data.vat.rate, 1050);
});

test('Sin IVA explicitly stores zero additional tax, while capital has no tax controls', async () => {
  const { ctx, fill, calls } = harness(); ctx.moneyForm('expense'); fill({ mf_tax_mode: 'none', mf_tax_rate: '21' });
  await ctx.moneySave(); assert.equal(calls.post[0].payload.data.amount, 10000); assert.equal(calls.post[0].payload.data.vat.rate, 0); assert.equal(calls.post[0].payload.data.vat.tax, 0);
  ctx.moneyForm('contribution'); assert.doesNotMatch(calls.modal.at(-1)[2], /mf_tax_mode|mf_tax_rate/);
});
