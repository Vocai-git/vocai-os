const express = require('express');
const path = require('path');
const os = require('os');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { generarImagen } = require('../config/gemini');
const storage = require('../config/storage');

// Slug a partir del título: minúsculas, sin acentos, guiones.
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// GET /api/marketing-web/posts?estado=borrador|en_revision|publicado
router.get('/posts', auth, async (req, res) => {
  let q = supabase.from('blog_posts').select('*').order('updated_at', { ascending: false });
  if (req.query.estado) q = q.eq('estado', req.query.estado);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/marketing-web/posts/:id
router.get('/posts/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('blog_posts').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// POST /api/marketing-web/posts  → crear
router.post('/posts', auth, async (req, res) => {
  const b = req.body || {};
  const slug = (b.slug && b.slug.trim()) ? slugify(b.slug) : slugify(b.titulo);
  const row = {
    slug,
    titulo: b.titulo || 'Sin título',
    meta_description: b.meta_description || null,
    keyword: b.keyword || null,
    excerpt: b.excerpt || null,
    body_md: b.body_md || null,
    cover_image: b.cover_image || null,
    pilar: b.pilar || null,
    autor: b.autor || 'VOCAI',
    estado: b.estado || 'borrador',
  };
  const { data, error } = await supabase.from('blog_posts').insert([row]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/marketing-web/posts/:id  → editar
router.put('/posts/:id', auth, async (req, res) => {
  const b = { ...req.body };
  delete b.id; delete b.created_at;
  if (b.slug) b.slug = slugify(b.slug);
  b.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('blog_posts').update(b).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/marketing-web/posts/:id/publicar
router.post('/posts/:id/publicar', auth, async (req, res) => {
  const upd = { estado: 'publicado', publicado_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('blog_posts').update(upd).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/marketing-web/posts/:id/despublicar
router.post('/posts/:id/despublicar', auth, async (req, res) => {
  const upd = { estado: 'borrador', updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('blog_posts').update(upd).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Prompt de portada: escena editorial coherente con el tema del post,
// estilo de marca, SIN texto (el título lo pone la web encima/abajo).
function promptPortada(post) {
  const tema = [post.titulo, post.excerpt].filter(Boolean).join('. ');
  return `Editorial blog cover illustration for a Spanish tech company article about: "${tema}".
Modern premium 3D editorial style. Scene must match the article topic literally
(if it is about AI/automation/software: digital scenes, screens, interfaces, devices;
if it is about a recording studio: microphones, cameras, studio lights; never change domain).
Deep navy blue background (#141d35), electric blue (#2979FF) and coral (#FF6B6B) accent
lighting, subtle tech atmosphere, cinematic soft light, high detail.
ABSOLUTELY NO text, no letters, no words, no logos, no watermarks anywhere in the image.
Clean 16:9 horizontal composition with clear focal point.`;
}

// POST /api/marketing-web/posts/:id/portada → generar imagen de portada
// con el motor del Generador (Nano Banana Pro) y guardarla en el post.
router.post('/posts/:id/portada', auth, async (req, res) => {
  try {
    const { data: post, error } = await supabase
      .from('blog_posts').select('*').eq('id', req.params.id).single();
    if (error || !post) return res.status(404).json({ error: 'Post no encontrado' });

    const archivo = `portada-${post.slug}-${Date.now()}.png`;
    const tmpPath = path.join(os.tmpdir(), archivo);
    await generarImagen(promptPortada(post), tmpPath, '16:9');
    await storage.subir(tmpPath, `blog/${archivo}`);
    const url = storage.urlPublica(`blog/${archivo}`);

    const { data: upd, error: e2 } = await supabase.from('blog_posts')
      .update({ cover_image: url, updated_at: new Date().toISOString() })
      .eq('id', post.id).select().single();
    if (e2) return res.status(400).json({ error: e2.message });
    res.json(upd);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/marketing-web/posts/:id
router.delete('/posts/:id', auth, async (req, res) => {
  const { error } = await supabase.from('blog_posts').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
