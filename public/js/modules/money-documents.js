/* Received documents are evidence, not financial movements. Review and link explicitly. */
window.moneyDocumentsState = { documents: [], total: 0, status: 'pending', loaded: false, loading: false, busy: false, error: '', telegram: null, telegramError: '', linkDocument: null, records: [] };
const md = () => window.moneyDocumentsState;
const MONEY_DOCUMENT_STATUS = { pending: 'Recibido · por revisar', linked: 'Vinculado a un movimiento', archived: 'Archivado · sin contabilizar' };
function moneyDocumentError(error) { return (error?.message || 'No se pudo completar la operación.') + (error?.status === 409 ? ' El documento cambió. Actualiza la bandeja antes de continuar.' : ''); }
function moneyDocumentDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'Europe/Madrid' }).format(date); }
function moneyDocumentById(id) { return md().documents.find(d => d.id === id); }
function moneyDocumentWritable() { return !moneyState.data.review && !window.moneyDocumentsPreview; }
function moneyDocumentResult(result) {
  const doc = result.document;
  const index = md().documents.findIndex(d => d.id === doc.id);
  if (index >= 0) md().documents[index] = doc;
  return doc;
}
async function moneyDocumentsRender(el) {
  moneyDocumentsPaint(el);
  await Promise.allSettled([moneyDocumentsLoad(), moneyDocumentsTelegramLoad()]);
}
async function moneyDocumentsLoad(append = false) {
  const s = md(), request = s.loadRequest = (s.loadRequest || 0) + 1;
  const status = s.status, offset = append ? s.documents.length : 0;
  s.loading = true; s.error = ''; moneyDocumentsPaint();
  try {
    const result = await API.get('/finance/documents?status=' + status + '&offset=' + offset + '&limit=50');
    if (s.status !== status || s.loadRequest !== request) return;
    s.documents = append ? [...s.documents, ...result.documents.filter(d => !s.documents.some(old => old.id === d.id))] : result.documents;
    s.total = result.total; s.loaded = true;
  } catch (e) { if (s.loadRequest === request) s.error = moneyDocumentError(e); }
  finally { if (s.loadRequest === request) s.loading = false; moneyDocumentsPaint(); }
}
async function moneyDocumentsTelegramLoad() {
  const s = md(); s.telegramError = '';
  try { s.telegram = await API.get('/finance/documents/telegram'); }
  catch (e) { s.telegramError = moneyDocumentError(e); }
  moneyDocumentsPaint();
}
function moneyDocumentsPaint(el = document.getElementById('moneyBody')) {
  if (!el || moneyState.view !== 'documents') return;
  const s = md(), disabled = s.busy || s.loading;
  el.innerHTML = `<section class="money-documents" aria-label="Documentos" aria-busy="${disabled}">
    <header class="money-document-heading"><div><h3>Documentos</h3><p>Recibe facturas y justificantes. Revísalos cuando te venga bien.</p></div><div class="money-document-actions"><button class="btn btn-secondary" onclick="moneyDocumentsRefresh()" ${disabled ? 'disabled' : ''}>Actualizar</button><button class="btn btn-primary" onclick="moneyDocumentsUploadModal()" ${disabled || !moneyDocumentWritable() ? 'disabled' : ''}>+ Subir documento</button></div></header>
    <div class="money-document-note">Subir un archivo no crea un gasto ni confirma un pago. Después puedes crear el movimiento o adjuntarlo a uno que ya existe.</div>
    ${window.moneyDocumentsPreview ? '<p class="money-document-note">Vista previa: subidas y conexiones desactivadas. Usa la plataforma para recibir documentos.</p>' : ''}
    ${s.error ? `<div class="money-document-error" role="alert">${moneyEsc(s.error)}</div>` : ''}
    <div class="money-document-toolbar"><div class="money-document-filters" aria-label="Estado de los documentos">${[['pending', 'Por revisar'], ['all', 'Todos'], ['linked', 'Vinculados'], ['archived', 'Archivados']].map(([key, label]) => `<button class="${s.status === key ? 'active' : ''}" onclick="moneyDocumentsFilter('${key}')" ${disabled ? 'disabled' : ''}>${label}</button>`).join('')}</div><span class="money-document-muted">${s.loading ? 'Cargando…' : s.loaded ? s.documents.length + ' de ' + s.total + ' documentos' : ''}</span></div>
    <div class="money-document-list">${s.documents.length ? s.documents.map(moneyDocumentCard).join('') : `<div class="money-document-empty"><strong>${s.loading ? 'Cargando documentos…' : 'No hay documentos en esta sección'}</strong><p>${s.status === 'pending' ? 'Sube una factura aquí o envíala desde Telegram cuando esté conectado.' : 'Los documentos aparecerán aquí según su estado.'}</p></div>`}</div>
    ${s.documents.length < s.total ? `<div class="money-document-footer"><button class="btn btn-secondary" onclick="moneyDocumentsLoad(true)" ${disabled ? 'disabled' : ''}>Cargar más</button></div>` : ''}
    ${moneyDocumentsTelegramHTML()}
  </section>`;
}
function moneyDocumentCard(doc, index) {
  const s = md(), editable = moneyDocumentWritable() && !s.busy && !s.loading, disabled = !editable ? 'disabled' : '';
  return `<article class="money-document-card"><div><span class="money-document-status ${['pending', 'linked', 'archived'].includes(doc.status) ? doc.status : ''}">${MONEY_DOCUMENT_STATUS[doc.status] || 'Por revisar'}</span><h4>${moneyEsc(doc.name)}</h4><div class="money-document-meta"><span>${moneyEsc(moneyDocumentDate(doc.created_at))}</span><span>${doc.source === 'telegram' ? 'Telegram' : 'Subido en VOCAI'}</span><span>${Math.max(1, Math.round(doc.bytes / 1024))} KB</span></div>${doc.caption ? `<small>${moneyEsc(doc.caption)}</small>` : ''}</div><div class="money-document-actions"><button class="btn btn-secondary btn-sm" onclick="moneyDocumentViewAt(${index})" ${s.busy ? 'disabled' : ''}>Ver archivo</button>${doc.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="moneyDocumentCreate(${index})" ${disabled}>Crear gasto</button><button class="btn btn-secondary btn-sm" onclick="moneyDocumentChoose(${index})" ${disabled}>Vincular a existente</button><button class="money-document-link" onclick="moneyDocumentStatus(${index},'archived')" ${disabled}>Archivar</button>` : doc.status === 'archived' ? `<button class="btn btn-secondary btn-sm" onclick="moneyDocumentStatus(${index},'pending')" ${disabled}>Volver a revisar</button>` : `<button class="btn btn-secondary btn-sm" onclick="moneyDocumentOpenRecord(${index})" ${s.busy ? 'disabled' : ''}>Ver movimiento</button>`}</div></article>`;
}
function moneyDocumentsFilter(status) {
  const s = md(); if (s.loading || s.busy || !['pending', 'all', 'linked', 'archived'].includes(status)) return;
  s.status = status; s.documents = []; s.total = 0; s.loaded = false; moneyDocumentsLoad();
}
async function moneyDocumentsRefresh() { if (!md().busy) await Promise.allSettled([moneyDocumentsLoad(), moneyDocumentsTelegramLoad()]); }
function moneyDocumentsAttach() { if (moneyDocumentWritable()) { moneyView('documents'); moneyDocumentsUploadModal(); } }
function moneyDocumentsUploadModal() {
  if (!moneyDocumentWritable() || md().busy) return;
  createModal('moneyDocumentUpload', 'Subir factura o justificante', `<div class="money-document-modal"><p>Se guardará en <strong>Por revisar</strong>. Los importes y el pago se completan después.</p><label class="money-document-upload"><strong>Selecciona el archivo</strong><input id="md_file" type="file" accept="application/pdf,image/jpeg,image/png"><small>PDF, JPG o PNG · hasta 10 MB · archivo privado</small></label><label>Nota opcional<textarea id="md_caption" class="form-textarea" maxlength="2000" placeholder="Ej. Material de oficina, pagado por Santiago"></textarea></label><p id="md_upload_error" class="money-error" role="alert"></p></div>`, '<button class="btn btn-secondary" onclick="closeModal(\'moneyDocumentUpload\')">Cancelar</button><button id="md_upload_save" class="btn btn-primary" onclick="moneyDocumentsUpload()">Guardar en Por revisar</button>');
}
async function moneyDocumentsUpload() {
  const s = md(); if (s.busy || !moneyDocumentWritable()) return;
  const file = document.getElementById('md_file')?.files[0], error = document.getElementById('md_upload_error'), button = document.getElementById('md_upload_save');
  if (error) error.textContent = '';
  try { if (!file) throw new Error('Selecciona un PDF, JPG o PNG.'); moneyValidateFile(file); }
  catch (e) { if (error) error.textContent = e.message; return; }
  s.busy = true; if (button) button.disabled = true; moneyDocumentsPaint();
  try {
    const form = new FormData(); form.append('file', file); form.append('caption', document.getElementById('md_caption')?.value || '');
    const response = await fetch('/api/finance/documents', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('vocai_token') }, body: form });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.document) throw new Error(result?.error || 'No se pudo confirmar la subida. Puedes reintentar; el mismo archivo no se duplica.');
    s.status = result.document.status; closeModal('moneyDocumentUpload');
    toast(result.duplicate ? 'Este archivo ya estaba en la bandeja. Se conserva el original.' : 'Documento recibido. Queda por revisar.', 'success');
    await moneyDocumentsLoad();
  } catch (e) { if (error) error.textContent = moneyDocumentError(e); s.error = moneyDocumentError(e); }
  finally { s.busy = false; if (button) button.disabled = false; moneyDocumentsPaint(); }
}
function moneyDocumentSafeURL(value, telegram = false) {
  let url; try { url = new URL(value); } catch { throw new Error('No se pudo abrir el enlace. Vuelve a intentarlo.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (telegram && url.hostname !== 't.me')) throw new Error('No se pudo abrir el enlace. Vuelve a intentarlo.');
  return url.href;
}
async function moneyDocumentViewAt(index) { const doc = md().documents[index]; if (doc) await moneyDocumentView(doc.id); }
async function moneyDocumentView(id) {
  try {
    const result = await API.get('/finance/documents/' + encodeURIComponent(id) + '/file'), url = moneyDocumentSafeURL(result.url);
    createModal('moneyDocumentFile', 'Abrir documento privado', `<div class="money-document-modal"><p>El enlace caduca por seguridad. Si caduca, vuelve a abrir el archivo desde Documentos.</p><a class="btn btn-primary money-document-private-link" href="${moneyEsc(url)}" target="_blank" rel="noopener noreferrer">Abrir archivo</a></div>`, '<button class="btn btn-secondary" onclick="closeModal(\'moneyDocumentFile\')">Cerrar</button>');
  } catch (e) { md().error = moneyDocumentError(e); moneyDocumentsPaint(); toast(md().error, 'error'); }
}
function moneyDocumentSourceHTML(doc) {
  return `<div class="money-document-note money-document-source"><span><strong>Documento recibido</strong><br>${moneyEsc(doc.name)}<br>Completa los datos. Quedará vinculado al guardar.</span><button class="btn btn-secondary btn-sm" onclick="moneyDocumentView(moneyState.form.document.id)">Ver archivo</button></div>`;
}
async function moneyDocumentCreate(index) {
  const s = md(), item = s.documents[index]; if (!item || item.status !== 'pending' || s.busy || !moneyDocumentWritable()) return;
  const priorForm = moneyState.form;
  s.busy = true; s.error = ''; moneyDocumentsPaint();
  try {
    const [result, finance] = await Promise.all([API.get('/finance/documents/' + encodeURIComponent(item.id)), API.get('/finance')]);
    if (moneyState.view !== 'documents' || moneyState.form !== priorForm) return;
    const doc = moneyDocumentResult(result); moneyState.data = finance;
    if (doc.status !== 'pending') throw new Error('El documento ya cambió de estado. Actualiza la bandeja.');
    if (!doc.draft_record_id) throw new Error('No se pudo preparar el movimiento. Actualiza la bandeja antes de continuar.');
    const prior = finance.records.find(r => r.id === doc.draft_record_id);
    if (prior) {
      if (prior.voided) throw new Error('El movimiento creado para este documento fue anulado. Vincula el documento a un movimiento existente.');
      s.linkDocument = doc; s.records = [prior];
      createModal('moneyDocumentChoose', 'Continuar con el movimiento guardado', `<div class="money-document-modal"><p>Este documento ya tiene un movimiento creado. Completa la vinculación para conservarlo sin duplicar.</p><p class="money-document-name">${moneyEsc(prior.data.title)} · ${moneyEuro(prior.data.amount)}</p><p id="md_link_error" class="money-error" role="alert"></p></div>`, '<button class="btn btn-secondary" onclick="closeModal(\'moneyDocumentChoose\')">Cancelar</button><button id="md_link_save" class="btn btn-primary" onclick="moneyDocumentLink(0)">Completar vinculación</button>');
    } else moneyForm('expense', null, false, null, doc);
  } catch (e) { s.error = moneyDocumentError(e); }
  finally { s.busy = false; moneyDocumentsPaint(); }
}
async function moneyDocumentLinkSaved(form) {
  if (!form.document || form.documentLinked) return;
  try {
    const result = await API.post('/finance/documents/' + encodeURIComponent(form.document.id) + '/link', { version: form.document.version, recordId: form.id });
    form.document = moneyDocumentResult(result); form.documentLinked = true;
  } catch (e) { throw new Error('Movimiento guardado; falta vincular el documento. Pulsa Guardar para reintentar sin duplicarlo. ' + moneyDocumentError(e)); }
}
async function moneyDocumentSaveRecord(form, data) {
  const result = await API.post('/finance/documents/' + encodeURIComponent(form.document.id) + '/record', { version: form.document.version, data });
  form.document = moneyDocumentResult(result); form.documentLinked = true;
  return result.record;
}
async function moneyDocumentChoose(index) {
  const s = md(), item = s.documents[index]; if (!item || item.status !== 'pending' || s.busy || !moneyDocumentWritable()) return;
  const priorForm = moneyState.form;
  s.busy = true; s.error = ''; moneyDocumentsPaint();
  try {
    const [result, finance] = await Promise.all([API.get('/finance/documents/' + encodeURIComponent(item.id)), API.get('/finance')]);
    if (moneyState.view !== 'documents' || moneyState.form !== priorForm) return;
    s.linkDocument = moneyDocumentResult(result);
    if (s.linkDocument.status !== 'pending') throw new Error('El documento ya cambió de estado. Actualiza la bandeja.');
    moneyState.data = finance;
    s.records = finance.records.filter(r => !r.voided && ['income', 'expense'].includes(r.data.kind) && !['draft', 'duplicate', 'review'].includes(r.data.history?.status));
    createModal('moneyDocumentChoose', 'Vincular a un movimiento existente', `<div class="money-document-modal"><p class="money-document-name">${moneyEsc(item.name)}</p><p>No se creará otro gasto ni se modificará su pago.</p><input id="md_search" class="form-input" type="search" placeholder="Buscar concepto, proveedor o importe…" oninput="moneyDocumentChoices()"><div id="md_choices" class="money-document-choices"></div><p id="md_link_error" class="money-error" role="alert"></p></div>`, '<button class="btn btn-secondary" onclick="closeModal(\'moneyDocumentChoose\')">Cerrar</button>');
    moneyDocumentChoices();
  } catch (e) { s.error = moneyDocumentError(e); }
  finally { s.busy = false; moneyDocumentsPaint(); }
}
function moneyDocumentChoices() {
  const s = md(), query = (document.getElementById('md_search')?.value || '').toLocaleLowerCase('es'), target = document.getElementById('md_choices'); if (!target) return;
  const items = s.records.map((record, index) => ({ record, index })).filter(({ record: r }) => [r.data.title, r.data.party, r.data.number, moneyEuro(r.data.amount), (r.data.amount / 100).toFixed(2), (r.data.amount / 100).toFixed(2).replace('.', ',')].join(' ').toLocaleLowerCase('es').includes(query));
  target.innerHTML = items.slice(0, 60).map(({ record: r, index }) => `<button class="money-document-choice" onclick="moneyDocumentLink(${index})" ${s.linking ? 'disabled' : ''}><span><strong>${moneyEsc(r.data.title)}</strong><small>${moneyEsc(r.data.party || '')} · ${moneyEsc(r.data.date)} · ${r.data.kind === 'income' ? 'Ingreso' : 'Gasto'}</small></span><b>${moneyEuro(r.data.amount)} →</b></button>`).join('') || '<p class="money-document-muted">No hay movimientos con esta búsqueda.</p>';
  if (items.length > 60) target.innerHTML += '<p class="money-document-muted">Hay más resultados. Escribe un concepto o importe para afinar la búsqueda.</p>';
}
async function moneyDocumentLink(index) {
  const s = md(), doc = s.linkDocument, record = s.records[index]; if (!doc || !record || s.busy || s.linking || !moneyDocumentWritable()) return;
  s.busy = true; s.linking = true; moneyDocumentChoices(); moneyDocumentsPaint();
  const error = document.getElementById('md_link_error'), button = document.getElementById('md_link_save'); if (button) button.disabled = true;
  try {
    moneyDocumentResult(await API.post('/finance/documents/' + encodeURIComponent(doc.id) + '/link', { version: doc.version, recordId: record.id }));
    closeModal('moneyDocumentChoose'); toast('Documento vinculado. El movimiento y sus pagos se conservan.', 'success'); await moneyDocumentsLoad();
  } catch (e) { if (error) error.textContent = moneyDocumentError(e); }
  finally { s.busy = false; s.linking = false; if (button) button.disabled = false; moneyDocumentChoices(); moneyDocumentsPaint(); }
}
async function moneyDocumentStatus(index, status) {
  const s = md(), doc = s.documents[index]; if (!doc || s.busy || !moneyDocumentWritable() || !['pending', 'archived'].includes(status)) return;
  s.busy = true; s.error = ''; moneyDocumentsPaint();
  try { moneyDocumentResult(await API.put('/finance/documents/' + encodeURIComponent(doc.id), { version: doc.version, status })); await moneyDocumentsLoad(); }
  catch (e) { s.error = moneyDocumentError(e); }
  finally { s.busy = false; moneyDocumentsPaint(); }
}
async function moneyDocumentOpenRecord(index) {
  const s = md(), doc = s.documents[index]; if (!doc?.record_id || s.busy) return;
  const priorForm = moneyState.form;
  s.busy = true; s.error = ''; moneyDocumentsPaint();
  try { const finance = await API.get('/finance'); if (moneyState.view !== 'documents' || moneyState.form !== priorForm) return; const record = finance.records.find(r => r.id === doc.record_id); if (!record) throw new Error('No se pudo encontrar el movimiento vinculado.'); moneyState.data = finance; if (record.voided) moneyReviewDetails(record); else moneyForm(record.data.kind, record.id); }
  catch (e) { s.error = moneyDocumentError(e); }
  finally { s.busy = false; moneyDocumentsPaint(); }
}
function moneyDocumentsTelegramHTML() {
  const s = md(), t = s.telegram, connected = !!t?.pairing;
  return `<section class="money-document-telegram"><div><h4>Enviar por Telegram</h4><p>${s.telegramError ? moneyEsc(s.telegramError) : !t ? 'Comprobando conexión…' : !t.configured ? 'Telegram todavía no está configurado. Mientras tanto, puedes subir tus archivos aquí.' : connected ? 'Tu Telegram está conectado. Envía el PDF o la foto al bot y aparecerá en Por revisar.' : 'Conecta tu Telegram para enviar facturas y fotos directamente a esta bandeja.'}</p></div><div class="money-document-actions">${t?.configured ? `<button class="btn btn-secondary" onclick="${connected ? 'moneyDocumentsDisconnect()' : 'moneyDocumentsConnect()'}" ${s.busy || !moneyDocumentWritable() ? 'disabled' : ''}>${connected ? 'Desconectar mi Telegram' : 'Conectar mi Telegram'}</button>${!connected ? '<button class="money-document-link" onclick="moneyDocumentsTelegramLoad()">Ya lo conecté · comprobar</button>' : ''}` : s.telegramError ? '<button class="btn btn-secondary" onclick="moneyDocumentsTelegramLoad()">Reintentar</button>' : ''}</div></section>`;
}
async function moneyDocumentsConnect() {
  const s = md(); if (s.busy || !moneyDocumentWritable()) return;
  s.busy = true; s.telegramError = ''; moneyDocumentsPaint();
  try {
    const result = await API.post('/finance/documents/telegram/code', {}), url = moneyDocumentSafeURL(result.url, true);
    const expiration = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(result.expiresAt));
    createModal('moneyDocumentTelegram', 'Conectar tu Telegram', `<div class="money-document-modal"><p>Abre el bot y pulsa <strong>Iniciar</strong>. Este enlace conecta tu cuenta de Telegram con VOCAI.</p><a class="btn btn-primary money-document-private-link" href="${moneyEsc(url)}" target="_blank" rel="noopener noreferrer">Abrir Telegram</a><p class="money-document-muted">Enlace de un solo uso, válido hasta las ${moneyEsc(expiration)}. No lo compartas.</p></div>`, '<button class="btn btn-secondary" onclick="closeModal(\'moneyDocumentTelegram\')">Cerrar</button><button class="btn btn-primary" onclick="moneyDocumentsTelegramCheck()">Ya pulsé Iniciar</button>');
  } catch (e) { s.telegramError = moneyDocumentError(e); }
  finally { s.busy = false; moneyDocumentsPaint(); }
}
async function moneyDocumentsTelegramCheck() { await moneyDocumentsTelegramLoad(); if (md().telegramError) return toast(md().telegramError, 'error'); if (md().telegram?.pairing) { closeModal('moneyDocumentTelegram'); toast('Telegram conectado.', 'success'); } else toast('Aún no se confirmó la conexión. Pulsa Iniciar en el bot y vuelve a comprobar.', 'info'); }
async function moneyDocumentsDisconnect() {
  const s = md(); if (s.busy || !moneyDocumentWritable() || !confirm('¿Desconectar tu Telegram? Los documentos recibidos se conservan.')) return;
  s.busy = true; s.telegramError = ''; moneyDocumentsPaint();
  try { await API.del('/finance/documents/telegram'); await moneyDocumentsTelegramLoad(); toast('Tu Telegram está desconectado. Los documentos se conservan.', 'success'); }
  catch (e) { s.telegramError = moneyDocumentError(e); }
  finally { s.busy = false; moneyDocumentsPaint(); }
}
