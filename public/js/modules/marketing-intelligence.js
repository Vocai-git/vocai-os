/* ============================================================
   VOCAI OS — Marketing · Inteligencia (banco de temas)
   Lista los temas agrupados por día (corrida del Radar IA).
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

const MKT_TIPO = {
  herramienta: { label: 'Herramienta', emoji: '🛠' },
  caso:        { label: 'Caso real',   emoji: '📈' },
  debate:      { label: 'Debate',      emoji: '💬' },
  hype:        { label: 'Hype',        emoji: '🔥' },
  espana:      { label: 'España',      emoji: '🇪🇸' },
};

const MKT_MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                         'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

  const grupos = mktIntAgrupar(vis);

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Inteligencia · Banco de temas</h2>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" onclick="mktIntCorrerRadar()"
          title="Disparar el Radar IA ahora (busca novedades en Grok + Telegram digest)">
          📡 Correr Radar ahora
        </button>
        <button class="btn btn-primary" onclick="mktIntNew()">+ Nuevo tema</button>
      </div>
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

    ${grupos.length ? grupos.map(mktIntGrupo).join('') : `
      <div class="empty-state">
        <div class="empty-icon">💡</div>
        <div class="empty-title">El banco de temas está vacío</div>
        <div class="empty-sub">Acá se juntan los temas y ángulos de contenido —
          del Radar IA, de Grok o cargados a mano.</div>
      </div>`}
  `;
}

// ── Agrupar por día (created_at) ────────────────────────────
function mktIntAgrupar(temas) {
  const grupos = [];
  const idx = {};
  temas.forEach(t => {
    const d = t.created_at ? new Date(t.created_at) : null;
    const key = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : 'sin';
    if (!(key in idx)) {
      idx[key] = grupos.length;
      grupos.push({ key, fecha: d, items: [] });
    }
    grupos[idx[key]].items.push(t);
  });
  return grupos;
}

function mktIntGrupo(g) {
  const label = g.fecha
    ? `${g.fecha.getDate()} ${MKT_MESES_CORTO[g.fecha.getMonth()]} ${g.fecha.getFullYear()}`
    : 'Sin fecha';
  const n = g.items.length;
  return `
    <div style="margin-bottom:26px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="font-weight:700;font-size:14px;color:var(--text);">${label}</span>
        <span style="font-size:12px;color:var(--text-muted);">·
          ${n} ${n === 1 ? 'tema' : 'temas'}</span>
        <div style="flex:1;height:1px;background:var(--border);"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${g.items.map(mktIntFila).join('')}
      </div>
    </div>`;
}

// ── Fila de tema ────────────────────────────────────────────
function mktIntFila(t) {
  const pilar = MKT_PILAR[t.pilar] || { label: '—', color: '#888888' };
  const est = MKT_TOPIC_ESTADO[t.estado] || MKT_TOPIC_ESTADO.nuevo;
  const tipo = MKT_TIPO[t.tipo];
  const emoji = tipo ? tipo.emoji : '•';

  const meta = [];
  meta.push(`<span style="font-size:11px;font-weight:600;color:${pilar.color};
    text-transform:uppercase;">${pilar.label}</span>`);
  if (tipo) meta.push(`<span style="font-size:11px;color:var(--text-muted);">${tipo.label}</span>`);
  meta.push(`<span style="font-size:11px;color:${est.color};">● ${est.label}</span>`);
  if (t.fecha_noticia) {
    meta.push(`<span style="font-size:11px;color:var(--text-muted);">📅 ${mktIntFechaCorta(t.fecha_noticia)}</span>`);
  }
  const url = t.fuente_url || (/^https?:\/\//.test(t.fuente || '') ? t.fuente : '');
  if (url) {
    meta.push(`<a href="${escHtml(url)}" target="_blank" onclick="event.stopPropagation()"
      style="font-size:11px;color:var(--blue);">${escHtml(t.fuente && !/^https?:\/\//.test(t.fuente) ? t.fuente : 'Fuente')} ↗</a>`);
  } else if (t.fuente) {
    meta.push(`<span style="font-size:11px;color:var(--text-muted);">${escHtml(t.fuente)}</span>`);
  }

  return `
    <div class="card" style="border-left:3px solid ${pilar.color};cursor:pointer;
         padding:12px 14px;" onclick="mktIntEdit('${t.id}')">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:16px;line-height:1.3;">${emoji}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:14px;line-height:1.3;">
            ${escHtml(t.titulo)}
          </div>
          ${t.descripcion ? `<div style="font-size:13px;color:var(--text-muted);
            margin-top:4px;">${escHtml(t.descripcion)}</div>` : ''}
          ${t.angulo ? `<div style="font-size:12px;color:var(--text-muted);
            margin-top:6px;font-style:italic;">↳ ${escHtml(t.angulo)}</div>` : ''}
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;
            margin-top:8px;">${meta.join('')}</div>
        </div>
        <button class="btn btn-secondary" title="Crear contenido con este tema"
          style="flex:0 0 auto;padding:7px 12px;font-size:12px;align-self:center;"
          onclick="event.stopPropagation();mktIntAlGenerador('${t.id}')">→ Generador</button>
      </div>
    </div>`;
}

// Manda el tema al Generador con la idea ya cargada.
function mktIntAlGenerador(id) {
  const t = mktIntTemas.find(x => x.id === id);
  if (!t) return;
  let idea = t.titulo || '';
  if (t.descripcion) idea += '. ' + t.descripcion;
  if (t.angulo) idea += ' — Ángulo: ' + t.angulo;
  generarDesdeIdea(idea, t.fuente || '');
}

function mktIntFechaCorta(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return escHtml(s || '');
  return `${+m[3]} ${MKT_MESES_CORTO[+m[2] - 1]}`;
}

// Dispara el Radar IA ahora — fuera de la corrida automática del cron.
// La llamada puede tardar 1-2 minutos (Grok + xAI hace web/X search).
async function mktIntCorrerRadar() {
  if (!confirm('¿Disparar el Radar IA ahora? Puede tardar 1-2 minutos.\n\n' +
    'Cuando termine te llega el digest a Telegram y los temas aparecen en este banco.')) return;
  toast('Radar corriendo… esperá 1-2 min', 'info');
  try {
    const r = await API.post('/radar/run');
    toast(`Radar OK · ${r.total} temas nuevos · revisá Telegram`, 'success');
    navigate('marketing-intelligence');
  } catch (err) {
    toast('Radar falló: ' + err.message, 'error');
  }
}

function mktIntSetPilar(v)  { mktIntFPilar = v;  navigate('marketing-intelligence'); }
function mktIntSetEstado(v) { mktIntFEstado = v; navigate('marketing-intelligence'); }

// ── Formulario ──────────────────────────────────────────────
function mktIntForm(t) {
  const opt = (arr, sel) => arr.map(o =>
    `<option value="${o.v}" ${o.v === sel ? 'selected' : ''}>${o.l}</option>`).join('');
  const pilares = Object.entries(MKT_PILAR).map(([k, v]) => ({ v: k, l: v.label }));
  const estados = Object.entries(MKT_TOPIC_ESTADO).map(([k, v]) => ({ v: k, l: v.label }));
  const tipos = [{ v: '', l: '— sin tipo —' }].concat(
    Object.entries(MKT_TIPO).map(([k, v]) => ({ v: k, l: `${v.emoji} ${v.label}` })));
  return `
    <div class="form-group">
      <label class="form-label">Tema / título *</label>
      <input class="form-input" id="mif_titulo" value="${escHtml(t.titulo || '')}"
        placeholder="ej. Cómo la IA cambia la atención al cliente">
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-textarea" id="mif_descripcion"
        placeholder="Qué pasó, en una línea">${escHtml(t.descripcion || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Ángulo de contenido</label>
      <textarea class="form-textarea" id="mif_angulo"
        placeholder="Cómo convertirlo en un reel o carrusel">${escHtml(t.angulo || '')}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select class="form-select" id="mif_tipo">${opt(tipos, t.tipo || '')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Pilar</label>
        <select class="form-select" id="mif_pilar">${opt(pilares, t.pilar)}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="mif_estado">${opt(estados, t.estado)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de la noticia</label>
        <input class="form-input" id="mif_fecha" type="date" value="${escHtml(t.fecha_noticia || '')}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Fuente</label>
      <input class="form-input" id="mif_fuente" value="${escHtml(t.fuente || '')}"
        placeholder="Nombre del medio o referente">
    </div>
    <div class="form-group">
      <label class="form-label">Link de la fuente</label>
      <input class="form-input" id="mif_fuente_url" value="${escHtml(t.fuente_url || '')}"
        placeholder="https://...">
    </div>`;
}

function mktIntNew() {
  createModal('mktIntModal', 'Nuevo tema',
    mktIntForm({ titulo: '', descripcion: '', angulo: '', tipo: '',
                 pilar: 'ia', estado: 'nuevo', fuente: '', fuente_url: '', fecha_noticia: '' }), `
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
    titulo:      document.getElementById('mif_titulo').value.trim(),
    descripcion: document.getElementById('mif_descripcion').value.trim(),
    angulo:      document.getElementById('mif_angulo').value.trim(),
    tipo:        document.getElementById('mif_tipo').value || null,
    pilar:       document.getElementById('mif_pilar').value,
    estado:      document.getElementById('mif_estado').value,
    fecha_noticia: document.getElementById('mif_fecha').value || null,
    fuente:      document.getElementById('mif_fuente').value.trim(),
    fuente_url:  document.getElementById('mif_fuente_url').value.trim() || null,
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
