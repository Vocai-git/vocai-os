/* Invoice drafts do not affect the ledger. Issuance and linking are server actions. */
window.moneyInvoicesState = { invoices: [], settings: null, clients: [], loaded: false, busy: false, error: '', clientError: '', filter: 'all', query: '', editor: null, pdfURL: null };
const mi = () => window.moneyInvoicesState;
const MI_CUSTOMER_FIELDS = [['name', 'Nombre o razón social'], ['tax_id', 'NIF / CIF'], ['address', 'Dirección'], ['postal_code', 'Código postal'], ['city', 'Ciudad'], ['country', 'País'], ['email', 'Email']];
const MI_FIELD_LIMITS = { name: 180, tax_id: 80, address: 500, postal_code: 30, city: 100, country: 80, email: 254, website: 250, iban: 40, payment_method: 180 };
function moneyInvoiceError(error) { return (error?.message || 'No se pudo completar la operación.') + (error?.status === 409 ? ' Recarga la factura para revisar los cambios antes de continuar.' : ''); }
function moneyInvoiceWritable() { return !moneyState.data?.review && !window.moneyInvoicesPreview; }
function moneyInvoiceClone(value) { return JSON.parse(JSON.stringify(value)); }
function moneyInvoiceDecimal(value, places, label, empty = null) {
  const v = String(value ?? '').trim().replace(',', '.');
  if (!v && empty != null) return empty;
  if (!new RegExp('^\\d+(?:\\.\\d{1,' + places + '})?$').test(v)) throw new Error(label + ': usa un número positivo con hasta ' + places + ' decimales, sin separador de miles.');
  const [whole, fraction = ''] = v.split('.'), result = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(label + ': el importe es demasiado grande.');
  return Number(result);
}
function moneyInvoiceCalculate(lines, vatRate, irpfRate) {
  const valid = n => Number.isSafeInteger(n) && n >= 0;
  if (!valid(vatRate) || vatRate > 10000 || !valid(irpfRate) || irpfRate > 10000) throw new Error('Los porcentajes deben estar entre 0 y 100, con hasta dos decimales.');
  if (!Array.isArray(lines) || lines.length > 50) throw new Error('La factura admite hasta 50 conceptos.');
  const round = (n, d) => (n + d / 2n) / d;
  let base = 0n;
  for (const line of lines) {
    if (!valid(line.quantity) || !line.quantity || line.quantity > 100000000 || !valid(line.unit_price)) throw new Error('Revisa las cantidades y los precios de los conceptos.');
    base += round(BigInt(line.quantity) * BigInt(line.unit_price), 1000n);
  }
  const vat = round(base * BigInt(vatRate), 10000n), irpf = round(base * BigInt(irpfRate), 10000n), gross = base + vat, net = gross - irpf;
  if (base > 1000000000n || gross > 1000000000n || net < 0n) throw new Error('Revisa el total de la factura: supera el límite permitido.');
  return { base: Number(base), vat: Number(vat), irpf: Number(irpf), gross: Number(gross), net: Number(net) };
}
function moneyInvoiceDate(value, label, optional = false) {
  if (!value && optional) return null;
  const date = new Date(value + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Revisa ' + label + '.');
  return value;
}
function moneyInvoiceModel(invoice) {
  const d = invoice.document || {}, customer = {};
  for (const [field] of MI_CUSTOMER_FIELDS) customer[field] = d.customer?.[field] || '';
  return { date: d.date || moneyToday(), due: d.due || '', period_start: d.period_start || '', period_end: d.period_end || '', customer,
    lines: (d.lines?.length ? d.lines : [{ description: '', detail: '', quantity: 1000, unit_price: 0 }]).map(line => ({ description: line.description || '', detail: line.detail || '', quantity: String(line.quantity / 1000), unit_price: line.unit_price ? (line.unit_price / 100).toFixed(2) : '' })),
    vatEnabled: d.vat_rate !== 0, vatRate: String((d.vat_rate ?? 2100) / 100), irpfEnabled: !!d.irpf_rate, irpfRate: d.irpf_rate ? String(d.irpf_rate / 100) : '', tax_note: d.tax_note || '', notes: d.notes || '', theme: d.theme === 'light' ? 'light' : 'dark' };
}
function moneyInvoiceRead() {
  const f = mi().editor.fields;
  const lines = f.lines.map(line => ({ description: line.description.trim(), detail: line.detail.trim(), quantity: moneyInvoiceDecimal(line.quantity, 3, 'Cantidad', 1000), unit_price: moneyInvoiceDecimal(line.unit_price, 2, 'Precio', 0) }));
  const vat_rate = f.vatEnabled ? moneyInvoiceDecimal(f.vatRate, 2, 'IVA') : 0, irpf_rate = f.irpfEnabled ? moneyInvoiceDecimal(f.irpfRate, 2, 'IRPF') : 0;
  if (f.irpfEnabled && !irpf_rate) throw new Error('Indica el porcentaje de IRPF de esta factura o desactiva la retención.');
  const result = { date: moneyInvoiceDate(f.date, 'la fecha de emisión'), due: moneyInvoiceDate(f.due, 'el vencimiento', true), period_start: moneyInvoiceDate(f.period_start, 'el inicio del servicio', true), period_end: moneyInvoiceDate(f.period_end, 'el final del servicio', true), customer: Object.fromEntries(MI_CUSTOMER_FIELDS.map(([key]) => [key, f.customer[key].trim()])), lines, vat_rate, irpf_rate, tax_note: f.tax_note.trim(), notes: f.notes.trim(), theme: f.theme, totals: moneyInvoiceCalculate(lines, vat_rate, irpf_rate) };
  if (result.due && result.due < result.date) throw new Error('El vencimiento no puede ser anterior a la fecha de emisión.');
  if (!!result.period_start !== !!result.period_end) throw new Error('Completa el inicio y el final del período del servicio, o deja ambos vacíos.');
  if (result.period_start && result.period_end && result.period_end < result.period_start) throw new Error('El período del servicio termina antes de empezar.');
  return result;
}
function moneyInvoiceRecordEligible(record) {
  const d = record?.data, h = d?.history || {};
  if (!d || d.kind !== 'income' || record.voided || d.stage === 'forecast' || ['assigned', 'draft', 'duplicate', 'review'].includes(h.status) || h.classification === 'startup') return false;
  return !d.number || (/^VOCAI-\d{4}-\d{3,}$/.test(d.number) && (h.sources || []).some(source => source.table === 'invoices' && source.original?.numero === d.number));
}
function moneyInvoiceCandidates() {
  const current = mi().editor?.invoice.id, used = new Set(mi().invoices.filter(invoice => invoice.id !== current && invoice.record_id).map(invoice => invoice.record_id));
  return (moneyState.data.records || []).filter(r => moneyInvoiceRecordEligible(r) && (!used.has(r.id) || r.id === mi().editor?.record_id));
}
function moneyInvoiceRecordMismatch(document) {
  const e = mi().editor, record = e?.record_id && moneyState.data.records.find(r => r.id === e.record_id);
  if (!record) return e?.record_id ? 'El ingreso vinculado no está disponible. Recarga antes de emitir.' : '';
  if (record.data.amount !== document.totals.gross || FinanceTax.payable(record.data) !== document.totals.net) return 'Los totales no coinciden con el ingreso elegido. Revisa base, IVA e IRPF; no se creará un segundo ingreso.';
  if (['date', 'due', 'period_start', 'period_end'].some(key => (record.data[key] || null) !== (document[key] || null))) return 'La fecha, el vencimiento y el período deben coincidir con el ingreso elegido. Si necesitas cambiarlos, edita primero ese ingreso y vuelve a seleccionarlo aquí.';
  return '';
}
async function moneyInvoicesRender(el) { moneyInvoicesPaint(el); if (!mi().editor) await moneyInvoicesLoad(); }
async function moneyInvoicesLoad() {
  const s = mi(); if (s.busy) return false;
  s.busy = true; s.error = ''; moneyInvoicesPaint();
  try {
    const [invoices, clients, finance] = await Promise.allSettled([API.get('/finance/invoices'), API.get('/clients'), API.get('/finance')]);
    if (invoices.status === 'rejected') throw invoices.reason;
    s.invoices = invoices.value.invoices; s.settings = invoices.value.settings; s.loaded = true;
    if (clients.status === 'fulfilled') { s.clients = clients.value; s.clientError = ''; } else s.clientError = 'No se pudieron cargar los clientes. Puedes escribir los datos de la factura.';
    if (finance.status === 'fulfilled') moneyState.data = finance.value; else throw new Error('No se pudieron actualizar los ingresos. Reintenta antes de vincular una factura.');
    return true;
  } catch (e) { s.error = moneyInvoiceError(e); return false; }
  finally { s.busy = false; moneyInvoicesPaint(); }
}
function moneyInvoicesPaint(el = document.getElementById('moneyBody')) {
  if (!el || moneyState.view !== 'invoices') return;
  const s = mi();
  el.innerHTML = `<section class="money-invoices" aria-label="Facturas emitidas" aria-busy="${s.busy}">${s.error ? `<div class="money-invoice-error" role="alert">${moneyEsc(s.error)}</div>` : ''}${s.editor ? moneyInvoiceEditorHTML() : moneyInvoicesListHTML()}</section>`;
}
function moneyInvoicesListHTML() {
  const s = mi();
  return `<header class="money-invoice-heading"><div><h3>Facturas emitidas</h3><p>Prepara la factura, revisa el PDF y registra el cobro cuando llegue.</p></div><div class="money-invoice-actions"><button class="btn btn-secondary" onclick="moneyInvoiceSettings()" ${s.busy || !s.settings ? 'disabled' : ''}>Datos de VOCAI</button><button class="btn btn-primary" onclick="moneyInvoiceNew()" ${s.busy || !s.loaded || !moneyInvoiceWritable() ? 'disabled' : ''}>+ Nueva factura</button></div></header>
    <div class="money-invoice-note">Un borrador no suma ingresos. Emitir una factura crea o vincula un único ingreso; <strong>el cobro se registra por separado.</strong></div>
    ${s.settings && !s.settings.configured ? '<div class="money-invoice-note">Antes de emitir hay que completar los datos de VOCAI y configurar la numeración del año. Puedes preparar y guardar borradores.</div>' : ''}
    <div class="money-invoice-toolbar"><div class="money-invoice-filters">${[['all', 'Todas'], ['draft', 'Borradores'], ['issued', 'Emitidas'], ['imported', 'Históricas']].map(([key, label]) => `<button class="${s.filter === key ? 'active' : ''}" onclick="mi().filter='${key}';moneyInvoicesRows()">${label}</button>`).join('')}</div><input class="form-input money-invoice-search" type="search" placeholder="Buscar cliente o número…" aria-label="Buscar facturas" value="${moneyEsc(s.query)}" oninput="mi().query=this.value;moneyInvoicesRows()"><button class="money-invoice-link" onclick="moneyInvoicesLoad()" ${s.busy ? 'disabled' : ''}>Actualizar</button></div><div id="moneyInvoiceRows" class="money-invoice-list">${moneyInvoicesRowsHTML()}</div>`;
}
function moneyInvoicesRows() { const el = document.getElementById('moneyInvoiceRows'); if (el) el.innerHTML = moneyInvoicesRowsHTML(); document.querySelectorAll?.('.money-invoice-filters button').forEach((button, index) => button.classList.toggle('active', ['all', 'draft', 'issued', 'imported'][index] === mi().filter)); }
function moneyInvoicesRowsHTML() {
  const s = mi(), query = s.query.toLocaleLowerCase('es');
  const rows = s.invoices.map((invoice, index) => ({ invoice, index })).filter(({ invoice: i }) => (s.filter === 'all' || i.status === s.filter) && [i.number, i.document?.customer?.name].join(' ').toLocaleLowerCase('es').includes(query));
  return rows.map(({ invoice: i, index }) => `<article class="money-invoice-card"><div><span class="money-invoice-status ${i.status === 'issued' ? 'issued' : i.status === 'draft' ? 'draft' : ''}">${i.status === 'draft' ? 'Borrador · sin emitir' : i.status === 'issued' ? 'Emitida' : 'Histórica'}</span><h4>${moneyEsc(i.number || 'Sin número · borrador')}</h4><div class="money-invoice-meta"><span>${moneyEsc(i.document?.customer?.name || 'Cliente por completar')}</span><span>${moneyEsc(i.document?.date || '')}</span>${i.record_id ? '<span>Ingreso vinculado</span>' : ''}</div></div><div class="money-invoice-actions"><strong class="money-invoice-card-amount">${moneyEuro(i.document?.totals?.net || 0)}</strong><button class="btn btn-secondary btn-sm" onclick="moneyInvoiceOpen(${index})" ${s.busy ? 'disabled' : ''}>${i.status === 'draft' ? 'Continuar borrador' : 'Ver factura'}</button><button class="btn btn-secondary btn-sm" onclick="moneyInvoicePDFAt(${index})" ${s.busy ? 'disabled' : ''}>${i.status === 'draft' ? 'Vista previa' : 'PDF'}</button></div></article>`).join('') || `<div class="money-invoice-empty"><strong>${s.busy ? 'Cargando facturas…' : 'No hay facturas en este filtro'}</strong><span>Los borradores guardados y las facturas emitidas aparecen aquí.</span></div>`;
}
function moneyInvoiceCanReplace() { return !mi().editor?.dirty || confirm('Tienes cambios sin guardar. ¿Descartarlos y continuar?'); }
function moneyInvoiceSetEditor(invoice) {
  mi().editor = { invoice: moneyInvoiceClone(invoice), fields: moneyInvoiceModel(invoice), record_id: invoice.record_id || null, record_version: invoice.record_version ?? null, dirty: false, retry: null, error: '', saved: !!invoice.version };
  mi().error = ''; moneyInvoicesPaint();
}
function moneyInvoiceNew() {
  if (mi().busy || !moneyInvoiceWritable() || !moneyInvoiceCanReplace()) return;
  moneyInvoiceSetEditor({ id: crypto.randomUUID(), status: 'draft', version: null, number: null, record_id: null, record_version: null, document: { date: moneyToday(), vat_rate: 2100, irpf_rate: 0, theme: 'dark' } });
}
async function moneyInvoiceOpen(index) {
  const invoice = mi().invoices[index]; if (!invoice || mi().busy || !moneyInvoiceCanReplace()) return;
  mi().busy = true; mi().error = ''; moneyInvoicesPaint();
  try { moneyInvoiceSetEditor(await API.get('/finance/invoices/' + encodeURIComponent(invoice.id))); }
  catch (e) { mi().error = moneyInvoiceError(e); }
  finally { mi().busy = false; moneyInvoicesPaint(); }
}
async function moneyInvoiceBack() { if (mi().busy || !moneyInvoiceCanReplace()) return; mi().editor = null; await moneyInvoicesLoad(); }
async function moneyInvoiceReload() {
  const e = mi().editor; if (!e || mi().busy || !e.saved || !moneyInvoiceCanReplace()) return;
  mi().busy = true; moneyInvoicesPaint();
  try { const [invoice, finance] = await Promise.all([API.get('/finance/invoices/' + encodeURIComponent(e.invoice.id)), API.get('/finance')]); moneyState.data = finance; moneyInvoiceSetEditor(invoice); }
  catch (error) { e.error = moneyInvoiceError(error); }
  finally { mi().busy = false; moneyInvoicesPaint(); }
}
async function moneyInvoiceFromRecord(recordId) {
  if (mi().busy || !moneyInvoiceWritable() || !moneyInvoiceCanReplace()) return;
  if (!await moneyInvoicesLoad()) return toast(mi().error, 'error');
  mi().busy = true;
  try {
  const existing = mi().invoices.find(i => i.record_id === recordId);
  if (existing) { moneyInvoiceSetEditor(await API.get('/finance/invoices/' + encodeURIComponent(existing.id))); moneyView('invoices'); return; }
  const record = moneyState.data.records.find(r => r.id === recordId);
  if (!moneyInvoiceRecordEligible(record)) return toast('Este ingreso ya tiene una factura numerada o pertenece a un movimiento que no admite emisión. Conserva su documento original.', 'info');
  const d = record.data;
  moneyInvoiceSetEditor({ id: crypto.randomUUID(), status: 'draft', version: null, number: null, record_id: record.id, record_version: record.version, document: { date: d.date, due: d.due, period_start: d.period_start, period_end: d.period_end, customer: { name: d.party || '' }, lines: [{ description: d.title, detail: '', quantity: 1000, unit_price: d.vat?.base ?? d.amount }], vat_rate: d.vat?.rate || 0, irpf_rate: d.irpf?.rate || 0, notes: d.notes || '', theme: 'dark' } });
  mi().editor.prefillNote = d.vat ? 'Se usan los importes del ingreso. Los pagos ya registrados se conservan.' : 'Este ingreso no tenía desglose de IVA. Revisa la base y los impuestos antes de emitir; no se han deducido automáticamente.';
  moneyView('invoices');
  } catch (error) { mi().error = moneyInvoiceError(error); toast(mi().error, 'error'); }
  finally { mi().busy = false; moneyInvoicesPaint(); }
}
function moneyInvoiceEdit(field, value) {
  const e = mi().editor; if (!e || e.invoice.status !== 'draft' || mi().busy || !moneyInvoiceWritable()) return;
  if (field.startsWith('customer.')) e.fields.customer[field.slice(9)] = value;
  else e.fields[field] = value;
  e.dirty = true; e.error = ''; moneyInvoiceUpdateSummary();
}
function moneyInvoiceLineEdit(index, field, value) { const e = mi().editor; if (!e || mi().busy || e.invoice.status !== 'draft' || !moneyInvoiceWritable()) return; e.fields.lines[index][field] = value; e.dirty = true; e.error = ''; moneyInvoiceUpdateSummary(); }
function moneyInvoiceAddLine() { const e = mi().editor; if (!e || mi().busy || e.fields.lines.length >= 50 || e.invoice.status !== 'draft' || !moneyInvoiceWritable()) return; e.fields.lines.push({ description: '', detail: '', quantity: '1', unit_price: '' }); e.dirty = true; moneyInvoicesPaint(); }
function moneyInvoiceRemoveLine(index) { const e = mi().editor; if (!e || mi().busy || e.invoice.status !== 'draft' || !moneyInvoiceWritable()) return; e.fields.lines.splice(index, 1); e.dirty = true; moneyInvoicesPaint(); }
function moneyInvoicePickClient(index) {
  const client = mi().clients[Number(index)], e = mi().editor; if (!client || index === '' || !e || mi().busy || e.invoice.status !== 'draft') return;
  if (Object.values(e.fields.customer).some(Boolean) && !confirm('¿Sustituir los datos de cliente de este borrador?')) return;
  e.fields.customer = Object.fromEntries(MI_CUSTOMER_FIELDS.map(([key]) => [key, ''])); e.fields.customer.name = client.empresa || client.nombre || ''; e.fields.customer.email = client.email || '';
  e.dirty = true; moneyInvoicesPaint();
}
function moneyInvoiceSelectRecord(id) { const e = mi().editor; if (!e || mi().busy || e.invoice.status !== 'draft' || !moneyInvoiceWritable()) return; const record = moneyInvoiceCandidates().find(r => r.id === id); e.record_id = record?.id || null; e.record_version = record?.version ?? null; if (record) for (const key of ['date', 'due', 'period_start', 'period_end']) e.fields[key] = record.data[key] || ''; e.dirty = true; moneyInvoicesPaint(); }
function moneyInvoiceInput(field, label, options = {}) {
  const f = mi().editor.fields, value = field.startsWith('customer.') ? f.customer[field.slice(9)] : f[field];
  return `<label class="${options.wide ? 'wide' : ''}">${label}<input class="form-input" type="${options.type || 'text'}" value="${moneyEsc(value)}" maxlength="${options.max || 180}" oninput="moneyInvoiceEdit('${field}',this.value)"></label>`;
}
function moneyInvoiceEditorHTML() {
  const s = mi(), e = s.editor, i = e.invoice, f = e.fields, readonly = i.status !== 'draft' || !moneyInvoiceWritable(), disabled = readonly || s.busy ? 'disabled' : '';
  const record = e.record_id && moneyState.data.records.find(r => r.id === e.record_id), candidates = moneyInvoiceCandidates();
  return `<header class="money-invoice-heading"><div><h3>${moneyEsc(i.number || 'Nueva factura · borrador')}</h3><p>${readonly ? 'La factura se conserva tal como se emitió.' : e.saved ? 'Borrador guardado' + (e.dirty ? ' · tienes cambios sin guardar' : '') : 'Completa los datos y guarda cuando quieras.'}</p></div><div class="money-invoice-actions"><button class="btn btn-secondary" onclick="moneyInvoiceBack()" ${s.busy ? 'disabled' : ''}>Volver a facturas</button><button class="btn btn-secondary" onclick="moneyInvoiceSettings()" ${s.busy ? 'disabled' : ''}>Datos de VOCAI</button></div></header>
    ${e.error ? `<div class="money-invoice-error" role="alert">${moneyEsc(e.error)}${e.saved ? ' <button class="money-invoice-link" onclick="moneyInvoiceReload()">Recargar factura</button>' : ''}</div>` : ''}
    ${e.prefillNote ? `<p class="money-invoice-note">${moneyEsc(e.prefillNote)}</p>` : ''}
    <div class="money-invoice-editor"><div class="money-invoice-main">
      <section class="money-invoice-section"><h4>Cliente</h4><fieldset ${disabled}>${!readonly ? `<label class="money-invoice-client-select">Usar un cliente de VOCAI<select class="form-select" onchange="moneyInvoicePickClient(this.value)"><option value="">Escribir los datos / elegir cliente</option>${s.clients.map((client, index) => `<option value="${index}">${moneyEsc(client.nombre)}${client.empresa ? ' · ' + moneyEsc(client.empresa) : ''}</option>`).join('')}</select></label><p class="money-invoice-muted" style="margin-bottom:15px">${moneyEsc(s.clientError || 'Comprueba los datos fiscales. El nombre y el email pueden venir de la ficha del cliente.')}</p>` : ''}<div class="money-invoice-fields">${MI_CUSTOMER_FIELDS.map(([key, label]) => moneyInvoiceInput('customer.' + key, label, { wide: key === 'address', type: key === 'email' ? 'email' : 'text', max: MI_FIELD_LIMITS[key] })).join('')}</div></fieldset></section>
      <section class="money-invoice-section"><h4>Fechas y referencia</h4><fieldset ${disabled}><div class="money-invoice-fields"><label>Número<input class="form-input" readonly value="${moneyEsc(i.number || 'Se asignará al emitir')}"></label>${moneyInvoiceInput('date', 'Fecha de emisión', { type: 'date' })}${moneyInvoiceInput('due', 'Vencimiento · opcional', { type: 'date' })}${moneyInvoiceInput('period_start', 'Servicio desde · opcional', { type: 'date' })}${moneyInvoiceInput('period_end', 'Servicio hasta · opcional', { type: 'date' })}</div></fieldset></section>
      <section class="money-invoice-section"><h4>Conceptos</h4><fieldset ${disabled}><div>${f.lines.map((line, index) => `<div class="money-invoice-line"><div class="money-invoice-line-head"><span>Concepto ${index + 1}</span>${!readonly ? `<button onclick="moneyInvoiceRemoveLine(${index})" ${s.busy ? 'disabled' : ''}>Quitar</button>` : ''}</div><div class="money-invoice-fields"><label class="wide">Descripción<input class="form-input" maxlength="180" value="${moneyEsc(line.description)}" placeholder="Ej. Servicio mensual" oninput="moneyInvoiceLineEdit(${index},'description',this.value)"></label><label class="wide">Detalle · opcional<textarea class="form-textarea" maxlength="500" oninput="moneyInvoiceLineEdit(${index},'detail',this.value)">${moneyEsc(line.detail)}</textarea></label><label>Cantidad<input class="form-input" inputmode="decimal" value="${moneyEsc(line.quantity)}" oninput="moneyInvoiceLineEdit(${index},'quantity',this.value)"></label><label>Precio unitario sin IVA (€)<input class="form-input" inputmode="decimal" placeholder="0,00" value="${moneyEsc(line.unit_price)}" oninput="moneyInvoiceLineEdit(${index},'unit_price',this.value)"></label></div><div class="money-invoice-line-amount" id="mi_line_total_${index}">${moneyInvoiceLineAmount(line)}</div></div>`).join('')}</div>${!readonly ? `<button class="btn btn-secondary btn-sm" onclick="moneyInvoiceAddLine()" ${f.lines.length >= 50 || s.busy ? 'disabled' : ''}>+ Añadir concepto</button>` : ''}</fieldset></section>
      <section class="money-invoice-section"><h4>Impuestos y notas</h4><fieldset ${disabled}><div class="money-invoice-tax"><div><label class="money-invoice-check"><input type="checkbox" ${f.vatEnabled ? 'checked' : ''} onchange="moneyInvoiceEdit('vatEnabled',this.checked)">Aplicar IVA</label><label id="mi_vat_rate_field" ${f.vatEnabled ? '' : 'hidden'}>IVA (%)<input class="form-input" inputmode="decimal" value="${moneyEsc(f.vatRate)}" oninput="moneyInvoiceEdit('vatRate',this.value)"></label></div><div><label class="money-invoice-check"><input type="checkbox" ${f.irpfEnabled ? 'checked' : ''} onchange="moneyInvoiceEdit('irpfEnabled',this.checked)">Retención IRPF</label><label id="mi_irpf_rate_field" ${f.irpfEnabled ? '' : 'hidden'}>IRPF (%)<input class="form-input" inputmode="decimal" placeholder="Según la factura" value="${moneyEsc(f.irpfRate)}" oninput="moneyInvoiceEdit('irpfRate',this.value)"></label></div></div><div class="money-invoice-fields"><label class="wide">Nota fiscal · si corresponde<textarea class="form-textarea" maxlength="500" placeholder="Texto que deba aparecer en la factura" oninput="moneyInvoiceEdit('tax_note',this.value)">${moneyEsc(f.tax_note)}</textarea></label><label class="wide">Notas de la factura<textarea class="form-textarea" maxlength="2000" oninput="moneyInvoiceEdit('notes',this.value)">${moneyEsc(f.notes)}</textarea></label></div></fieldset></section>
      <section class="money-invoice-section"><h4>Ingreso en Finanzas</h4><fieldset ${disabled}><label>¿Ya registraste este ingreso?<select class="form-select" onchange="moneyInvoiceSelectRecord(this.value)"><option value="">No · crear un único ingreso al emitir</option>${candidates.map(r => `<option value="${moneyEsc(r.id)}" ${e.record_id === r.id ? 'selected' : ''}>${moneyEsc(r.data.title)} · ${moneyEsc(r.data.party || '')} · ${moneyEuro(r.data.amount)}</option>`).join('')}${e.record_id && !candidates.some(r => r.id === e.record_id) ? `<option selected value="${moneyEsc(e.record_id)}">${moneyEsc(record?.data.title || 'Ingreso vinculado')}</option>` : ''}</select></label></fieldset><p class="money-invoice-muted" style="margin-top:12px">${e.record_id ? 'Se conservará el ingreso elegido y sus pagos. No se sumará otro ingreso. La fecha y el período deben coincidir; para cambiarlos, edita primero el ingreso.' : 'Guardar el borrador no cambia las cuentas. Al emitir quedará pendiente de cobro.'}</p>${record?.data.number && record.data.number !== i.number ? `<p class="money-invoice-muted" style="margin-top:8px">Referencia anterior: ${moneyEsc(record.data.number)}. La referencia original quedará en el historial.</p>` : ''}</section>
    </div><aside class="money-invoice-section money-invoice-summary"><h4>Importes</h4><div id="mi_summary">${moneyInvoiceSummaryHTML()}</div><fieldset ${disabled}><label class="money-invoice-muted" style="display:block;margin-top:21px">Diseño del PDF<select class="form-select" onchange="moneyInvoiceEdit('theme',this.value)"><option value="dark" ${f.theme === 'dark' ? 'selected' : ''}>Oscuro · VOCAI</option><option value="light" ${f.theme === 'light' ? 'selected' : ''}>Claro · para imprimir</option></select></label></fieldset><p>${readonly ? 'Descarga la factura o registra su cobro desde el ingreso vinculado.' : 'El PDF de vista previa lleva la indicación de borrador. La numeración se asigna al emitir.'}</p></aside></div>
    <footer class="money-invoice-footer"><span class="money-invoice-muted">${e.dirty ? 'Cambios sin guardar' : e.saved ? 'Guardado en VOCAI' : 'Borrador nuevo'}</span><div class="money-invoice-actions">${!readonly ? `<button class="btn btn-secondary" onclick="moneyInvoiceSave()" ${s.busy ? 'disabled' : ''}>Guardar borrador</button><button class="btn btn-secondary" onclick="moneyInvoicePreview()" ${s.busy ? 'disabled' : ''}>Vista previa PDF</button><button class="btn btn-primary" onclick="moneyInvoiceIssueDialog()" ${s.busy ? 'disabled' : ''}>Revisar y emitir</button>` : `<button class="btn btn-primary" onclick="moneyInvoicePreview()" ${s.busy ? 'disabled' : ''}>Descargar PDF</button>${i.record_id ? `<button class="btn btn-secondary" onclick="moneyInvoiceOpenIncome(false)" ${s.busy ? 'disabled' : ''}>Ver ingreso</button>${moneyInvoiceCanCollect(i) ? `<button class="btn btn-secondary" onclick="moneyInvoiceOpenIncome(true)" ${s.busy || !moneyInvoiceWritable() ? 'disabled' : ''}>Registrar cobro</button>` : ''}` : ''}`}</div></footer>`;
}
function moneyInvoiceLineAmount(line) {
  try { return moneyEuro(moneyInvoiceCalculate([{ quantity: moneyInvoiceDecimal(line.quantity, 3, 'Cantidad', 1000), unit_price: moneyInvoiceDecimal(line.unit_price, 2, 'Precio', 0) }], 0, 0).base); }
  catch { return 'Revisa cantidad / precio'; }
}
function moneyInvoiceSummaryHTML() {
  try {
    const d = moneyInvoiceRead(), t = d.totals, mismatch = moneyInvoiceRecordMismatch(d);
    return `<dl><div><dt>Base</dt><dd>${moneyEuro(t.base)}</dd></div><div><dt>IVA (${d.vat_rate / 100} %)</dt><dd>${moneyEuro(t.vat)}</dd></div>${d.irpf_rate ? `<div><dt>Retención IRPF (${d.irpf_rate / 100} %)</dt><dd>−${moneyEuro(t.irpf)}</dd></div>` : ''}<div class="total"><dt>Total a cobrar</dt><dd>${moneyEuro(t.net)}</dd></div></dl>${mismatch ? `<p class="money-invoice-warning">${moneyEsc(mismatch)}</p>` : ''}`;
  } catch (e) { return `<p class="money-invoice-error" role="alert">${moneyEsc(e.message)}</p>`; }
}
function moneyInvoiceUpdateSummary() {
  const e = mi().editor; if (!e) return;
  const el = document.getElementById('mi_summary'); if (el) el.innerHTML = moneyInvoiceSummaryHTML();
  const vat = document.getElementById('mi_vat_rate_field'), irpf = document.getElementById('mi_irpf_rate_field'); if (vat) vat.hidden = !e.fields.vatEnabled; if (irpf) irpf.hidden = !e.fields.irpfEnabled;
  e.fields.lines.forEach((line, index) => { const cell = document.getElementById('mi_line_total_' + index); if (cell) cell.textContent = moneyInvoiceLineAmount(line); });
}
function moneyInvoiceRemember(invoice) { const index = mi().invoices.findIndex(i => i.id === invoice.id); if (index < 0) mi().invoices.unshift(invoice); else mi().invoices[index] = invoice; }
async function moneyInvoiceSave(announce = true) {
  const s = mi(), e = s.editor; if (!e || s.busy || e.invoice.status !== 'draft' || !moneyInvoiceWritable()) return false;
  try {
    const payload = { document: moneyInvoiceRead(), record_id: e.record_id, record_version: e.record_version };
    if (e.retry && JSON.stringify(payload) !== e.retry) throw new Error('Hay un guardado sin confirmar. Reintenta sin cambiar los datos o recarga la factura antes de continuar.');
    if (e.saved && !e.dirty && !e.retry) return true;
    s.busy = true; e.error = ''; e.retry = JSON.stringify(payload); moneyInvoicesPaint();
    const invoice = e.saved ? await API.put('/finance/invoices/' + encodeURIComponent(e.invoice.id), { version: e.invoice.version, ...payload }) : await API.post('/finance/invoices', { id: e.invoice.id, ...payload });
    moneyInvoiceRemember(invoice); moneyInvoiceSetEditor(invoice); if (announce) toast('Borrador guardado. Las cuentas no cambian.', 'success'); return true;
  } catch (error) { e.error = moneyInvoiceError(error); if (error.status && error.status < 500) e.retry = null; return false; }
  finally { s.busy = false; moneyInvoicesPaint(); }
}
function moneyInvoiceIssuable() {
  const s = mi(), e = s.editor, d = moneyInvoiceRead(), required = ['name', 'tax_id', 'address', 'postal_code', 'city', 'country'];
  if (required.some(key => !d.customer[key])) throw new Error('Completa nombre, NIF / CIF, dirección, código postal, ciudad y país del cliente antes de emitir.');
  if (required.some(key => !s.settings?.issuer?.[key])) throw new Error('Completa los datos de VOCAI antes de emitir. Puedes hacerlo en «Datos de VOCAI».');
  if (!s.settings.series?.some(series => Number(series.year) === Number(d.date.slice(0, 4)))) throw new Error('La numeración de ' + d.date.slice(0, 4) + ' todavía no está configurada. El borrador está guardado; falta preparar esa serie antes de emitir.');
  if (d.date > moneyToday()) throw new Error('La fecha de emisión no puede estar en el futuro.');
  if (!d.lines.length || d.lines.some(line => !line.description) || d.totals.net <= 0) throw new Error('Completa los conceptos y un total a cobrar mayor que cero antes de emitir.');
  const mismatch = moneyInvoiceRecordMismatch(d); if (mismatch) throw new Error(mismatch);
  if (!e.saved) throw new Error('Guarda primero el borrador.');
  return d;
}
async function moneyInvoiceIssueDialog() {
  if (!await moneyInvoiceSave(false)) return;
  try {
    const d = moneyInvoiceIssuable(), e = mi().editor;
    mi().issueTarget = { id: e.invoice.id, version: e.invoice.version };
    createModal('moneyInvoiceIssue', 'Confirmar emisión', `<div class="money-invoice-modal"><p>Se asignará el número definitivo y se conservarán los datos de esta factura.</p><dl><div><dt>Cliente</dt><dd>${moneyEsc(d.customer.name)}</dd></div><div><dt>Fecha</dt><dd>${moneyEsc(d.date)}</dd></div><div><dt>Total a cobrar</dt><dd><strong>${moneyEuro(d.totals.net)}</strong></dd></div></dl><div class="money-invoice-note">${e.record_id ? 'Se vinculará al ingreso existente y se conservarán sus pagos.' : 'Se creará un ingreso pendiente de cobro.'} <strong>Emitir no registra un cobro.</strong></div><p id="mi_issue_error" class="money-error" role="alert"></p></div>`, '<button class="btn btn-secondary" onclick="closeModal(\'moneyInvoiceIssue\')">Volver a revisar</button><button id="mi_issue_confirm" class="btn btn-primary" onclick="moneyInvoiceIssue()">Confirmar emisión</button>');
  } catch (error) { mi().editor.error = moneyInvoiceError(error); moneyInvoicesPaint(); }
}
async function moneyInvoiceIssue() {
  const s = mi(), target = s.issueTarget, e = s.editor; if (!target || !e || s.busy || e.invoice.id !== target.id || e.invoice.version !== target.version || !moneyInvoiceWritable()) return;
  s.busy = true; const button = document.getElementById('mi_issue_confirm'), error = document.getElementById('mi_issue_error'); if (button) button.disabled = true;
  try {
    const invoice = await API.post('/finance/invoices/' + encodeURIComponent(target.id) + '/issue', { version: target.version });
    moneyInvoiceRemember(invoice); moneyInvoiceSetEditor(invoice); s.issueTarget = null; closeModal('moneyInvoiceIssue'); toast('Factura emitida. El cobro se registra por separado.', 'success');
    try { moneyState.data = await API.get('/finance'); } catch { s.error = 'La factura está emitida. Actualiza Finanzas para ver el ingreso vinculado.'; }
  } catch (err) { if (error) error.textContent = moneyInvoiceError(err); }
  finally { s.busy = false; if (button) button.disabled = false; moneyInvoicesPaint(); }
}
function moneyInvoiceCanCollect(invoice) {
  const record = moneyState.data.records.find(r => r.id === invoice.record_id);
  return record && !record.voided && !record.included_in_opening && !['assigned', 'draft', 'duplicate', 'review'].includes(record.data.history?.status) && moneyPaid(record.data) < FinanceTax.payable(record.data);
}
async function moneyInvoiceOpenIncome(payment = false) {
  const s = mi(), invoice = s.editor?.invoice; if (!invoice?.record_id || s.busy) return;
  s.busy = true; s.error = ''; moneyInvoicesPaint();
  try {
    const data = await API.get('/finance'), record = data.records.find(r => r.id === invoice.record_id);
    if (!record) throw new Error('El ingreso vinculado no está disponible. Actualiza la página.');
    moneyState.data = data;
    if (payment) moneyPayment(record.id); else moneyForm('income', record.id);
  } catch (e) { s.error = moneyInvoiceError(e); }
  finally { s.busy = false; moneyInvoicesPaint(); }
}
function moneyInvoiceReleasePDF() {
  const s = mi(); if (s.pdfObserver) { s.pdfObserver.disconnect(); s.pdfObserver = null; }
  if (s.pdfURL) { URL.revokeObjectURL(s.pdfURL); s.pdfURL = null; }
}
function moneyInvoiceClosePDF() { closeModal('moneyInvoicePDF'); moneyInvoiceReleasePDF(); }
async function moneyInvoicePDFAt(index) { const invoice = mi().invoices[index]; if (invoice) await moneyInvoiceFetchPDF(invoice); }
async function moneyInvoicePreview() {
  if (!mi().editor || mi().busy) return;
  if (mi().editor.invoice.status === 'draft' && !await moneyInvoiceSave(false)) return;
  await moneyInvoiceFetchPDF(mi().editor.invoice);
}
async function moneyInvoiceFetchPDF(invoice) {
  const s = mi(); if (s.busy) return;
  s.busy = true; s.error = ''; moneyInvoicesPaint();
  try {
    const current = await API.get('/finance/invoices/' + encodeURIComponent(invoice.id));
    if (current.version !== invoice.version) throw new Error('La factura cambió. Actualízala antes de descargar el PDF.');
    const response = await fetch('/api/finance/invoices/' + encodeURIComponent(invoice.id) + '/pdf', { headers: { Authorization: 'Bearer ' + localStorage.getItem('vocai_token') } });
    if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error || 'No se pudo generar el PDF. Reintenta en unos instantes.'); }
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/pdf')) throw new Error('La respuesta no contiene un PDF. Vuelve a intentarlo.');
    const blob = await response.blob(); if (!blob.size) throw new Error('El PDF está vacío. Vuelve a intentarlo.');
    moneyInvoiceReleasePDF(); s.pdfURL = URL.createObjectURL(blob);
    const filename = String(invoice.number || 'borrador').replace(/[^A-Za-z0-9_-]/g, '-') + '.pdf';
    createModal('moneyInvoicePDF', invoice.status === 'draft' ? 'Vista previa · borrador' : 'Factura ' + moneyEsc(invoice.number || ''), `<div class="money-invoice-modal">${invoice.status === 'draft' ? '<p class="money-invoice-note">Borrador sin emitir. Descargarlo no registra ingresos ni cobros.</p>' : ''}<iframe class="money-invoice-pdf" title="Vista previa privada de la factura" src="${moneyEsc(s.pdfURL)}"></iframe><p class="money-invoice-muted">Si tu navegador no muestra la vista previa, usa Descargar PDF.</p></div>`, `<button class="btn btn-secondary" onclick="moneyInvoiceClosePDF()">Cerrar</button><a class="btn btn-primary" href="${moneyEsc(s.pdfURL)}" download="${moneyEsc(filename)}">Descargar PDF</a>`, 'modal-lg');
    const modal = document.getElementById('moneyInvoicePDF');
    if (modal && typeof MutationObserver !== 'undefined') { s.pdfObserver = new MutationObserver(() => { if (!modal.classList.contains('open') || !modal.isConnected) moneyInvoiceReleasePDF(); }); s.pdfObserver.observe(modal, { attributes: true, attributeFilter: ['class'] }); }
  } catch (e) { s.error = moneyInvoiceError(e); if (s.editor) s.editor.error = s.error; toast(s.error, 'error'); }
  finally { s.busy = false; moneyInvoicesPaint(); }
}
function moneyInvoiceSettings() {
  const s = mi(); if (!s.settings || s.busy) return;
  const issuer = s.settings.issuer || {}, writable = moneyInvoiceWritable(); s.issuerVersion = s.settings.version;
  const fields = [...MI_CUSTOMER_FIELDS, ['website', 'Web'], ['iban', 'IBAN'], ['payment_method', 'Instrucciones de pago']];
  createModal('moneyInvoiceSettings', 'Datos de VOCAI', `<div class="money-invoice-modal"><p>Estos datos aparecerán en las próximas facturas. Las ya emitidas conservan su copia original.</p><fieldset ${!writable ? 'disabled' : ''} style="border:0;padding:0;margin:0;min-width:0"><div class="money-invoice-settings-grid">${fields.map(([key, label]) => `<label class="${['address', 'payment_method'].includes(key) ? 'wide' : ''}">${label}${key === 'payment_method' ? `<textarea id="mis_${key}" class="form-textarea" maxlength="180">${moneyEsc(issuer[key] || '')}</textarea>` : `<input id="mis_${key}" class="form-input" maxlength="${MI_FIELD_LIMITS[key]}" value="${moneyEsc(issuer[key] || '')}">`}</label>`).join('')}</div></fieldset><div class="money-invoice-note"><strong>Numeración</strong><p>${s.settings.series?.length ? s.settings.series.map(series => moneyEsc(series.year) + ' · último número ' + moneyEsc(series.last_number) + (series.last_date ? ' · ' + moneyEsc(series.last_date) : '')).join('<br>') : 'La serie de facturación todavía no está configurada. Puedes preparar borradores; antes de emitir hay que confirmar la numeración de inicio.'}</p></div><p id="mis_error" class="money-error" role="alert"></p></div>`, `<button class="btn btn-secondary" onclick="closeModal('moneyInvoiceSettings')">Cerrar</button>${writable ? '<button id="mis_save" class="btn btn-primary" onclick="moneyInvoiceSettingsSave()">Guardar datos</button>' : ''}`, 'modal-lg');
}
async function moneyInvoiceSettingsSave() {
  const s = mi(); if (s.busy || !moneyInvoiceWritable()) return;
  const issuer = Object.fromEntries([...MI_CUSTOMER_FIELDS.map(([key]) => key), 'website', 'iban', 'payment_method'].map(key => [key, document.getElementById('mis_' + key)?.value.trim() || '']));
  const button = document.getElementById('mis_save'), error = document.getElementById('mis_error'); s.busy = true; if (button) button.disabled = true; if (error) error.textContent = '';
  try { s.settings = await API.put('/finance/invoices/settings', { version: s.issuerVersion, issuer }); closeModal('moneyInvoiceSettings'); toast('Datos de VOCAI guardados.', 'success'); }
  catch (e) { if (error) error.textContent = moneyInvoiceError(e); }
  finally { s.busy = false; if (button) button.disabled = false; moneyInvoicesPaint(); }
}
async function moneyInvoiceGuardForm(record) {
  if (record?.data.kind !== 'income' || !moneyState.form) return;
  const form = moneyState.form;
  try {
    const data = await API.get('/finance/invoices');
    if (moneyState.form !== form || form.id !== record.id) return;
    const invoice = data.invoices.find(i => i.record_id === record.id && i.status !== 'draft'); if (!invoice) return;
    for (const id of ['mf_title', 'mf_amount', 'mf_date', 'mf_party', 'mf_number', 'mf_start', 'mf_end', 'mf_due', 'mf_stage', 'mf_repeat', 'mf_tax_mode', 'mf_tax_rate', 'mf_irpf_enabled', 'mf_irpf_rate']) { const input = document.getElementById(id); if (input) input.disabled = true; }
    const modal = document.getElementById('moneyModal');
    const correction = document.getElementById('mf_payment_correction');
    if (correction) correction.textContent = 'Los cobros anteriores se conservan. La corrección de una factura emitida requiere una rectificación; no se anula desde este formulario.';
    modal?.querySelectorAll('button[onclick]').forEach(button => { if ((button.getAttribute('onclick') || '').startsWith('moneyVoid(')) button.hidden = true; });
    if (modal && !modal.querySelector('.money-invoice-issued-note')) { const note = document.createElement('p'); note.className = 'money-notice money-invoice-issued-note'; note.textContent = 'Factura emitida: conserva sus datos. Puedes guardar notas; registra el cobro por separado.'; modal.querySelector('.money-form')?.prepend(note); }
  } catch { /* The server also protects issued values; a failed lookup never grants an override. */ }
}
window.addEventListener?.('beforeunload', event => { moneyInvoiceReleasePDF(); if (mi().editor?.dirty) { event.preventDefault(); event.returnValue = ''; } });
