/* ============================================================
   VOCAI OS — Composición de placas
   Capa de marca: ilustración + texto + logo → placa final.
   Compone con HTML/CSS y captura con Chrome headless.
   Tipografía: Inter. Sistema de categorías (acento + etiqueta).
   ============================================================ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execSync } = require('child_process');

const CHROME_RUTAS = [
  // Windows (desarrollo local)
  path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  // Linux (Railway / contenedores)
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
];

function buscarChrome() {
  // 1. Ruta explícita por variable de entorno
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  // 2. Rutas conocidas (Windows + Linux)
  for (const r of CHROME_RUTAS) {
    if (r && fs.existsSync(r)) return r;
  }
  // 3. Resolver el binario desde el PATH (Nixpacks instala 'chromium' ahí)
  for (const cmd of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const buscar = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
      const p = execSync(buscar, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim().split(/\r?\n/)[0];
      if (p && fs.existsSync(p)) return p;
    } catch (e) { /* no está, probar el siguiente */ }
  }
  throw new Error('No se encontró Chrome ni Edge para renderizar la placa');
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Logo wordmark — PNG transparente recortado, embebido en base64.
function cargarImg(rel) {
  try { return fs.readFileSync(path.join(__dirname, '..', 'public', rel)).toString('base64'); }
  catch (e) { return null; }
}
const LOGO_B64 = cargarImg('img/logo-wordmark.png');

// Categorías de contenido: color de acento + etiqueta.
const CATEGORIAS = {
  novedad:   { etiqueta: 'NOVEDAD',         acento: '#FF6B6B' },
  educativo: { etiqueta: 'APRENDE',         acento: '#2979FF' },
  caso:      { etiqueta: 'CASO REAL',       acento: '#00C48C' },
  interno:   { etiqueta: 'PUERTAS ADENTRO', acento: '#FF8C42' },
};

// ── Diseños de historia ──────────────────────────────────────
// 'clasico' (el original) + 2 diseños 2026: brutal y aurora.
const DISENOS_HISTORIA = ['clasico', 'brutal', 'aurora'];

// Auto-ajuste de texto a su caja (mismo mecanismo que la placa de feed).
const FIT_SCRIPT = `<script>
(function(){
  function fit(){
    var els=document.querySelectorAll('[data-fit-max]');
    for(var i=0;i<els.length;i++){
      var el=els[i],s=+el.getAttribute('data-fit-max'),
          mn=+el.getAttribute('data-fit-min'),
          lh=+el.getAttribute('data-fit-h')||999999;
      el.style.fontSize=s+'px';
      var g=0;
      while(s>mn && (el.scrollHeight>lh || el.scrollWidth>el.clientWidth+2) && g<200){
        s-=2;el.style.fontSize=s+'px';g++;
      }
    }
  }
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit);}
  fit(); setTimeout(fit,1400);
})();
<\/script>`;

// Divide el título alrededor de la palabra "IA" (o "VOCAI") para poder
// destacarla en gradiente. Devuelve { pre, bloque, resto } SIN escapar:
// bloque = artículo + IA (lo que se pinta), resto = lo que sigue.
function partirTituloIA(titulo) {
  const limpio = String(titulo || '').replace(/[.!]+$/, '').trim();
  const w = limpio.split(/\s+/);
  const iaIdx = w.findIndex(t => /^(ia|vocai)[.,!?]*$/i.test(t));
  if (iaIdx < 0) {
    // sin IA: se pintan las últimas 2 palabras (si el título da)
    const corte = w.length > 3 ? w.length - 2 : w.length;
    return { pre: w.slice(0, corte).join(' '), bloque: w.slice(corte).join(' '), resto: '' };
  }
  let ini = iaIdx;
  if (ini > 0 && /^(la|el|una|un|las|los|tu|e|y)$/i.test(w[ini - 1])) ini -= 1;
  return {
    pre: w.slice(0, ini).join(' '),
    bloque: w.slice(ini, iaIdx + 1).join(' '),
    resto: w.slice(iaIdx + 1).join(' '),
  };
}

// Plantilla de placa de historia (1080x1920).
function htmlPlacaHistoria({ ilustracionDataUri, titulo, subtitulo, fuente, categoria }) {
  const cat = CATEGORIAS[categoria];
  const acento = cat ? cat.acento : '#FF6B6B';
  const kicker = cat ? `
    <div class="kicker">
      <span class="barra"></span>
      <span class="cat">${esc(cat.etiqueta)}</span>
    </div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1920px;}
.placa{position:relative;width:1080px;height:1920px;overflow:hidden;
  background:#141d35;font-family:'Inter','Segoe UI',sans-serif;}
.fondo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.velo{position:absolute;left:0;right:0;bottom:0;height:80%;
  background:linear-gradient(to bottom,rgba(20,29,53,0) 0%,
    rgba(20,29,53,.55) 36%,rgba(20,29,53,.93) 64%,#141d35 86%);}
.velo-top{position:absolute;left:0;right:0;top:0;height:20%;
  background:linear-gradient(to top,rgba(20,29,53,0) 0%,
    rgba(20,29,53,.5) 48%,rgba(20,29,53,.86) 100%);z-index:1;}
.contenido{position:absolute;left:0;right:0;bottom:430px;padding:0 96px;text-align:center;}
.kicker{position:absolute;top:96px;left:96px;display:flex;align-items:center;gap:18px;z-index:5;}
.barra{width:56px;height:8px;border-radius:4px;background:${acento};}
.cat{font-weight:700;font-size:30px;letter-spacing:.14em;color:${acento};}
.titulo{font-weight:800;font-size:92px;line-height:1.08;color:#fff;letter-spacing:-.02em;}
.subtitulo{font-weight:400;font-size:41px;line-height:1.34;
  color:rgba(255,255,255,.74);margin-top:28px;}
.fuente{font-weight:400;font-size:30px;color:#8AA2D4;letter-spacing:.02em;margin-top:24px;}
.logo{position:absolute;bottom:116px;left:50%;transform:translateX(-50%);height:74px;}
</style></head><body>
<div class="placa">
  <img class="fondo" src="${ilustracionDataUri}">
  <div class="velo"></div>
  <div class="velo-top"></div>
  ${kicker}
  <div class="contenido">
    <div class="titulo">${esc(titulo)}</div>
    ${subtitulo ? `<div class="subtitulo">${esc(subtitulo)}</div>` : ''}
    ${fuente ? `<div class="fuente">Fuente · ${esc(fuente)}</div>` : ''}
  </div>
  ${LOGO_B64 ? `<img class="logo" src="data:image/png;base64,${LOGO_B64}">` : ''}
</div>
</body></html>`;
}

// ── Diseño BRUTAL — neo-brutalismo en dark ───────────────────
// Tarjeta con borde grueso, sombra dura desplazada y sticker rotado.
function htmlHistoriaBrutal({ ilustracionDataUri, titulo, subtitulo, fuente, categoria }) {
  const cat = CATEGORIAS[categoria];
  const acento = cat ? cat.acento : '#FF6B6B';
  const { pre, bloque, resto } = partirTituloIA(titulo);
  const tituloHtml = (pre ? esc(pre) + ' ' : '') +
    (bloque ? `<span class="mk">${esc(bloque)}</span>` : '') +
    (resto ? ' ' + esc(resto) : '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1920px;}
.placa{position:relative;width:1080px;height:1920px;overflow:hidden;
  background:#141d35;font-family:'Inter','Segoe UI',sans-serif;}
.fondo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.dim{position:absolute;inset:0;background:rgba(10,16,32,.5);}
.card{position:absolute;left:84px;right:84px;bottom:420px;
  background:#1b2544;border:7px solid #fff;border-radius:14px;
  box-shadow:26px 26px 0 ${acento};padding:96px 72px 72px;}
.sticker{position:absolute;top:-46px;left:44px;transform:rotate(-5deg);
  background:${acento};color:#fff;font-weight:900;font-size:34px;
  letter-spacing:.1em;padding:20px 38px;border:6px solid #141d35;
  border-radius:10px;box-shadow:10px 10px 0 rgba(0,0,0,.35);}
.tit{font-weight:900;line-height:1.04;color:#fff;
  letter-spacing:-.02em;text-transform:uppercase;}
.tit .mk{background:linear-gradient(135deg,#2979FF,#FF6B6B);
  -webkit-background-clip:text;background-clip:text;color:transparent;}
.sub{font-weight:500;font-size:39px;line-height:1.35;color:rgba(255,255,255,.82);
  margin-top:34px;}
.fuente{font-size:27px;color:#8AA2D4;margin-top:20px;}
.pie{display:flex;align-items:center;justify-content:space-between;margin-top:56px;}
.logo{height:54px;}
.fl{width:96px;height:96px;border:6px solid #fff;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:48px;font-weight:900;color:#fff;background:${acento};}
</style></head><body>
<div class="placa">
  <img class="fondo" src="${ilustracionDataUri}">
  <div class="dim"></div>
  <div class="card">
    ${cat ? `<div class="sticker">${esc(cat.etiqueta)}</div>` : ''}
    <div class="tit" data-fit-max="96" data-fit-min="50" data-fit-h="540">${tituloHtml}</div>
    ${subtitulo ? `<div class="sub">${esc(subtitulo)}</div>` : ''}
    ${fuente ? `<div class="fuente">Fuente · ${esc(fuente)}</div>` : ''}
    <div class="pie">
      ${LOGO_B64 ? `<img class="logo" src="data:image/png;base64,${LOGO_B64}">` : ''}
      <div class="fl">→</div>
    </div>
  </div>
</div>
${FIT_SCRIPT}</body></html>`;
}

// ── Diseño AURORA — gradient mesh de marca, SIN imagen ───────
// No usa fondo de Nano Banana: blobs aurora sobre navy. Gratis por pieza.
function htmlHistoriaAurora({ titulo, subtitulo, fuente, categoria }) {
  const cat = CATEGORIAS[categoria];
  const acento = cat ? cat.acento : '#FF6B6B';
  const { pre, bloque, resto } = partirTituloIA(titulo);
  const pintado = [bloque, resto].filter(Boolean).join(' ');
  const tituloHtml = (pre ? esc(pre) + ' ' : '') +
    (pintado ? `<span class="mk">${esc(pintado)}</span>` : '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1920px;}
.placa{position:relative;width:1080px;height:1920px;overflow:hidden;
  background:#141d35;font-family:'Inter','Segoe UI',sans-serif;}
.b{position:absolute;border-radius:50%;filter:blur(90px);}
.b1{width:900px;height:900px;left:-260px;top:-140px;background:rgba(41,121,255,.55);}
.b2{width:820px;height:820px;right:-300px;top:420px;background:rgba(255,107,107,.42);}
.b3{width:700px;height:700px;left:-160px;bottom:-180px;background:rgba(88,64,187,.5);}
.halo{position:absolute;left:140px;right:140px;top:640px;height:640px;border-radius:50%;
  background:rgba(20,29,53,.55);filter:blur(70px);}
.pill{position:absolute;top:262px;left:50%;transform:translateX(-50%);
  display:inline-flex;align-items:center;gap:14px;padding:16px 36px;
  border-radius:999px;border:2px solid rgba(255,255,255,.35);
  background:rgba(20,29,53,.4);font-weight:700;font-size:28px;
  letter-spacing:.18em;color:#fff;}
.pill i{width:12px;height:12px;border-radius:50%;background:${acento};}
.centro{position:absolute;left:80px;right:80px;top:50%;transform:translateY(-54%);text-align:center;}
.tit{font-weight:900;line-height:1.02;color:#fff;letter-spacing:-.03em;}
.tit .mk{background:linear-gradient(135deg,#6ea8ff,#FF6B6B);
  -webkit-background-clip:text;background-clip:text;color:transparent;}
.sub{font-weight:400;font-size:41px;line-height:1.36;color:rgba(255,255,255,.8);
  margin-top:44px;padding:0 40px;}
.fuente{font-size:28px;color:#9DB4E4;margin-top:24px;}
.hair{width:240px;height:6px;border-radius:3px;margin:52px auto 0;
  background:linear-gradient(135deg,#2979FF,#FF6B6B);}
.logo{position:absolute;bottom:330px;left:50%;transform:translateX(-50%);height:60px;}
</style></head><body>
<div class="placa">
  <div class="b b1"></div><div class="b b2"></div><div class="b b3"></div>
  <div class="halo"></div>
  ${cat ? `<div class="pill"><i></i>${esc(cat.etiqueta)}</div>` : ''}
  <div class="centro">
    <div class="tit" data-fit-max="128" data-fit-min="62" data-fit-h="720">${tituloHtml}</div>
    ${subtitulo ? `<div class="sub">${esc(subtitulo)}</div>` : ''}
    ${fuente ? `<div class="fuente">Fuente · ${esc(fuente)}</div>` : ''}
    <div class="hair"></div>
  </div>
  ${LOGO_B64 ? `<img class="logo" src="data:image/png;base64,${LOGO_B64}">` : ''}
</div>
${FIT_SCRIPT}</body></html>`;
}

// Renderiza un HTML a PNG con Chrome headless.
function renderHtml(html, salidaPath, ancho = 1080, alto = 1920) {
  return new Promise((resolve, reject) => {
    const chrome = buscarChrome();
    const tmpHtml = path.join(os.tmpdir(),
      `placa-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tmpHtml, html, 'utf8');
    const args = [
      '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
      '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${ancho},${alto}`, '--virtual-time-budget=6000',
      `--screenshot=${salidaPath}`,
      'file:///' + tmpHtml.replace(/\\/g, '/'),
    ];
    execFile(chrome, args, { timeout: 60000 }, (err) => {
      fs.unlink(tmpHtml, () => {});
      if (!fs.existsSync(salidaPath)) {
        return reject(new Error('Chrome no pudo renderizar la placa' +
          (err ? ': ' + err.message : '')));
      }
      resolve(salidaPath);
    });
  });
}

// Compone la placa de historia final y la guarda en salidaPath.
// diseno: 'clasico' (default) · 'brutal' · 'aurora' (sin imagen).
async function componerPlacaHistoria({ ilustracionPath, titulo, subtitulo, fuente, categoria, salidaPath, diseno }) {
  const d = DISENOS_HISTORIA.includes(diseno) ? diseno : 'clasico';
  let html;
  if (d === 'aurora') {
    html = htmlHistoriaAurora({ titulo, subtitulo, fuente, categoria });
  } else {
    const b64 = fs.readFileSync(ilustracionPath).toString('base64');
    const dataUri = 'data:image/png;base64,' + b64;
    const args = { ilustracionDataUri: dataUri, titulo, subtitulo, fuente, categoria };
    html = d === 'brutal' ? htmlHistoriaBrutal(args) : htmlPlacaHistoria(args);
  }
  await renderHtml(html, salidaPath);
  return salidaPath;
}

// ════════════════════════════════════════════════════════════
//  Placa de feed (1080x1350, formato 4:5)
//  Misma idea que la historia, adaptada al formato cuadrado-alto.
//  El título se auto-ajusta a su caja en el render.
// ════════════════════════════════════════════════════════════

function htmlPlacaFeed({ ilustracionDataUri, titulo, subtitulo, fuente, categoria }) {
  const cat = CATEGORIAS[categoria];
  const acento = cat ? cat.acento : '#FF6B6B';
  const kicker = cat ? `
    <div class="kicker">
      <span class="barra"></span>
      <span class="cat">${esc(cat.etiqueta)}</span>
    </div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1350px;}
.placa{position:relative;width:1080px;height:1350px;overflow:hidden;
  background:#141d35;font-family:'Inter','Segoe UI',sans-serif;}
.fondo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.velo{position:absolute;left:0;right:0;bottom:0;height:84%;
  background:linear-gradient(to bottom,rgba(20,29,53,0) 0%,
    rgba(20,29,53,.55) 34%,rgba(20,29,53,.93) 62%,#141d35 86%);}
.velo-top{position:absolute;left:0;right:0;top:0;height:22%;
  background:linear-gradient(to top,rgba(20,29,53,0) 0%,
    rgba(20,29,53,.5) 48%,rgba(20,29,53,.86) 100%);z-index:1;}
.contenido{position:absolute;left:0;right:0;bottom:252px;padding:0 90px;text-align:center;}
.kicker{position:absolute;top:80px;left:80px;display:flex;align-items:center;gap:16px;z-index:5;}
.barra{width:52px;height:8px;border-radius:4px;background:${acento};}
.cat{font-weight:700;font-size:27px;letter-spacing:.14em;color:${acento};}
.titulo{font-weight:800;line-height:1.09;color:#fff;letter-spacing:-.02em;}
.subtitulo{font-weight:400;font-size:37px;line-height:1.32;
  color:rgba(255,255,255,.74);margin-top:24px;}
.fuente{font-weight:400;font-size:27px;color:#8AA2D4;letter-spacing:.02em;margin-top:20px;}
.logo{position:absolute;bottom:76px;left:50%;transform:translateX(-50%);height:60px;}
</style></head><body>
<div class="placa">
  <img class="fondo" src="${ilustracionDataUri}">
  <div class="velo"></div>
  <div class="velo-top"></div>
  ${kicker}
  <div class="contenido">
    <div class="titulo" data-fit-max="80" data-fit-min="46" data-fit-h="430">${esc(titulo)}</div>
    ${subtitulo ? `<div class="subtitulo">${esc(subtitulo)}</div>` : ''}
    ${fuente ? `<div class="fuente">Fuente · ${esc(fuente)}</div>` : ''}
  </div>
  ${LOGO_B64 ? `<img class="logo" src="data:image/png;base64,${LOGO_B64}">` : ''}
</div>
<script>
(function(){
  function fit(){
    var els=document.querySelectorAll('[data-fit-max]');
    for(var i=0;i<els.length;i++){
      var el=els[i],s=+el.getAttribute('data-fit-max'),
          mn=+el.getAttribute('data-fit-min'),
          lh=+el.getAttribute('data-fit-h')||999999;
      el.style.fontSize=s+'px';
      var guard=0;
      while(s>mn && el.scrollHeight>lh && guard<200){s-=2;el.style.fontSize=s+'px';guard++;}
    }
  }
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit);}
  fit();
  setTimeout(fit,1400);
})();
</script>
</body></html>`;
}

// Compone la placa de feed final y la guarda en salidaPath.
async function componerPlacaFeed({ ilustracionPath, titulo, subtitulo, fuente, categoria, salidaPath }) {
  const b64 = fs.readFileSync(ilustracionPath).toString('base64');
  const html = htmlPlacaFeed({
    ilustracionDataUri: 'data:image/png;base64,' + b64,
    titulo, subtitulo, fuente, categoria,
  });
  await renderHtml(html, salidaPath, 1080, 1350);
  return salidaPath;
}

// ════════════════════════════════════════════════════════════
//  Slides de carrusel (1080x1350, formato 4:5)
//  Sistema de layouts variados para que el carrusel no sea
//  monótono. El texto se auto-ajusta a su caja en el render.
// ════════════════════════════════════════════════════════════

const LOGO_TAG_C = LOGO_B64
  ? `<img class="logo-c" src="data:image/png;base64,${LOGO_B64}">` : '';
const LOGO_TAG_E = LOGO_B64
  ? `<img class="logo-e" src="data:image/png;base64,${LOGO_B64}">` : '';

// Fondo "con vida" para los slides sin imagen.
function fondoRico(acento) {
  return `radial-gradient(circle at 82% 12%, ${acento}2b 0%, transparent 46%),` +
         `radial-gradient(circle at 14% 90%, #2979FF26 0%, transparent 52%),` +
         `linear-gradient(160deg, #1b2649 0%, #141d35 62%)`;
}

// Numerador de slide (arriba a la derecha).
function numHtml(indice, total) {
  return `<div class="num"><b>${indice}</b> / ${total}</div>`;
}

// Formatea el cuerpo: si detecta una lista con flechas ("→ A → B → C"),
// la renderiza como ítems verticales con la flecha como marcador visual.
// Si no, devuelve el texto plano. Recibe el texto YA escapado por esc().
function formatCuerpo(c) {
  if (!c) return '';
  const txt = c.trim();
  if (/^→\s/.test(txt)) {
    const partes = txt.split(/\s*→\s+/).map(s => s.trim()).filter(Boolean);
    if (partes.length >= 2) {
      const items = partes.map(p =>
        `<li style="display:flex;gap:20px;margin-bottom:22px;align-items:flex-start;text-align:left;">` +
        `<span style="color:var(--acento);font-weight:800;flex-shrink:0;font-size:1.15em;line-height:1;">→</span>` +
        `<span style="flex:1;">${p}</span></li>`
      ).join('');
      return `<ul style="list-style:none;padding:0;margin:0;">${items}</ul>`;
    }
  }
  return c;
}

// ── Layout de cada slide → devuelve el interior del .slide ──
function layoutSlide({ layout, img, titulo, cuerpo, dato, etiqueta, indice, total }) {
  const t = esc(titulo), c = formatCuerpo(esc(cuerpo)), d = esc(dato);
  const num = numHtml(indice, total);

  switch (layout) {

    case 'portada':
      return `
        <img class="fondo" src="${img}">
        <div class="velo"></div>
        <div class="zona" style="bottom:155px;">
          <div class="kick" style="margin-bottom:30px;">
            <span class="barra" style="width:56px;"></span>
            ${etiqueta ? `<span class="cat" style="font-size:29px;">${esc(etiqueta)}</span>` : ''}
          </div>
          <div class="tit" data-fit-max="94" data-fit-min="54" data-fit-h="500"
            style="line-height:1.06;">${t}</div>
          ${c ? `<div class="cpo" style="font-size:39px;margin-top:26px;">${c}</div>` : ''}
        </div>
        ${LOGO_TAG_C}`;

    case 'imagen-fondo':
      return `
        <img class="fondo" src="${img}">
        <div class="velo"></div>
        ${num}
        <div class="zona" style="bottom:145px;">
          <span class="barra" style="width:62px;display:block;margin-bottom:26px;"></span>
          <div class="tit" data-fit-max="76" data-fit-min="42" data-fit-h="380"
            style="line-height:1.12;">${t}</div>
          ${c ? `<div class="cpo" style="font-size:36px;margin-top:22px;">${c}</div>` : ''}
        </div>
        ${LOGO_TAG_E}`;

    case 'split':
      return `
        <img src="${img}" style="position:absolute;top:0;left:0;width:1080px;
          height:606px;object-fit:cover;">
        <div style="position:absolute;top:470px;left:0;right:0;height:170px;
          background:linear-gradient(to bottom,rgba(20,29,53,0),#141d35);"></div>
        <div style="position:absolute;top:606px;left:0;right:0;bottom:0;background:#141d35;"></div>
        ${num}
        <div class="zona" style="top:692px;">
          <span class="barra" style="width:62px;display:block;margin-bottom:26px;"></span>
          <div class="tit" data-fit-max="68" data-fit-min="40" data-fit-h="300"
            style="line-height:1.12;">${t}</div>
          ${c ? `<div class="cpo" style="font-size:36px;margin-top:22px;">${c}</div>` : ''}
        </div>
        ${LOGO_TAG_E}`;

    case 'texto-pleno':
      return `
        ${num}
        <div class="zona zona-c" style="padding:0 90px;">
          <span class="barra" style="width:76px;height:9px;display:block;margin-bottom:36px;"></span>
          <div class="tit" data-fit-max="92" data-fit-min="48" data-fit-h="660"
            style="line-height:1.09;">${t}</div>
          ${c ? `<div class="cpo" style="font-size:39px;margin-top:30px;">${c}</div>` : ''}
        </div>
        ${LOGO_TAG_E}`;

    case 'dato':
      return `
        ${num}
        <div class="zona zona-c">
          <div class="dato" data-fit-max="310" data-fit-min="120" data-fit-w="900">${d || t}</div>
          <div class="tit" data-fit-max="58" data-fit-min="34" data-fit-h="190"
            style="line-height:1.14;margin-top:18px;">${t}</div>
          ${c ? `<div class="cpo" style="font-size:35px;margin-top:18px;">${c}</div>` : ''}
        </div>
        ${LOGO_TAG_E}`;

    case 'cita':
      return `
        ${num}
        <div class="comilla">&#8220;</div>
        <div class="zona zona-c" style="padding:0 92px;">
          <div class="tit" data-fit-max="80" data-fit-min="44" data-fit-h="600"
            style="line-height:1.16;">${t}</div>
          ${c ? `<div class="cpo" style="font-size:35px;margin-top:30px;">— ${c}</div>` : ''}
        </div>
        ${LOGO_TAG_E}`;

    case 'cierre':
      return `
        ${img ? `<img class="fondo" src="${img}"><div class="velo"></div>` : ''}
        <div class="zona" style="bottom:240px;text-align:center;">
          <span class="barra" style="width:56px;height:8px;display:inline-block;
            margin-bottom:30px;"></span>
          <div class="tit" data-fit-max="80" data-fit-min="46" data-fit-h="400"
            style="line-height:1.09;">${t}</div>
          ${c ? `<div class="cpo" style="font-size:39px;margin-top:26px;">${c}</div>` : ''}
        </div>
        ${LOGO_TAG_C}`;

    default:
      return layoutSlide({ layout: 'imagen-fondo', img, titulo, cuerpo, dato,
        etiqueta, indice, total });
  }
}

// Plantilla completa de un slide de carrusel.
function htmlSlideCarrusel({ ilustracionDataUri, titulo, cuerpo, dato, categoria, layout, tipo, indice, total }) {
  const cat = CATEGORIAS[categoria];
  const acento = cat ? cat.acento : '#FF6B6B';
  const etiqueta = cat ? cat.etiqueta : '';
  const lay = layout || (tipo === 'portada' ? 'portada' : tipo === 'cierre' ? 'cierre' : 'imagen-fondo');
  const sinImagen = !ilustracionDataUri;
  const interior = layoutSlide({
    layout: lay, img: ilustracionDataUri || '', titulo, cuerpo, dato,
    etiqueta, indice, total,
  });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
:root{--acento:${acento};}
html,body{width:1080px;height:1350px;}
.slide{position:relative;width:1080px;height:1350px;overflow:hidden;
  font-family:'Inter','Segoe UI',sans-serif;
  background:${sinImagen ? fondoRico(acento) : '#141d35'};}
.fondo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.velo{position:absolute;left:0;right:0;bottom:0;height:86%;
  background:linear-gradient(to bottom,rgba(20,29,53,0) 0%,
    rgba(20,29,53,.5) 30%,rgba(20,29,53,.93) 62%,#141d35 88%);}
.num{position:absolute;top:58px;right:74px;font-size:29px;font-weight:700;
  color:rgba(255,255,255,.55);letter-spacing:.04em;z-index:5;}
.num b{color:${acento};}
.zona{position:absolute;left:0;right:0;padding:0 80px;z-index:4;}
.zona-c{top:50%;transform:translateY(-50%);}
.barra{height:7px;border-radius:4px;background:${acento};}
.kick{display:flex;align-items:center;gap:16px;}
.cat{font-weight:700;letter-spacing:.14em;color:${acento};}
.tit{font-weight:800;color:#fff;letter-spacing:-.02em;}
.cpo{font-weight:400;color:rgba(255,255,255,.78);line-height:1.36;}
.dato{font-weight:900;color:${acento};line-height:.92;letter-spacing:-.04em;}
.comilla{position:absolute;left:78px;top:240px;font-size:300px;font-weight:900;
  color:${acento};opacity:.42;line-height:.6;z-index:3;}
.logo-c{position:absolute;bottom:78px;left:50%;transform:translateX(-50%);
  height:56px;z-index:5;}
.logo-e{position:absolute;bottom:56px;right:74px;height:34px;z-index:5;}
</style></head><body>
<div class="slide">${interior}</div>
<script>
(function(){
  function fit(){
    var els=document.querySelectorAll('[data-fit-max]');
    for(var i=0;i<els.length;i++){
      var el=els[i],
          s=+el.getAttribute('data-fit-max'),
          mn=+el.getAttribute('data-fit-min'),
          lh=+el.getAttribute('data-fit-h')||999999,
          lw=+el.getAttribute('data-fit-w')||999999;
      el.style.fontSize=s+'px';
      var guard=0;
      while(s>mn && (el.scrollHeight>lh || el.scrollWidth>lw) && guard<200){
        s-=2; el.style.fontSize=s+'px'; guard++;
      }
    }
  }
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit);}
  fit();
  setTimeout(fit,1400);
})();
</script>
</body></html>`;
}

// Compone un slide de carrusel y lo guarda en salidaPath.
// ilustracionPath puede ser null (layouts sin imagen).
async function componerSlideCarrusel({ ilustracionPath, titulo, cuerpo, dato, categoria, layout, tipo, indice, total, salidaPath }) {
  let dataUri = null;
  if (ilustracionPath && fs.existsSync(ilustracionPath)) {
    dataUri = 'data:image/png;base64,' + fs.readFileSync(ilustracionPath).toString('base64');
  }
  const html = htmlSlideCarrusel({
    ilustracionDataUri: dataUri,
    titulo, cuerpo, dato, categoria, layout, tipo, indice, total,
  });
  await renderHtml(html, salidaPath, 1080, 1350);
  return salidaPath;
}

module.exports = { componerPlacaHistoria, componerPlacaFeed, componerSlideCarrusel, CATEGORIAS, DISENOS_HISTORIA };
