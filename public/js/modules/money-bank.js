/* Bank review links evidence to existing movements; it never creates payments. */
window.moneyBankState = { month: '', reviews: [], loaded: false, file: null, parsed: null, config: null, normalized: null, rows: [], decisions: [], comparison: null, review: null, notes: '', dirty: false, busy: false, error: '', balanceError: false, filter: 'pending', split: null, remapping: false };
const MONEY_BANK_LIMIT = 5 * 1024 * 1024;
const MONEY_BANK_STATUS = { matched: 'Confirmado', suggested: 'Coincidencia sugerida', difference: 'Importe diferente', unmatched: 'Sin registro encontrado', ambiguous: 'Varias coincidencias', stale: 'El registro cambió' };
const mb = () => window.moneyBankState;
const mbEsc = value => moneyEsc(value);
const mbAmount = value => moneyEuro(value || 0);
function moneyBankFileCheck(file) {
  if (!file || !file.size) throw new Error('Selecciona un extracto con contenido.');
  if (file.size > MONEY_BANK_LIMIT) throw new Error('El archivo supera 5 MB. Exporta únicamente el mes que vas a revisar.');
  if (!/\.(csv|xlsx)$/i.test(file.name || '')) throw new Error('Usa un archivo CSV o XLSX del banco.');
}
function moneyBankCanReplace() { return !mb().dirty || confirm('Hay una revisión sin guardar. ¿Descartar esos cambios y continuar?'); }
function moneyBankError(error) {
  const details = error?.data?.details || error?.details || [];
  mb().error = (error?.message || String(error)) + (error?.status === 409 ? ' Otra persona pudo cambiar los datos. Abre de nuevo la revisión antes de guardar.' : '') + (details.length ? ' ' + details.map(e => (e.row ? 'Fila ' + e.row + ': ' : '') + e.message).join(' · ') : '');
}
async function moneyBankMultipart(path, form) {
  const response = await fetch('/api/finance/bank-reviews' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('vocai_token') }, body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) { const e = new Error(body?.error || 'No se pudo procesar el extracto.'); e.status = response.status; e.data = body; throw e; }
  return body;
}
async function moneyBankRender(el) {
  const s = mb();
  if (!s.month) s.month = moneyState.month || moneyToday().slice(0, 7);
  moneyBankPaint(el);
  try {
    if (!s.loaded || s.loadedMonth !== s.month) await moneyBankRefreshList();
    // Financial corrections are made in their own form. Recompute their links
    // when returning here, so a prior match cannot silently remain current.
    const revision = moneyState.data.records.map(r => [r.id, r.version, r.voided].join(':')).join('|');
    if (s.comparison && s.recordRevision !== revision && !s.busy) await moneyBankCompare();
    else if (!s.comparison) s.recordRevision = revision;
  } catch (e) { moneyBankError(e); }
  if (moneyState.view === 'bank') moneyBankPaint(el);
}
function moneyBankPaint(el = document.getElementById('moneyBody')) {
  if (!el || moneyState.view !== 'bank') return;
  const s = mb(), saved = !!s.review;
  el.innerHTML = `<section class="bank-workspace" aria-label="Revisar banco" aria-busy="${s.busy}">
    <header class="bank-heading"><div><h2>Revisar banco</h2><p>Compara el extracto con los movimientos de VOCAI, mes a mes.</p></div><span class="bank-account">Banco VOCAI · EUR</span></header>
    <p class="bank-scope">Esta revisión confirma coincidencias. No crea gastos, cobros ni aportes y no cambia tus saldos.</p>
    ${window.moneyBankPreview ? '<div class="bank-info">Vista previa local: la carga y el guardado de extractos están desactivados. Usa la plataforma para realizar la revisión.</div>' : ''}
    ${s.error ? `<div class="bank-error" role="alert">${mbEsc(s.error)}${saved ? '<button class="bank-link" onclick="moneyBankReload()">Volver a abrir la revisión guardada</button>' : ''}</div>` : ''}
    <div class="bank-period"><label>Mes a revisar<input class="form-input" type="month" value="${mbEsc(s.month)}" onchange="moneyBankMonth(this.value)" ${s.busy || s.remapping ? 'disabled' : ''}></label>${s.parsed || saved ? `<div class="bank-file-label"><strong>${mbEsc(s.review?.name || s.parsed?.filename || s.file?.name || 'Extracto')}</strong><span>${saved ? 'Extracto guardado · versión ' + s.review.version : 'Archivo preparado · aún sin guardar'}</span></div><button class="btn btn-secondary" onclick="moneyBankNew()" ${s.busy ? 'disabled' : ''}>Otro extracto</button>` : ''}</div>
    ${!s.parsed && !saved ? moneyBankUploadHTML() : s.parsed && !s.comparison ? moneyBankMappingHTML() : ''}
    ${s.comparison ? moneyBankComparisonHTML() : ''}
    <section class="bank-saved"><h3>Revisiones guardadas de este mes</h3>${moneyBankSavedHTML()}</section>
  </section>`;
}
function moneyBankUploadHTML() {
  return `<label class="bank-upload"><strong>1. Sube el extracto del mes</strong><span>CSV o Excel (.xlsx) · hasta 5 MB</span><input type="file" accept=".csv,.xlsx" aria-label="Subir extracto bancario" onchange="moneyBankSelectFile(this.files[0])" ${mb().busy || window.moneyBankPreview ? 'disabled' : ''}><small>Usaremos la fecha del movimiento, no la fecha valor.</small></label>`;
}
async function moneyBankRefreshList() {
  const s = mb(), month = s.month;
  const reviews = await API.get('/finance/bank-reviews?month=' + encodeURIComponent(month));
  if (s.month === month) { s.reviews = reviews; s.loaded = true; s.loadedMonth = month; }
}
function moneyBankSavedHTML() {
  const s = mb(), items = s.reviews.map((r, index) => ({ r, index })).filter(({ r }) => r.month === s.month);
  if (!s.loaded) return '<p class="bank-muted">Cargando revisiones…</p>';
  if (!items.length) return '<p class="bank-muted">Todavía no hay revisiones guardadas para este mes.</p>';
  return `<div class="bank-saved-list">${items.map(({ r, index }) => `<button onclick="moneyBankOpen(${index})" ${s.busy ? 'disabled' : ''}><span><strong>${mbEsc(r.name)}</strong><small>Guardado ${mbEsc(String(r.updated_at || r.created_at || '').slice(0, 10))}</small></span><span>Abrir revisión →</span></button>`).join('')}</div>`;
}
function moneyBankReset(month) {
  const s = mb(); Object.assign(s, { month: month || s.month, file: null, parsed: null, config: null, normalized: null, rows: [], decisions: [], comparison: null, review: null, notes: '', dirty: false, error: '', balanceError: false, filter: 'pending', split: null, remapping: false });
}
function moneyBankMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month) || mb().busy || mb().remapping || !moneyBankCanReplace()) return moneyBankPaint();
  moneyBankReset(month); moneyBankRender(document.getElementById('moneyBody'));
}
function moneyBankNew() { if (!mb().busy && moneyBankCanReplace()) { moneyBankReset(); moneyBankPaint(); } }
async function moneyBankSelectFile(file) {
  if (!file || mb().busy) return;
  const s = mb();
  try { moneyBankFileCheck(file); if (!moneyBankCanReplace()) return; }
  catch (e) { moneyBankError(e); moneyBankPaint(); return; }
  s.busy = true; s.error = ''; moneyBankPaint();
  try {
    const form = new FormData(); form.append('file', file);
    const parsed = await moneyBankMultipart('/parse', form);
    moneyBankReset(); s.file = file; s.parsed = parsed; s.config = FinanceBank.inferConfig(parsed.sheets, s.month); s.dirty = true;
    moneyBankNormalize();
  } catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
function moneyBankBalance(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(v)) throw new Error('Escribe el saldo sin separador de miles, por ejemplo 1234,56.');
  const cents = Math.round(Number(v.replace(',', '.')) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('Revisa el importe del saldo.');
  return cents;
}
function moneyBankNormalize() {
  const s = mb();
  try { s.normalized = FinanceBank.normalize(s.parsed.sheets, s.config); s.rows = s.normalized.rows; }
  catch (e) { s.normalized = { rows: [], errors: [{ message: e.message }], outsideCount: 0 }; s.rows = []; }
}
function moneyBankConfig(field, value) {
  const s = mb(); if (s.busy || (s.review && !s.remapping)) return;
  s.error = '';
  if (field === 'sheet') { const inferred = FinanceBank.inferConfig([s.parsed.sheets[Number(value)]], s.month); s.config = { ...inferred, sheet: Number(value), openingBalance: s.config.openingBalance, closingBalance: s.config.closingBalance }; s.split = null; }
  else if (field === 'header') s.config.header = Math.max(0, Number(value) - 1);
  else if (['date', 'description', 'amount', 'debit', 'credit'].includes(field)) s.config[field] = value === '' ? null : Number(value);
  else if (field === 'mode') { s.config.amount = null; s.config.debit = null; s.config.credit = null; s.split = value === 'split'; }
  else s.config[field] = value;
  s.comparison = null; s.decisions = []; s.dirty = true; moneyBankNormalize(); moneyBankPaint();
}
function moneyBankColumn(field, label, optional = false) {
  const s = mb(), sheet = s.parsed.sheets[s.config.sheet], header = sheet?.rows[s.config.header] || [];
  const count = (sheet?.rows || []).slice(s.config.header, s.config.header + 12).reduce((n, r) => Math.max(n, r.length), header.length);
  return `<label>${label}<select class="form-select" onchange="moneyBankConfig('${field}',this.value)"><option value="">${optional ? 'No se usa' : 'Selecciona la columna'}</option>${Array.from({ length: count }, (_, i) => `<option value="${i}" ${s.config[field] === i ? 'selected' : ''}>${i + 1} · ${mbEsc(header[i] || 'Columna sin nombre')}</option>`).join('')}</select></label>`;
}
function moneyBankBalancesHTML() {
  const s = mb(), c = s.config;
  const value = n => n == null ? '' : (n / 100).toFixed(2).replace('.', ',');
  return `<div class="bank-balances-input"><label>Saldo inicial del extracto <small>Opcional · sin separador de miles</small><input id="bankOpening" class="form-input" inputmode="decimal" placeholder="Ej. 1250,00" value="${value(c.openingBalance)}" onchange="moneyBankSetBalance('openingBalance',this.value)" ${s.busy ? 'disabled' : ''}></label><label>Saldo final del extracto <small>Opcional · sin separador de miles</small><input id="bankClosing" class="form-input" inputmode="decimal" placeholder="Ej. 1475,00" value="${value(c.closingBalance)}" onchange="moneyBankSetBalance('closingBalance',this.value)" ${s.busy ? 'disabled' : ''}></label></div>`;
}
function moneyBankMappingHTML() {
  const s = mb(), c = s.config, sheet = s.parsed.sheets[c.sheet], split = s.split ?? (c.amount == null && (c.debit != null || c.credit != null)), n = s.normalized;
  const rows = sheet?.rows || [], width = Math.min(12, rows.slice(0, 8).reduce((max, r) => Math.max(max, r.length), 0));
  return `<section class="bank-card"><h3>2. Comprueba cómo leer el archivo</h3><p class="bank-muted">Las columnas sugeridas se revisan aquí antes de comparar. Una salida del banco debe quedar con signo negativo.</p>${s.remapping ? '<div class="bank-info">Al guardar estas columnas se reiniciarán las coincidencias. Se conservan el extracto original y las notas; después volverás a revisar sus movimientos. El mes de esta revisión no cambia.</div>' : ''}
    <fieldset ${s.busy ? 'disabled' : ''}><div class="bank-mapping"><label>Hoja<select class="form-select" onchange="moneyBankConfig('sheet',this.value)">${s.parsed.sheets.map((sh, i) => `<option value="${i}" ${c.sheet === i ? 'selected' : ''}>${mbEsc(sh.name || 'Hoja ' + (i + 1))}</option>`).join('')}</select></label><label>Fila de encabezados<input class="form-input" type="number" min="1" max="${Math.max(1, rows.length)}" value="${c.header + 1}" onchange="moneyBankConfig('header',this.value)"></label>${moneyBankColumn('date', 'Fecha del movimiento')}${moneyBankColumn('description', 'Concepto')}<label>Importes<select class="form-select" onchange="moneyBankConfig('mode',this.value)"><option value="amount" ${!split ? 'selected' : ''}>Una columna con signo + / −</option><option value="split" ${split ? 'selected' : ''}>Cargo y abono separados</option></select></label>${split ? moneyBankColumn('debit', 'Cargo / salida', true) + moneyBankColumn('credit', 'Abono / entrada', true) : moneyBankColumn('amount', 'Importe con signo')}<label>Formato de decimales<select class="form-select" onchange="moneyBankConfig('decimal',this.value)"><option value="comma" ${c.decimal === 'comma' ? 'selected' : ''}>Coma: 1.234,56</option><option value="dot" ${c.decimal === 'dot' ? 'selected' : ''}>Punto: 1,234.56</option></select></label><label>Orden de las fechas<select class="form-select" onchange="moneyBankConfig('dateOrder',this.value)"><option value="dmy" ${c.dateOrder === 'dmy' ? 'selected' : ''}>Día / mes / año</option><option value="mdy" ${c.dateOrder === 'mdy' ? 'selected' : ''}>Mes / día / año</option></select></label></div>
    <details class="bank-source" open><summary>Primeras filas del archivo · números de fila originales</summary><div class="bank-table-scroll"><table><thead><tr><th>Fila</th>${Array.from({ length: width }, (_, i) => `<th>Columna ${i + 1}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 8).map((r, i) => `<tr class="${i === c.header ? 'bank-header-row' : ''}"><th>${i + 1}</th>${Array.from({ length: width }, (_, j) => `<td>${mbEsc(String(r[j] ?? '').slice(0, 180))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
    ${moneyBankBalancesHTML()}${n?.errors?.length ? `<div class="bank-error" role="alert"><strong>Revisa estas filas antes de comparar</strong><ul>${n.errors.slice(0, 12).map(e => `<li>${e.row ? 'Fila ' + e.row + ': ' : ''}${mbEsc(e.message)}</li>`).join('')}</ul>${n.errors.length > 12 ? `<p>Y ${n.errors.length - 12} errores más.</p>` : ''}</div>` : ''}
    <div class="bank-mapping-result"><span>${n?.rows?.length || 0} movimientos de ${mbEsc(s.month)}${n?.outsideCount ? ` · ${n.outsideCount} de otros meses quedan fuera` : ''}</span>${s.remapping ? '<button class="bank-link" onclick="moneyBankReload()">Cancelar cambio de columnas</button>' : ''}<button class="btn btn-primary" onclick="${s.remapping ? 'moneyBankApplyColumns()' : 'moneyBankCompare()'}" ${s.busy || s.balanceError || n?.errors?.length || !n?.rows?.length ? 'disabled' : ''}>${s.remapping ? 'Guardar columnas y volver a revisar' : 'Comparar con VOCAI'}</button></div></fieldset></section>`;
}
async function moneyBankSetBalance(field, value) {
  const s = mb(); if (s.busy) return;
  try {
    const config = { ...s.config, [field]: moneyBankBalance(value) }; s.error = ''; s.balanceError = false;
    if (s.comparison) return moneyBankApplyReviewChange(config, s.decisions);
    s.config = config; s.dirty = true;
  }
  catch (e) { s.balanceError = true; moneyBankError(e); }
  moneyBankPaint();
}
async function moneyBankApplyReviewChange(config, decisions) {
  const s = mb(); if (s.busy || s.balanceError || s.remapping) return;
  const rows = s.rows, month = s.month, review = s.review;
  s.busy = true; s.error = ''; moneyBankPaint();
  try {
    // A comparison may contain newer records than the finance page's snapshot.
    // Confirm and recompute against the server, never the older browser cache.
    const comparison = await API.post('/finance/bank-reviews/compare', { rows, config, decisions });
    if (s.rows !== rows || s.month !== month || s.review !== review) return;
    s.config = config; s.decisions = decisions; s.comparison = comparison; s.dirty = true;
  } catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
async function moneyBankCompare() {
  const s = mb(); if (s.busy || s.balanceError || s.remapping) return;
  if (s.parsed && !s.review) { moneyBankNormalize(); if (s.normalized.errors.length || !s.rows.length) return moneyBankPaint(); }
  const rows = s.rows, month = s.month, review = s.review;
  s.busy = true; s.error = ''; moneyBankPaint();
  try {
    const comparison = await API.post('/finance/bank-reviews/compare', { rows, config: s.config, decisions: s.decisions });
    if (s.rows !== rows || s.month !== month || s.review !== review) return;
    s.comparison = comparison; s.recordRevision = moneyState.data.records.map(r => [r.id, r.version, r.voided].join(':')).join('|');
  }
  catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
function moneyBankEligible(row, item) {
  return item && row.amount === item.amount && !mb().decisions.some(d => d.rowId !== row.id && d.ledgerKey === item.key);
}
function moneyBankSuggestions() {
  const used = new Set(mb().decisions.map(d => d.ledgerKey));
  return (mb().comparison?.bankRows || []).filter(row => { if (row.status !== 'suggested' || !row.match || row.amount !== row.match.amount || used.has(row.match.key)) return false; used.add(row.match.key); return true; });
}
async function moneyBankConfirm(index, ledgerIndex) {
  const s = mb(), row = s.comparison.bankRows[index], item = ledgerIndex == null ? row.match : s.comparison.ledgerItems[ledgerIndex];
  if (s.busy || !moneyBankEligible(row, item)) return;
  const decisions = s.decisions.filter(d => d.rowId !== row.id); decisions.push({ rowId: row.id, ledgerKey: item.key, fingerprint: item.fingerprint });
  await moneyBankApplyReviewChange(s.config, decisions);
}
async function moneyBankConfirmAll() {
  const s = mb(), rows = moneyBankSuggestions(); if (!rows.length || s.busy) return;
  const rowIds = new Set(rows.map(row => row.id)), decisions = s.decisions.filter(d => !rowIds.has(d.rowId));
  for (const row of rows) decisions.push({ rowId: row.id, ledgerKey: row.match.key, fingerprint: row.match.fingerprint });
  await moneyBankApplyReviewChange(s.config, decisions);
}
async function moneyBankUnlink(index) {
  const s = mb(); if (s.busy) return;
  const row = s.comparison.bankRows[index];
  await moneyBankApplyReviewChange(s.config, s.decisions.filter(d => d.rowId !== row.id));
}
function moneyBankMatchHTML(item) {
  if (!item) return '<span class="bank-muted">Sin coincidencia confirmada</span>';
  return `<strong>${mbEsc(item.description)}</strong><small>${mbEsc(item.date)}${item.estimated ? ' · día sin confirmar' : ''}${item.inMonth === false ? ' · otro mes' : ''}</small><span>${mbAmount(item.amount)}</span>`;
}
function moneyBankRowHTML(row, index) {
  const s = mb(), sameAmount = row.match && row.match.amount === row.amount, canConfirm = row.status === 'suggested' && sameAmount && moneyBankEligible(row, row.match);
  return `<article class="bank-movement ${row.status === 'matched' ? 'bank-confirmed' : ''}"><div class="bank-movement-source"><span class="bank-status ${row.status === 'matched' ? 'done' : ''}">${MONEY_BANK_STATUS[row.status] || 'Por revisar'}</span><strong>${mbEsc(row.description)}</strong><small>${mbEsc(row.date)} · fila ${mbEsc(row.sourceRow)}</small><b class="${row.amount >= 0 ? 'bank-income' : 'bank-expense'}">${row.amount > 0 ? '+' : ''}${mbAmount(row.amount)}</b></div><div class="bank-movement-match"><span class="bank-label">En VOCAI</span>${moneyBankMatchHTML(row.match)}${row.status === 'difference' ? '<p class="bank-row-note">Los importes difieren. Revisa el registro; no se pueden confirmar como iguales.</p>' : ''}${row.status === 'stale' ? '<p class="bank-row-note">El registro cambió desde la confirmación. Desvincula y revisa de nuevo.</p>' : ''}<div class="bank-row-actions">${canConfirm ? `<button class="btn btn-secondary btn-sm" onclick="moneyBankConfirm(${index})" ${s.busy ? 'disabled' : ''}>Confirmar coincidencia</button>` : ''}${row.status === 'matched' || s.decisions.some(d => d.rowId === row.id) ? `<button class="bank-link" onclick="moneyBankUnlink(${index})" ${s.busy ? 'disabled' : ''}>Desvincular</button>` : `<button class="bank-link" onclick="moneyBankChoose(${index})" ${s.busy ? 'disabled' : ''}>Buscar un registro</button>`}${row.match ? `<button class="bank-link" onclick="moneyBankOpenRecord(${s.comparison.ledgerItems.findIndex(x => x.key === row.match.key)})">Ver movimiento</button>` : ''}</div></div></article>`;
}
function moneyBankComparisonHTML() {
  const s = mb(), c = s.comparison, t = c.totals, suggestions = moneyBankSuggestions(), readySaved = s.review && !s.dirty && c.ready;
  const rows = c.bankRows.map((row, index) => ({ row, index })).filter(({ row }) => s.filter === 'all' || (s.filter === 'matched' ? row.status === 'matched' : row.status !== 'matched'));
  const b = c.balance || {}, hasBalances = b.opening != null && b.closing != null;
  return `<section class="bank-comparison"><div class="bank-review-heading"><div><h3>3. Confirma los movimientos</h3><p>${c.ready ? 'Todas las coincidencias están confirmadas.' : 'Revisa las sugerencias y los movimientos que quedan sin vincular.'}</p></div><span class="bank-status ${readySaved ? 'done' : ''}">${readySaved ? 'Extracto revisado' : s.review ? 'Revisión pendiente' : c.ready ? 'Listo para guardar' : 'Sin guardar'}</span></div>
    <div class="bank-kpis"><article><span>Entró en el banco</span><strong class="bank-income">${mbAmount(t.bankIn)}</strong></article><article><span>Salió del banco</span><strong class="bank-expense">${mbAmount(t.bankOut)}</strong></article><article><span>Diferencia del extracto</span><strong>${mbAmount(t.bankNet)}</strong></article><article><span>Movimientos confirmados</span><strong>${t.matchedCount} <small>/ ${c.bankRows.length}</small></strong></article></div>
    <details class="bank-balance-check" ${s.balanceOpen ? 'open' : ''} ontoggle="mb().balanceOpen=this.open"><summary>Comprobar saldos del extracto ${hasBalances ? b.difference === 0 ? '· coincide' : '· hay diferencia' : '· opcional'}</summary>${moneyBankBalancesHTML()}<p>${hasBalances ? `Saldo inicial ${mbAmount(b.opening)} + entradas − salidas = ${mbAmount(b.calculated)}. Saldo final del banco: ${mbAmount(b.closing)}. <strong>Diferencia: ${mbAmount(b.difference)}.</strong>` : 'Introduce ambos saldos para comprobar que el extracto está completo. Sin ellos no se comprueba el saldo de cierre.'}</p></details>
    ${c.warnings?.length ? `<div class="bank-info">${c.warnings.map(w => `<p>${mbEsc(typeof w === 'string' ? w : w.message || w.code || '')}</p>`).join('')}</div>` : ''}
    <div class="bank-toolbar"><div class="bank-filters">${[['pending', 'Por revisar'], ['matched', 'Confirmados'], ['all', 'Todos']].map(([key, label]) => `<button class="${s.filter === key ? 'active' : ''}" onclick="mb().filter='${key}';moneyBankPaint()">${label}</button>`).join('')}</div>${suggestions.length ? `<button class="btn btn-secondary" onclick="moneyBankConfirmAll()" ${s.busy ? 'disabled' : ''}>Confirmar ${suggestions.length} sugerencias claras</button>` : ''}${s.parsed || (s.review && !moneyState.data.review) ? `<button class="bank-link" onclick="moneyBankRemap()" ${s.busy ? 'disabled' : ''}>${s.review ? 'Revisar columnas' : 'Cambiar columnas'}</button>` : ''}<button class="bank-link" onclick="moneyBankCompare()" ${s.busy ? 'disabled' : ''}>Volver a comparar</button></div>
    <div class="bank-movements">${rows.map(({ row, index }) => moneyBankRowHTML(row, index)).join('') || '<p class="bank-empty">No hay movimientos en este filtro.</p>'}</div>
    <details class="bank-unmatched" ${c.unmatchedLedger.length ? 'open' : ''}><summary>Registrados en VOCAI sin coincidencia en este extracto · ${c.unmatchedLedger.length}</summary><p class="bank-muted">Solo movimientos de Banco VOCAI. Los pagos personales y el efectivo se revisan por separado. Incluye aportes y transferencias; no todos son ingresos o gastos.</p>${c.unmatchedLedger.map(item => `<div class="bank-unmatched-row"><div>${moneyBankMatchHTML(item)}</div><button class="bank-link" onclick="moneyBankOpenRecord(${c.ledgerItems.findIndex(x => x.key === item.key)})">Ver movimiento</button></div>`).join('') || '<p class="bank-muted">No quedan movimientos bancarios sin vincular en VOCAI.</p>'}</details>
    <section class="bank-save"><label>Notas de la revisión<textarea class="form-textarea" maxlength="4000" placeholder="Ej. Falta la factura de un cargo…" oninput="mb().notes=this.value;mb().dirty=true">${mbEsc(s.notes)}</textarea></label><div class="bank-save-actions"><p>${s.dirty ? 'Hay cambios sin guardar. ' : ''}${c.ready ? 'Al guardar quedará como extracto revisado.' : 'Puedes guardar el avance y continuar después.'} ${window.moneyBankPreview ? 'La vista previa no guarda revisiones.' : ''}</p><div>${s.review ? '<button class="btn btn-secondary" onclick="moneyBankFile()">Ver extracto original</button>' : ''}<button class="btn btn-primary" onclick="moneyBankSave()" ${s.busy || s.balanceError || window.moneyBankPreview || moneyState.data.review ? 'disabled' : ''}>${s.busy ? 'Procesando…' : 'Guardar revisión'}</button></div></div></section>
  </section>`;
}
async function moneyBankRemap() {
  const s = mb(); if (s.busy || window.moneyBankPreview) return;
  if (!s.review) {
    if (s.decisions.length && !confirm('Al cambiar las columnas se revisarán de nuevo las coincidencias. ¿Continuar?')) return;
    s.comparison = null; s.decisions = []; moneyBankPaint(); return;
  }
  if (moneyState.data.review || !moneyBankCanReplace()) return;
  if (s.review.decisions?.length && !confirm('Al guardar las columnas se reiniciarán las coincidencias de este extracto para revisarlas de nuevo. El archivo y las notas se conservan. ¿Continuar?')) return;
  s.busy = true; s.error = ''; moneyBankPaint();
  try {
    const parsed = await API.get('/finance/bank-reviews/' + s.review.id + '/columns');
    s.parsed = parsed; s.config = { ...s.review.config, month: s.review.month }; s.month = s.review.month;
    s.remapping = true; s.comparison = null; s.decisions = []; s.notes = s.review.notes || ''; s.split = null; s.balanceError = false; s.dirty = true;
    moneyBankNormalize();
  } catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
async function moneyBankApplyColumns() {
  const s = mb(); if (!s.remapping || !s.review || s.busy || s.balanceError || window.moneyBankPreview || moneyState.data.review) return;
  moneyBankNormalize(); if (s.normalized.errors.length || !s.rows.length) return moneyBankPaint();
  s.busy = true; s.error = ''; moneyBankPaint();
  try {
    const result = await API.post('/finance/bank-reviews/' + s.review.id + '/remap', { version: s.review.version, config: { ...s.config, month: s.review.month } });
    moneyBankLoad(result); await moneyBankRefreshList();
    toast('Columnas guardadas. Vuelve a confirmar las coincidencias del extracto.', 'success');
  } catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
function moneyBankChoose(index) {
  const s = mb(); if (s.busy) return;
  const row = s.comparison.bankRows[index]; s.chooseIndex = index;
  createModal('bankChoose', 'Vincular un movimiento existente', `<div class="bank-choice"><p><strong>${mbEsc(row.description)}</strong> · ${mbEsc(row.date)} · ${mbAmount(row.amount)}</p><p class="bank-muted">Busca el mismo movimiento. Solo puedes confirmar el mismo importe y sentido (entrada o salida).</p><input id="bankMatchSearch" class="form-input" type="search" placeholder="Buscar concepto o fecha…" oninput="moneyBankChoices()"><div id="bankMatchChoices"></div><p class="bank-muted">Si falta un movimiento, regístralo en Movimientos y vuelve a comparar. Subir el extracto no lo crea.</p></div>`, '<button class="btn btn-secondary" onclick="closeModal(\'bankChoose\')">Cerrar</button>');
  moneyBankChoices();
}
function moneyBankChoices() {
  const s = mb(), row = s.comparison.bankRows[s.chooseIndex], query = (document.getElementById('bankMatchSearch')?.value || '').toLowerCase();
  const items = s.comparison.ledgerItems.map((item, index) => ({ item, index })).filter(({ item }) => moneyBankEligible(row, item) && [item.description, item.date].join(' ').toLowerCase().includes(query));
  document.getElementById('bankMatchChoices').innerHTML = items.slice(0, 60).map(({ item, index }) => `<button class="bank-choice-row" onclick="moneyBankConfirm(mb().chooseIndex,${index});closeModal('bankChoose')"><span>${moneyBankMatchHTML(item)}</span><span>Vincular →</span></button>`).join('') || '<p class="bank-empty">No hay registros disponibles con el mismo importe. Revisa el movimiento o la cuenta desde Movimientos.</p>';
}
async function moneyBankOpenRecord(index) {
  const s = mb(), item = s.comparison?.ledgerItems[index]; if (!item || s.busy) return;
  const rows = s.rows, month = s.month, review = s.review;
  s.busy = true; s.error = ''; moneyBankPaint();
  try {
    const data = await API.get('/finance');
    if (s.rows !== rows || s.month !== month || s.review !== review || moneyState.view !== 'bank') return;
    const record = data.records.find(r => r.id === item.recordId && !r.voided);
    if (!record) throw new Error('Este movimiento ya no está disponible. Vuelve a comparar el extracto.');
    moneyState.data = data;
    moneyForm(record.data.kind, record.id);
  } catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
function moneyBankLoad(payload) {
  const s = mb(), r = payload.review; Object.assign(s, { review: r, month: r.month, config: r.config, rows: r.rows, decisions: r.decisions || [], notes: r.notes || '', comparison: payload.comparison, parsed: null, file: null, normalized: null, dirty: false, error: '', balanceError: false, filter: 'pending', split: null, remapping: false });
}
async function moneyBankOpen(index) {
  const s = mb(), meta = s.reviews[index]; if (!meta || s.busy || !moneyBankCanReplace()) return;
  s.busy = true; s.error = ''; moneyBankPaint();
  try { moneyBankLoad(await API.get('/finance/bank-reviews/' + meta.id)); }
  catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
async function moneyBankReload() {
  const s = mb(); if (!s.review || s.busy || !moneyBankCanReplace()) return;
  s.busy = true; moneyBankPaint();
  try { moneyBankLoad(await API.get('/finance/bank-reviews/' + s.review.id)); }
  catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
async function moneyBankSave() {
  const s = mb(); if (s.busy || s.balanceError || s.remapping || !s.comparison || window.moneyBankPreview || moneyState.data.review) return;
  s.busy = true; s.error = ''; moneyBankPaint();
  try {
    let result;
    if (s.review) result = await API.put('/finance/bank-reviews/' + s.review.id, { version: s.review.version, decisions: s.decisions, notes: s.notes, openingBalance: s.config.openingBalance, closingBalance: s.config.closingBalance });
    else { moneyBankFileCheck(s.file); const form = new FormData(); form.append('file', s.file); form.append('config', JSON.stringify(s.config)); form.append('decisions', JSON.stringify(s.decisions)); form.append('notes', s.notes); result = await moneyBankMultipart('', form); }
    moneyBankLoad(result); await moneyBankRefreshList();
    toast(result.duplicate ? 'Ese extracto ya estaba guardado. Abrimos la revisión existente.' : result.comparison.ready ? 'Extracto revisado y guardado.' : 'Avance guardado. Puedes continuar después.', 'success');
  } catch (e) { moneyBankError(e); }
  finally { s.busy = false; moneyBankPaint(); }
}
async function moneyBankFile() {
  const id = mb().review?.id; if (!id) return;
  try { const { url } = await API.get('/finance/bank-reviews/' + id + '/file'); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click(); }
  catch (e) { moneyBankError(e); moneyBankPaint(); }
}
window.addEventListener('beforeunload', event => { if (mb().dirty) { event.preventDefault(); event.returnValue = ''; } });
