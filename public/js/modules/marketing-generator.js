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
let mktGenCategoria = 'novedad';
let mktGenIdea      = '';
let mktGenFuente    = '';
let mktGenFoto      = null;     // objeto File de la foto subida
let mktGenReferencia = null;    // objeto File de la imagen de referencia
let mktGenUltimo    = null;
let mktGenCargando  = false;
let mktGenMuestras  = [];

// Sección activa del Generador unificado: 'historias' | 'carrusel'.
let mktGenSeccion = 'historias';

// Carga una idea externa (ej. desde Inteligencia) y abre el Generador.
function generarDesdeIdea(idea, fuente) {
  idea = (idea || '').trim();
  fuente = (fuente || '').trim();
  mktGenIdea = idea; mktGenFuente = fuente; mktGenCategoria = 'novedad';
  mktCarIdea = idea; mktCarFuente = fuente; mktCarCategoria = 'novedad';
  navigate('marketing-generator');
  toast('Idea cargada — elegí Historias o Carruseles y generá', 'success');
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
    ${tab('carrusel', 'Carruseles')}
  </div>`;
}

function mktGenSetSeccion(s) {
  if (mktGenSeccion === s) return;
  mktGenSeccion = s;
  navigate('marketing-generator');
}

// Sub-panel "Historias" (placas verticales).
async function mktGenPanelHistorias(panel) {
  mktGenMuestras = await API.get('/marketing-generator/muestras');
  panel.innerHTML = `
    ${mktGenFormHTML()}
    ${mktGenResultadoHTML()}
    ${mktGenGaleriaHTML()}
  `;
}

// ── Formulario ──────────────────────────────────────────────
function mktGenFormHTML() {
  const dis = mktGenCargando ? 'disabled' : '';
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) =>
    `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  return `
  <div class="card" style="margin-bottom:20px;">
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Modo</label>
        <select class="form-select" id="mgen_modo" ${dis}
          onchange="mktGenToggleModo(this.value)">${opt(MKT_GEN_MODOS, mktGenModo)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="mgen_categoria" ${dis}>${opt(MKT_GEN_CATEGORIAS, mktGenCategoria)}</select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Tu idea</label>
      <textarea class="form-textarea" id="mgen_idea" rows="3" ${dis}
        placeholder="Contá qué placa querés. Ej: anunciar que muy pronto abrimos al público">${escHtml(mktGenIdea)}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Fuente (opcional)</label>
      <input class="form-input" id="mgen_fuente" value="${escHtml(mktGenFuente)}" ${dis}
        placeholder="Ej: TechCrunch — aparece como crédito en la placa">
    </div>
    <div class="form-group" id="mgen_ref_wrap"
         style="display:${mktGenModo !== 'foto' ? 'block' : 'none'};">
      <label class="form-label">Imagen de referencia (opcional)</label>
      <input type="file" class="form-input" id="mgen_referencia" accept="image/*" ${dis}
        onchange="mktGenSetReferencia(this)">
      <div id="mgen_ref_info" style="font-size:12px;color:var(--text-muted);margin-top:6px;">
        ${mktGenReferencia ? '✓ ' + escHtml(mktGenReferencia.name)
          : 'Nano Banana la usa como guía de estilo, clima y composición.'}
      </div>
    </div>
    <div class="form-group" id="mgen_foto_wrap"
         style="display:${mktGenModo === 'foto' ? 'block' : 'none'};">
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
  const w = document.getElementById('mgen_foto_wrap');
  if (w) w.style.display = v === 'foto' ? 'block' : 'none';
  const r = document.getElementById('mgen_ref_wrap');
  if (r) r.style.display = v !== 'foto' ? 'block' : 'none';
}

function mktGenToggleRetoque(checked) {
  const w = document.getElementById('mgen_retoque_wrap');
  if (w) w.style.display = checked ? 'block' : 'none';
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
    : 'Nano Banana la usa como guía de estilo, clima y composición.';
}

// ── Zona de resultado ───────────────────────────────────────
function mktGenResultadoHTML() {
  if (mktGenCargando) {
    return `
    <div class="card" style="margin-bottom:20px;text-align:center;padding:40px;">
      <div class="loader"><div class="spinner"></div></div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:14px;">
        Generando la placa… esto puede tardar hasta un minuto.</div>
    </div>`;
  }
  if (!mktGenUltimo) return '';
  const u = mktGenUltimo;
  return `
  <div class="card" style="margin-bottom:20px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:14px;">Resultado</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;">
      <img src="${escHtml(u.url)}" alt="placa generada" title="Clic para ampliar"
        onclick="mktGenVerUltimo()"
        style="width:260px;aspect-ratio:9/16;object-fit:contain;align-self:flex-start;
               flex:0 0 auto;border-radius:10px;border:1px solid var(--border);
               cursor:zoom-in;">
      <div style="flex:1;min-width:240px;">
        ${mktGenCampo('Categoría', MKT_GEN_CATEGORIAS[u.categoria] || u.categoria)}
        ${mktGenCampo('Modo', MKT_GEN_MODOS[u.modo] || u.modo)}
        ${mktGenCampo('Tu idea', u.idea)}
        ${mktGenCampo('Título', u.titulo)}
        ${u.subtitulo ? mktGenCampo('Subtítulo', u.subtitulo) : ''}
        ${u.fuente ? mktGenCampo('Fuente', u.fuente) : ''}
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="btn btn-secondary" href="${escHtml(u.url)}" download>Descargar</a>
          <button class="btn btn-primary"
            onclick="mktGenAlCalendario('${escHtml(u.archivo)}')">Añadir al calendario</button>
        </div>
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
          <label class="form-label">Ajustar esta placa</label>
          <textarea class="form-textarea" id="mgen_ajuste" rows="2"
            placeholder="Ej: sacá el objeto de la izquierda · dale más iluminación · fondo más despejado"></textarea>
          <button class="btn btn-secondary" style="margin-top:8px;"
            onclick="mktGenAjustar()">Aplicar ajuste</button>
        </div>
      </div>
    </div>
  </div>`;
}

function mktGenCampo(label, valor) {
  return `
    <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);
      margin-bottom:4px;">${escHtml(label)}</div>
    <div style="font-size:13px;margin-bottom:12px;">${escHtml(valor || '—')}</div>`;
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
           style="width:100%;aspect-ratio:9/16;object-fit:cover;display:block;">
      <div style="padding:7px 9px;font-size:11px;color:var(--text-muted);
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${escHtml(info)}
      </div>
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
    await API.del('/marketing-generator/' + encodeURIComponent(archivo));
    toast('Placa eliminada', 'success');
    closeLightbox();
    navigate('marketing-generator');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Generar ─────────────────────────────────────────────────
async function mktGenSubmit() {
  const idea = document.getElementById('mgen_idea').value.trim();
  const categoria = document.getElementById('mgen_categoria').value;
  const modo = document.getElementById('mgen_modo').value;
  const fuente = document.getElementById('mgen_fuente').value.trim();
  if (!idea) { toast('Escribí tu idea primero', 'error'); return; }
  if (modo === 'foto' && !mktGenFoto) { toast('Subí una foto', 'error'); return; }

  mktGenIdea = idea; mktGenCategoria = categoria; mktGenModo = modo; mktGenFuente = fuente;
  mktGenCargando = true;
  navigate('marketing-generator');
  try {
    const fd = new FormData();
    fd.append('idea', idea);
    fd.append('categoria', categoria);
    fd.append('modo', modo);
    fd.append('fuente', fuente);
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
function mktGenAlCalendario(archivo) {
  const m = mktGenMuestras.find(x => x.archivo === archivo) ||
            (mktGenUltimo && mktGenUltimo.archivo === archivo ? mktGenUltimo : null);
  if (!m) { toast('No se encontró la placa', 'error'); return; }
  const hoy = new Date().toISOString().slice(0, 10);
  createModal('mktGenCalModal', 'Añadir al calendario', `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;line-height:1.5;">
      Se va a crear una historia en el <b>Calendario · Historias</b> con esta placa,
      en la categoría <b>${escHtml(MKT_GEN_CATEGORIAS[m.categoria] || m.categoria || '—')}</b>.</p>
    <div class="form-group">
      <label class="form-label">Fecha de publicación</label>
      <input class="form-input" type="date" id="mgcal_fecha" value="${hoy}">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('mktGenCalModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="mktGenCalGuardar('${escHtml(archivo)}')">Añadir</button>
  `);
}

async function mktGenCalGuardar(archivo) {
  const m = mktGenMuestras.find(x => x.archivo === archivo) ||
            (mktGenUltimo && mktGenUltimo.archivo === archivo ? mktGenUltimo : null);
  if (!m) return;
  const fecha = document.getElementById('mgcal_fecha').value;
  if (!fecha) { toast('Elegí una fecha', 'error'); return; }
  try {
    await API.post('/marketing-calendar', {
      titulo:  m.titulo || m.idea || 'Placa generada',
      fecha,
      formato: 'story',
      pilar:   MKT_GEN_CAT_PILAR[m.categoria] || 'ia',
      estado:  'lista',
      notas:   '[media:' + (m.url || '').split('?')[0] + '] Placa del Generador',
    });
    toast('Añadida al Calendario · Historias', 'success');
    closeModal('mktGenCalModal');
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
      archivo: mktGenUltimo.archivo, instruccion,
    });
    mktGenUltimo = data;
    toast('Ajuste aplicado', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktGenCargando = false;
    navigate('marketing-generator');
  }
}
