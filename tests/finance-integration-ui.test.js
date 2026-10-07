'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const FinanceReport = require('../public/js/finance-report');
const FixedDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-10T12:00:00Z'])); }
};
const source = file => fs.readFileSync(require.resolve(file), 'utf8');
const record = (id, kind, amount, extra = {}, row = {}) => ({ id, ...row, data: { kind, title: id, date: '2026-11-01', amount, payments: [], ...extra } });
function moduleContext(file, records, enabled = true) {
  const finance = { records, baseline: { cutoff: '2026-10-05' }, summary: { cash: { bank: 80000, cash: 10000 }, pending_income: 999999, pending_expense: 888888 } };
  const ctx = {
    Date: FixedDate, Intl, FinanceReport, moneyEnabled: async () => enabled,
    moneyEuro: n => (n / 100).toFixed(2), formatMoney: n => n.toFixed(2), escHtml: String,
    requestAnimationFrame: () => {},
    API: { get: async path => {
      if (path === '/finance') return finance;
      if (path === '/dashboard') return { kpis: { pendingInvoices: 777, pendingAmount: 9999, monthlyRevenue: 100, activeClients: 2, activeProjects: 3 }, tasks: [], todayBookings: [] };
      if (path === '/invoices') return [];
      if (path.startsWith('/goals?')) return { goal: { objetivo: 1000 }, actual: 123 };
      if (path.startsWith('/marketing-planning?')) return { plan: null };
      throw new Error('Unexpected path: ' + path);
    } }
  };
  vm.createContext(ctx); vm.runInContext(source(file), ctx); return ctx;
}

test('live dashboard pending totals exclude assigned income, historical opening and forecasts', async () => {
  const records = [
    record('Assigned client', 'income', 20000, { history: { status: 'assigned' } }, { included_in_opening: true }),
    record('Historical receipt', 'income', 9000, { history: { status: 'paid', account: 'santi' } }, { included_in_opening: true }),
    record('Part-paid invoice', 'income', 10000, { payments: [{ date: '2026-11-02', amount: 4000, account: 'bank' }] }),
    record('Confirmed cost', 'expense', 4000, { payments: [{ date: '2026-11-03', amount: 1000, account: 'santi' }] }),
    record('Forecast cost', 'expense', 8000, { stage: 'forecast' }),
    record('Historical cost', 'expense', 25000, { history: { status: 'paid', account: 'santi' } }, { included_in_opening: true }),
    record('Draft invoice', 'income', 100000, { history: { status: 'draft' } })
  ];
  const ctx = moduleContext('../public/js/modules/dashboard.js', records), el = { innerHTML: '' };
  await ctx.renderDashboard(el);
  assert.match(el.innerHTML, /60\.00 por cobrar/);
  assert.match(el.innerHTML, /Facturas pendientes<\/div>\s*<div class="kpi-value">1<\/div>/);
  assert.match(el.innerHTML, /Gastos confirmados pendientes<\/h3><div class="money-big">30\.00/);
  assert.match(el.innerHTML, /Previsiones de este mes: 80\.00/);
  assert.doesNotMatch(el.innerHTML, /9999\.99|8888\.88/);
});

test('live revenue goals use service periods, including assignments without fabricating receipts', async () => {
  const records = [
    record('Service invoiced later', 'income', 15000, { date: '2026-12-01', period_start: '2026-11-01', period_end: '2026-11-30' }),
    record('Assigned service', 'income', 20000, { history: { status: 'assigned' } }, { included_in_opening: true }),
    record('Prior service paid now', 'income', 30000, { date: '2026-10-01', payments: [{ date: '2026-11-03', amount: 30000, account: 'bank' }] }),
    record('Capital', 'contribution', 60000),
    record('Forecast income', 'income', 50000, { stage: 'forecast' }),
    record('Duplicate', 'income', 70000, { history: { status: 'duplicate' } })
  ];
  const ctx = moduleContext('../public/js/modules/goals.js', records), el = { innerHTML: '' };
  await ctx.renderGoals(el);
  assert.match(el.innerHTML, /goal-current">350\.00/);
  assert.match(el.innerHTML, /Ingresos del mes/);
  assert.match(el.innerHTML, /35% conseguido/);
  assert.doesNotMatch(el.innerHTML, /Facturado y cobrado/);
});

test('legacy goals retain their original basis before V2 becomes live', async () => {
  const ctx = moduleContext('../public/js/modules/goals.js', [], false), el = { innerHTML: '' };
  await ctx.renderGoals(el);
  assert.match(el.innerHTML, /goal-current">123\.00/);
  assert.match(el.innerHTML, /Facturado y cobrado/);
});

function navigationContext(enabled = true) {
  const text = source('../public/js/app.js');
  const nodes = {}, calls = [];
  const node = id => nodes[id] ||= { innerHTML: '', dataset: {}, classList: { remove() {}, toggle() {} }, insertAdjacentHTML(position, html) { this.innerHTML = html + this.innerHTML; } };
  const ctx = {
    localStorage: { getItem: key => key === 'vocai_token' ? 'test' : null },
    window: { location: { hash: '' } }, document: { getElementById: node, addEventListener() {}, querySelectorAll: () => [] },
    setInterval() {}, moneyEnabled: async () => enabled,
    renderMoney: async (el, view) => { calls.push(view); el.innerHTML = 'V2 ' + view; }
  };
  for (const [, name] of text.matchAll(/render:\s*(render\w+)/g)) ctx[name] = async el => { calls.push(name); el.innerHTML = name; };
  ctx.unmountTito = () => {}; ctx.unmountChats = () => {};
  vm.createContext(ctx); vm.runInContext(text, ctx);
  return { ctx, nodes, calls };
}

test('legacy routes remain distinct and guide all authenticated sessions to live V2', async () => {
  const { ctx, nodes, calls } = navigationContext();
  for (const [route, renderer] of [['finanzas', 'renderFinanzas'], ['expenses', 'renderExpenses'], ['invoices', 'renderInvoices']]) {
    await ctx.navigate(route);
    assert.equal(calls.at(-1), renderer);
    assert.match(nodes.pageContent.innerHTML, /Versión anterior · consulta/);
    assert.match(nodes.pageContent.innerHTML, new RegExp(renderer));
  }
  await ctx.navigate('finanzasV2');
  assert.equal(calls.at(-1), 'summary');
  assert.equal(ctx.window.location.hash, 'finanzasV2');
  assert.doesNotMatch(nodes.pageContent.innerHTML, /Versión anterior/);
  await ctx.navigate('inversionV2');
  assert.equal(calls.at(-1), 'contributions');
  await ctx.navigate('facturasV2');
  assert.equal(calls.at(-1), 'renderPracticalInvoices');
  assert.equal(ctx.window.location.hash, 'facturasV2');
  assert.doesNotMatch(nodes.pageContent.innerHTML, /Versión anterior/);
});

test('original finance stays usable before activation without a misleading read-only notice', async () => {
  const { ctx, nodes } = navigationContext(false);
  await ctx.navigate('finanzas');
  assert.equal(nodes.pageContent.innerHTML, 'renderFinanzas');
});
