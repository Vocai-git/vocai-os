/* ============================================================
   VOCAI OS — Marketing · Calendario editorial
   ============================================================ */

let mktCalDate = new Date();   // mes actualmente mostrado
let mktCalDragId = null;       // pieza que se está arrastrando
let mktCalPiezas = [];         // piezas del mes en memoria

const MKT_PILAR = {
  ia:       { label: 'IA y automatización', color: '#2979FF' },
  estudio:  { label: 'El estudio',          color: '#FF6B6B' },
  casos:    { label: 'Casos reales',        color: '#9D7FE8' },
  personas: { label: 'Las personas',        color: '#00C48C' },
};
const MKT_ESTADO = {
  idea:       { label: 'Idea',          color: '#888888' },
  produccion: { label: 'En producción', color: '#2979FF' },
  lista:      { label: 'Lista',         color: '#FF8C42' },
  publicada:  { label: 'Publicada',     color: '#00C48C' },
};
const MKT_FORMATOS = ['reel', 'carrusel', 'story', 'post', 'otro'];
const MKT_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Estilos propios del módulo (se inyectan una sola vez) ────
function mktCalInjectStyles() {
  if (document.getElementById('mkt-cal-styles')) return;
  const s = document.createElement('style');
  s.id = 'mkt-cal-styles';
  s.textContent = `
    .mkt-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
    .mkt-dayname { text-align:center; font-size:10px; font-weight:700; letter-spacing:1px;
      text-transform:uppercase; color:var(--text-dim); padding-bottom:4px; }
    .mkt-day { background:var(--surface); border:1px solid var(--border); border-radius:8px;
      padding:6px; min-height:108px; transition:border-color .15s, background .15s; }
    .mkt-day.weekend { background:#191919; }
    .mkt-day.empty { background:transparent; border-color:transparent; }
    .mkt-day.dragover { border-color:var(--coral); background:rgba(255,107,107,0.06); }
    .mkt-daynum { font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:4px;
      display:flex; justify-content:space-between; align-items:center; }
    .mkt-dayadd { cursor:pointer; color:var(--text-dim); font-size:14px; line-height:1;
      padding:0 4px; border-radius:4px; }
    .mkt-dayadd:hover { color:var(--coral); background:rgba(255,107,107,0.1); }
    .mkt-piece { border-radius:6px; padding:5px 7px; margin-bottom:4px; cursor:grab;
      background:#252525; border-left:3px solid var(--blue); transition:transform .1s; }
    .mkt-piece:hover { transform:translateX(1px); border-color:rgba(255,255,255,0.1); }
    .mkt-piece.dragging { opacity:.35; }
    .mkt-piece-fmt { font-size:8px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }
    .mkt-piece-tit { font-size:11px; font-weight:500; line-height:1.25; margin-top:1px; color:var(--text); }
    .mkt-piece-est { margin-top:3px; font-size:9px; display:flex; align-items:center; gap:3px; }
    .mkt-dot { width:6px; height:6px; border-radius:50%; display:inline-block; }
    .mkt-legend { display:flex; gap:14px; flex-wrap:wrap; }
    .mkt-legend-item { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); }
    .mkt-legend-dot { width:10px; height:10px; border-radius:3px; }
    .mkt-monthnav { display:flex; align-items:center; gap:8px; }
    .mkt-monthnav button { background:var(--bg); border:1px solid var(--border);
      color:var(--text); height:30px; min-width:30px; border-radius:8px; cursor:pointer;
      font-size:14px; font-family:'Outfit',sans-serif; }
    .mkt-monthnav button:hover { border-color:var(--coral); }
    .mkt-monthlabel { font-family:'Syne',sans-serif; font-weight:700; font-size:15px;
      min-width:140px; text-align:center; }
    .mkt-tally { display:flex; gap:18px; flex-wrap:wrap; font-size:13px; color:var(--text-muted);
      margin-top:16px; padding-top:14px; border-top:1px solid var(--border); align-items:center; }
    .mkt-tally b { color:var(--text); }
    .mkt-tally span { display:flex; align-items:center; gap:5px; }
  `;
  document.head.appendChild(s);
}

// ── Render principal ────────────────────────────────────────
async function renderMarketingCalendar(el) {
  mktCalInjectStyles();
  const y = mktCalDate.getFullYear();
  const m = mktCalDate.getMonth();
  const mesStr = `${y}-${String(m + 1).padStart(2, '0')}`;

  let piezas;
  try {
    piezas = await API.get(`/marketing-calendar?mes=${mesStr}`);
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">Error al cargar: ${escHtml(err.message)}</div>`;
    return;
  }
  mktCalPiezas = piezas;

  // conteo por pilar
  const tally = { ia: 0, estudio: 0, casos: 0, personas: 0 };
  piezas.forEach(p => { if (tally[p.pilar] !== undefined) tally[p.pilar]++; });

  // grilla del mes (semana arranca lunes)
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const diasMes = new Date(y, m + 1, 0).getDate();

  let celdas = '';
  for (let i = 0; i < offset; i++) celdas += `<div class="mkt-day empty"></div>`;
  for (let d = 1; d <= diasMes; d++) {
    const fecha = `${mesStr}-${String(d).padStart(2, '0')}`;
    const dow = new Date(y, m, d).getDay();
    const weekend = (dow === 0 || dow === 6) ? ' weekend' : '';
    const delDia = piezas.filter(p => p.fecha === fecha).map(mktPieceHTML).join('');
    celdas += `
      <div class="mkt-day${weekend}" ondragover="mktCalDragOver(event)"
           ondragleave="mktCalDragLeave(event)" ondrop="mktCalDrop(event,'${fecha}')">
        <div class="mkt-daynum">
          <span>${d}</span>
          <span class="mkt-dayadd" onclick="mktCalNew('${fecha}')" title="Agregar pieza">+</span>
        </div>
        ${delDia}
      </div>`;
  }
  const resto = (7 - ((offset + diasMes) % 7)) % 7;
  for (let i = 0; i < resto; i++) celdas += `<div class="mkt-day empty"></div>`;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Calendario editorial</h2>
      <button class="btn btn-primary" onclick="mktCalNew()">+ Nueva pieza</button>
    </div>

    <div class="card" style="margin-bottom:16px;display:flex;align-items:center;
         justify-content:space-between;flex-wrap:wrap;gap:14px;">
      <div class="mkt-monthnav">
        <button onclick="mktCalNav(-1)">&lsaquo;</button>
        <div class="mkt-monthlabel">${MKT_MESES[m]} ${y}</div>
        <button onclick="mktCalNav(1)">&rsaquo;</button>
        <button onclick="mktCalToday()" style="padding:0 12px;font-size:12px;">Hoy</button>
      </div>
      <div class="mkt-legend">
        ${Object.values(MKT_PILAR).map(v =>
          `<div class="mkt-legend-item"><span class="mkt-legend-dot"
            style="background:${v.color}"></span>${v.label}</div>`).join('')}
      </div>
    </div>

    <div class="mkt-grid">
      ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
        .map(d => `<div class="mkt-dayname">${d}</div>`).join('')}
      ${celdas}
    </div>

    <div class="mkt-tally">
      <span><b>${piezas.length}</b>&nbsp;piezas este mes</span>
      ${Object.entries(MKT_PILAR).map(([k, v]) =>
        `<span><span class="mkt-dot" style="background:${v.color}"></span>
          <b>${tally[k]}</b>&nbsp;${v.label}</span>`).join('')}
      <span style="margin-left:auto;color:var(--text-dim);font-size:12px;">
        Arrastrá una pieza para moverla de día · clic para editar
      </span>
    </div>`;
}

// ── HTML de una pieza ───────────────────────────────────────
function mktPieceHTML(p) {
  const pilar = MKT_PILAR[p.pilar] || MKT_PILAR.ia;
  const est = MKT_ESTADO[p.estado] || MKT_ESTADO.idea;
  return `
    <div class="mkt-piece" draggable="true" style="border-left-color:${pilar.color}"
         ondragstart="mktCalDragStart(event,'${p.id}')" ondragend="mktCalDragEnd(event)"
         onclick="mktCalEdit('${p.id}')">
      <div class="mkt-piece-fmt" style="color:${pilar.color}">${escHtml(p.formato)}</div>
      <div class="mkt-piece-tit">${escHtml(p.titulo)}</div>
      <div class="mkt-piece-est" style="color:${est.color}">
        <span class="mkt-dot" style="background:${est.color}"></span>${est.label}
      </div>
    </div>`;
}

// ── Navegación de meses ─────────────────────────────────────
function mktCalNav(delta) {
  mktCalDate = new Date(mktCalDate.getFullYear(), mktCalDate.getMonth() + delta, 1);
  navigate('marketing-calendar');
}
function mktCalToday() {
  mktCalDate = new Date();
  navigate('marketing-calendar');
}

// ── Drag & drop ─────────────────────────────────────────────
function mktCalDragStart(ev, id) {
  mktCalDragId = id;
  ev.dataTransfer.effectAllowed = 'move';
  ev.target.classList.add('dragging');
}
function mktCalDragEnd(ev) {
  ev.target.classList.remove('dragging');
}
function mktCalDragOver(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.add('dragover');
}
function mktCalDragLeave(ev) {
  ev.currentTarget.classList.remove('dragover');
}
async function mktCalDrop(ev, fecha) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('dragover');
  if (!mktCalDragId) return;
  const id = mktCalDragId;
  mktCalDragId = null;
  const pieza = mktCalPiezas.find(x => x.id === id);
  if (pieza && pieza.fecha === fecha) return;  // mismo día → nada
  try {
    await API.put(`/marketing-calendar/${id}`, { fecha });
    toast('Pieza movida', 'success');
    navigate('marketing-calendar');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Formulario (crear / editar) ─────────────────────────────
function mktCalForm(p) {
  const opts = (arr, sel) => arr.map(o =>
    `<option value="${o.v}" ${o.v === sel ? 'selected' : ''}>${o.l}</option>`).join('');
  const formatos = MKT_FORMATOS.map(f => ({ v: f, l: f.charAt(0).toUpperCase() + f.slice(1) }));
  const pilares = Object.entries(MKT_PILAR).map(([k, v]) => ({ v: k, l: v.label }));
  const estados = Object.entries(MKT_ESTADO).map(([k, v]) => ({ v: k, l: v.label }));
  return `
    <div class="form-group">
      <label class="form-label">Título *</label>
      <input class="form-input" id="mkf_titulo" value="${escHtml(p.titulo)}"
        placeholder="ej. La IA que contesta tu WhatsApp">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input class="form-input" id="mkf_fecha" type="date" value="${p.fecha || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Formato</label>
        <select class="form-select" id="mkf_formato">${opts(formatos, p.formato)}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Pilar</label>
        <select class="form-select" id="mkf_pilar">${opts(pilares, p.pilar)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="mkf_estado">${opts(estados, p.estado)}</select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">CTA</label>
      <input class="form-input" id="mkf_cta" value="${escHtml(p.cta)}"
        placeholder="ej. automatizá tu negocio">
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="mkf_notas"
        placeholder="Gancho, guion, referencias...">${escHtml(p.notas)}</textarea>
    </div>`;
}

function mktCalNew(fecha) {
  const p = {
    titulo: '', fecha: fecha || new Date().toISOString().slice(0, 10),
    formato: 'reel', pilar: 'ia', estado: 'idea', cta: '', notas: ''
  };
  createModal('mktCalModal', 'Nueva pieza', mktCalForm(p), `
    <button class="btn btn-secondary" onclick="closeModal('mktCalModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="mktCalSave()">Crear pieza</button>
  `);
}

function mktCalEdit(id) {
  const p = mktCalPiezas.find(x => x.id === id);
  if (!p) return;
  createModal('mktCalModal', 'Editar pieza', mktCalForm(p), `
    <button class="btn btn-danger" onclick="mktCalDelete('${id}')"
      style="margin-right:auto;">Eliminar</button>
    <button class="btn btn-secondary" onclick="closeModal('mktCalModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="mktCalSave('${id}')">Guardar</button>
  `);
}

async function mktCalSave(id) {
  const body = {
    titulo:  document.getElementById('mkf_titulo').value.trim(),
    fecha:   document.getElementById('mkf_fecha').value,
    formato: document.getElementById('mkf_formato').value,
    pilar:   document.getElementById('mkf_pilar').value,
    estado:  document.getElementById('mkf_estado').value,
    cta:     document.getElementById('mkf_cta').value.trim(),
    notas:   document.getElementById('mkf_notas').value.trim(),
  };
  if (!body.titulo) { toast('El título es obligatorio', 'error'); return; }
  if (!body.fecha)  { toast('La fecha es obligatoria', 'error'); return; }
  try {
    if (id) await API.put(`/marketing-calendar/${id}`, body);
    else    await API.post('/marketing-calendar', body);
    toast(id ? 'Pieza actualizada' : 'Pieza creada', 'success');
    closeModal('mktCalModal');
    navigate('marketing-calendar');
  } catch (err) { toast(err.message, 'error'); }
}

async function mktCalDelete(id) {
  if (!confirm('¿Eliminar esta pieza? No se puede deshacer.')) return;
  try {
    await API.del(`/marketing-calendar/${id}`);
    toast('Pieza eliminada', 'success');
    closeModal('mktCalModal');
    navigate('marketing-calendar');
  } catch (err) { toast(err.message, 'error'); }
}
