/* ============================================================
   VOCAI OS — Marketing · Inteligencia (banco de temas)
   Reutiliza MKT_PILAR y mktCalInjectStyles de marketing-calendar.js.
   ============================================================ */

let mktIntTemas = [];
let mktIntFPilar = '';
let mktIntFEstado = '';

const MKT_TOPIC_ESTADO = {
  nuevo:      { label: 'Nuevo',      color: '#2979FF' },
  usado:      { label: 'Usado',      color: '#00C48C' },
  descartado: { label: 'Descartado', color: '#888888' },
};

async function renderMarketingIntelligence(el) {
  mktCalInjectStyles();
  let temas;
  try {
    temas = await API.get('/marketing-intelligence');
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">Error al cargar: ${escHtml(err.message)}</div>`;
    return;
  }
  mktIntTemas = temas;

  let vis = temas;
  if (mktIntFPilar)  vis = vis.filter(t => t.pilar === mktIntFPilar);
  if (mktIntFEstado) vis = vis.filter(t => t.estado === mktIntFEstado);

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Inteligencia · Banco de temas</h2>
      <button class="btn btn-primary" onclick="mktIntNew()">+ Nuevo tema</button>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;align-items:center;
         gap:12px;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--text-muted);">Filtrar:</span>
      <select class="filter-select" onchange="mktIntSetPilar(this.value)">
        <option value="">Todos los pilares</option>
        ${Object.entries(MKT_PILAR).map(([k, v]) =>
          `<option value="${k}" ${mktIntFPilar === k ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
      <select class="filter-select" onchange="mktIntSetEstado(this.value)">
        <option value="">Todos los estados</option>
        ${Object.entries(MKT_TOPIC_ESTADO).map(([k, v]) =>
          `<option value="${k}" ${mktIntFEstado === k ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
      <span style="margin-left:auto;font-size:13px;color:var(--text-muted);">
        ${vis.length} de ${temas.length} temas
      </span>
    </div>

    ${vis.length ? `<div class="grid-auto">${vis.map(mktIntCard).join('')}</div>` : `
      <div class="empty-state">
        <div class="empty-icon">💡</div>
        <div class="empty-title">El banco de temas está vacío</div>
        <div class="empty-sub">Acá se juntan los temas y ángulos de contenido —
          del research, de Grok, del bot o cargados a mano.</div>
      </div>`}
  `;
}

function mktIntCard(t) {
  const pilar = MKT_PILAR[t.pilar] || { label: '—', color: '#888888' };
  const est = MKT_TOPIC_ESTADO[t.estado] || MKT_TOPIC_ESTADO.nuevo;
  let fuente = '';
  if (t.fuente) {
    fuente = /^https?:\/\//.test(t.fuente)
      ? `<a href="${escHtml(t.fuente)}" target="_blank" onclick="event.stopPropagation()"
           style="color:var(--blue);font-size:12px;">Ver fuente ↗</a>`
      : `<span style="font-size:12px;color:var(--text-muted);">${escHtml(t.fuente)}</span>`;
  }
  return `
    <div class="card" style="border-left:3px solid ${pilar.color};cursor:pointer;"
         onclick="mktIntEdit('${t.id}')">
      <div style="font-weight:600;font-size:14px;line-height:1.3;margin-bottom:8px;">
        ${escHtml(t.titulo)}
      </div>
      ${t.angulo ? `<div style="font-size:13px;color:var(--text-muted);
        margin-bottom:10px;">${escHtml(t.angulo)}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span style="font-size:11px;font-weight:600;color:${pilar.color};
          text-transform:uppercase;">${pilar.label}</span>
        <span style="font-size:11px;color:${est.color};">● ${est.label}</span>
      </div>
      ${fuente ? `<div style="margin-top:8px;">${fuente}</div>` : ''}
    </div>`;
}

function mktIntSetPilar(v)  { mktIntFPilar = v;  navigate('marketing-intelligence'); }
function mktIntSetEstado(v) { mktIntFEstado = v; navigate('marketing-intelligence'); }

function mktIntForm(t) {
  const opt = (arr, sel) => arr.map(o =>
    `<option value="${o.v}" ${o.v === sel ? 'selected' : ''}>${o.l}</option>`).join('');
  const pilares = Object.entries(MKT_PILAR).map(([k, v]) => ({ v: k, l: v.label }));
  const estados = Object.entries(MKT_TOPIC_ESTADO).map(([k, v]) => ({ v: k, l: v.label }));
  return `
    <div class="form-group">
      <label class="form-label">Tema / título *</label>
      <input class="form-input" id="mif_titulo" value="${escHtml(t.titulo)}"
        placeholder="ej. Cómo la IA cambia la atención al cliente">
    </div>
    <div class="form-group">
      <label class="form-label">Ángulo</label>
      <textarea class="form-textarea" id="mif_angulo"
        placeholder="Desde qué enfoque contarlo">${escHtml(t.angulo)}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Pilar</label>
        <select class="form-select" id="mif_pilar">${opt(pilares, t.pilar)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="mif_estado">${opt(estados, t.estado)}</select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Fuente</label>
      <input class="form-input" id="mif_fuente" value="${escHtml(t.fuente)}"
        placeholder="URL o de dónde salió el tema">
    </div>`;
}

function mktIntNew() {
  createModal('mktIntModal', 'Nuevo tema',
    mktIntForm({ titulo: '', angulo: '', pilar: 'ia', estado: 'nuevo', fuente: '' }), `
    <button class="btn btn-secondary" onclick="closeModal('mktIntModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="mktIntSave()">Crear tema</button>
  `);
}

function mktIntEdit(id) {
  const t = mktIntTemas.find(x => x.id === id);
  if (!t) return;
  createModal('mktIntModal', 'Editar tema', mktIntForm(t), `
    <button class="btn btn-danger" onclick="mktIntDelete('${id}')"
      style="margin-right:auto;">Eliminar</button>
    <button class="btn btn-secondary" onclick="closeModal('mktIntModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="mktIntSave('${id}')">Guardar</button>
  `);
}

async function mktIntSave(id) {
  const body = {
    titulo: document.getElementById('mif_titulo').value.trim(),
    angulo: document.getElementById('mif_angulo').value.trim(),
    pilar:  document.getElementById('mif_pilar').value,
    estado: document.getElementById('mif_estado').value,
    fuente: document.getElementById('mif_fuente').value.trim(),
  };
  if (!body.titulo) { toast('El título es obligatorio', 'error'); return; }
  try {
    if (id) await API.put(`/marketing-intelligence/${id}`, body);
    else    await API.post('/marketing-intelligence', body);
    toast(id ? 'Tema actualizado' : 'Tema creado', 'success');
    closeModal('mktIntModal');
    navigate('marketing-intelligence');
  } catch (err) { toast(err.message, 'error'); }
}

async function mktIntDelete(id) {
  if (!confirm('¿Eliminar este tema? No se puede deshacer.')) return;
  try {
    await API.del(`/marketing-intelligence/${id}`);
    toast('Tema eliminado', 'success');
    closeModal('mktIntModal');
    navigate('marketing-intelligence');
  } catch (err) { toast(err.message, 'error'); }
}
