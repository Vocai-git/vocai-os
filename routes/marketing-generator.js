const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { generarTexto, generarPromptImagen, generarImagen, editarImagen } = require('../config/gemini');
const { componerPlacaHistoria, componerPlacaFeed, CATEGORIAS } = require('../config/placa');
const storage = require('../config/storage');

// Dos formatos de placa suelta. Cada uno con su carpeta y composición.
//  · historia → 1080x1920 (9:16)
//  · feed     → 1080x1350 (4:5)
const FORMATOS = {
  historia: { prefijo: 'muestras', aspecto: '9:16', componer: componerPlacaHistoria },
  feed:     { prefijo: 'feed',     aspecto: '4:5',  componer: componerPlacaFeed },
};
function fmtDe(v) { return FORMATOS[v] ? v : 'historia'; }

// Carpeta de trabajo temporal de un formato (el durable es Storage).
function dirDe(formato) {
  return path.join(__dirname, '..', 'public', 'generador', FORMATOS[formato].prefijo);
}

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 15 * 1024 * 1024 } });
const MODOS = ['ilustracion', 'realista', 'foto'];

// Nombre del archivo de fondo a partir del nombre de la placa.
function fondoDe(archivo) {
  return archivo.replace(/\.png$/i, '-fondo.png');
}

// GET /api/marketing-generator/muestras?formato=historia|feed  → lista las placas
router.get('/muestras', auth, async (req, res) => {
  try {
    const formato = fmtDe(req.query.formato);
    const prefijo = FORMATOS[formato].prefijo;
    const entradas = await storage.listar(prefijo);
    const pngs = entradas.filter(e => e.id &&
      /^pieza-.*\.png$/i.test(e.name) && !/-fondo\.png$/i.test(e.name));
    const items = await Promise.all(pngs.map(async e => {
      const base = e.name.replace(/\.png$/i, '');
      const m = await storage.leerJson(`${prefijo}/${base}.json`) || {};
      const stamp = m.stamp || Date.parse(m.fecha || '') || 0;
      return {
        archivo: e.name,
        url: storage.urlPublica(`${prefijo}/${e.name}`) + '?t=' + stamp,
        mtime: stamp, formato,
        categoria: m.categoria || null, modo: m.modo || '',
        idea: m.idea || '', titulo: m.titulo || '',
        subtitulo: m.subtitulo || '', fuente: m.fuente || '',
      };
    }));
    items.sort((a, b) => b.mtime - a.mtime);
    res.json(items);
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
  const formato = fmtDe(req.body.formato);
  const fmt = FORMATOS[formato];
  const fotoFile = req.files && req.files.foto ? req.files.foto[0] : null;
  const refFile  = req.files && req.files.referencia ? req.files.referencia[0] : null;

  if (!idea) return res.status(400).json({ error: 'Escribí tu idea primero' });
  if (!CATEGORIAS[categoria]) return res.status(400).json({ error: 'Elegí una categoría' });
  if (modo === 'foto' && !fotoFile) return res.status(400).json({ error: 'Subí una foto' });

  try {
    const DIR = dirDe(formato);
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

    // 1 · Especialista de copy: idea → título + subtítulo
    const texto = await generarTexto(idea);

    // 2 · Imagen de fondo — se conserva para poder ajustarla después
    const stamp = Date.now();
    const archivo = `pieza-${categoria}-${stamp}.png`;
    const fondoNombre = fondoDe(archivo);
    const fondoPath = path.join(DIR, fondoNombre);
    const salidaPath = path.join(DIR, archivo);

    if (modo === 'foto') {
      fs.copyFileSync(fotoFile.path, fondoPath);
      if (req.body.retocar === 'true') {
        const retoque = (req.body.retoque || '').trim() ||
          'armonizá los colores y la iluminación con una estética de marca tecnológica navy y azul';
        await editarImagen(fondoPath, retoque, fondoPath, fmt.aspecto);
      }
    } else {
      // Especialista de prompt: idea → prompt técnico dedicado para Nano Banana
      const estiloPorModo = { ilustracion: '3d', realista: 'realista' };
      const promptImagen = await generarPromptImagen(idea, estiloPorModo[modo] || '3d',
        refFile ? refFile.path : null, fmt.aspecto);
      await generarImagen(promptImagen, fondoPath, fmt.aspecto, refFile ? refFile.path : null);
    }

    // 3 · Componer la placa final según el formato
    await fmt.componer({
      ilustracionPath: fondoPath,
      titulo: texto.titulo, subtitulo: texto.subtitulo,
      fuente, categoria,
      salidaPath,
    });

    // 4 · Metadata
    const m = {
      modo, categoria, idea, titulo: texto.titulo, subtitulo: texto.subtitulo,
      fuente, formato, stamp, fecha: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(DIR, archivo.replace(/\.png$/, '.json')),
                     JSON.stringify(m, null, 2));

    // 5 · Persistir en Supabase Storage (el disco de Railway es efímero)
    await Promise.all([
      storage.subir(salidaPath, `${fmt.prefijo}/${archivo}`),
      storage.subir(fondoPath, `${fmt.prefijo}/${fondoNombre}`),
      storage.subirJson(m, `${fmt.prefijo}/${archivo.replace(/\.png$/, '.json')}`),
    ]);

    res.json({
      archivo,
      url: storage.urlPublica(`${fmt.prefijo}/${archivo}`) + '?t=' + stamp,
      ...m,
    });
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
  const formato = fmtDe(req.body.formato);
  const fmt = FORMATOS[formato];
  if (!/^pieza-[\w.-]+\.png$/i.test(archivo) || /-fondo\.png$/i.test(archivo)) {
    return res.status(400).json({ error: 'Placa inválida' });
  }
  if (!instruccion) return res.status(400).json({ error: 'Escribí qué querés ajustar' });

  const DIR = dirDe(formato);
  const fondoNombre = fondoDe(archivo);
  const jsonNombre = archivo.replace(/\.png$/i, '.json');
  const fondoPath = path.join(DIR, fondoNombre);
  const salidaPath = path.join(DIR, archivo);

  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

    // recuperar el fondo: del disco o, si se redeployó, de Storage
    if (!fs.existsSync(fondoPath)) {
      const ok = await storage.bajar(`${fmt.prefijo}/${fondoNombre}`, fondoPath);
      if (!ok) return res.status(400).json({ error: 'No se encontró la imagen base de esta placa' });
    }
    const m = await storage.leerJson(`${fmt.prefijo}/${jsonNombre}`);
    if (!m) return res.status(400).json({ error: 'No se encontró la metadata de esta placa' });

    // editar el fondo (sobreescribe) y recomponer la placa
    await editarImagen(fondoPath, instruccion, fondoPath, fmt.aspecto);
    await fmt.componer({
      ilustracionPath: fondoPath,
      titulo: m.titulo, subtitulo: m.subtitulo,
      fuente: m.fuente, categoria: m.categoria,
      salidaPath,
    });

    m.stamp = Date.now();
    fs.writeFileSync(path.join(DIR, jsonNombre), JSON.stringify(m, null, 2));
    await Promise.all([
      storage.subir(salidaPath, `${fmt.prefijo}/${archivo}`),
      storage.subir(fondoPath, `${fmt.prefijo}/${fondoNombre}`),
      storage.subirJson(m, `${fmt.prefijo}/${jsonNombre}`),
    ]);

    res.json({
      archivo,
      url: storage.urlPublica(`${fmt.prefijo}/${archivo}`) + '?t=' + m.stamp,
      ...m,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/marketing-generator/:archivo?formato=historia|feed  → eliminar
router.delete('/:archivo', auth, async (req, res) => {
  const f = req.params.archivo;
  if (!/^pieza-[\w.-]+\.(png|jpe?g|webp)$/i.test(f)) {
    return res.status(400).json({ error: 'Archivo inválido' });
  }
  try {
    const formato = fmtDe(req.query.formato);
    const fmt = FORMATOS[formato];
    const DIR = dirDe(formato);
    const fondoNombre = fondoDe(f);
    const jsonNombre = f.replace(/\.(png|jpe?g|webp)$/i, '.json');
    [path.join(DIR, f), path.join(DIR, fondoNombre), path.join(DIR, jsonNombre)]
      .forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
    await storage.borrar([
      `${fmt.prefijo}/${f}`, `${fmt.prefijo}/${fondoNombre}`, `${fmt.prefijo}/${jsonNombre}`,
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
