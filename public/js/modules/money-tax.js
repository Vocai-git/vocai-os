/* Explicit VAT inputs. Existing documents without a breakdown remain unchanged. */
function moneyTaxMode(d, existing) { return d.vat?.mode || (existing ? 'legacy' : 'none'); }
function moneyTaxInput(d) { return d.vat?.input ?? d.amount; }
function moneyTaxRate(value, label = 'IVA') {
  const v = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(v)) throw new Error('Indica un porcentaje de ' + label + ' entre 0 y 100, con hasta dos decimales.');
  const rate = Math.round(Number(v) * 100);
  if (!Number.isSafeInteger(rate) || rate > 10000) throw new Error('El porcentaje de ' + label + ' debe estar entre 0 y 100.');
  return rate;
}
function moneyTaxFields(d, existing) {
  const mode = moneyTaxMode(d, existing), rate = d.vat && d.vat.mode !== 'none' ? d.vat.rate : 2100;
  moneyState.form.taxMode = mode; moneyState.form.taxRate = rate;
  moneyState.form.irpfEnabled = !!d.irpf; moneyState.form.irpfRate = d.irpf?.rate;
  return `<section class="money-tax"><div class="money-tax-controls"><label>IVA<select id="mf_tax_mode" class="form-select" onchange="moneyTaxUpdate()">${mode === 'legacy' ? '<option value="legacy" selected>Total sin desglose · conservar</option>' : ''}<option value="none" ${mode === 'none' ? 'selected' : ''}>Sin IVA</option><option value="included" ${mode === 'included' ? 'selected' : ''}>IVA incluido</option><option value="added" ${mode === 'added' ? 'selected' : ''}>Sumar IVA</option></select></label><label id="mf_tax_rate_field" ${['legacy', 'none'].includes(mode) ? 'hidden' : ''}>IVA (%)<input id="mf_tax_rate" class="form-input" inputmode="decimal" value="${(rate / 100).toFixed(2).replace(/\.00$/, '')}" oninput="moneyTaxUpdate()"></label></div><div class="money-irpf-controls"><label class="money-irpf-toggle"><input id="mf_irpf_enabled" type="checkbox" ${d.irpf ? 'checked' : ''} onchange="moneyTaxUpdate()"><span>Aplicar retención IRPF</span></label><label id="mf_irpf_rate_field" ${d.irpf ? '' : 'hidden'}>IRPF (%)<input id="mf_irpf_rate" class="form-input" inputmode="decimal" value="${d.irpf ? d.irpf.rate / 100 : ''}" placeholder="Según la factura" oninput="moneyTaxUpdate()"></label></div><div id="mf_tax_summary" class="money-tax-summary" aria-live="polite"></div></section>`;
}
function moneyTaxHasIRPF() { return document.getElementById('mf_irpf_enabled')?.checked ?? moneyState.form.irpfEnabled ?? false; }
function moneyTaxRead() {
  const amount = moneyCents(document.getElementById('mf_amount')?.value || '');
  const mode = document.getElementById('mf_tax_mode')?.value || moneyState.form.taxMode || 'legacy';
  const hasIRPF = moneyTaxHasIRPF();
  if (mode === 'legacy') {
    if (hasIRPF) throw new Error('Para aplicar IRPF, indica el desglose de IVA de la factura: Sin IVA, IVA incluido o Sumar IVA.');
    return { amount, payable: amount };
  }
  const rate = mode === 'none' ? 0 : moneyTaxRate(document.getElementById('mf_tax_rate')?.value ?? moneyState.form.taxRate / 100);
  const vat = FinanceTax.calculate(amount, mode, rate);
  const irpf = hasIRPF ? FinanceTax.withholding(vat, moneyTaxRate(document.getElementById('mf_irpf_rate')?.value ?? (moneyState.form.irpfRate == null ? '' : moneyState.form.irpfRate / 100), 'IRPF')) : null;
  return { amount: vat.total, vat, ...(irpf ? { irpf } : {}), payable: vat.total - (irpf?.tax || 0) };
}
function moneyTaxSummaryHTML(vat, irpf = null, kind = 'expense') {
  const percent = rate => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(rate / 100);
  return `<div class="money-tax-totals${irpf ? ' money-tax-withholding' : ''}"><span>Base <b>${moneyEuro(vat.base)}</b></span><span>IVA (${percent(vat.rate)} %) <b>${moneyEuro(vat.tax)}</b></span>${irpf ? `<span>Base + IVA <b>${moneyEuro(vat.total)}</b></span><span class="money-tax-retention">Retención IRPF (${percent(irpf.rate)} %) <b>−${moneyEuro(irpf.tax)}</b></span><strong>Total a ${kind === 'income' ? 'cobrar' : 'pagar'} <b>${moneyEuro(vat.total - irpf.tax)}</b></strong>` : `<strong>Total <b>${moneyEuro(vat.total)}</b></strong>`}</div>`;
}
function moneyTaxUpdate() {
  const target = document.getElementById('mf_tax_summary'); if (!target) return;
  const mode = document.getElementById('mf_tax_mode')?.value || moneyState.form.taxMode || 'legacy';
  const hasIRPF = moneyTaxHasIRPF(), label = document.getElementById('mf_amount_label'), rateField = document.getElementById('mf_tax_rate_field'), irpfField = document.getElementById('mf_irpf_rate_field');
  if (label) label.textContent = mode === 'added' ? 'Base (€)' : hasIRPF ? 'Total antes de retención (€)' : 'Total (€)';
  if (rateField) rateField.hidden = ['legacy', 'none'].includes(mode);
  if (irpfField) irpfField.hidden = !hasIRPF;
  const hint = (mode === 'legacy' ? 'Se conserva el total registrado. No se deduce ni se añade IVA al histórico.' : mode === 'added' ? 'Se suma el IVA a la base que escribes.' + (hasIRPF ? '' : ' Se registra y se cobra o paga el total.') : mode === 'included' ? 'El importe que escribes ya incluye IVA. Se muestra el desglose sin sumar nada.' : 'El importe se registra sin añadir IVA.') + (hasIRPF ? ' La retención se calcula sobre la base y se resta del total. Escribe el importe antes de retención; el cobro o pago será por el neto.' : '');
  if (!document.getElementById('mf_amount')?.value.trim()) { target.innerHTML = `<p>${hint}</p>`; return; }
  try {
    const result = moneyTaxRead();
    target.innerHTML = (result.vat ? moneyTaxSummaryHTML(result.vat, result.irpf, moneyState.form.kind) : `<div class="money-tax-totals"><strong>Total registrado <b>${moneyEuro(result.amount)}</b></strong></div>`) + `<p>${hint}</p>`;
  } catch (e) { target.innerHTML = `<p class="money-error" role="alert">${moneyEsc(e.message)}</p>`; }
}
