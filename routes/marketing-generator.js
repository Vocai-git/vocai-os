const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { generarTexto, generarPromptImagen, generarImagen, editarImagen } = require('../config/gemini');
const { componerPlacaHistoria, CATEGORIAS } = require('../config/placa');

const DIR = path.join(__dirname, '..', 'public', 'generador', 'muestras');
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 15 * 1024 * 1024 } });

const MODOS = ['ilustracion', 'realista', 'foto'];

// Metadata de una pieza: del .json hermano.
function meta(archivo) {
  const jsonPath = path.join(DIR, archivo.replace(/\.(png|jpe?g|webp)$/i, '.json'));
  if (fs.existsSync(jsonPath)) {
    try { return JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { /* ignora */ }
  }
  return { categoria: null, modo: '', idea: '', titulo: '', subtitulo: '', fuente: '' };
}
function fondoDe(archivo) {
  return path.join(DIR, archivo.replace(/\.png$/i, '-fondo.png'));
}

// GET /api/marketing-generator/muestras  → lista las placas (no los fondos crudos)
router.get('/muestras', auth, (req, res) => {
  try {
    if (!fs.existsSync(DIR)) return res.json([]);
    const files = fs.readdirSync(DIR)
      .filter(f => /^pieza-.*\.(png|jpe?g|webp)$/i.test(f) && !/-fondo\.png$/i.test(f))
      .map(f => {
        const st = fs.statSync(path.join(DIR, f));
        const m = meta(f);
        return {
          archivo: f, url: '/generador/muestras/' + f + '?t=' + Math.floor(st.mtimeMs),
          mtime: st.mtimeMs,
          categoria: m.categoria || null, modo: m.modo || '',
          idea: m.idea || '', titulo: m.titulo || '',
          subtitulo: m.subtitulo || '', fuente: m.fuente || '',
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing-generator/generar  → modo ilustración, realista o foto
router.post('/generar', auth,
  upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'referencia', maxCount: 1 }]),
  async (req, res) => {
  const idea = (req.body.idea || '').trim();
  const categoria = req.body.categoria;
  const modo = MODOS.includes(req.body.modo) ? req.body.modo : 'ilustracion';
  const fuente = (req.body.fuente || '').trim();
  const fotoFile = req.files && req.files.foto ? req.files.foto[0] : null;
  const refFile  = req.files && req.files.referencia ? req.files.referencia[0] : null;

  if (!idea) return res.status(400).json({ error: 'Escribí tu idea primero' });
  if (!CATEGORIAS[categoria]) return res.status(400).json({ error: 'Elegí una categoría' });
  if (modo === 'foto' && !fotoFile) return res.status(400).json({ error: 'Subí una foto' });

  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

    // 1 · Especialista de copy: idea → título + subtítulo
    const texto = await generarTexto(idea);

    // 2 · Imagen de fondo — se conserva para poder ajustarla después
    const stamp = Date.now();
    const archivo = `pieza-${categoria}-${stamp}.png`;
    const fondoPath = fondoDe(archivo);
    if (modo === 'foto') {
      fs.copyFileSync(fotoFile.path, fondoPath);
      if (req.body.retocar === 'true') {
        const retoque = (req.body.retoque || '').trim() ||
          'armonizá los colores y la iluminación con una estética de marca tecnológica navy y azul';
        await editarImagen(fondoPath, retoque, fondoPath);
      }
    } else {
      // Especialista de prompt: idea → prompt técnico dedicado para Nano Banana
      const estiloPorModo = { ilustracion: '3d', realista: 'realista' };
      const promptImagen = await generarPromptImagen(idea, estiloPorModo[modo] || '3d',
        refFile ? refFile.path : null);
      await generarImagen(promptImagen, fondoPath, '9:16', refFile ? refFile.path : null);
    }

    // 3 · Componer la placa final
    await componerPlacaHistoria({
      ilustracionPath: fondoPath,
      titulo: texto.titulo, subtitulo: texto.subtitulo,
      fuente, categoria,
      salidaPath: path.join(DIR, archivo),
    });

    // 4 · Metadata
    const m = {
      modo, categoria, idea, titulo: texto.titulo, subtitulo: texto.subtitulo,
      fuente, fecha: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(DIR, archivo.replace(/\.png$/, '.json')),
                     JSON.stringify(m, null, 2));

    res.json({ archivo, url: '/generador/muestras/' + archivo + '?t=' + stamp, ...m });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    [fotoFile, refFile].forEach(f => {
      if (f && fs.existsSync(f.path)) fs.unlink(f.path, () => {});
    });
  }
});

// POST /api/marketing-generator/ajustar  → refinar el fondo con una instrucción
router.post('/ajustar', auth, async (req, res) => {
  const archivo = req.body.archivo || '';
  const instruccion = (req.body.instruccion || '').trim();
  if (!/^pieza-[\w.-]+\.png$/i.test(archivo) || /-fondo\.png$/i.test(archivo)) {
    return res.status(400).json({ error: 'Placa inválida' });
  }
  if (!instruccion) return res.status(400).json({ error: 'Escribí qué querés ajustar' });
  const fondoPath = fondoDe(archivo);
  if (!fs.existsSync(fondoPath)) {
    return res.status(400).json({ error: 'No se encontró la imagen base de esta placa' });
  }
  try {
    const m = meta(archivo);
    // editar el fondo (sobreescribe) y recomponer la placa
    await editarImagen(fondoPath, instruccion, fondoPath);
    await componerPlacaHistoria({
      ilustracionPath: fondoPath,
      titulo: m.titulo, subtitulo: m.subtitulo,
      fuente: m.fuente, categoria: m.categoria,
      salidaPath: path.join(DIR, archivo),
    });
    res.json({ archivo, url: '/generador/muestras/' + archivo + '?t=' + Date.now(), ...m });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/marketing-generator/:archivo  → eliminar una pieza
router.delete('/:archivo', auth, (req, res) => {
  const f = req.params.archivo;
  if (!/^pieza-[\w.-]+\.(png|jpe?g|webp)$/i.test(f)) {
    return res.status(400).json({ error: 'Archivo inválido' });
  }
  try {
    [path.join(DIR, f), fondoDe(f),
     path.join(DIR, f.replace(/\.(png|jpe?g|webp)$/i, '.json'))]
      .forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
