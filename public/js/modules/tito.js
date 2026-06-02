/* ============================================================
   VOCAI OS — Tito (Atención al cliente)
   Dashboard de casos y conversaciones gestionados por Tito.
   Proxy vía /api/tito → vocai-assistant backend.
   ============================================================ */

const TITO_CANALES  = { whatsapp: 'WhatsApp', llamada: 'Llamada', email: 'Email', otro: 'Otro' };
const TITO_TIPOS    = { presupuesto: 'Presupuesto', consulta_datos: 'Consulta', otra: 'Otra' };
const TITO_ESTADOS  = { abierto: 'Abierto', en_gestion: 'En gestión', resuelto: 'Resuelto', cancelado: 'Cancelado' };
const TITO_URGENCIA = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baja: 'Baja' };

const TITO_CANAL_BADGE = {
  whatsapp: 'background:#25D366;color:#fff',
  llamada:  'background:#2979FF;color:#fff',
  email:    'background:#FF9800;color:#fff',
  otro:     'background:#666;color:#fff'
};
const TITO_URGENCIA_BADGE = {
  urgente: 'background:#ef4444;color:#fff',
  alta:    'background:#f97316;color:#fff',
  normal:  'background:#22c55e;color:#fff',
  baja:    'background:#64748b;color:#fff'
};
const TITO_ESTADO_BADGE = {
  abierto:     'background:rgba(41,121,255,0.2);color:#2979FF',
  en_gestion:  'background:rgba(249,115,22,0.2);color:#f97316',
  resuelto:    'background:rgba(34,197,94,0.2);color:#22c55e',
  cancelado:   'background:rgba(100,116,139,0.2);color:#94a3b8'
};

let titoFiltroCanal = '';
let titoFiltroEstado = 'estado_no=resuelto';
let titoOffset = 0;
const TITO_LIMIT = 30;
let titoDetalleCasoId = null;

// ── Render principal ─────────────────────────────────────────
async function renderTito(container) {
  container.innerHTML = titoShell();
  titoFiltroCanal = '';
  titoFiltroEstado = 'estado_no=resuelto';
  titoOffset = 0;
  titoDetalleCasoId = null;

  await Promise.all([titoCargarContadores(), titoCargarCasos()]);
  titoBindFiltros();
}

function titoShell() {
  return `
<div style="display:flex;gap:20px;height:calc(100vh - 80px);overflow:hidden">

  <!-- COLUMNA IZQUIERDA: stats + lista -->
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px;overflow:hidden">

    <!-- Stats cards -->
    <div id="titoStats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
      ${[1,2,3,4].map(() => `<div class="card" style="padding:16px;animation:pulse 1.5s infinite">&nbsp;</div>`).join('')}
    </div>

    <!-- Filtros -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <div id="titoTabsEstado" style="display:flex;gap:6px">
        <button class="tito-tab active" data-estado="estado_no=resuelto">Abiertos</button>
        <button class="tito-tab" data-estado="estado=resuelto">Resueltos</button>
        <button class="tito-tab" data-estado="">Todos</button>
      </div>
      <div style="width:1px;height:24px;background:rgba(255,255,255,0.12);margin:0 4px"></div>
      <div id="titoTabsCanal" style="display:flex;gap:6px">
        <button class="tito-tab-canal active" data-canal="">Todos</button>
        <button class="tito-tab-canal" data-canal="whatsapp">WhatsApp</button>
        <button class="tito-tab-canal" data-canal="llamada">Llamadas</button>
      </div>
    </div>

    <!-- Lista de casos -->
    <div id="titoCasos" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
      <div class="loader"><div class="spinner"></div></div>
    </div>

    <!-- Paginación -->
    <div id="titoPaginacion" style="display:flex;gap:8px;justify-content:center;padding:8px 0"></div>
  </div>

  <!-- PANEL DERECHO: detalle caso -->
  <div id="titoDetalle" style="width:380px;flex-shrink:0;display:none;flex-direction:column;gap:12px;overflow-y:auto">
  </div>

</div>

<style>
.tito-tab, .tito-tab-canal {
  padding: 5px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15);
  background: transparent; color: var(--text-muted, #94a3b8); cursor: pointer; font-size: 13px;
  transition: all .15s;
}
.tito-tab.active, .tito-tab-canal.active {
  background: rgba(41,121,255,0.2); border-color: #2979FF; color: #2979FF;
}
.tito-caso-row {
  background: var(--card-bg, #1e2a45); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 12px 14px; cursor: pointer; transition: border-color .15s;
}
.tito-caso-row:hover { border-color: rgba(41,121,255,0.4); }
.tito-caso-row.selected { border-color: #2979FF; background: rgba(41,121,255,0.08); }
.tito-badge {
  display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600;
}
.tito-msg { padding: 8px 12px; border-radius: 8px; font-size: 13px; max-width: 90%; line-height: 1.45; }
.tito-msg.cliente { background: rgba(255,255,255,0.07); align-self: flex-start; }
.tito-msg.bot { background: rgba(41,121,255,0.15); align-self: flex-end; }
</style>`;
}

// ── Contadores ───────────────────────────────────────────────
async function titoCargarContadores() {
  try {
    const d = await API.get('/tito/contadores');
    document.getElementById('titoStats').innerHTML = `
      ${titoStatCard('Casos hoy', d.casos_hoy, '📋', '#2979FF')}
      ${titoStatCard('Urgentes', d.urgentes_pendientes, '🔴', '#ef4444')}
      ${titoStatCard('Sin asignar', d.sin_asignar_pendientes, '⏳', '#f97316')}
      ${titoStatCard('Resueltos hoy', d.resueltos_hoy, '✅', '#22c55e')}
    `;
  } catch {
    document.getElementById('titoStats').innerHTML =
      `<div class="alert alert-error" style="grid-column:1/-1">No se pudo conectar con vocai-assistant. Verifica que esté corriendo.</div>`;
  }
}

function titoStatCard(label, valor, icon, color) {
  return `
    <div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <span style="font-size:20px">${icon}</span>
        <span style="font-size:11px;color:var(--text-muted,#94a3b8)">${label}</span>
      </div>
      <div style="font-size:28px;font-weight:700;color:${color}">${valor ?? '—'}</div>
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
      listEl.innerHTML = `<div style="text-align:center;color:var(--text-muted,#94a3b8);padding:40px 0">Sin casos para mostrar</div>`;
      document.getElementById('titoPaginacion').innerHTML = '';
      return;
    }

    listEl.innerHTML = casos.map(c => titoCasoRow(c)).join('');

    // paginación
    const pages = Math.ceil(total / TITO_LIMIT);
    const currentPage = Math.floor(titoOffset / TITO_LIMIT);
    const pag = document.getElementById('titoPaginacion');
    pag.innerHTML = pages > 1 ? `
      <button class="btn btn-secondary btn-sm" ${currentPage === 0 ? 'disabled' : ''} onclick="titoIrPagina(${currentPage - 1})">← Anterior</button>
      <span style="color:var(--text-muted);font-size:13px;padding:0 8px">${currentPage + 1} / ${pages}</span>
      <button class="btn btn-secondary btn-sm" ${currentPage >= pages - 1 ? 'disabled' : ''} onclick="titoIrPagina(${currentPage + 1})">Siguiente →</button>
    ` : '';

    // click en fila
    listEl.querySelectorAll('.tito-caso-row').forEach(row => {
      row.addEventListener('click', () => titoAbrirDetalle(row.dataset.id));
    });

    // si había uno seleccionado, mantener highlight
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
  const fecha  = c.creado_en ? new Date(c.creado_en).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  const canal  = c.canal || 'otro';
  const urg    = c.urgencia || 'normal';
  const estado = c.estado || 'abierto';

  return `
<div class="tito-caso-row" data-id="${c.id}">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
    <div style="font-weight:600;font-size:14px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nombre}</div>
    <span class="tito-badge" style="${TITO_CANAL_BADGE[canal]}">${TITO_CANALES[canal] || canal}</span>
  </div>
  ${ref ? `<div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ref}</div>` : ''}
  <div style="display:flex;gap:6px;align-items:center">
    <span class="tito-badge" style="${TITO_URGENCIA_BADGE[urg]}">${TITO_URGENCIA[urg] || urg}</span>
    <span class="tito-badge" style="${TITO_ESTADO_BADGE[estado]}">${TITO_ESTADOS[estado] || estado}</span>
    <span style="margin-left:auto;font-size:11px;color:var(--text-muted,#94a3b8)">${fecha}</span>
  </div>
</div>`;
}

// ── Detalle de caso ───────────────────────────────────────────
async function titoAbrirDetalle(id) {
  titoDetalleCasoId = id;

  // highlight en lista
  document.querySelectorAll('.tito-caso-row').forEach(r => r.classList.toggle('selected', r.dataset.id === id));

  const panel = document.getElementById('titoDetalle');
  panel.style.display = 'flex';
  panel.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  try {
    const caso = await API.get(`/tito/casos/${id}`);
    panel.innerHTML = titoDetalleHTML(caso);

    panel.querySelectorAll('[data-estado-btn]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nuevoEstado = btn.dataset.estadoBtn;
        btn.disabled = true;
        try {
          await API.put(`/tito/casos/${id}`, { estado: nuevoEstado });
          toast(`Estado actualizado a "${TITO_ESTADOS[nuevoEstado]}"`, 'success');
          await Promise.all([titoCargarContadores(), titoCargarCasos()]);
          if (titoDetalleCasoId === id) await titoAbrirDetalle(id);
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    panel.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  }
}

function titoDetalleHTML(caso) {
  const nombre  = escHtml(caso.cliente_nombre || caso.cliente_telefono || 'Desconocido');
  const tel     = escHtml(caso.cliente_telefono || '');
  const canal   = caso.canal || 'otro';
  const urg     = caso.urgencia || 'normal';
  const estado  = caso.estado || 'abierto';
  const tipo    = TITO_TIPOS[caso.tipo] || caso.tipo || '';
  const ref     = escHtml(caso.referencia || caso.datos?.resumen || '');
  const fecha   = caso.creado_en ? new Date(caso.creado_en).toLocaleString('es-ES') : '';
  const datos   = caso.datos || {};
  const mensajes = caso.conversacion || [];

  const acciones = estado !== 'resuelto'
    ? `<button class="btn btn-sm" style="background:#22c55e;color:#fff" data-estado-btn="resuelto">Marcar resuelto</button>`
    : `<button class="btn btn-sm btn-secondary" data-estado-btn="abierto">Reabrir</button>`;

  const msgsHTML = mensajes.length === 0
    ? `<div style="text-align:center;color:var(--text-muted);padding:20px 0;font-size:13px">Sin mensajes registrados</div>`
    : `<div style="display:flex;flex-direction:column;gap:6px">
        ${mensajes.map(m => `
          <div class="tito-msg ${m.rol === 'cliente' ? 'cliente' : 'bot'}">
            ${escHtml(m.contenido || '')}
            <div style="font-size:10px;opacity:0.5;margin-top:3px;text-align:right">
              ${m.creado_en ? new Date(m.creado_en).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}) : ''}
            </div>
          </div>`).join('')}
      </div>`;

  return `
<div style="display:flex;flex-direction:column;gap:12px">

  <!-- Header -->
  <div class="card" style="padding:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px">
      <div>
        <div style="font-size:16px;font-weight:700">${nombre}</div>
        ${tel ? `<div style="font-size:12px;color:var(--text-muted)">${tel}</div>` : ''}
      </div>
      <button onclick="titoDetalleCerrar()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1">✕</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <span class="tito-badge" style="${TITO_CANAL_BADGE[canal]}">${TITO_CANALES[canal] || canal}</span>
      <span class="tito-badge" style="${TITO_URGENCIA_BADGE[urg]}">${TITO_URGENCIA[urg] || urg}</span>
      <span class="tito-badge" style="${TITO_ESTADO_BADGE[estado]}">${TITO_ESTADOS[estado] || estado}</span>
      ${tipo ? `<span class="tito-badge" style="background:rgba(255,255,255,0.08);color:var(--text-muted)">${tipo}</span>` : ''}
    </div>
    ${ref ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">${ref}</div>` : ''}
    ${datos.nombre || datos.empresa ? `
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">
        ${datos.nombre ? `👤 ${escHtml(datos.nombre)}` : ''}
        ${datos.empresa ? ` · 🏢 ${escHtml(datos.empresa)}` : ''}
      </div>` : ''}
    <div style="font-size:11px;color:var(--text-muted)">${fecha}</div>
  </div>

  <!-- Acciones -->
  <div style="display:flex;gap:8px">${acciones}</div>

  <!-- Conversación -->
  <div class="card" style="padding:14px">
    <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">Conversación</div>
    ${msgsHTML}
  </div>

</div>`;
}

function titoDetalleCerrar() {
  titoDetalleCasoId = null;
  const panel = document.getElementById('titoDetalle');
  if (panel) panel.style.display = 'none';
  document.querySelectorAll('.tito-caso-row').forEach(r => r.classList.remove('selected'));
}
window.titoDetalleCerrar = titoDetalleCerrar;

// ── Paginación ────────────────────────────────────────────────
function titoIrPagina(page) {
  titoOffset = page * TITO_LIMIT;
  titoCargarCasos();
}
window.titoIrPagina = titoIrPagina;

// ── Filtros ────────────────────────────────────────────────────
function titoBindFiltros() {
  document.querySelectorAll('.tito-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tito-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      titoFiltroEstado = btn.dataset.estado;
      titoOffset = 0;
      titoCargarCasos();
    });
  });

  document.querySelectorAll('.tito-tab-canal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tito-tab-canal').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      titoFiltroCanal = btn.dataset.canal;
      titoOffset = 0;
      titoCargarCasos();
    });
  });
}

// API.put no existe en app.js core, agregamos wrapper local
const _titoApiPut = (path, body) => API.req('PUT', path, body);
Object.assign(API, { put: _titoApiPut });
