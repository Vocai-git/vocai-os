const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { logActivity } = require('./activity');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const BUCKET = 'adn-visual';

// Helpers ----------------------------------------------------

const extFromMime = (mime) => {
  const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  return map[mime] || 'bin';
};

const publicUrl = (path) =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

// Extrae el path interno del bucket desde una URL pública
const pathFromPublicUrl = (url) => {
  if (!url) return null;
  const marker = `/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.substring(i + marker.length);
};

// ============================================================
// LISTA de clientes con indicador de ADN cargado
// ============================================================
router.get('/', auth, async (req, res) => {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, nombre, empresa, tipo_servicio')
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });

  const { data: adns } = await supabase
    .from('clientes_adn_visual')
    .select('cliente_id, logo_url, rubro');
  const adnMap = new Map((adns || []).map(a => [a.cliente_id, a]));

  const list = clients.map(c => ({
    ...c,
    tiene_adn: adnMap.has(c.id),
    logo_url: adnMap.get(c.id)?.logo_url || null,
    rubro: adnMap.get(c.id)?.rubro || null
  }));
  res.json(list);
});

// ============================================================
// BUNDLE completo del ADN de un cliente
// ============================================================
router.get('/:clientId', auth, async (req, res) => {
  const { clientId } = req.params;

  const [cliente, adn, pilares, referencias, tipos] = await Promise.all([
    supabase.from('clients').select('id, nombre, empresa').eq('id', clientId).single(),
    supabase.from('clientes_adn_visual').select('*').eq('cliente_id', clientId).maybeSingle(),
    supabase.from('clientes_pilares').select('*').eq('cliente_id', clientId).order('orden'),
    supabase.from('clientes_referencias').select('*').eq('cliente_id', clientId).order('orden'),
    supabase.from('clientes_tipos_diseno').select('*').eq('cliente_id', clientId).order('orden')
  ]);

  if (cliente.error) return res.status(404).json({ error: 'Cliente no encontrado' });

  res.json({
    cliente: cliente.data,
    adn: adn.data || null,
    pilares: pilares.data || [],
    referencias: referencias.data || [],
    tipos_diseno: tipos.data || []
  });
});

// ============================================================
// UPSERT info básica del ADN (paleta, tono, rubro, publico)
// ============================================================
router.put('/:clientId', auth, async (req, res) => {
  const { clientId } = req.params;
  const {
    paleta,
    paleta_hex_estructurada,
    tono,
    rubro,
    publico_objetivo,
    tipografias_primaria,
    tipografias_secundaria,
    formato_export,
    reglas_globales,
    errores_frecuentes
  } = req.body;

  const payload = { cliente_id: clientId };
  if (paleta !== undefined) payload.paleta = paleta || [];
  if (paleta_hex_estructurada !== undefined) payload.paleta_hex_estructurada = paleta_hex_estructurada;
  if (tono !== undefined) payload.tono = tono;
  if (rubro !== undefined) payload.rubro = rubro;
  if (publico_objetivo !== undefined) payload.publico_objetivo = publico_objetivo;
  if (tipografias_primaria !== undefined) payload.tipografias_primaria = tipografias_primaria;
  if (tipografias_secundaria !== undefined) payload.tipografias_secundaria = tipografias_secundaria;
  if (formato_export !== undefined) payload.formato_export = formato_export;
  if (reglas_globales !== undefined) payload.reglas_globales = reglas_globales;
  if (errores_frecuentes !== undefined) payload.errores_frecuentes = errores_frecuentes;

  const { data, error } = await supabase
    .from('clientes_adn_visual')
    .upsert(payload, { onConflict: 'cliente_id' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'editar', 'adn', `ADN actualizado para cliente ${clientId}`);
  res.json(data);
});

// ============================================================
// LOGO — subir / reemplazar
// ============================================================
router.post('/:clientId/logo', auth, upload.single('file'), async (req, res) => {
  const { clientId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  // Borrar logo anterior si existe
  const { data: prev } = await supabase
    .from('clientes_adn_visual')
    .select('logo_url')
    .eq('cliente_id', clientId)
    .maybeSingle();
  const prevPath = pathFromPublicUrl(prev?.logo_url);
  if (prevPath) {
    await supabase.storage.from(BUCKET).remove([prevPath]);
  }

  const ext = extFromMime(req.file.mimetype);
  const path = `${clientId}/logo-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (upErr) return res.status(500).json({ error: upErr.message });

  const url = publicUrl(path);
  const { data, error } = await supabase
    .from('clientes_adn_visual')
    .upsert({ cliente_id: clientId, logo_url: url }, { onConflict: 'cliente_id' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ logo_url: url, adn: data });
});

// ============================================================
// REFERENCIAS — subir (una o varias), borrar
// ============================================================
router.post('/:clientId/referencias', auth, upload.array('files', 10), async (req, res) => {
  const { clientId } = req.params;
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'Archivos requeridos' });

  const results = [];
  for (const f of req.files) {
    const ext = extFromMime(f.mimetype);
    const path = `${clientId}/referencias/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, f.buffer, { contentType: f.mimetype });
    if (upErr) return res.status(500).json({ error: upErr.message });

    const url = publicUrl(path);
    const { data, error } = await supabase
      .from('clientes_referencias')
      .insert({ cliente_id: clientId, imagen_url: url })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    results.push(data);
  }
  res.json(results);
});

router.delete('/referencias/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { data: ref, error: getErr } = await supabase
    .from('clientes_referencias')
    .select('imagen_url')
    .eq('id', id)
    .single();
  if (getErr) return res.status(404).json({ error: 'Referencia no encontrada' });

  const path = pathFromPublicUrl(ref.imagen_url);
  if (path) await supabase.storage.from(BUCKET).remove([path]);

  const { error } = await supabase.from('clientes_referencias').delete().eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ============================================================
// PILARES — crear, editar, borrar, reordenar
// ============================================================
router.post('/:clientId/pilares', auth, async (req, res) => {
  const { clientId } = req.params;
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre requerido' });

  const { data: existentes } = await supabase
    .from('clientes_pilares')
    .select('orden')
    .eq('cliente_id', clientId)
    .order('orden', { ascending: false })
    .limit(1);
  const orden = existentes && existentes[0] ? existentes[0].orden + 1 : 0;

  const { data, error } = await supabase
    .from('clientes_pilares')
    .insert({ cliente_id: clientId, nombre, descripcion, orden })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/pilares/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion } = req.body;
  const { data, error } = await supabase
    .from('clientes_pilares')
    .update({ nombre, descripcion })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/pilares/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('clientes_pilares').delete().eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

router.put('/:clientId/pilares/orden', auth, async (req, res) => {
  const { ids } = req.body; // array ordenado de pilar ids
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids requerido (array)' });

  for (let i = 0; i < ids.length; i++) {
    await supabase.from('clientes_pilares').update({ orden: i }).eq('id', ids[i]);
  }
  res.json({ ok: true });
});

// ============================================================
// TIPOS DE DISEÑO — crear, editar, borrar, reordenar
// ============================================================
const TIPO_CAMPOS = [
  'nombre', 'descripcion_corta', 'referencias_esteticas',
  'sensacion', 'adn_visual', 'prompt_positivo', 'prompt_negativo',
  'posicion_logo'
];

router.post('/:clientId/tipos', auth, async (req, res) => {
  const { clientId } = req.params;
  const payload = { cliente_id: clientId };
  TIPO_CAMPOS.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });
  if (!payload.nombre) payload.nombre = 'Nuevo tipo';
  if (!payload.posicion_logo) payload.posicion_logo = 'nunca';

  const { data: existentes } = await supabase
    .from('clientes_tipos_diseno')
    .select('orden')
    .eq('cliente_id', clientId)
    .order('orden', { ascending: false })
    .limit(1);
  payload.orden = existentes && existentes[0] ? existentes[0].orden + 1 : 0;

  const { data, error } = await supabase
    .from('clientes_tipos_diseno')
    .insert(payload)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/tipos/:id', auth, async (req, res) => {
  const { id } = req.params;
  const update = {};
  TIPO_CAMPOS.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  const { data, error } = await supabase
    .from('clientes_tipos_diseno')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/tipos/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('clientes_tipos_diseno').delete().eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

router.put('/:clientId/tipos/orden', auth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids requerido (array)' });
  for (let i = 0; i < ids.length; i++) {
    await supabase.from('clientes_tipos_diseno').update({ orden: i }).eq('id', ids[i]);
  }
  res.json({ ok: true });
});

module.exports = router;
