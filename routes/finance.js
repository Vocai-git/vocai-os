'use strict';
const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const finance = require('../lib/finance');
const router = express.Router();
const BUCKET = 'finance-private';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
function id(value) { if (!finance.UUID.test(value || '')) fail('Identificador no válido'); return value; }
async function setting() {
  const { data, error } = await supabase.from('finance_settings').select('baseline').eq('id', true).single();
  if (error || !data) fail('La nueva sección está pendiente de activar. El histórico sigue disponible.', 503);
  return data.baseline;
}
async function all(table, columns = '*') {
  let rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(offset, offset + 999);
    if (error) fail('No se pudieron cargar los registros', 503);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
async function record(recordId) {
  const { data, error } = await supabase.from('finance_records').select('*').eq('id', id(recordId)).single();
  if (error || !data) fail('Registro no encontrado', 404);
  return data;
}
router.use(auth);
router.get('/status', (req, res) => res.json({ enabled: process.env.FINANCE_V2 === 'true' }));
router.use((req, res, next) => {
  if (process.env.FINANCE_V2 !== 'true') return res.status(503).json({ error: 'La nueva sección está pendiente de activar' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'Configuración privada de Finanzas incompleta' });
  next();
});
router.get('/', wrap(async (req, res) => {
  const [baseline, records, files] = await Promise.all([setting(), all('finance_records'), all('finance_files', 'id,record_id,name,mime,bytes')]);
  res.json({ baseline, records, files, summary: finance.summarize(baseline, records) });
}));
router.get('/archive', wrap(async (req, res) => {
  const [expenses, invoices] = await Promise.all([all('expenses'), all('invoices')]);
  res.json({ expenses, invoices });
}));
router.post('/records', wrap(async (req, res) => {
  const recordId = id(req.body.id);
  const baseline = await setting();
  const body = finance.validate(req.body.data, baseline.cutoff);
  const row = { id: recordId, data: body, actor: req.user.email || req.user.id };
  const { data, error } = await supabase.from('finance_records').insert(row).select('*').single();
  if (error?.code === '23505') {
    const { data: existing } = await supabase.from('finance_records').select('*').eq('id', recordId).maybeSingle();
    if (!existing) fail('Ya existe una factura con ese proveedor o cliente y número. Revisa Movimientos antes de duplicarla.', 409);
    // Retry after a lost response is safe, but a reused id with new content is not.
    const same = require('util').isDeepStrictEqual(existing.data, body);
    if (!same) fail('Este identificador ya tiene otro registro. Recarga antes de continuar.', 409);
    return res.json(existing);
  }
  if (error) fail('No se pudo guardar el registro', 503);
  res.status(201).json(data);
}));
router.put('/records/:id', wrap(async (req, res) => {
  const existing = await record(req.params.id);
  if (existing.voided) fail('El registro está anulado');
  if (existing.included_in_opening) fail('Este pago ya está incluido en el cierre. Puedes adjuntar su factura o preparar el siguiente mes, pero no cambiar el saldo inicial desde aquí.', 409);
  const baseline = await setting();
  const body = finance.validate(req.body.data, baseline.cutoff);
  if (req.body.version === existing.version - 1 && require('util').isDeepStrictEqual(existing.data, body)) return res.json(existing);
  if (req.body.version !== existing.version) fail('Otra persona modificó este registro. Recarga para ver los cambios.', 409);
  // Changing the nature of an existing transaction hides accounting history.
  if (body.kind !== existing.data.kind) fail('Anula el registro y crea otro para cambiar el tipo');
  const { data, error } = await supabase.from('finance_records')
    .update({ data: body, version: existing.version + 1, actor: req.user.email || req.user.id, updated_at: new Date().toISOString() })
    .eq('id', existing.id).eq('version', existing.version).select('*').maybeSingle();
  if (error?.code === '23505') fail('Ya existe una factura con ese proveedor o cliente y número', 409);
  if (error) fail('No se pudo guardar el cambio', 503);
  if (!data) fail('Otra persona modificó el registro. Recarga antes de continuar.', 409);
  res.json(data);
}));
router.post('/records/:id/void', wrap(async (req, res) => {
  const existing = await record(req.params.id);
  if (existing.included_in_opening) fail('Este pago forma parte del cierre revisado. Su corrección requiere revisar el cierre.', 409);
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5 || reason.length > 500) fail('Indica por qué se anula el registro');
  if (req.body.version !== existing.version || existing.voided) fail('El registro cambió. Recarga antes de continuar.', 409);
  const { data, error } = await supabase.from('finance_records').update({
    voided: true, version: existing.version + 1, actor: req.user.email || req.user.id,
    data: { ...existing.data, void_reason: reason }, updated_at: new Date().toISOString(),
  }).eq('id', existing.id).eq('version', existing.version).select('*').maybeSingle();
  if (error) fail('No se pudo anular el registro', 503);
  if (!data) fail('Otra persona modificó el registro', 409);
  res.json(data);
}));
router.post('/records/:id/next', wrap(async (req, res) => {
  const existing = await record(req.params.id);
  if (existing.voided) fail('El registro está anulado');
  const baseline = await setting();
  const body = finance.validate(finance.nextDocument(existing.data), baseline.cutoff);
  const origin_key = `next:${existing.id}:${body.date}`;
  const { data, error } = await supabase.from('finance_records').insert({
    id: randomUUID(), data: body, origin_key, actor: req.user.email || req.user.id,
  }).select('*').single();
  if (error?.code === '23505') {
    const { data: previous, error: pe } = await supabase.from('finance_records').select('*').eq('origin_key', origin_key).single();
    if (pe) fail('No se pudo recuperar la previsión', 503);
    return res.json(previous);
  }
  if (error) fail('No se pudo preparar el próximo mes', 503);
  res.status(201).json(data);
}));
router.post('/records/:id/files', upload.single('file'), wrap(async (req, res) => {
  const doc = await record(req.params.id);
  if (doc.voided) fail('No se puede adjuntar a un registro anulado');
  if (!req.file?.buffer?.length) fail('Selecciona una factura PDF, JPG o PNG');
  const b = req.file.buffer;
  const mime = b.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf'
    : b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg'
    : b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : null;
  if (!mime) fail('Solo se admiten PDF, JPG o PNG reales');
  const fileId = randomUUID();
  const path = `${doc.id}/${fileId}.${mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg'}`;
  const { error: ue } = await supabase.storage.from(BUCKET).upload(path, b, { contentType: mime, upsert: false });
  if (ue) fail('No se pudo guardar el adjunto. El registro sigue guardado; puedes reintentar.', 503);
  const { data, error } = await supabase.from('finance_files').insert({ id: fileId, record_id: doc.id, path,
    name: req.file.originalname.replace(/[\x00-\x1f]/g, '').slice(0, 180), mime, bytes: b.length, actor: req.user.email || req.user.id,
  }).select('id,record_id,name,mime,bytes').single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    fail('No se pudo vincular el adjunto. El registro sigue guardado.', 503);
  }
  res.status(201).json(data);
}));
router.get('/files/:id', wrap(async (req, res) => {
  const { data, error } = await supabase.from('finance_files').select('path').eq('id', id(req.params.id)).single();
  if (error || !data) fail('Adjunto no encontrado', 404);
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(data.path, 60, { download: true });
  if (signed.error) fail('No se pudo abrir el adjunto', 503);
  res.json({ url: signed.data.signedUrl });
}));
router.get('/records/:id/audit', wrap(async (req, res) => {
  await record(req.params.id);
  const { data, error } = await supabase.from('finance_audit').select('actor,at,before_row,after_row').eq('record_id', req.params.id).order('id', { ascending: false }).limit(100);
  if (error) fail('No se pudo cargar el historial', 503);
  res.json(data);
}));
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const uploadError = err instanceof multer.MulterError;
  res.status(uploadError ? 400 : err.status || 500).json({ error: uploadError ? 'Adjunta un solo archivo de hasta 10 MB' : err.status ? err.message : 'No se pudo completar la operación' });
});
module.exports = router;
