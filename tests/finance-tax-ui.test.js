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
  const fill = (values = {}) => { fields({ mf_title: 'Servicio de prueba', mf_amount: '100', mf_tax_mode: 'none', mf_tax_rate: '21', mf_irpf_enabled: false, mf_irpf_rate: '', mf_irpf_rate_field: '', mf_date: '2026-10-06', mf_status: 'pending', mf_payment_date: '2026-10-06', mf_account: 'bank', mf_stage: 'document', mf_save: '', mf_error: '', mf_tax_summary: '', mf_tax_rate_field: '', mf_amount_label: '', ...values }); nodes.mf_irpf_enabled.checked = values.mf_irpf_enabled === true; nodes.mf_file = { files: [] }; };
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

test('IRPF is optional, starts unchecked with no suggested rate and is absent from invoices without it', async () => {
  const { ctx, calls, fill } = harness(); ctx.moneyForm('income');
  const html = calls.modal[0][2];
  assert.match(html, /Aplicar retención IRPF/);
  assert.doesNotMatch(html, /id="mf_irpf_enabled"[^>]*checked/);
  assert.match(html, /id="mf_irpf_rate"[^>]*value=""[^>]*placeholder="Según la factura"/);
  fill({ mf_amount: '1250', mf_tax_mode: 'added', mf_status: 'paid' });
  await ctx.moneySave();
  const d = calls.post[0].payload.data;
  assert.equal(Object.hasOwn(d, 'irpf'), false); assert.equal(d.amount, 151250); assert.equal(d.payments[0].amount, 151250);
});

test('income with IRPF saves gross and VAT separately while a new payment uses the net total', async () => {
  const { ctx, calls, fill, nodes } = harness(); ctx.moneyForm('income');
  fill({ mf_amount: '1000', mf_tax_mode: 'added', mf_irpf_enabled: true, mf_irpf_rate: '15', mf_status: 'paid' });
  ctx.moneyTaxUpdate();
  assert.equal(nodes.mf_amount_label.textContent, 'Base (€)'); assert.equal(nodes.mf_irpf_rate_field.hidden, false);
  assert.match(nodes.mf_tax_summary.innerHTML, /Base \+ IVA/); assert.match(nodes.mf_tax_summary.innerHTML, /−150\.00/);
  assert.match(nodes.mf_tax_summary.innerHTML, /Total a cobrar <b>1060\.00/);
  const calculated = ctx.moneyTaxRead(); assert.equal(calculated.amount, 121000); assert.equal(calculated.payable, 106000);
  await ctx.moneySave(); const d = calls.post[0].payload.data;
  assert.equal(d.amount, 121000); assert.equal(d.vat.total, 121000); assert.equal(d.vat.base, 100000); assert.equal(d.vat.tax, 21000);
  assert.equal(d.irpf.rate, 1500); assert.equal(d.irpf.base, 100000); assert.equal(d.irpf.tax, 15000);
  assert.equal(d.payments[0].amount, 106000); assert.equal(d.payments[0].account, 'bank'); assert.equal(d.payments[0].date, '2026-10-06');
  assert.equal(Object.hasOwn(d, 'payable'), false, 'net is calculated, not a second persisted invoice total');
});

test('included VAT takes the total before withholding and expense details show gross, retention and net', async () => {
  const { ctx, fill, calls, nodes } = harness(); ctx.moneyForm('expense');
  fill({ mf_amount: '1210', mf_tax_mode: 'included', mf_irpf_enabled: true, mf_irpf_rate: '15,50' }); ctx.moneyTaxUpdate();
  assert.equal(nodes.mf_amount_label.textContent, 'Total antes de retención (€)');
  assert.match(nodes.mf_tax_summary.innerHTML, /Escribe el importe antes de retención/);
  assert.match(nodes.mf_tax_summary.innerHTML, /Total a pagar <b>1055\.00/);
  await ctx.moneySave(); const d = calls.post[0].payload.data;
  assert.equal(d.amount, 121000); assert.equal(d.vat.input, 121000); assert.equal(d.irpf.tax, 15500); assert.equal(d.payments.length, 0);
  const detail = ctx.moneyRecordDetailHTML({ id: 'example', data: d });
  assert.match(detail, /Base \+ IVA: 1210\.00/); assert.match(detail, /Retención IRPF \(15,5 %\)/); assert.match(detail, /Total a pagar <b>1055\.00/);
});

test('IRPF requires an explicit VAT breakdown and a valid entered percentage before saving', async () => {
  const existing = doc(), { ctx, fill, calls, nodes } = harness([existing]); ctx.moneyForm('income', existing.id);
  fill({ mf_tax_mode: 'legacy', mf_irpf_enabled: true, mf_irpf_rate: '15' }); await ctx.moneySave();
  assert.equal(calls.put.length, 0); assert.match(nodes.mf_error.textContent, /indica el desglose de IVA/);
  for (const rate of ['', '0', '-1', '101', '15,333', 'texto']) {
    fill({ mf_tax_mode: 'added', mf_irpf_enabled: true, mf_irpf_rate: rate }); await ctx.moneySave();
    assert.equal(calls.put.length, 0); assert.match(nodes.mf_error.textContent, /IRPF|retención/i);
  }
  fill({ mf_tax_mode: 'none', mf_irpf_enabled: true, mf_irpf_rate: '7' }); await ctx.moneySave();
  assert.equal(calls.put[0].payload.data.amount, 10000); assert.equal(calls.put[0].payload.data.irpf.tax, 700);
});

test('reopening IRPF preserves the original VAT input, percentage and existing net payments', async () => {
  const vat = FinanceTax.calculate(100000, 'added', 2100), irpf = FinanceTax.withholding(vat, 1500);
  const existing = doc({ amount: vat.total, vat, irpf, payments: [{ id: 'real-payment', amount: 106000, date: '2026-10-06', account: 'santi' }] });
  const before = JSON.stringify(existing), { ctx, calls, fill } = harness([existing]); ctx.moneyForm('income', existing.id);
  const html = calls.modal[0][2];
  assert.match(html, /id="mf_amount"[^>]*value="1000\.00"/); assert.match(html, /id="mf_irpf_enabled"[^>]*checked/);
  assert.match(html, /id="mf_irpf_rate"[^>]*value="15"/);
  fill({ mf_amount: '1000', mf_tax_mode: 'added', mf_irpf_enabled: true, mf_irpf_rate: '15', mf_title: 'Descripción nueva' });
  await ctx.moneySave(); const d = calls.put[0].payload.data;
  assert.equal(d.amount, 121000); assert.equal(d.vat.input, 100000); assert.equal(d.irpf.rate, 1500);
  assert.equal(JSON.stringify(d.payments), JSON.stringify(existing.data.payments)); assert.equal(JSON.stringify(existing), before);
  assert.match(ctx.moneyRecordDetailHTML({ ...existing, data: d }), /Pago o cobro confirmado/);
  const modalCount = calls.modal.length; ctx.moneyState.data.records = [{ ...existing, data: d }]; ctx.moneyPayment(existing.id);
  assert.equal(calls.modal.length, modalCount, 'net fully paid is not offered another payment for the withholding');
});

test('turning off IRPF removes only the retention and leaves prior payments untouched', async () => {
  const vat = FinanceTax.calculate(100000, 'added', 2100), irpf = FinanceTax.withholding(vat, 1500);
  const existing = doc({ amount: vat.total, vat, irpf, payments: [{ id: 'real-payment', amount: 106000, date: '2026-10-06', account: 'santi' }] });
  const { ctx, calls, fill } = harness([existing]); ctx.moneyForm('income', existing.id);
  fill({ mf_amount: '1000', mf_tax_mode: 'added', mf_irpf_enabled: false, mf_irpf_rate: '15' }); await ctx.moneySave();
  const d = calls.put[0].payload.data;
  assert.equal(Object.hasOwn(d, 'irpf'), false); assert.equal(d.amount, 121000);
  assert.equal(JSON.stringify(d.payments), JSON.stringify(existing.data.payments));
  ctx.moneyState.data.records = [{ ...existing, data: d }]; ctx.moneyPayment(existing.id);
  assert.match(calls.modal.at(-1)[2], /pendiente 150\.00/);
});

test('adding retention never reduces existing payments when they already exceed the new net total', async () => {
  const vat = FinanceTax.calculate(100000, 'added', 2100), existing = doc({ amount: vat.total, vat, payments: [{ id: 'existing', amount: 121000, date: '2026-10-06', account: 'bank' }] });
  const before = JSON.stringify(existing), { ctx, calls, fill, nodes } = harness([existing]); ctx.moneyForm('income', existing.id);
  fill({ mf_amount: '1000', mf_tax_mode: 'added', mf_irpf_enabled: true, mf_irpf_rate: '15' }); await ctx.moneySave();
  assert.equal(calls.put.length, 0); assert.match(nodes.mf_error.textContent, /menor que los pagos ya registrados/); assert.equal(JSON.stringify(existing), before);
});

test('partial payments are capped at the net remaining amount instead of the gross invoice total', async () => {
  const vat = FinanceTax.calculate(100000, 'added', 2100), irpf = FinanceTax.withholding(vat, 1500);
  const existing = doc({ amount: vat.total, vat, irpf, payments: [{ id: 'first', amount: 60000, date: '2026-10-06', account: 'bank' }] });
  const { ctx, calls, fields, nodes } = harness([existing]); ctx.moneyPayment(existing.id);
  assert.match(calls.modal[0][2], /pendiente 460\.00/);
  fields({ mp_amount: '610', mp_date: '2026-10-06', mp_account: 'bank', mp_save: '', mp_error: '' });
  await ctx.moneyPaySave(); assert.equal(calls.put.length, 0); assert.match(nodes.mp_error.textContent, /supera el importe pendiente/);
  nodes.mp_amount.value = '460'; await ctx.moneyPaySave();
  const d = calls.put[0].payload.data;
  assert.equal(d.payments[0].amount, 60000); assert.equal(d.payments[1].amount, 46000); assert.equal(d.amount, 121000); assert.equal(d.irpf.tax, 15000);
});
