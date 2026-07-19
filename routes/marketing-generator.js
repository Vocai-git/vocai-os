const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { generarTexto, generarCopy, generarPromptImagen, generarImagen, editarImagen, generarBlog } = require('../config/gemini');
const {
  componerPlacaHistoria, componerPlacaFeed, componerPlacaDirector,
  CATEGORIAS, DISENOS_HISTORIA,
} = require('../config/placa');
const {
  generarImagenOpenAI, editarImagenOpenAI, costeDesdeUsage,
} = require('../config/openai-image');
const storage = require('../config/storage');
const { supabase } = require('../config/supabase');

function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// POST /api/marketing-generator/blog → genera un borrador y lo guarda en blog_posts
router.post('/blog', auth, async (req, res) => {
  try {
    const { tema, keyword, pilar, angulo } = req.body || {};
    if (!tema || !tema.trim()) return res.status(400).json({ error: 'Falta el tema' });
    const post = await generarBlog(tema.trim(), { keyword, pilar, angulo });
    const row = {
      slug: slugify(post.slug || post.titulo) || ('post-' + Date.now()),
      titulo: post.titulo || tema.trim(),
      meta_description: post.meta_description || null,
      keyword: post.keyword || keyword || null,
      excerpt: post.excerpt || null,
      body_md: post.body_md || null,
      pilar: pilar || null,
      estado: 'borrador',
    };
    const { data, error } = await supabase.from('blog_posts').insert([row]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dos formatos de placa suelta. Cada uno con su carpeta y composición.
//  · historia → 1080x1920 (9:16)
//  · feed     → 1080x1350 (4:5)
const FORMATOS = {
  historia: {
    prefijo: 'muestras', aspecto: '9:16', componer: componerPlacaHistoria,
    directorSize: '1024x1824',
  },
  feed: {
    prefijo: 'feed', aspecto: '4:5', componer: componerPlacaFeed,
    directorSize: '1024x1280',
  },
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

function promptDirector(idea, formato) {
  const destino = formato === 'feed'
    ? 'un post vertical de Instagram 4:5'
    : 'una historia de Instagram 9:16';
  return `Creá el diseño completo y terminado de ${destino} a partir de este pedido del usuario:

${idea}

Actuá como un director creativo senior. Interpretá el pedido en lenguaje natural y resolvé concepto,
composición, jerarquía, fotografía o ilustración y tipografía como una única pieza premium. Si el usuario
da textos concretos, escribilos exactamente, en español y sin agregar frases no solicitadas. Priorizá impacto
visual, lectura inmediata en móvil y una composición cinematográfica contemporánea. Usá la identidad de VOCAI
con criterio: azul noche #141D35, azul eléctrico #2979FF, blanco y acentos coral #FF6B6B cuando aporten.
No dibujes logotipos, marcas de agua ni la palabra VOCAI: el sistema añadirá después el wordmark oficial.
Reservá una zona limpia y discreta en el centro inferior para ese wordmark. Evitá elementos importantes en los
bordes y respetá las zonas seguras de Instagram. Entregá solamente la placa visual final, sin mockup ni marco.`;
}

function promptAjusteDirector(instruccion, idea, formato) {
  const destino = formato === 'feed' ? '4:5' : '9:16';
  return `Editá la placa adjunta (${destino}) siguiendo exactamente esta nueva instrucción del usuario:

${instruccion}

La idea original era: ${idea || 'una pieza de VOCAI'}.
Conservá todo lo que el usuario no pidió cambiar: concepto, composición, textos, personajes, proporciones y
estilo. Si pide quitar un texto o elemento, eliminá también cualquier rastro. No inventes logotipos ni la palabra
VOCAI; mantené limpia la pequeña zona central inferior porque el sistema coloca allí el wordmark oficial.
Entregá solo la placa final editada, sin mockup ni explicaciones.`;
}

function costeTotal(costes) {
  return Number((costes || []).reduce((s, c) => s + Number(c.usdAprox || 0), 0).toFixed(4));
}

function registrarCoste(usage, formato, accion) {
  return {
    accion,
    fecha: new Date().toISOString(),
    ...costeDesdeUsage(usage, { formato, accion }),
  };
}

function interpretarAjusteLogo(instruccion, m) {
  const partes = String(instruccion || '').split(/\s*(?:,|;|\r?\n|\by\b)\s*/i).filter(Boolean);
  let escala = Number(m.logoEscala || 1);
  let visible = m.logoVisible !== false;
  const visuales = [];
  partes.forEach((parte) => {
    const hablaLogo = /\b(logo|wordmark)\b/i.test(parte);
    const soportado = /(achic|reduc|pequeñ|agrand|aument|quit|sac|elimin|sin\s+(?:el\s+)?logo|mostr|agreg|pon)/i.test(parte);
    if (!hablaLogo || !soportado) {
      visuales.push(parte);
      return;
    }
    const porcentaje = Number((parte.match(/(\d{1,3})\s*%/) || [])[1] || 0);
    if (/(quit|sac|elimin|sin\s+(?:el\s+)?logo)/i.test(parte)) visible = false;
    if (/(mostr|agreg|pon)/i.test(parte)) visible = true;
    if (/(achic|reduc|pequeñ)/i.test(parte)) escala *= 1 - (porcentaje || 20) / 100;
    if (/(agrand|aument)/i.test(parte)) escala *= 1 + (porcentaje || 20) / 100;
  });
  return {
    logoEscala: Number(Math.max(0.3, Math.min(2, escala)).toFixed(3)),
    logoVisible: visible,
    instruccionVisual: visuales.join('. ').trim(),
  };
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
        diseno: m.diseno || '', idea: m.idea || '', titulo: m.titulo || '',
        subtitulo: m.subtitulo || '', fuente: m.fuente || '',
        copy: m.copy || '',
        flujo: m.flujo || 'rapido',
        costeUsdAprox: Number(m.costeUsdAprox || 0),
        costes: m.costes || [],
      };
    }));
    items.sort((a, b) => b.mtime - a.mtime);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing-generator/director/generar → lienzo completo, sin plantilla fija.
router.post('/director/generar', auth, upload.single('referencia'), async (req, res) => {
  const idea = (req.body.idea || '').trim();
  const categoria = CATEGORIAS[req.body.categoria] ? req.body.categoria : '';
  const formato = fmtDe(req.body.formato);
  const fmt = FORMATOS[formato];
  const refFile = req.file || null;
  if (!idea) return res.status(400).json({ error: 'Escribí qué placa querés crear' });

  const DIR = dirDe(formato);
  const stamp = Date.now();
  const archivo = `pieza-director-${categoria || 'sincat'}-${stamp}.png`;
  const fondoNombre = fondoDe(archivo);
  const fondoPath = path.join(DIR, fondoNombre);
  const salidaPath = path.join(DIR, archivo);
  const jsonNombre = archivo.replace(/\.png$/i, '.json');

  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    const prompt = promptDirector(idea, formato);
    const resultado = refFile
      ? await editarImagenOpenAI({ imagePaths: [refFile.path], prompt, size: fmt.directorSize })
      : await generarImagenOpenAI({ prompt, size: fmt.directorSize });
    fs.writeFileSync(fondoPath, resultado.buffer);
    await componerPlacaDirector({ imagenPath: fondoPath, salidaPath, formato });

    const costes = [registrarCoste(resultado.usage, formato, refFile ? 'editar' : 'generar')];
    const m = {
      flujo: 'director', modo: 'director', categoria, idea, formato,
      titulo: '', subtitulo: '', fuente: '', copy: '', diseno: 'libre',
      logoEscala: 1, logoVisible: true,
      conversaciones: [{ rol: 'usuario', texto: idea, fecha: new Date().toISOString() }],
      costes, costeUsdAprox: costeTotal(costes),
      stamp, fecha: new Date().toISOString(),
    };
    await Promise.all([
      storage.subir(salidaPath, `${fmt.prefijo}/${archivo}`),
      storage.subir(fondoPath, `${fmt.prefijo}/${fondoNombre}`),
      storage.subirJson(m, `${fmt.prefijo}/${jsonNombre}`),
    ]);
    res.json({
      archivo,
      url: storage.urlPublica(`${fmt.prefijo}/${archivo}`) + '?t=' + stamp,
      ...m,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (refFile && fs.existsSync(refFile.path)) fs.unlink(refFile.path, () => {});
  }
});

// POST /api/marketing-generator/generar  → modo ilustración, realista o foto
router.post('/generar', auth,
  upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'referencia', maxCount: 1 }]),
  async (req, res) => {
  const idea = (req.body.idea || '').trim();
  // Categoría opcional: si no es válida queda vacía ("Sin categoría").
  const categoria = CATEGORIAS[req.body.categoria] ? req.body.categoria : '';
  const modo = MODOS.includes(req.body.modo) ? req.body.modo : 'ilustracion';
  const fuente = (req.body.fuente || '').trim();
  const formato = fmtDe(req.body.formato);
  // modoLibre: si está prendido, el especialista respeta la idea al pie (sin
  // filtrar contra la lista negra ni imponer fórmulas).
  const modoLibre = req.body.modoLibre === 'true';
  const fmt = FORMATOS[formato];
  const fotoFile = req.files && req.files.foto ? req.files.foto[0] : null;
  const refFile  = req.files && req.files.referencia ? req.files.referencia[0] : null;
  // Diseño de la placa (solo historias): clasico, brutal o aurora.
  // Aurora no usa imagen de fondo — se saltea Nano Banana (no gasta crédito).
  const diseno = (formato === 'historia' && DISENOS_HISTORIA.includes(req.body.diseno))
    ? req.body.diseno : 'clasico';
  const sinImagen = diseno === 'aurora';

  if (!idea) return res.status(400).json({ error: 'Escribí tu idea primero' });
  if (modo === 'foto' && !fotoFile && !sinImagen) return res.status(400).json({ error: 'Subí una foto' });

  try {
    const DIR = dirDe(formato);
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

    // 1 · Especialistas de texto: título/subtítulo y, en feed, el copy del posteo.
    //     La imagen de referencia (si la hay) se pasa también para que puedan
    //     leerla cuando la idea hace referencia a ella ("esa frase", etc.).
    const refPath = refFile ? refFile.path : null;
    const texto = await generarTexto(idea, categoria, modoLibre, refPath);
    const copy = formato === 'feed' ? await generarCopy(idea, modoLibre, refPath) : '';

    // 2 · Imagen de fondo — se conserva para poder ajustarla después
    const stamp = Date.now();
    const archivo = `pieza-${categoria || 'sincat'}-${stamp}.png`;
    const fondoNombre = fondoDe(archivo);
    const fondoPath = path.join(DIR, fondoNombre);
    const salidaPath = path.join(DIR, archivo);

    if (sinImagen) {
      // Aurora: el diseño ES el fondo (gradient mesh de marca) — no hay imagen.
    } else if (modo === 'foto') {
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
      ilustracionPath: sinImagen ? null : fondoPath,
      titulo: texto.titulo, subtitulo: texto.subtitulo,
      fuente, categoria,
      salidaPath, diseno,
    });

    // 4 · Metadata
    const m = {
      modo: sinImagen ? 'aurora' : modo, categoria, idea,
      titulo: texto.titulo, subtitulo: texto.subtitulo,
      fuente, copy, formato, diseno, stamp, fecha: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(DIR, archivo.replace(/\.png$/, '.json')),
                     JSON.stringify(m, null, 2));

    // 5 · Persistir en Supabase Storage (el disco de Railway es efímero)
    const subidas = [
      storage.subir(salidaPath, `${fmt.prefijo}/${archivo}`),
      storage.subirJson(m, `${fmt.prefijo}/${archivo.replace(/\.png$/, '.json')}`),
    ];
    if (!sinImagen) subidas.push(storage.subir(fondoPath, `${fmt.prefijo}/${fondoNombre}`));
    await Promise.all(subidas);

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

    const m = await storage.leerJson(`${fmt.prefijo}/${jsonNombre}`);
    if (!m) return res.status(400).json({ error: 'No se encontró la metadata de esta placa' });

    if (m.flujo === 'director') {
      if (!fs.existsSync(fondoPath)) {
        const ok = await storage.bajar(`${fmt.prefijo}/${fondoNombre}`, fondoPath);
        if (!ok) return res.status(400).json({ error: 'No se encontró el lienzo editable de esta placa' });
      }
      const ajusteLogo = interpretarAjusteLogo(instruccion, m);
      let resultado = null;
      if (ajusteLogo.instruccionVisual) {
        resultado = await editarImagenOpenAI({
          imagePaths: [fondoPath],
          prompt: promptAjusteDirector(ajusteLogo.instruccionVisual, m.idea, formato),
          size: fmt.directorSize,
        });
        fs.writeFileSync(fondoPath, resultado.buffer);
      }
      m.logoEscala = ajusteLogo.logoEscala;
      m.logoVisible = ajusteLogo.logoVisible;
      await componerPlacaDirector({
        imagenPath: fondoPath, salidaPath, formato,
        logoEscala: m.logoEscala, logoVisible: m.logoVisible,
      });
      m.conversaciones = m.conversaciones || [];
      m.conversaciones.push({ rol: 'usuario', texto: instruccion, fecha: new Date().toISOString() });
      m.costes = m.costes || [];
      if (resultado) m.costes.push(registrarCoste(resultado.usage, formato, 'editar'));
      m.costeUsdAprox = costeTotal(m.costes);
      m.stamp = Date.now();
      await Promise.all([
        storage.subir(salidaPath, `${fmt.prefijo}/${archivo}`),
        storage.subir(fondoPath, `${fmt.prefijo}/${fondoNombre}`),
        storage.subirJson(m, `${fmt.prefijo}/${jsonNombre}`),
      ]);
      return res.json({
        archivo,
        url: storage.urlPublica(`${fmt.prefijo}/${archivo}`) + '?t=' + m.stamp,
        ...m,
      });
    }
    if (m.diseno === 'aurora') {
      return res.status(400).json({ error: 'El diseño Aurora no usa imagen de fondo — no hay nada que ajustar' });
    }

    // recuperar el fondo: del disco o, si se redeployó, de Storage
    if (!fs.existsSync(fondoPath)) {
      const ok = await storage.bajar(`${fmt.prefijo}/${fondoNombre}`, fondoPath);
      if (!ok) return res.status(400).json({ error: 'No se encontró la imagen base de esta placa' });
    }

    // editar el fondo (sobreescribe) y recomponer la placa
    await editarImagen(fondoPath, instruccion, fondoPath, fmt.aspecto);
    await fmt.componer({
      ilustracionPath: fondoPath,
      titulo: m.titulo, subtitulo: m.subtitulo,
      fuente: m.fuente, categoria: m.categoria,
      salidaPath, diseno: m.diseno,
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
