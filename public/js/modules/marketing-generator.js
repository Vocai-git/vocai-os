/* ============================================================
   VOCAI OS — Marketing · Generador de contenidos
   Dos modos: Ilustración (IA) y Foto (imagen propia).
   El especialista arma el texto; se compone la placa de marca
   con su categoría (color de acento + etiqueta).
   ============================================================ */

const MKT_GEN_MODOS = {
  ilustracion: 'Ilustración (IA)',
  realista:    'Realista (IA)',
  foto:        'Foto propia',
};

// Diseños de la placa de historia. Aurora no usa imagen de fondo
// (gradient mesh de marca) — no gasta crédito de imagen.
const MKT_GEN_DISENOS = {
  clasico: 'Clásico',
  brutal:  'Brutal',
  aurora:  'Aurora (sin imagen)',
};

const MKT_GEN_CATEGORIAS = {
  novedad:   'Novedad',
  educativo: 'Educativo',
  caso:      'Caso real',
  interno:   'VOCAI por dentro',
};

// Mapeo categoría → pilar del calendario editorial.
const MKT_GEN_CAT_PILAR = {
  novedad: 'ia', educativo: 'ia', caso: 'casos', interno: 'estudio',
};

let mktGenModo      = 'ilustracion';
let mktGenDiseno    = 'clasico';
let mktGenCategoria = 'novedad';
let mktGenIdea      = '';
let mktGenFuente    = '';
let mktGenFoto      = null;     // objeto File de la foto subida
let mktGenReferencia = null;    // objeto File de la imagen de referencia
let mktGenUltimo    = null;
let mktGenCargando  = false;
let mktGenMuestras  = [];
let mktGenFbPaso    = null;   // veredicto: null preguntar · 'motivo' · 'hecho'

// Flujo de placa: plantilla rápida (copy + fondo + composición fija) o
// Director creativo (lienzo completo generado y refinado por conversación).
let mktGenFlujo = 'rapido';

// Pieza del calendario que se está produciendo (viene del botón 🎨 Producir).
// Si está seteada, "Añadir al calendario" adjunta la placa a ESA pieza.
let mktGenPiezaDestino = null;  // { id, fecha, titulo }

// Modo libre: el especialista respeta la idea al pie, sin filtrar contra la
// lista negra ni la regla de oro. El campo "Tu idea" sigue siendo el mismo;
// solo cambia cómo lo interpreta el especialista de copy.
let mktGenModoLibre = false;

// Sección activa del Generador unificado: 'historias' | 'feed' | 'carrusel'.
let mktGenSeccion = 'historias';

// Config de la sección de placa suelta activa (historias 9:16 / feed 4:5).
function mktGenCfg() {
  if (mktGenSeccion === 'feed') return {
    formato: 'feed', ratio: '4 / 5', calFormato: 'post', calNombre: 'Feed',
  };
  return {
    formato: 'historia', ratio: '9 / 16', calFormato: 'story', calNombre: 'Historias',
  };
}

// Carga una idea externa (ej. desde Inteligencia) y abre el Generador.
function generarDesdeIdea(idea, fuente) {
  idea = (idea || '').trim();
  fuente = (fuente || '').trim();
  mktGenIdea = idea; mktGenFuente = fuente; mktGenCategoria = 'novedad';
  mktCarIdea = idea; mktCarFuente = fuente; mktCarCategoria = 'novedad';
  navigate('marketing-generator');
  toast('Idea cargada — elegí Historias, Feed o Carruseles y generá', 'success');
}

async function renderMarketingGenerator(el) {
  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Generador de contenidos</h2>
    </div>
    ${mktGenToggleHTML()}
    <div id="mgen_panel"><div class="loader"><div class="spinner"></div></div></div>
  `;
  const panel = document.getElementById('mgen_panel');
  try {
    if (mktGenSeccion === 'carrusel') await mktGenPanelCarrusel(panel);
    else await mktGenPanelHistorias(panel);
  } catch (err) {
    panel.innerHTML = `<div class="alert alert-error">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// Toggle Historias / Carruseles.
function mktGenToggleHTML() {
  const tab = (k, label) => `
    <button class="btn ${mktGenSeccion === k ? 'btn-primary' : 'btn-secondary'}"
      onclick="mktGenSetSeccion('${k}')">${label}</button>`;
  return `<div style="display:flex;gap:8px;margin-bottom:18px;">
    ${tab('historias', 'Historias')}
    ${tab('feed', 'Feed')}
    ${tab('carrusel', 'Carruseles')}
  </div>`;
}

function mktGenSetSeccion(s) {
  if (mktGenSeccion === s) return;
  mktGenSeccion = s;
  mktGenUltimo = null;
  navigate('marketing-generator');
}

// Sub-panel "Historias" (placas verticales).
async function mktGenPanelHistorias(panel) {
  mktGenMuestras = await API.get('/marketing-generator/muestras?formato=' + mktGenCfg().formato);
  panel.innerHTML = `
    ${mktGenFlujoHTML()}
    ${mktGenFlujo === 'director' ? mktGenDirectorFormHTML() : mktGenFormHTML()}
    ${mktGenResultadoHTML()}
    ${mktGenGaleriaHTML()}
  `;
}

function mktGenFlujoHTML() {
  const boton = (valor, titulo, bajada) => `
    <button type="button" onclick="mktGenSetFlujo('${valor}')"
      style="flex:1;min-width:220px;text-align:left;padding:14px 16px;border-radius:12px;cursor:pointer;
        border:1px solid ${mktGenFlujo === valor ? 'var(--blue)' : 'var(--border)'};
        background:${mktGenFlujo === valor ? 'rgba(41,121,255,.10)' : 'var(--surface)'};color:var(--text);">
      <span style="display:block;font-weight:700;font-size:13px;margin-bottom:4px;">${titulo}</span>
      <span style="display:block;font-size:12px;line-height:1.4;color:var(--text-muted);">${bajada}</span>
    </button>`;
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
    ${boton('rapido', 'Plantilla rápida', 'Copy y fondo IA dentro de un diseño fijo de VOCAI.')}
    ${boton('director', 'Director creativo', 'Pedí la placa completa en lenguaje natural y refinála conversando.')}
  </div>`;
}

function mktGenSetFlujo(flujo) {
  if (!['rapido', 'director'].includes(flujo) || mktGenFlujo === flujo) return;
  const idea = document.getElementById('mgen_idea');
  if (idea) mktGenIdea = idea.value;
  mktGenFlujo = flujo;
  mktGenUltimo = null;
  mktGenReferencia = null;
  navigate('marketing-generator');
}

function mktGenDirectorFormHTML() {
  const dis = mktGenCargando ? 'disabled' : '';
  const optCategorias = Object.entries(MKT_GEN_CATEGORIAS).map(([k, v]) =>
    `<option value="${k}" ${k === mktGenCategoria ? 'selected' : ''}>${v}</option>`).join('');
  return `
  <div class="card" style="margin-bottom:20px;">
    <div class="form-group">
      <label class="form-label">Describí la placa como me la pedirías por chat</label>
      <textarea class="form-textarea" id="mgen_idea" rows="5" ${dis}
        placeholder="Ej: Quiero una historia impactante para la final Argentina–España. Messi de espaldas, clima cinematográfico, texto: HOY EL CORAZÓN SE PARTE EN DOS. Logo pequeño abajo.">${escHtml(mktGenIdea)}</textarea>
      <div style="font-size:12px;color:var(--text-muted);margin-top:7px;line-height:1.45;">
        Sol interpreta el pedido y dirige a GPT Image 2 para generar el lienzo entero. Después podés pedir cambios sobre la misma placa.
        Los resultados serán muy cercanos al flujo libre, aunque cada generación sigue siendo única.
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="mgen_categoria" ${dis}>
          <option value="" ${mktGenCategoria === '' ? 'selected' : ''}>Sin categoría</option>
          ${optCategorias}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Referencia visual (opcional)</label>
        <input type="file" class="form-input" id="mgen_referencia" accept="image/*" ${dis}
          onchange="mktGenSetReferencia(this)">
        <div id="mgen_ref_info" style="font-size:12px;color:var(--text-muted);margin-top:6px;">
          ${mktGenReferencia ? '✓ ' + escHtml(mktGenReferencia.name)
            : 'Podés subir una placa, foto o estilo que quieras tomar como referencia.'}
        </div>
      </div>
    </div>
    <button class="btn btn-primary" onclick="mktGenDirectorSubmit()" ${dis}>
      ${mktGenCargando ? 'Creando…' : 'Crear con Director creativo'}
    </button>
    <span style="font-size:11px;color:var(--text-muted);margin-left:10px;">Coste estimado visible en el resultado</span>
  </div>`;
}

// ── Formulario ──────────────────────────────────────────────
function mktGenFormHTML() {
  const dis = mktGenCargando ? 'disabled' : '';
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) =>
    `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const esHistoria = mktGenCfg().formato === 'historia';
  const sinImagen = esHistoria && mktGenDiseno === 'aurora';
  const destino = mktGenPiezaDestino && esHistoria ? `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;
                padding:10px 14px;border-radius:10px;border:1px solid var(--border);
                background:rgba(41,121,255,0.08);font-size:13px;">
      <span>🎨 Produciendo pieza del calendario:
        <b>${escHtml(mktGenPiezaDestino.titulo)}</b> · ${escHtml(mktGenPiezaDestino.fecha)}</span>
      <button class="btn btn-secondary" style="margin-left:auto;padding:2px 10px;font-size:12px;"
        onclick="mktGenSoltarDestino()">Soltar</button>
    </div>` : '';
  return `
  <div class="card" style="margin-bottom:20px;">
    ${destino}
    <div class="form-row">
      ${esHistoria ? `
      <div class="form-group">
        <label class="form-label">Diseño</label>
        <select class="form-select" id="mgen_diseno" ${dis}
          onchange="mktGenSetDiseno(this.value)">${opt(MKT_GEN_DISENOS, mktGenDiseno)}</select>
      </div>` : ''}
      <div class="form-group" id="mgen_modo_wrap" style="display:${sinImagen ? 'none' : 'block'};">
        <label class="form-label">Modo</label>
        <select class="form-select" id="mgen_modo" ${dis}
          onchange="mktGenToggleModo(this.value)">${opt(MKT_GEN_MODOS, mktGenModo)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="mgen_categoria" ${dis}>
          <option value="" ${mktGenCategoria === '' ? 'selected' : ''}>Sin categoría</option>
          ${opt(MKT_GEN_CATEGORIAS, mktGenCategoria)}
        </select>
      </div>
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <label class="form-label" style="margin:0;">Tu idea</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);cursor:pointer;">
          <input type="checkbox" id="mgen_modolibre" ${mktGenModoLibre ? 'checked' : ''} ${dis}
            onchange="mktGenSetModoLibre(this.checked)">
          Modo libre
        </label>
      </div>
      <textarea class="form-textarea" id="mgen_idea" rows="3" ${dis}
        placeholder="Contá qué placa querés. Ej: anunciar que muy pronto abrimos al público">${escHtml(mktGenIdea)}</textarea>
      <div id="mgen_modolibre_hint" style="font-size:12px;margin-top:6px;color:#FF6B6B;display:${mktGenModoLibre ? 'block' : 'none'};">
        ⚡ Modo libre activo: el especialista respeta tu idea al pie, sin filtros de marca. La responsabilidad del copy es tuya.
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Fuente (opcional)</label>
      <input class="form-input" id="mgen_fuente" value="${escHtml(mktGenFuente)}" ${dis}
        placeholder="Ej: TechCrunch — aparece como crédito en la placa">
    </div>
    <div class="form-group" id="mgen_ref_wrap"
         style="display:${mktGenModo !== 'foto' && !sinImagen ? 'block' : 'none'};">
      <label class="form-label">Imagen de referencia (opcional)</label>
      <input type="file" class="form-input" id="mgen_referencia" accept="image/*" ${dis}
        onchange="mktGenSetReferencia(this)">
      <div id="mgen_ref_info" style="font-size:12px;color:var(--text-muted);margin-top:6px;">
        ${mktGenReferencia ? '✓ ' + escHtml(mktGenReferencia.name)
          : 'Nano Banana la usa como guía de estilo, clima y composición.'}
      </div>
    </div>
    <div class="form-group" id="mgen_foto_wrap"
         style="display:${mktGenModo === 'foto' && !sinImagen ? 'block' : 'none'};">
      <label class="form-label">Tu foto</label>
      <input type="file" class="form-input" id="mgen_foto" accept="image/*" ${dis}
        onchange="mktGenSetFoto(this)">
      <div id="mgen_foto_info" style="font-size:12px;color:var(--text-muted);margin-top:6px;">
        ${mktGenFoto ? '✓ ' + escHtml(mktGenFoto.name) : 'La foto va de fondo; el diseño de marca se compone encima.'}
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;
             font-size:13px;cursor:pointer;">
        <input type="checkbox" id="mgen_retocar" ${dis}
          onchange="mktGenToggleRetoque(this.checked)">
        Que la IA retoque la foto antes de usarla
      </label>
      <div id="mgen_retoque_wrap" style="display:none;margin-top:10px;">
        <textarea class="form-textarea" id="mgen_retoque" rows="2"
          placeholder="Qué retoque querés. Ej: armonizá los colores con la marca · mejorá la iluminación"></textarea>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin:4px 0 14px;line-height:1.5;">
      El especialista convierte tu idea en el texto de la placa. Se compone con la
      marca VOCAI y el color de la categoría.
    </div>
    <button class="btn btn-primary" onclick="mktGenSubmit()" ${dis}>
      ${mktGenCargando ? 'Generando…' : 'Generar placa'}
    </button>
  </div>`;
}

function mktGenToggleModo(v) {
  mktGenModo = v;
  const sinImagen = mktGenCfg().formato === 'historia' && mktGenDiseno === 'aurora';
  const w = document.getElementById('mgen_foto_wrap');
  if (w) w.style.display = v === 'foto' && !sinImagen ? 'block' : 'none';
  const r = document.getElementById('mgen_ref_wrap');
  if (r) r.style.display = v !== 'foto' && !sinImagen ? 'block' : 'none';
}

// Cambio de diseño de historia: Aurora no usa imagen — oculta modo/foto/ref.
function mktGenSetDiseno(v) {
  mktGenDiseno = MKT_GEN_DISENOS[v] ? v : 'clasico';
  const m = document.getElementById('mgen_modo_wrap');
  if (m) m.style.display = mktGenDiseno === 'aurora' ? 'none' : 'block';
  mktGenToggleModo(mktGenModo);
}

function mktGenToggleRetoque(checked) {
  const w = document.getElementById('mgen_retoque_wrap');
  if (w) w.style.display = checked ? 'block' : 'none';
}

function mktGenSetModoLibre(checked) {
  mktGenModoLibre = checked;
  const h = document.getElementById('mgen_modolibre_hint');
  if (h) h.style.display = checked ? 'block' : 'none';
}

function mktGenSetFoto(input) {
  mktGenFoto = input.files && input.files[0] ? input.files[0] : null;
  const info = document.getElementById('mgen_foto_info');
  if (info) info.textContent = mktGenFoto ? '✓ ' + mktGenFoto.name
    : 'La foto va de fondo; el diseño de marca se compone encima.';
}

function mktGenSetReferencia(input) {
  mktGenReferencia = input.files && input.files[0] ? input.files[0] : null;
  const info = document.getElementById('mgen_ref_info');
  if (info) info.textContent = mktGenReferencia ? '✓ ' + mktGenReferencia.name
    : (mktGenFlujo === 'director'
      ? 'Podés subir una placa, foto o estilo que quieras tomar como referencia.'
      : 'Nano Banana la usa como guía de estilo, clima y composición.');
}

// ── Zona de resultado ───────────────────────────────────────
function mktGenResultadoHTML() {
  if (mktGenCargando) {
    return `
    <div class="card" style="margin-bottom:20px;text-align:center;padding:40px;">
      <div class="loader"><div class="spinner"></div></div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:14px;">
        ${mktGenFlujo === 'director' ? 'Sol está pensando y generando la placa… puede tardar hasta dos minutos.' : 'Generando la placa… esto puede tardar hasta un minuto.'}</div>
    </div>`;
  }
  if (!mktGenUltimo) return '';
  const u = mktGenUltimo;
  const esDirector = u.flujo === 'director';
  return `
  <div class="card" style="margin-bottom:20px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:14px;">Resultado</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;">
      <div style="width:260px;align-self:flex-start;flex:0 0 auto;">
        <img src="${escHtml(u.url)}" alt="placa generada" title="Clic para ampliar"
          onclick="mktGenVerUltimo()"
          style="width:100%;aspect-ratio:${mktGenCfg().ratio};object-fit:contain;display:block;
                 border-radius:10px;border:1px solid var(--border);cursor:zoom-in;">
        ${mktGenCosteHTML(u)}
      </div>
      <div style="flex:1;min-width:240px;">
        ${mktGenCampo('Categoría', MKT_GEN_CATEGORIAS[u.categoria] || u.categoria)}
        ${esDirector ? mktGenCampo('Flujo', 'Director creativo') : `
          ${u.diseno && u.diseno !== 'clasico' ? mktGenCampo('Diseño', MKT_GEN_DISENOS[u.diseno] || u.diseno) : ''}
          ${mktGenCampo('Modo', MKT_GEN_MODOS[u.modo] || u.modo)}`}
        ${mktGenCampo('Tu idea', u.idea)}
        ${!esDirector ? mktGenCampo('Título', u.titulo) : ''}
        ${u.subtitulo ? mktGenCampo('Subtítulo', u.subtitulo) : ''}
        ${u.fuente ? mktGenCampo('Fuente', u.fuente) : ''}
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="btn btn-secondary" href="${escHtml(u.url)}" download>Descargar</a>
          <button class="btn btn-primary"
            onclick="mktGenAlCalendario('${escHtml(u.archivo)}')">Añadir al calendario</button>
        </div>
        ${u.copy ? `
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
          <label class="form-label">Copy del posteo</label>
          <textarea class="form-textarea" id="mgen_copy" rows="7">${escHtml(u.copy)}</textarea>
          <button class="btn btn-secondary" style="margin-top:8px;"
            onclick="mktGenCopiarCopy()">Copiar copy</button>
        </div>` : ''}
        ${esDirector ? mktGenConversacionHTML(u) : ''}
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
          <label class="form-label">${esDirector ? 'Seguí conversando sobre esta placa' : 'Ajustar esta placa'}</label>
          <textarea class="form-textarea" id="mgen_ajuste" rows="2"
            placeholder="${esDirector
              ? 'Ej: achicá el logo un 30%, quitá la pregunta y cambiá la frase inferior'
              : 'Ej: sacá el objeto de la izquierda · dale más iluminación · fondo más despejado'}"></textarea>
          <button class="btn btn-secondary" style="margin-top:8px;"
            onclick="mktGenAjustar()">${esDirector ? 'Enviar cambio' : 'Aplicar ajuste'}</button>
        </div>
        ${mktGenFeedbackHTML()}
      </div>
    </div>
  </div>`;
}

function mktGenCosteHTML(m) {
  const usd = Number(m && m.costeUsdAprox || 0);
  if (!usd) return '';
  const costes = m.costes || [];
  const sol = costes.filter(c => c.servicio === 'orquestacion');
  const imagen = costes.filter(c => c.servicio !== 'orquestacion');
  const solUsd = sol.reduce((s, c) => s + Number(c.usdAprox || 0), 0);
  const imagenUsd = imagen.reduce((s, c) => s + Number(c.usdAprox || 0), 0);
  const importe = usd.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const detalle = `Sol: US$ ${solUsd.toFixed(4)} · Imagen: US$ ${imagenUsd.toFixed(4)}`;
  return `<div title="${escHtml(detalle)} · La facturación real puede variar"
    style="font-size:10px;color:var(--text-muted);text-align:center;margin-top:6px;opacity:.8;">
    ≈ US$ ${importe} acumulado${sol.length ? ' · Sol + imagen' : ''}${imagen.length > 1 ? ` · ${imagen.length} imágenes` : ''}
  </div>`;
}

function mktGenConversacionHTML(m) {
  const historial = m.conversaciones || [];
  if (historial.length < 2) return '';
  const mensajes = historial.length > 6 ? historial.slice(-6) : historial.slice(1);
  return `<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
    <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Conversación con Sol</div>
    ${mensajes.map(x => `<div style="font-size:12px;line-height:1.45;padding:8px 10px;
      margin:0 0 6px ${x.rol === 'asistente' ? '0' : '18px'};border-radius:8px;
      background:${x.rol === 'asistente' ? 'var(--surface-hover)' : 'rgba(41,121,255,.10)'};">
      <b style="font-size:10px;color:var(--text-muted);">${x.rol === 'asistente' ? 'SOL' : 'VOS'}</b><br>
      ${escHtml(x.texto)}</div>`).join('')}
  </div>`;
}

function mktGenCampo(label, valor) {
  return `
    <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);
      margin-bottom:4px;">${escHtml(label)}</div>
    <div style="font-size:13px;margin-bottom:12px;">${escHtml(valor || '—')}</div>`;
}

// Copia el copy de la placa al portapapeles.
function mktGenCopiarCopy() {
  const t = document.getElementById('mgen_copy');
  if (!t) return;
  navigator.clipboard.writeText(t.value).then(
    () => toast('Copy copiado al portapapeles', 'success'),
    () => toast('No se pudo copiar', 'error'));
}

// ── Galería / historial ─────────────────────────────────────
function mktGenGaleriaHTML() {
  if (!mktGenMuestras.length) return '';
  const grupos = {};
  const otras = [];
  mktGenMuestras.forEach(m => {
    if (m.categoria && MKT_GEN_CATEGORIAS[m.categoria]) (grupos[m.categoria] = grupos[m.categoria] || []).push(m);
    else otras.push(m);
  });
  const bloque = (titulo, items) => `
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="font-weight:700;font-size:13px;color:var(--text);">${escHtml(titulo)}</span>
        <span style="font-size:12px;color:var(--text-muted);">· ${items.length}</span>
        <div style="flex:1;height:1px;background:var(--border);"></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;">${items.map(mktGenThumb).join('')}</div>
    </div>`;
  return `
    <div class="section-header" style="margin-top:8px;">
      <h2 class="section-title" style="font-size:16px;">Historial</h2>
      <button class="btn btn-secondary" onclick="navigate('marketing-generator')">↻ Actualizar</button>
    </div>
    ${Object.keys(MKT_GEN_CATEGORIAS).filter(c => grupos[c])
       .map(c => bloque(MKT_GEN_CATEGORIAS[c], grupos[c])).join('')}
    ${otras.length ? bloque('Otras', otras) : ''}
  `;
}

function mktGenThumb(m) {
  const info = (m.titulo || m.idea || m.archivo || '').slice(0, 60);
  return `
    <div onclick="mktGenVer('${escHtml(m.archivo)}')"
         style="cursor:pointer;width:160px;border-radius:10px;overflow:hidden;
                border:1px solid var(--border);background:var(--bg);transition:transform .12s;"
         onmouseover="this.style.transform='translateY(-3px)'"
         onmouseout="this.style.transform='translateY(0)'">
      <img src="${escHtml(m.url)}" loading="lazy"
           style="width:100%;aspect-ratio:${mktGenCfg().ratio};object-fit:cover;display:block;">
      <div style="padding:7px 9px;font-size:11px;color:var(--text-muted);
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${escHtml(info)}
      </div>
      ${m.costeUsdAprox ? `<div style="padding:0 9px 7px;font-size:9px;color:var(--text-muted);opacity:.75;">
        ≈ US$ ${Number(m.costeUsdAprox).toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
      </div>` : ''}
    </div>`;
}

// Abre el visor ampliado sobre el historial de placas.
function mktGenVer(archivo) {
  const idx = mktGenMuestras.findIndex(x => x.archivo === archivo);
  if (idx < 0) return;
  openLightbox(
    mktGenMuestras.map(m => ({
      url: m.url, caption: m.titulo || m.idea || m.archivo,
    })),
    idx,
    [
      { label: 'Descargar', tipo: 'secondary',
        fn: (it, i) => mktGenDescargar(mktGenMuestras[i]) },
      { label: 'Añadir al calendario', tipo: 'primary', fn: (it, i) => {
          const arch = mktGenMuestras[i].archivo;
          closeLightbox(); mktGenAlCalendario(arch);
        } },
      { label: 'Eliminar', tipo: 'danger',
        fn: (it, i) => mktGenBorrar(mktGenMuestras[i].archivo) },
    ]
  );
}

// Abre el visor ampliado sobre la placa recién generada.
function mktGenVerUltimo() {
  if (!mktGenUltimo) return;
  const u = mktGenUltimo;
  openLightbox([{ url: u.url, caption: u.titulo || u.idea || '' }], 0, [
    { label: 'Descargar', tipo: 'secondary', fn: () => mktGenDescargar(u) },
    { label: 'Añadir al calendario', tipo: 'primary', fn: () => {
        closeLightbox(); mktGenAlCalendario(u.archivo);
      } },
  ]);
}

function mktGenDescargar(m) {
  if (!m) return;
  const a = document.createElement('a');
  a.href = m.url; a.download = m.archivo;
  document.body.appendChild(a); a.click(); a.remove();
}

async function mktGenBorrar(archivo) {
  if (!confirm('¿Eliminar esta placa? No se puede deshacer.')) return;
  try {
    await API.del('/marketing-generator/' + encodeURIComponent(archivo) +
      '?formato=' + mktGenCfg().formato);
    toast('Placa eliminada', 'success');
    closeLightbox();
    navigate('marketing-generator');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Generar ─────────────────────────────────────────────────
async function mktGenDirectorSubmit() {
  const idea = document.getElementById('mgen_idea').value.trim();
  const categoria = document.getElementById('mgen_categoria').value;
  if (!idea) { toast('Escribí qué placa querés crear', 'error'); return; }

  mktGenIdea = idea;
  mktGenCategoria = categoria;
  mktGenCargando = true;
  navigate('marketing-generator');
  try {
    const fd = new FormData();
    fd.append('idea', idea);
    fd.append('categoria', categoria);
    fd.append('formato', mktGenCfg().formato);
    if (mktGenReferencia) fd.append('referencia', mktGenReferencia);
    const res = await fetch('/api/marketing-generator/director/generar', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('vocai_token') },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    mktGenUltimo = data;
    mktGenFbPaso = null;
    mktGenReferencia = null;
    toast('Placa creada con Director creativo', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktGenCargando = false;
    navigate('marketing-generator');
  }
}

async function mktGenSubmit() {
  const idea = document.getElementById('mgen_idea').value.trim();
  const categoria = document.getElementById('mgen_categoria').value;
  const modo = document.getElementById('mgen_modo').value;
  const fuente = document.getElementById('mgen_fuente').value.trim();
  const sinImagen = mktGenCfg().formato === 'historia' && mktGenDiseno === 'aurora';
  if (!idea) { toast('Escribí tu idea primero', 'error'); return; }
  if (modo === 'foto' && !mktGenFoto && !sinImagen) { toast('Subí una foto', 'error'); return; }

  mktGenIdea = idea; mktGenCategoria = categoria; mktGenModo = modo; mktGenFuente = fuente;
  mktGenCargando = true;
  navigate('marketing-generator');
  try {
    const fd = new FormData();
    fd.append('idea', idea);
    fd.append('categoria', categoria);
    fd.append('modo', modo);
    fd.append('fuente', fuente);
    fd.append('formato', mktGenCfg().formato);
    fd.append('modoLibre', mktGenModoLibre ? 'true' : 'false');
    if (mktGenCfg().formato === 'historia') fd.append('diseno', mktGenDiseno);
    if (modo === 'foto' && mktGenFoto) {
      fd.append('foto', mktGenFoto);
      const rc = document.getElementById('mgen_retocar');
      if (rc && rc.checked) {
        fd.append('retocar', 'true');
        fd.append('retoque', (document.getElementById('mgen_retoque').value || '').trim());
      }
    }
    if (modo !== 'foto' && mktGenReferencia) {
      fd.append('referencia', mktGenReferencia);
    }
    const res = await fetch('/api/marketing-generator/generar', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('vocai_token') },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    mktGenUltimo = data;
    mktGenFbPaso = null;
    mktGenFoto = null;
    mktGenReferencia = null;
    toast('Placa generada', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktGenCargando = false;
    navigate('marketing-generator');
  }
}

// ── Añadir al calendario ────────────────────────────────────
function mktGenSoltarDestino() {
  mktGenPiezaDestino = null;
  navigate('marketing-generator');
}

function mktGenAlCalendario(archivo) {
  const m = mktGenMuestras.find(x => x.archivo === archivo) ||
            (mktGenUltimo && mktGenUltimo.archivo === archivo ? mktGenUltimo : null);
  if (!m) { toast('No se encontró la placa', 'error'); return; }
  const cfg = mktGenCfg();
  const dest = mktGenPiezaDestino && cfg.formato === 'historia' ? mktGenPiezaDestino : null;
  const fecha = dest ? dest.fecha : new Date().toISOString().slice(0, 10);
  const intro = dest
    ? `Esta placa se adjunta a la pieza <b>${escHtml(dest.titulo)}</b> del calendario,
       que pasa a estado <b>Lista</b>. No se publica sola.`
    : `Se va a crear una pieza en el <b>Calendario · ${cfg.calNombre}</b> con esta placa,
       en la categoría <b>${escHtml(MKT_GEN_CATEGORIAS[m.categoria] || m.categoria || '—')}</b>.`;
  createModal('mktGenCalModal', dest ? 'Adjuntar a la pieza' : 'Añadir al calendario', `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;line-height:1.5;">${intro}</p>
    <div class="form-group">
      <label class="form-label">Fecha de publicación</label>
      <input class="form-input" type="date" id="mgcal_fecha" value="${fecha}">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('mktGenCalModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="mktGenCalGuardar('${escHtml(archivo)}')">
      ${dest ? 'Adjuntar' : 'Añadir'}</button>
  `);
}

async function mktGenCalGuardar(archivo) {
  const m = mktGenMuestras.find(x => x.archivo === archivo) ||
            (mktGenUltimo && mktGenUltimo.archivo === archivo ? mktGenUltimo : null);
  if (!m) return;
  const fecha = document.getElementById('mgcal_fecha').value;
  if (!fecha) { toast('Elegí una fecha', 'error'); return; }
  const cfg = mktGenCfg();
  const notas = '[media:' + (m.url || '').split('?')[0] + '] ' +
                (m.copy || 'Placa del Generador');
  const dest = mktGenPiezaDestino && cfg.formato === 'historia' ? mktGenPiezaDestino : null;
  try {
    if (dest) {
      await API.put('/marketing-calendar/' + dest.id, { fecha, estado: 'lista', notas });
      mktGenPiezaDestino = null;
      toast('Placa adjuntada — la pieza quedó Lista en el calendario', 'success');
    } else {
      await API.post('/marketing-calendar', {
        titulo:  m.titulo || m.idea || 'Placa generada',
        fecha,
        formato: cfg.calFormato,
        pilar:   MKT_GEN_CAT_PILAR[m.categoria] || 'ia',
        estado:  'lista',
        notas,
      });
      toast('Añadida al Calendario · ' + cfg.calNombre, 'success');
    }
    closeModal('mktGenCalModal');
    if (dest) navigate('marketing-generator');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Ajustar / refinar el resultado ──────────────────────────
async function mktGenAjustar() {
  if (!mktGenUltimo) return;
  const instruccion = document.getElementById('mgen_ajuste').value.trim();
  if (!instruccion) { toast('Escribí qué querés ajustar', 'error'); return; }
  mktGenCargando = true;
  navigate('marketing-generator');
  try {
    const data = await API.post('/marketing-generator/ajustar', {
      archivo: mktGenUltimo.archivo, instruccion, formato: mktGenCfg().formato,
    });
    mktGenUltimo = data;
    mktGenFbPaso = null;
    toast('Ajuste aplicado', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktGenCargando = false;
    navigate('marketing-generator');
  }
}

// ── Veredicto / biblioteca de ejemplos ──────────────────────
// Después de generar, el humano dice si la placa queda o la
// rehace; el veredicto alimenta la biblioteca de copy.
function mktGenFeedbackHTML() {
  const borde = 'margin-top:16px;border-top:1px solid var(--border);padding-top:14px;';
  if (mktGenFbPaso === 'hecho') {
    return `<div style="${borde}font-size:13px;color:var(--text-muted);">
      ✓ Veredicto guardado. El generador lo tiene en cuenta en las próximas piezas.
    </div>`;
  }
  if (mktGenFbPaso === 'motivo') {
    return `<div style="${borde}">
      <label class="form-label">¿Qué falla?</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="mktGenFbMotivo('copy')">Copy</button>
        <button class="btn btn-secondary" onclick="mktGenFbMotivo('imagen')">Imagen</button>
        <button class="btn btn-secondary" onclick="mktGenFbMotivo('tono')">Tono</button>
      </div>
    </div>`;
  }
  return `<div style="${borde}">
    <label class="form-label">¿Esta placa queda o la rehacés?</label>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="mktGenFb('queda')">Queda</button>
      <button class="btn btn-secondary" onclick="mktGenFb('rehago')">La rehago</button>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">
      Tu veredicto alimenta la biblioteca de ejemplos del generador.</div>
  </div>`;
}

function mktGenFb(veredicto) {
  if (veredicto === 'rehago') {
    mktGenFbPaso = 'motivo';
    navigate('marketing-generator');
    return;
  }
  mktGenFbEnviar('queda', '');
}

function mktGenFbMotivo(motivo) { mktGenFbEnviar('rehago', motivo); }

async function mktGenFbEnviar(veredicto, motivo) {
  if (!mktGenUltimo) return;
  try {
    await API.post('/marketing-biblioteca/feedback', {
      tipo: 'placa', ref: mktGenUltimo.archivo,
      formato: mktGenCfg().formato, veredicto, motivo,
    });
    mktGenFbPaso = 'hecho';
    toast(veredicto === 'queda' ? 'Guardada como ejemplo aprobado'
      : 'Anotada como ejemplo a evitar', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
  navigate('marketing-generator');
}
