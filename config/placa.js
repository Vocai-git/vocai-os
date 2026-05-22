/* ============================================================
   VOCAI OS — Composición de placas
   Capa de marca: ilustración + texto + logo → placa final.
   Compone con HTML/CSS y captura con Chrome headless.
   Tipografía: Inter. Sistema de categorías (acento + etiqueta).
   ============================================================ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const CHROME_RUTAS = [
  path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];

function buscarChrome() {
  for (const r of CHROME_RUTAS) {
    if (r && fs.existsSync(r)) return r;
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
  educativo: { etiqueta: 'APRENDÉ',         acento: '#2979FF' },
  caso:      { etiqueta: 'CASO REAL',       acento: '#00C48C' },
  interno:   { etiqueta: 'PUERTAS ADENTRO', acento: '#FF8C42' },
};

// Plantilla de placa de historia (1080x1920).
function htmlPlacaHistoria({ ilustracionDataUri, titulo, subtitulo, fuente, categoria }) {
  const cat = CATEGORIAS[categoria];
  const acento = cat ? cat.acento : '#FF6B6B';
  const etiqueta = cat ? cat.etiqueta : '';
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
.contenido{position:absolute;left:0;right:0;bottom:320px;padding:0 96px;}
.kicker{display:flex;align-items:center;gap:18px;margin-bottom:30px;}
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
  <div class="contenido">
    <div class="kicker">
      <span class="barra"></span>
      ${etiqueta ? `<span class="cat">${esc(etiqueta)}</span>` : ''}
    </div>
    <div class="titulo">${esc(titulo)}</div>
    ${subtitulo ? `<div class="subtitulo">${esc(subtitulo)}</div>` : ''}
    ${fuente ? `<div class="fuente">Fuente · ${esc(fuente)}</div>` : ''}
  </div>
  ${LOGO_B64 ? `<img class="logo" src="data:image/png;base64,${LOGO_B64}">` : ''}
</div>
</body></html>`;
}

// Renderiza un HTML a PNG con Chrome headless.
function renderHtml(html, salidaPath, ancho = 1080, alto = 1920) {
  return new Promise((resolve, reject) => {
    const chrome = buscarChrome();
    const tmpHtml = path.join(os.tmpdir(),
      `placa-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tmpHtml, html, 'utf8');
    const args = [
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--force-device-scale-factor=1', `--window-size=${ancho},${alto}`,
      '--virtual-time-budget=6000',
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
async function componerPlacaHistoria({ ilustracionPath, titulo, subtitulo, fuente, categoria, salidaPath }) {
  const b64 = fs.readFileSync(ilustracionPath).toString('base64');
  const html = htmlPlacaHistoria({
    ilustracionDataUri: 'data:image/png;base64,' + b64,
    titulo, subtitulo, fuente, categoria,
  });
  await renderHtml(html, salidaPath);
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

// ── Layout de cada slide → devuelve el interior del .slide ──
function layoutSlide({ layout, img, titulo, cuerpo, dato, etiqueta, indice, total }) {
  const t = esc(titulo), c = esc(cuerpo), d = esc(dato);
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

module.exports = { componerPlacaHistoria, componerSlideCarrusel, CATEGORIAS };
