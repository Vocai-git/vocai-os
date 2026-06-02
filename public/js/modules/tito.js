/* ============================================================
   VOCAI OS — Tito (Atención al cliente)
   ============================================================ */

const TITO_CANALES  = { whatsapp: 'WhatsApp', llamada: 'Llamada', email: 'Email', otro: 'Otro' };
const TITO_TIPOS    = { presupuesto: 'Presupuesto', consulta_datos: 'Consulta', otra: 'Otra' };
const TITO_ESTADOS  = { pendiente: 'Pendiente', en_curso: 'En curso', resuelto: 'Resuelto', cerrado: 'Cerrado' };
const TITO_URGENCIA = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baja: 'Baja' };

let titoFiltroCanal  = '';
let titoFiltroEstado = 'estado_no=cerrado';
let titoOffset       = 0;
const TITO_LIMIT     = 30;
let titoDetalleCasoId = null;

// ── Render principal ──────────────────────────────────────────
async function renderTito(container) {
  container.innerHTML = titoShell();
  titoFiltroCanal  = '';
  titoFiltroEstado = 'estado_no=cerrado';
  titoOffset       = 0;
  titoDetalleCasoId = null;

  await Promise.all([titoCargarContadores(), titoCargarCasos()]);
  titoBindFiltros();
}

function titoShell() {
  return `
<style>
.tito-layout {
  display: flex;
  gap: 20px;
  height: calc(100vh - 108px);
  overflow: hidden;
}
.tito-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
.tito-right {
  width: 360px;
  flex-shrink: 0;
  display: none;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
}
.tito-right.open { display: flex; }

/* Stats */
.tito-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
.tito-stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  transition: border-color var(--transition);
}
.tito-stat:hover { border-color: var(--border-light); }
.tito-stat-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.tito-stat-value {
  font-family: 'Syne', sans-serif;
  font-size: 26px;
  font-weight: 800;
  color: var(--text);
  line-height: 1;
}
.tito-stat-value.accent { color: var(--coral); }

/* Filtros */
.tito-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tito-sep { width: 1px; height: 18px; background: var(--border); margin: 0 2px; }
.tito-pill {
  padding: 4px 12px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
  font-family: 'Outfit', sans-serif;
}
.tito-pill:hover { border-color: var(--border-light); color: var(--text); }
.tito-pill.active { border-color: var(--coral); color: var(--coral); background: var(--coral-dim); }

/* Lista */
.tito-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--border);
  overflow: hidden;
}
.tito-row {
  background: var(--surface);
  padding: 13px 16px;
  cursor: pointer;
  transition: background var(--transition);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.tito-row:hover { background: var(--surface-hover); }
.tito-row.selected { background: rgba(255,107,107,0.05); border-left: 2px solid var(--coral); }
.tito-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.tito-row-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.tito-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tito-row-ref {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tito-row-bottom {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tito-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.2px;
}
.tito-tag-canal  { color: var(--text-muted); border: 1px solid var(--border); }
.tito-tag-estado-pendiente { color: #60a5fa; background: rgba(96,165,250,0.08); }
.tito-tag-estado-en_curso  { color: #fb923c; background: rgba(251,146,60,0.08); }
.tito-tag-estado-resuelto  { color: var(--green); background: rgba(0,196,140,0.08); }
.tito-tag-estado-cerrado   { color: var(--text-muted); background: rgba(255,255,255,0.04); }
.tito-tag-urg-urgente { color: var(--coral); background: var(--coral-dim); }
.tito-tag-urg-alta    { color: #fb923c; background: rgba(251,146,60,0.08); }
.tito-tag-urg-normal  { }
.tito-tag-urg-baja    { color: var(--text-muted); }
.tito-time { margin-left: auto; font-size: 10px; color: var(--text-muted); }

/* Panel detalle */
.tito-detail-header {
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tito-detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.tito-detail-section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.tito-detail-section:last-child { border-bottom: none; }
.tito-section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}

/* Conversación */
.tito-bubble {
  padding: 9px 13px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.5;
  max-width: 88%;
  margin-bottom: 6px;
  color: var(--text);
}
.tito-bubble.cliente {
  background: var(--bg);
  border: 1px solid var(--border);
  align-self: flex-start;
  border-bottom-left-radius: 3px;
}
.tito-bubble.bot {
  background: rgba(255,107,107,0.08);
  border: 1px solid rgba(255,107,107,0.15);
  align-self: flex-end;
  border-bottom-right-radius: 3px;
}
.tito-bubble-time {
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 3px;
  text-align: right;
}
.tito-chat {
  display: flex;
  flex-direction: column;
  padding: 0;
}

/* Paginación */
.tito-pag {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
  padding: 8px 0 0;
  flex-shrink: 0;
}
</style>

<div class="tito-layout">

  <!-- IZQUIERDA -->
  <div class="tito-left">
    <div class="tito-stats" id="titoStats">
      ${[0,1,2,3].map(() => `<div class="tito-stat" style="opacity:.4">&nbsp;</div>`).join('')}
    </div>

    <div class="tito-filters" id="titoFiltros">
      <button class="tito-pill active" data-f="estado" data-v="estado_no=cerrado">Activos</button>
      <button class="tito-pill" data-f="estado" data-v="estado=resuelto">Resueltos</button>
      <button class="tito-pill" data-f="estado" data-v="">Todos</button>
      <div class="tito-sep"></div>
      <button class="tito-pill active" data-f="canal" data-v="">Todos</button>
      <button class="tito-pill" data-f="canal" data-v="whatsapp">WhatsApp</button>
      <button class="tito-pill" data-f="canal" data-v="llamada">Llamadas</button>
    </div>

    <div class="tito-list" id="titoCasos">
      <div class="loader"><div class="spinner"></div></div>
    </div>

    <div class="tito-pag" id="titoPaginacion"></div>
  </div>

  <!-- DERECHA: detalle -->
  <div class="tito-right" id="titoDetalle"></div>

</div>`;
}

// ── Contadores ────────────────────────────────────────────────
async function titoCargarContadores() {
  try {
    const d = await API.get('/tito/contadores');
    document.getElementById('titoStats').innerHTML = `
      ${titoStat('Casos hoy',       d.casos_hoy,             false)}
      ${titoStat('Urgentes',        d.urgentes_pendientes,   d.urgentes_pendientes > 0)}
      ${titoStat('Sin asignar',     d.sin_asignar_pendientes,false)}
      ${titoStat('Resueltos hoy',   d.resueltos_hoy,         false)}
    `;
  } catch {
    document.getElementById('titoStats').innerHTML =
      `<div style="grid-column:1/-1;padding:12px;color:var(--text-muted);font-size:13px">No se pudo conectar con vocai-assistant</div>`;
  }
}

function titoStat(label, valor, accent) {
  return `
    <div class="tito-stat">
      <div class="tito-stat-label">${label}</div>
      <div class="tito-stat-value${accent ? ' accent' : ''}">${valor ?? '—'}</div>
    </div>`;
}

// ── Lista de casos ────────────────────────────────────────────
async function titoCargarCasos() {
  const listEl = document.getElementById('titoCasos');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  try {
    const params = new URLSearchParams({ limit: TITO_LIMIT, offset: titoOffset });
    if (titoFiltroCanal) params.set('canal', titoFiltroCanal);
    if (titoFiltroEstado.includes('=')) {
      const [k, v] = titoFiltroEstado.split('=');
      params.set(k, v);
    }

    const { casos, total } = await API.get(`/tito/casos?${params}`);

    if (!casos || casos.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-title">Sin casos</div><div class="empty-text">No hay casos que coincidan con los filtros</div></div>`;
      document.getElementById('titoPaginacion').innerHTML = '';
      return;
    }

    listEl.innerHTML = casos.map(c => titoCasoRow(c)).join('');

    const pages = Math.ceil(total / TITO_LIMIT);
    const curr  = Math.floor(titoOffset / TITO_LIMIT);
    const pag   = document.getElementById('titoPaginacion');
    pag.innerHTML = pages > 1 ? `
      <button class="btn btn-secondary btn-sm" ${curr === 0 ? 'disabled' : ''} onclick="titoIrPagina(${curr - 1})">← Anterior</button>
      <span style="font-size:12px;color:var(--text-muted)">${curr + 1} / ${pages}</span>
      <button class="btn btn-secondary btn-sm" ${curr >= pages - 1 ? 'disabled' : ''} onclick="titoIrPagina(${curr + 1})">Siguiente →</button>
    ` : '';

    listEl.querySelectorAll('.tito-row').forEach(row => {
      row.addEventListener('click', () => titoAbrirDetalle(row.dataset.id));
    });

    if (titoDetalleCasoId) {
      const sel = listEl.querySelector(`[data-id="${titoDetalleCasoId}"]`);
      if (sel) sel.classList.add('selected');
    }
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  }
}

function titoCasoRow(c) {
  const nombre = escHtml(c.cliente_nombre || c.cliente_telefono || 'Desconocido');
  const ref    = escHtml(c.referencia || c.datos?.resumen || '');
  const canal  = c.canal  || 'otro';
  const urg    = c.urgencia || 'normal';
  const estado = c.estado || 'pendiente';
  const fecha  = c.creado_en
    ? new Date(c.creado_en).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '';

  const urgTag = urg !== 'normal' && urg !== 'baja'
    ? `<span class="tito-tag tito-tag-urg-${urg}">${TITO_URGENCIA[urg]}</span>` : '';

  return `
<div class="tito-row" data-id="${c.id}">
  <div class="tito-row-top">
    <div class="tito-row-name">${nombre}</div>
    <div class="tito-row-meta">
      <span class="tito-tag tito-tag-estado-${estado}">${TITO_ESTADOS[estado] || estado}</span>
    </div>
  </div>
  ${ref ? `<div class="tito-row-ref">${ref}</div>` : ''}
  <div class="tito-row-bottom">
    <span class="tito-tag tito-tag-canal">${TITO_CANALES[canal] || canal}</span>
    ${urgTag}
    <span class="tito-time">${fecha}</span>
  </div>
</div>`;
}

// ── Detalle ───────────────────────────────────────────────────
async function titoAbrirDetalle(id) {
  titoDetalleCasoId = id;
  document.querySelectorAll('.tito-row').forEach(r => r.classList.toggle('selected', r.dataset.id === id));

  const panel = document.getElementById('titoDetalle');
  panel.classList.add('open');
  panel.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  try {
    const caso = await API.get(`/tito/casos/${id}`);
    panel.innerHTML = titoDetalleHTML(caso);

    panel.querySelectorAll('[data-estado-btn]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nuevoEstado = btn.dataset.estadoBtn;
        btn.disabled = true;
        try {
          await API.req('PATCH', `/tito/casos/${id}`, { estado: nuevoEstado });
          toast(`Estado: ${TITO_ESTADOS[nuevoEstado]}`, 'success');
          await Promise.all([titoCargarContadores(), titoCargarCasos()]);
          if (titoDetalleCasoId === id) await titoAbrirDetalle(id);
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    panel.innerHTML = `<div style="padding:20px"><div class="alert alert-error">${escHtml(err.message)}</div></div>`;
  }
}

function titoDetalleHTML(caso) {
  const nombre = escHtml(caso.cliente_nombre || caso.cliente_telefono || 'Desconocido');
  const tel    = escHtml(caso.cliente_telefono || '');
  const canal  = caso.canal    || 'otro';
  const urg    = caso.urgencia || 'normal';
  const estado = caso.estado   || 'pendiente';
  const tipo   = TITO_TIPOS[caso.tipo] || caso.tipo || '';
  const ref    = escHtml(caso.referencia || caso.datos?.resumen || '');
  const fecha  = caso.creado_en ? new Date(caso.creado_en).toLocaleString('es-ES') : '';
  const datos  = caso.datos || {};
  const msgs   = caso.conversacion || [];

  const esActivo = estado !== 'resuelto' && estado !== 'cerrado';
  const accionBtn = esActivo
    ? `<button class="btn btn-sm" style="background:var(--green);color:#fff;font-size:12px" data-estado-btn="resuelto">Marcar resuelto</button>`
    : `<button class="btn btn-sm btn-secondary" style="font-size:12px" data-estado-btn="pendiente">Reabrir</button>`;

  const msgsHTML = msgs.length === 0
    ? `<div style="padding:20px 0;text-align:center;font-size:12px;color:var(--text-muted)">Sin mensajes registrados</div>`
    : `<div class="tito-chat">
        ${msgs.map(m => `
          <div class="tito-bubble ${m.rol === 'cliente' ? 'cliente' : 'bot'}">
            ${escHtml(m.contenido || '')}
            <div class="tito-bubble-time">${m.creado_en ? new Date(m.creado_en).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}) : ''}</div>
          </div>`).join('')}
      </div>`;

  return `
<div class="tito-detail-header">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:3px">${nombre}</div>
      ${tel ? `<div style="font-size:12px;color:var(--text-muted)">${tel}</div>` : ''}
    </div>
    <button onclick="titoDetalleCerrar()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:2px 4px;line-height:1;transition:color var(--transition)" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text-muted)'">✕</button>
  </div>
  <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center">
    <span class="tito-tag tito-tag-canal">${TITO_CANALES[canal] || canal}</span>
    <span class="tito-tag tito-tag-estado-${estado}">${TITO_ESTADOS[estado] || estado}</span>
    ${urg !== 'normal' ? `<span class="tito-tag tito-tag-urg-${urg}">${TITO_URGENCIA[urg]}</span>` : ''}
    ${tipo ? `<span class="tito-tag" style="color:var(--text-muted)">${tipo}</span>` : ''}
  </div>
</div>

<div class="tito-detail-body">

  <div class="tito-detail-section">
    <div class="tito-section-label">Datos del caso</div>
    ${ref ? `<div style="font-size:13px;color:var(--text);margin-bottom:8px">${ref}</div>` : ''}
    ${datos.nombre || datos.empresa ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${[datos.nombre,datos.empresa].filter(Boolean).map(v=>escHtml(v)).join(' · ')}</div>` : ''}
    <div style="font-size:11px;color:var(--text-muted)">${fecha}</div>
  </div>

  <div class="tito-detail-section">
    <div style="display:flex;gap:8px">${accionBtn}</div>
  </div>

  <div class="tito-detail-section" style="flex:1;overflow:hidden;display:flex;flex-direction:column">
    <div class="tito-section-label">Conversación</div>
    <div style="flex:1;overflow-y:auto">${msgsHTML}</div>
  </div>

</div>`;
}

function titoDetalleCerrar() {
  titoDetalleCasoId = null;
  const panel = document.getElementById('titoDetalle');
  if (panel) { panel.classList.remove('open'); panel.innerHTML = ''; }
  document.querySelectorAll('.tito-row').forEach(r => r.classList.remove('selected'));
}
window.titoDetalleCerrar = titoDetalleCerrar;

// ── Paginación ────────────────────────────────────────────────
function titoIrPagina(page) {
  titoOffset = page * TITO_LIMIT;
  titoCargarCasos();
}
window.titoIrPagina = titoIrPagina;

// ── Filtros ───────────────────────────────────────────────────
function titoBindFiltros() {
  document.querySelectorAll('[data-f="estado"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-f="estado"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      titoFiltroEstado = btn.dataset.v;
      titoOffset = 0;
      titoCargarCasos();
    });
  });

  document.querySelectorAll('[data-f="canal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-f="canal"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      titoFiltroCanal = btn.dataset.v;
      titoOffset = 0;
      titoCargarCasos();
    });
  });
}
