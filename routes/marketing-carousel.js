const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { generarCarrusel, generarImagen, generarCopy } = require('../config/gemini');
const { componerSlideCarrusel, CATEGORIAS } = require('../config/placa');
const storage = require('../config/storage');

// DIR es workspace temporal: el render compone acá y después se sube
// a Supabase Storage, que es el almacenamiento durable.
const DIR = path.join(__dirname, '..', 'public', 'generador', 'carruseles');
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 15 * 1024 * 1024 } });
const MODOS = ['ilustracion', 'realista'];
const estiloPorModo = { ilustracion: '3d', realista: 'realista' };

// Arma el objeto de respuesta de un carrusel a partir de su meta.
function carruselDTO(id, meta) {
  const t = meta.stamp || Date.now();
  const slides = (meta.slides || []).map((s, i) => ({
    indice: i + 1, tipo: s.tipo, layout: s.layout || '',
    titulo: s.titulo, cuerpo: s.cuerpo || s.subtitulo || '',
    archivo: `slide-${i + 1}.png`,
    url: storage.urlPublica(`carruseles/${id}/slide-${i + 1}.png`) + '?t=' + t,
  }));
  return {
    id, modo: meta.modo, categoria: meta.categoria, idea: meta.idea,
    fuente: meta.fuente || '', copy: meta.copy || '',
    fecha: meta.fecha, total: slides.length,
    portada: slides[0] ? slides[0].url : null, slides,
  };
}

// GET /api/marketing-carousel/carruseles  → lista de carruseles desde Storage
router.get('/carruseles', auth, async (req, res) => {
  try {
    const entradas = await storage.listar('carruseles');
    const carpetas = entradas.filter(e => !e.id && /^carrusel-[\w.-]+$/.test(e.name));
    const items = await Promise.all(carpetas.map(async e => {
      const meta = await storage.leerJson(`carruseles/${e.name}/meta.json`);
      return meta ? carruselDTO(e.name, meta) : null;
    }));
    res.json(items.filter(Boolean)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing-carousel/generar  → genera un carrusel completo
router.post('/generar', auth, upload.single('referencia'), async (req, res) => {
  const idea = (req.body.idea || '').trim();
  // Categoría opcional: si no es válida queda vacía ("Sin categoría").
  const categoria = CATEGORIAS[req.body.categoria] ? req.body.categoria : '';
  const modo = MODOS.includes(req.body.modo) ? req.body.modo : 'ilustracion';
  const fuente = (req.body.fuente || '').trim();
  const refFile = req.file || null;

  if (!idea) return res.status(400).json({ error: 'Escribí tu idea primero' });

  const stamp = Date.now();
  const id = `carrusel-${categoria || 'sincat'}-${stamp}`;
  const carpeta = path.join(DIR, id);

  try {
    fs.mkdirSync(carpeta, { recursive: true });

    // 1 · Especialistas: estructura de slides + copy del posteo
    const slides = await generarCarrusel(idea, estiloPorModo[modo] || '3d',
      refFile ? refFile.path : null);
    const copy = await generarCopy(idea);
    const total = slides.length;

    // 2 · Por cada slide: imagen de fondo (si el layout la lleva) + composición
    for (let i = 0; i < total; i++) {
      const s = slides[i];
      const slidePath = path.join(carpeta, `slide-${i + 1}.png`);
      let fondoPath = null;
      if (s.prompt_imagen) {
        fondoPath = path.join(carpeta, `slide-${i + 1}-fondo.png`);
        await generarImagen(s.prompt_imagen, fondoPath, '4:5',
          refFile ? refFile.path : null);
      }
      await componerSlideCarrusel({
        ilustracionPath: fondoPath,
        titulo: s.titulo, cuerpo: s.cuerpo, dato: s.dato,
        categoria, layout: s.layout, tipo: s.tipo, indice: i + 1, total,
        salidaPath: slidePath,
      });
    }

    // 3 · Metadata
    const meta = {
      id, modo, categoria, idea, fuente, copy, stamp,
      fecha: new Date().toISOString(),
      slides: slides.map(s => ({
        tipo: s.tipo, layout: s.layout, titulo: s.titulo,
        cuerpo: s.cuerpo, dato: s.dato, prompt_imagen: s.prompt_imagen,
      })),
    };
    fs.writeFileSync(path.join(carpeta, 'meta.json'), JSON.stringify(meta, null, 2));

    // 4 · Persistir toda la carpeta en Supabase Storage (disco de Railway efímero)
    await Promise.all(fs.readdirSync(carpeta).map(f =>
      storage.subir(path.join(carpeta, f), `carruseles/${id}/${f}`)));

    res.json(carruselDTO(id, meta));
  } catch (err) {
    // limpiar carpeta parcial si algo falló
    try { fs.rmSync(carpeta, { recursive: true, force: true }); } catch (e) { /* ignora */ }
    res.status(500).json({ error: err.message });
  } finally {
    if (refFile && fs.existsSync(refFile.path)) fs.unlink(refFile.path, () => {});
  }
});

// GET /api/marketing-carousel/uno/:id  → un carrusel por id
router.get('/uno/:id', auth, async (req, res) => {
  const id = req.params.id;
  if (!/^carrusel-[\w.-]+$/.test(id)) {
    return res.status(400).json({ error: 'Carrusel inválido' });
  }
  try {
    const meta = await storage.leerJson(`carruseles/${id}/meta.json`);
    if (!meta) return res.status(404).json({ error: 'No se encontró el carrusel' });
    res.json(carruselDTO(id, meta));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/marketing-carousel/:id  → eliminar un carrusel
router.delete('/:id', auth, async (req, res) => {
  const id = req.params.id;
  if (!/^carrusel-[\w.-]+$/.test(id)) {
    return res.status(400).json({ error: 'Carrusel inválido' });
  }
  try {
    const carpeta = path.join(DIR, id);
    if (fs.existsSync(carpeta)) fs.rmSync(carpeta, { recursive: true, force: true });
    await storage.borrarPrefijo(`carruseles/${id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
