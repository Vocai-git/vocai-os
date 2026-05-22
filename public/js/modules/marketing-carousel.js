/* ============================================================
   VOCAI OS — Marketing · Generador de carruseles
   El especialista despieza la idea en slides (portada →
   contenido → cierre). Cada slide lleva su imagen IA y se
   compone con la marca VOCAI y el color de la categoría.
   ============================================================ */

const MKT_CAR_MODOS = {
  ilustracion: 'Ilustración (IA)',
  realista:    'Realista (IA)',
};

const MKT_CAR_CATEGORIAS = {
  novedad:   'Novedad',
  educativo: 'Educativo',
  caso:      'Caso real',
  interno:   'VOCAI por dentro',
};

// Mapeo categoría → pilar del calendario editorial.
const MKT_CAR_CAT_PILAR = {
  novedad: 'ia', educativo: 'ia', caso: 'casos', interno: 'estudio',
};

// Nombres legibles de los layouts de slide.
const MKT_CAR_LAYOUTS = {
  portada: 'Portada', 'imagen-fondo': 'Imagen', split: 'Split',
  'texto-pleno': 'Texto', dato: 'Dato', cita: 'Cita', cierre: 'Cierre',
};
function mktCarLayoutLabel(s) {
  return MKT_CAR_LAYOUTS[s.layout] ||
    ({ portada: 'Portada', cierre: 'Cierre' }[s.tipo]) || 'Contenido';
}

let mktCarModo      = 'ilustracion';
let mktCarCategoria = 'novedad';
let mktCarIdea      = '';
let mktCarFuente    = '';
let mktCarReferencia = null;     // objeto File de la imagen de referencia
let mktCarUltimo    = null;
let mktCarCargando  = false;
let mktCarLista     = [];

// Sub-panel del Generador unificado (sección "Carruseles").
async function mktGenPanelCarrusel(panel) {
  mktCarLista = await API.get('/marketing-carousel/carruseles');
  panel.innerHTML = `
    ${mktCarFormHTML()}
    ${mktCarResultadoHTML()}
    ${mktCarGaleriaHTML()}
  `;
}

// ── Formulario ──────────────────────────────────────────────
function mktCarFormHTML() {
  const dis = mktCarCargando ? 'disabled' : '';
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) =>
    `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  return `
  <div class="card" style="margin-bottom:20px;">
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Modo</label>
        <select class="form-select" id="mcar_modo" ${dis}>${opt(MKT_CAR_MODOS, mktCarModo)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="mcar_categoria" ${dis}>
          <option value="" ${mktCarCategoria === '' ? 'selected' : ''}>Sin categoría</option>
          ${opt(MKT_CAR_CATEGORIAS, mktCarCategoria)}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Tu idea</label>
      <textarea class="form-textarea" id="mcar_idea" rows="3" ${dis}
        placeholder="Contá el tema del carrusel. Ej: explicar qué es la automatización con IA y por qué le conviene a un negocio">${escHtml(mktCarIdea)}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Fuente (opcional)</label>
      <input class="form-input" id="mcar_fuente" value="${escHtml(mktCarFuente)}" ${dis}
        placeholder="Ej: TechCrunch — referencia del contenido">
    </div>
    <div class="form-group">
      <label class="form-label">Imagen de referencia (opcional)</label>
      <input type="file" class="form-input" id="mcar_referencia" accept="image/*" ${dis}
        onchange="mktCarSetReferencia(this)">
      <div id="mcar_ref_info" style="font-size:12px;color:var(--text-muted);margin-top:6px;">
        ${mktCarReferencia ? '✓ ' + escHtml(mktCarReferencia.name)
          : 'Guía el estilo de todas las slides con imagen.'}
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin:4px 0 14px;line-height:1.5;">
      El especialista despieza tu idea en slides con layouts variados (portada,
      imagen, split, texto, dato, cita, cierre). Solo algunos llevan imagen IA:
      puede tardar varios minutos.
    </div>
    <button class="btn btn-primary" onclick="mktCarSubmit()" ${dis}>
      ${mktCarCargando ? 'Generando…' : 'Generar carrusel'}
    </button>
  </div>`;
}

// ── Zona de resultado ───────────────────────────────────────
function mktCarResultadoHTML() {
  if (mktCarCargando) {
    return `
    <div class="card" style="margin-bottom:20px;text-align:center;padding:40px;">
      <div class="loader"><div class="spinner"></div></div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:14px;">
        Generando el carrusel… una imagen por slide, esto puede tardar
        varios minutos. No cierres esta pantalla.</div>
    </div>`;
  }
  if (!mktCarUltimo) return '';
  const c = mktCarUltimo;
  return `
  <div class="card" style="margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <span style="font-weight:700;font-size:14px;">Resultado</span>
      <span style="font-size:12px;color:var(--text-muted);">· ${c.total} slides</span>
    </div>
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:14px;">
      ${c.slides.map(mktCarSlideThumb).join('')}
    </div>
    ${mktCarCampo('Categoría', MKT_CAR_CATEGORIAS[c.categoria] || c.categoria)}
    ${mktCarCampo('Modo', MKT_CAR_MODOS[c.modo] || c.modo)}
    ${mktCarCampo('Tu idea', c.idea)}
    ${c.fuente ? mktCarCampo('Fuente', c.fuente) : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">
      <button class="btn btn-secondary" onclick="mktCarDescargar('${escHtml(c.id)}')">Descargar todas</button>
      <button class="btn btn-primary" onclick="mktCarAlCalendario('${escHtml(c.id)}')">Añadir al calendario</button>
    </div>
    ${c.copy ? `
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
      <label class="form-label">Copy del posteo</label>
      <textarea class="form-textarea" id="mcar_copy" rows="7">${escHtml(c.copy)}</textarea>
      <button class="btn btn-secondary" style="margin-top:8px;"
        onclick="mktCarCopiarCopy()">Copiar copy</button>
    </div>` : ''}
  </div>`;
}

function mktCarSlideThumb(s) {
  return `
    <div style="flex:0 0 auto;width:188px;">
      <img src="${escHtml(s.url)}" loading="lazy" title="Clic para ampliar"
        onclick="mktCarVerUltimo(${s.indice - 1})"
        style="width:188px;height:235px;object-fit:cover;display:block;
               border-radius:8px;border:1px solid var(--border);cursor:zoom-in;">
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
        ${s.indice}. ${escHtml(mktCarLayoutLabel(s))}
      </div>
    </div>`;
}

function mktCarCampo(label, valor) {
  return `
    <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);
      margin-bottom:4px;">${escHtml(label)}</div>
    <div style="font-size:13px;margin-bottom:12px;">${escHtml(valor || '—')}</div>`;
}

// ── Galería / historial ─────────────────────────────────────
function mktCarGaleriaHTML() {
  if (!mktCarLista.length) return '';
  const grupos = {};
  mktCarLista.forEach(c => {
    const k = MKT_CAR_CATEGORIAS[c.categoria] ? c.categoria : 'otras';
    (grupos[k] = grupos[k] || []).push(c);
  });
  const bloque = (titulo, items) => `
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="font-weight:700;font-size:13px;color:var(--text);">${escHtml(titulo)}</span>
        <span style="font-size:12px;color:var(--text-muted);">· ${items.length}</span>
        <div style="flex:1;height:1px;background:var(--border);"></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;">${items.map(mktCarThumb).join('')}</div>
    </div>`;
  return `
    <div class="section-header" style="margin-top:8px;">
      <h2 class="section-title" style="font-size:16px;">Historial</h2>
      <button class="btn btn-secondary" onclick="navigate('marketing-generator')">↻ Actualizar</button>
    </div>
    ${Object.keys(MKT_CAR_CATEGORIAS).filter(c => grupos[c])
       .map(c => bloque(MKT_CAR_CATEGORIAS[c], grupos[c])).join('')}
    ${grupos.otras ? bloque('Otras', grupos.otras) : ''}
  `;
}

function mktCarThumb(c) {
  const info = (c.idea || c.id || '').slice(0, 56);
  return `
    <div onclick="mktCarVer('${escHtml(c.id)}')"
         style="cursor:pointer;width:170px;border-radius:10px;overflow:hidden;
                border:1px solid var(--border);background:var(--bg);transition:transform .12s;"
         onmouseover="this.style.transform='translateY(-3px)'"
         onmouseout="this.style.transform='translateY(0)'">
      <div style="position:relative;">
        <img src="${escHtml(c.portada)}" loading="lazy"
             style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block;">
        <span style="position:absolute;top:8px;right:8px;background:rgba(20,29,53,.85);
              color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;">
          ${c.total} slides</span>
      </div>
      <div style="padding:7px 9px;font-size:11px;color:var(--text-muted);
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${escHtml(info)}
      </div>
    </div>`;
}

// Abre el visor ampliado con las slides de un carrusel.
function mktCarAbrirLightbox(c, idx) {
  if (!c || !c.slides || !c.slides.length) return;
  openLightbox(
    c.slides.map(s => ({
      url: s.url, caption: s.indice + ' · ' + mktCarLayoutLabel(s),
    })),
    idx || 0,
    [
      { label: 'Descargar esta', tipo: 'secondary', fn: (it, i) => {
          const s = c.slides[i];
          const a = document.createElement('a');
          a.href = s.url; a.download = c.id + '-slide-' + s.indice + '.png';
          document.body.appendChild(a); a.click(); a.remove();
        } },
      { label: 'Descargar todas', tipo: 'secondary', fn: () => mktCarDescargar(c.id) },
      { label: 'Añadir al calendario', tipo: 'primary', fn: () => {
          closeLightbox(); mktCarAlCalendario(c.id);
        } },
      { label: 'Eliminar', tipo: 'danger', fn: () => mktCarBorrar(c.id) },
    ]
  );
}

function mktCarVer(id) {
  const c = mktCarLista.find(x => x.id === id);
  if (c) mktCarAbrirLightbox(c, 0);
}

function mktCarVerUltimo(idx) {
  if (mktCarUltimo) mktCarAbrirLightbox(mktCarUltimo, idx || 0);
}

async function mktCarBorrar(id) {
  if (!confirm('¿Eliminar este carrusel? No se puede deshacer.')) return;
  try {
    await API.del('/marketing-carousel/' + encodeURIComponent(id));
    toast('Carrusel eliminado', 'success');
    closeLightbox();
    navigate('marketing-generator');
  } catch (err) { toast(err.message, 'error'); }
}

// Descarga cada slide del carrusel (una por una).
function mktCarDescargar(id) {
  const c = mktCarLista.find(x => x.id === id) ||
            (mktCarUltimo && mktCarUltimo.id === id ? mktCarUltimo : null);
  if (!c) { toast('No se encontró el carrusel', 'error'); return; }
  c.slides.forEach((s, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = s.url; a.download = `${id}-slide-${s.indice}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    }, i * 350);
  });
  toast('Descargando ' + c.slides.length + ' slides', 'success');
}

function mktCarSetReferencia(input) {
  mktCarReferencia = input.files && input.files[0] ? input.files[0] : null;
  const info = document.getElementById('mcar_ref_info');
  if (info) info.textContent = mktCarReferencia ? '✓ ' + mktCarReferencia.name
    : 'Guía el estilo de todas las slides con imagen.';
}

// ── Generar ─────────────────────────────────────────────────
async function mktCarSubmit() {
  const idea = document.getElementById('mcar_idea').value.trim();
  const categoria = document.getElementById('mcar_categoria').value;
  const modo = document.getElementById('mcar_modo').value;
  const fuente = document.getElementById('mcar_fuente').value.trim();
  if (!idea) { toast('Escribí tu idea primero', 'error'); return; }

  mktCarIdea = idea; mktCarCategoria = categoria; mktCarModo = modo; mktCarFuente = fuente;
  mktCarCargando = true;
  navigate('marketing-generator');
  try {
    const fd = new FormData();
    fd.append('idea', idea);
    fd.append('categoria', categoria);
    fd.append('modo', modo);
    fd.append('fuente', fuente);
    if (mktCarReferencia) fd.append('referencia', mktCarReferencia);
    const res = await fetch('/api/marketing-carousel/generar', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('vocai_token') },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    mktCarUltimo = data;
    mktCarReferencia = null;
    toast('Carrusel generado', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktCarCargando = false;
    navigate('marketing-generator');
  }
}

// Copia el copy del carrusel al portapapeles.
function mktCarCopiarCopy() {
  const t = document.getElementById('mcar_copy');
  if (!t) return;
  navigator.clipboard.writeText(t.value).then(
    () => toast('Copy copiado al portapapeles', 'success'),
    () => toast('No se pudo copiar', 'error'));
}

// ── Añadir al calendario ────────────────────────────────────
function mktCarAlCalendario(id) {
  const c = mktCarLista.find(x => x.id === id) ||
            (mktCarUltimo && mktCarUltimo.id === id ? mktCarUltimo : null);
  if (!c) { toast('No se encontró el carrusel', 'error'); return; }
  const hoy = new Date().toISOString().slice(0, 10);
  createModal('mktCarCalModal', 'Añadir al calendario', `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;line-height:1.5;">
      Se va a crear un carrusel en el <b>Calendario · Feed</b> con esta pieza,
      en la categoría <b>${escHtml(MKT_CAR_CATEGORIAS[c.categoria] || c.categoria || '—')}</b>.</p>
    <div class="form-group">
      <label class="form-label">Fecha de publicación</label>
      <input class="form-input" type="date" id="mccal_fecha" value="${hoy}">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('mktCarCalModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="mktCarCalGuardar('${escHtml(id)}')">Añadir</button>
  `);
}

async function mktCarCalGuardar(id) {
  const c = mktCarLista.find(x => x.id === id) ||
            (mktCarUltimo && mktCarUltimo.id === id ? mktCarUltimo : null);
  if (!c) return;
  const fecha = document.getElementById('mccal_fecha').value;
  if (!fecha) { toast('Elegí una fecha', 'error'); return; }
  try {
    const titulo = (c.slides[0] && c.slides[0].titulo) || c.idea || 'Carrusel generado';
    await API.post('/marketing-calendar', {
      titulo,
      fecha,
      formato: 'carrusel',
      pilar:   MKT_CAR_CAT_PILAR[c.categoria] || 'ia',
      estado:  'lista',
      notas:   '[media:/generador/carruseles/' + c.id + '/] ' +
               (c.copy || ('Carrusel del Generador · ' + c.total + ' slides')),
    });
    toast('Añadido al Calendario · Feed', 'success');
    closeModal('mktCarCalModal');
  } catch (err) { toast(err.message, 'error'); }
}
