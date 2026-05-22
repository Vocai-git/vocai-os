const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const { generarCarrusel, generarImagen } = require('../config/gemini');
const { componerSlideCarrusel, CATEGORIAS } = require('../config/placa');

const DIR = path.join(__dirname, '..', 'public', 'generador', 'carruseles');
const MODOS = ['ilustracion', 'realista'];
const estiloPorModo = { ilustracion: '3d', realista: 'realista' };

// Lee meta.json de una carpeta de carrusel.
function leerMeta(id) {
  const p = path.join(DIR, id, 'meta.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

// Arma el objeto de respuesta de un carrusel a partir de su meta.
function carruselDTO(id, meta) {
  const t = Date.now();
  const slides = (meta.slides || []).map((s, i) => ({
    indice: i + 1, tipo: s.tipo, layout: s.layout || '',
    titulo: s.titulo, cuerpo: s.cuerpo || s.subtitulo || '',
    archivo: `slide-${i + 1}.png`,
    url: `/generador/carruseles/${id}/slide-${i + 1}.png?t=${meta.stamp || t}`,
  }));
  return {
    id, modo: meta.modo, categoria: meta.categoria, idea: meta.idea,
    fuente: meta.fuente || '', fecha: meta.fecha, total: slides.length,
    portada: slides[0] ? slides[0].url : null, slides,
  };
}

// GET /api/marketing-carousel/carruseles  → lista de carruseles
router.get('/carruseles', auth, (req, res) => {
  try {
    if (!fs.existsSync(DIR)) return res.json([]);
    const items = fs.readdirSync(DIR)
      .filter(f => /^carrusel-[\w.-]+$/.test(f) &&
        fs.statSync(path.join(DIR, f)).isDirectory())
      .map(id => {
        const meta = leerMeta(id);
        return meta ? carruselDTO(id, meta) : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing-carousel/generar  → genera un carrusel completo
router.post('/generar', auth, async (req, res) => {
  const idea = (req.body.idea || '').trim();
  const categoria = req.body.categoria;
  const modo = MODOS.includes(req.body.modo) ? req.body.modo : 'ilustracion';
  const fuente = (req.body.fuente || '').trim();

  if (!idea) return res.status(400).json({ error: 'Escribí tu idea primero' });
  if (!CATEGORIAS[categoria]) return res.status(400).json({ error: 'Elegí una categoría' });

  const stamp = Date.now();
  const id = `carrusel-${categoria}-${stamp}`;
  const carpeta = path.join(DIR, id);

  try {
    fs.mkdirSync(carpeta, { recursive: true });

    // 1 · Especialista: idea → estructura de slides
    const slides = await generarCarrusel(idea, estiloPorModo[modo] || '3d');
    const total = slides.length;

    // 2 · Por cada slide: imagen de fondo (si el layout la lleva) + composición
    for (let i = 0; i < total; i++) {
      const s = slides[i];
      const slidePath = path.join(carpeta, `slide-${i + 1}.png`);
      let fondoPath = null;
      if (s.prompt_imagen) {
        fondoPath = path.join(carpeta, `slide-${i + 1}-fondo.png`);
        await generarImagen(s.prompt_imagen, fondoPath, '4:5');
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
      id, modo, categoria, idea, fuente, stamp,
      fecha: new Date().toISOString(),
      slides: slides.map(s => ({
        tipo: s.tipo, layout: s.layout, titulo: s.titulo,
        cuerpo: s.cuerpo, dato: s.dato, prompt_imagen: s.prompt_imagen,
      })),
    };
    fs.writeFileSync(path.join(carpeta, 'meta.json'), JSON.stringify(meta, null, 2));

    res.json(carruselDTO(id, meta));
  } catch (err) {
    // limpiar carpeta parcial si algo falló
    try { fs.rmSync(carpeta, { recursive: true, force: true }); } catch (e) { /* ignora */ }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing-carousel/uno/:id  → un carrusel por id
router.get('/uno/:id', auth, (req, res) => {
  const id = req.params.id;
  if (!/^carrusel-[\w.-]+$/.test(id)) {
    return res.status(400).json({ error: 'Carrusel inválido' });
  }
  const meta = leerMeta(id);
  if (!meta) return res.status(404).json({ error: 'No se encontró el carrusel' });
  res.json(carruselDTO(id, meta));
});

// DELETE /api/marketing-carousel/:id  → eliminar un carrusel
router.delete('/:id', auth, (req, res) => {
  const id = req.params.id;
  if (!/^carrusel-[\w.-]+$/.test(id)) {
    return res.status(400).json({ error: 'Carrusel inválido' });
  }
  try {
    const carpeta = path.join(DIR, id);
    if (fs.existsSync(carpeta)) fs.rmSync(carpeta, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
