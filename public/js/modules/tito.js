/* ============================================================
   VOCAI OS — Tito (Atención al cliente)
   ============================================================ */

const TITO_CANALES  = { whatsapp: 'WhatsApp', llamada: 'Llamada', email: 'Email', otro: 'Otro' };
const TITO_TIPOS    = { presupuesto: 'Presupuesto', consulta_datos: 'Consulta', otra: 'Otra' };
const TITO_ESTADOS  = { pendiente: 'Pendiente', en_curso: 'En curso', resuelto: 'Resuelto', cerrado: 'Cerrado' };
const TITO_URGENCIA = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baja: 'Baja' };

let titoFiltroCanal   = '';
let titoFiltroEstado  = 'estado_no=cerrado';
let titoOffset        = 0;
const TITO_LIMIT      = 30;
let titoDetalleCasoId = null;
let titoVistaActual   = 'casos';
let titoStatsPeriodo  = 'mes';
let titoChartVolumen  = null;
let titoChartMotivos  = null;

// ── Render principal ──────────────────────────────────────────
async function renderTito(container) {
  container.innerHTML = titoCSS() + titoShell();
  titoFiltroCanal   = '';
  titoFiltroEstado  = 'estado_no=cerrado';
  titoOffset        = 0;
  titoDetalleCasoId = null;
  titoVistaActual   = 'casos';

  titoBindNavVistas();
  await titoMostrarVista('casos');
}

// ── Shell y CSS ───────────────────────────────────────────────
function titoCSS() {
  return `<style>
/* ── Nav vistas ── */
.tito-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.tito-nav-tabs {
  display: flex;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;
}
.tito-nav-tab {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 16px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
  font-family: 'Outfit', sans-serif;
}
.tito-nav-tab svg { width: 14px; height: 14px; opacity: 0.6; }
.tito-nav-tab:hover { color: var(--text); }
.tito-nav-tab.active { background: var(--surface-hover); color: var(--text); font-weight: 600; }
.tito-nav-tab.active svg { opacity: 1; }

/* ── Vista casos ── */
.tito-layout {
  display: flex;
  gap: 20px;
  height: calc(100vh - 148px);
  overflow: hidden;
}
.tito-left {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 16px;
  overflow: hidden;
}
.tito-right {
  width: 360px; flex-shrink: 0;
  display: none; flex-direction: column; gap: 0;
  overflow: hidden;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
}
.tito-right.open { display: flex; }

/* ── Stats cards ── */
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
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.6px; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 8px;
}
.tito-stat-value {
  font-family: 'Syne', sans-serif;
  font-size: 28px; font-weight: 700;
  color: var(--text); line-height: 1;
  font-variant-numeric: tabular-nums;
}
.tito-stat-value.accent { color: var(--coral); }

/* ── Filtros ── */
.tito-filters {
  display: flex; align-items: center;
  justify-content: space-between; gap: 8px;
}
.tito-tabs {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px; gap: 2px;
}
.tito-tab {
  padding: 5px 14px;
  border-radius: 6px; border: none;
  background: transparent; color: var(--text-muted);
  font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all var(--transition);
  font-family: 'Outfit', sans-serif; white-space: nowrap;
}
.tito-tab:hover { color: var(--text); }
.tito-tab.active { background: var(--surface-hover); color: var(--text); font-weight: 600; }

/* Canal dropdown */
.tito-canal-wrap { position: relative; }
.tito-canal-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent; color: var(--text-muted);
  font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all var(--transition);
  font-family: 'Outfit', sans-serif; white-space: nowrap;
}
.tito-canal-btn:hover { border-color: var(--border-light); color: var(--text); }
.tito-canal-btn.active { border-color: var(--coral); color: var(--coral); }
.tito-canal-btn svg { width: 12px; height: 12px; opacity: 0.6; transition: transform var(--transition); }
.tito-canal-btn.open svg { transform: rotate(180deg); }
.tito-canal-menu {
  position: absolute; top: calc(100% + 6px); right: 0;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 4px;
  min-width: 140px; box-shadow: var(--shadow-lg);
  z-index: 50; display: none;
}
.tito-canal-menu.open { display: block; }
.tito-canal-opt {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 6px;
  cursor: pointer; font-size: 12px; color: var(--text-muted);
  transition: all var(--transition);
}
.tito-canal-opt:hover { background: var(--surface-hover); color: var(--text); }
.tito-canal-opt.selected { color: var(--text); }
.tito-canal-dot {
  width: 6px; height: 6px; border-radius: 50%;
  flex-shrink: 0; background: var(--border-light);
}
.tito-canal-dot.whatsapp { background: #25D366; }
.tito-canal-dot.llamada  { background: var(--blue); }
.tito-canal-dot.email    { background: #f59e0b; }

/* ── Lista casos ── */
.tito-list {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 1px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--border);
  overflow: hidden;
}
.tito-row {
  background: var(--surface); padding: 13px 16px;
  cursor: pointer; transition: background var(--transition);
  display: flex; flex-direction: column; gap: 5px;
}
.tito-row:hover { background: var(--surface-hover); }
.tito-row.selected { background: rgba(255,107,107,0.05); border-left: 2px solid var(--coral); }
.tito-row-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.tito-row-name {
  font-size: 13px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.tito-row-ref {
  font-size: 11px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tito-row-bottom { display: flex; align-items: center; gap: 6px; }
.tito-tag {
  font-size: 10px; font-weight: 500;
  padding: 2px 7px; border-radius: 4px; letter-spacing: 0.2px;
}
.tito-tag-canal  { color: var(--text-muted); border: 1px solid var(--border); }
.tito-tag-estado-pendiente { color: #60a5fa; background: rgba(96,165,250,0.08); }
.tito-tag-estado-en_curso  { color: #fb923c; background: rgba(251,146,60,0.08); }
.tito-tag-estado-resuelto  { color: var(--green); background: rgba(0,196,140,0.08); }
.tito-tag-estado-cerrado   { color: var(--text-muted); background: rgba(255,255,255,0.04); }
.tito-tag-urg-urgente { color: var(--coral); background: var(--coral-dim); }
.tito-tag-urg-alta    { color: #fb923c; background: rgba(251,146,60,0.08); }
.tito-time { margin-left: auto; font-size: 10px; color: var(--text-muted); }

/* ── Panel detalle ── */
.tito-detail-header { padding: 18px 20px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.tito-detail-body   { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
.tito-detail-section { padding: 16px 20px; border-bottom: 1px solid var(--border); }
.tito-detail-section:last-child { border-bottom: none; }
.tito-section-label {
  font-size: 10px; font-weight: 600; letter-spacing: 1px;
  text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;
}
.tito-bubble {
  padding: 9px 13px; border-radius: 10px;
  font-size: 12px; line-height: 1.5;
  max-width: 88%; margin-bottom: 6px; color: var(--text);
}
.tito-bubble.cliente {
  background: var(--bg); border: 1px solid var(--border);
  align-self: flex-start; border-bottom-left-radius: 3px;
}
.tito-bubble.bot {
  background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.15);
  align-self: flex-end; border-bottom-right-radius: 3px;
}
.tito-bubble-time { font-size: 9px; color: var(--text-muted); margin-top: 3px; text-align: right; }
.tito-chat { display: flex; flex-direction: column; }

/* ── Paginación ── */
.tito-pag {
  display: flex; gap: 8px; justify-content: center;
  align-items: center; padding: 8px 0 0; flex-shrink: 0;
}

/* ── Vista estadísticas ── */
.tito-stats-view {
  overflow-y: auto;
  height: calc(100vh - 148px);
  padding-right: 4px;
}
.tito-periodo-bar {
  display: flex; align-items: center;
  justify-content: space-between; margin-bottom: 24px;
}
.tito-periodo-tabs {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px; gap: 2px;
}
.tito-periodo-tab {
  padding: 5px 14px; border-radius: 6px; border: none;
  background: transparent; color: var(--text-muted);
  font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all var(--transition);
  font-family: 'Outfit', sans-serif;
}
.tito-periodo-tab:hover { color: var(--text); }
.tito-periodo-tab.active { background: var(--surface-hover); color: var(--text); font-weight: 600; }

/* KPIs de estadísticas */
.tito-kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
.tito-kpi {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px 20px;
}
.tito-kpi-label { font-size: 11px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }
.tito-kpi-value { font-family: 'Syne', sans-serif; font-size: 32px; font-weight: 700; color: var(--text); line-height: 1; font-variant-numeric: tabular-nums; }
.tito-kpi-sub { font-size: 11px; color: var(--text-muted); margin-top: 6px; }
.tito-kpi-var { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 600; margin-top: 6px; }
.tito-kpi-var.up   { color: var(--green); }
.tito-kpi-var.down { color: var(--coral); }
.tito-kpi-var.neu  { color: var(--text-muted); }

/* Secciones de gráficos */
.tito-chart-row { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 20px; }
.tito-chart-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.tito-chart-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 22px 24px;
}
.tito-chart-title {
  font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700;
  margin-bottom: 4px;
}
.tito-chart-sub { font-size: 12px; color: var(--text-muted); margin-bottom: 20px; }

/* Tabla comparativa */
.tito-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tito-table th {
  text-align: right; font-size: 10px; font-weight: 600;
  letter-spacing: 0.6px; text-transform: uppercase;
  color: var(--text-muted); padding: 0 0 12px;
}
.tito-table th:first-child { text-align: left; }
.tito-table td {
  padding: 10px 0; border-top: 1px solid var(--border);
  text-align: right; color: var(--text-muted);
}
.tito-table td:first-child { text-align: left; color: var(--text); font-weight: 500; }
.tito-table .var-up   { color: var(--green); font-weight: 600; }
.tito-table .var-down { color: var(--coral); font-weight: 600; }
.tito-table .var-neu  { color: var(--text-muted); }

/* Barra horizontal de motivos */
.tito-bar-row { margin-bottom: 14px; }
.tito-bar-label {
  display: flex; justify-content: space-between;
  font-size: 12px; margin-bottom: 5px;
}
.tito-bar-label span:first-child { color: var(--text); font-weight: 500; }
.tito-bar-label span:last-child  { color: var(--text-muted); }
.tito-bar-track { height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; }
.tito-bar-fill  { height: 100%; border-radius: 99px; transition: width 0.6s ease; }
</style>`;
}

function titoShell() {
  return `
<div class="tito-nav">
  <div class="tito-nav-tabs">
    <button class="tito-nav-tab active" data-vista="casos">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
      Casos
    </button>
    <button class="tito-nav-tab" data-vista="stats">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
      Estadísticas
    </button>
  </div>
</div>
<div id="titoVista"></div>`;
}

// ── Navegación entre vistas ───────────────────────────────────
function titoBindNavVistas() {
  document.querySelectorAll('.tito-nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tito-nav-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      titoMostrarVista(btn.dataset.vista);
    });
  });
}

async function titoMostrarVista(vista) {
  titoVistaActual = vista;
  if (titoChartVolumen) { titoChartVolumen.destroy(); titoChartVolumen = null; }
  if (titoChartMotivos) { titoChartMotivos.destroy(); titoChartMotivos = null; }

  if (vista === 'casos') {
    document.getElementById('titoVista').innerHTML = titoCasosHTML();
    titoFiltroCanal  = '';
    titoFiltroEstado = 'estado_no=cerrado';
    titoOffset       = 0;
    titoDetalleCasoId = null;
    await Promise.all([titoCargarContadores(), titoCargarCasos()]);
    titoBindFiltros();
  } else {
    document.getElementById('titoVista').innerHTML = titoStatsHTML();
    titoBindPeriodo();
    await titoCargarStats();
  }
}

// ── VISTA CASOS ───────────────────────────────────────────────
function titoCasosHTML() {
  return `
<div class="tito-layout">
  <div class="tito-left">
    <div class="tito-stats" id="titoStats">
      ${[0,1,2,3].map(() => `<div class="tito-stat" style="opacity:.4">&nbsp;</div>`).join('')}
    </div>
    <div class="tito-filters" id="titoFiltros">
      <div class="tito-tabs">
        <button class="tito-tab active" data-v="estado_no=cerrado">Activos</button>
        <button class="tito-tab" data-v="estado=resuelto">Resueltos</button>
        <button class="tito-tab" data-v="">Todos</button>
      </div>
      <div class="tito-canal-wrap">
        <button class="tito-canal-btn" id="titoCanalBtn">
          <span id="titoCanalLabel">Canal</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="tito-canal-menu" id="titoCanalMenu">
          <div class="tito-canal-opt selected" data-canal="">
            <span class="tito-canal-dot"></span>Todos
          </div>
          <div class="tito-canal-opt" data-canal="whatsapp">
            <span class="tito-canal-dot whatsapp"></span>WhatsApp
          </div>
          <div class="tito-canal-opt" data-canal="llamada">
            <span class="tito-canal-dot llamada"></span>Llamadas
          </div>
          <div class="tito-canal-opt" data-canal="email">
            <span class="tito-canal-dot email"></span>Email
          </div>
        </div>
      </div>
    </div>
    <div class="tito-list" id="titoCasos">
      <div class="loader"><div class="spinner"></div></div>
    </div>
    <div class="tito-pag" id="titoPaginacion"></div>
  </div>
  <div class="tito-right" id="titoDetalle"></div>
</div>`;
}

// ── VISTA ESTADÍSTICAS ────────────────────────────────────────
function titoStatsHTML() {
  return `
<div class="tito-stats-view" id="titoStatsView">
  <div class="tito-periodo-bar">
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700">Actividad de Tito</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Métricas de conversaciones y canales</div>
    </div>
    <div class="tito-periodo-tabs">
      <button class="tito-periodo-tab" data-p="semana">7 días</button>
      <button class="tito-periodo-tab active" data-p="mes">30 días</button>
      <button class="tito-periodo-tab" data-p="trimestre">Trimestre</button>
    </div>
  </div>

  <!-- KPIs -->
  <div class="tito-kpi-grid" id="titoKpis">
    ${[0,1,2,3].map(() => `<div class="tito-kpi" style="opacity:.4">&nbsp;<br>&nbsp;</div>`).join('')}
  </div>

  <!-- Volumen diario (full width) -->
  <div class="tito-chart-row">
    <div class="tito-chart-card">
      <div class="tito-chart-title">Volumen diario</div>
      <div class="tito-chart-sub">Contactos por día — WhatsApp vs llamadas</div>
      <canvas id="titoChartVolumen" style="max-height:220px"></canvas>
    </div>
  </div>

  <!-- Motivos + Comparativa -->
  <div class="tito-chart-row-2">
    <div class="tito-chart-card">
      <div class="tito-chart-title">Por qué contactan</div>
      <div class="tito-chart-sub">Distribución de motivos</div>
      <div id="titoMotivos">
        <div class="loader"><div class="spinner"></div></div>
      </div>
    </div>
    <div class="tito-chart-card">
      <div class="tito-chart-title">Mes actual vs anterior</div>
      <div class="tito-chart-sub">Comparativa de métricas clave</div>
      <div id="titoComparativa">
        <div class="loader"><div class="spinner"></div></div>
      </div>
    </div>
  </div>
</div>`;
}

// ── Contadores (vista casos) ──────────────────────────────────
async function titoCargarContadores() {
  try {
    const d = await API.get('/tito/contadores');
    document.getElementById('titoStats').innerHTML = `
      ${titoStat('Casos hoy',     d.casos_hoy,              false)}
      ${titoStat('Urgentes',      d.urgentes_pendientes,    d.urgentes_pendientes > 0)}
      ${titoStat('Sin asignar',   d.sin_asignar_pendientes, false)}
      ${titoStat('Resueltos hoy', d.resueltos_hoy,          false)}
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
  const canal  = c.canal     || 'otro';
  const urg    = c.urgencia  || 'normal';
  const estado = c.estado    || 'pendiente';
  const fecha  = c.creado_en
    ? new Date(c.creado_en).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '';

  const urgTag = urg !== 'normal' && urg !== 'baja'
    ? `<span class="tito-tag tito-tag-urg-${urg}">${TITO_URGENCIA[urg]}</span>` : '';

  return `
<div class="tito-row" data-id="${c.id}">
  <div class="tito-row-top">
    <div class="tito-row-name">${nombre}</div>
    <span class="tito-tag tito-tag-estado-${estado}">${TITO_ESTADOS[estado] || estado}</span>
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

function titoIrPagina(page) {
  titoOffset = page * TITO_LIMIT;
  titoCargarCasos();
}
window.titoIrPagina = titoIrPagina;

// ── Filtros casos ─────────────────────────────────────────────
function titoBindFiltros() {
  document.querySelectorAll('.tito-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tito-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      titoFiltroEstado = btn.dataset.v;
      titoOffset = 0;
      titoCargarCasos();
    });
  });

  const canalBtn   = document.getElementById('titoCanalBtn');
  const canalMenu  = document.getElementById('titoCanalMenu');
  const canalLabel = document.getElementById('titoCanalLabel');

  canalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = canalMenu.classList.toggle('open');
    canalBtn.classList.toggle('open', open);
  });

  document.addEventListener('click', () => {
    canalMenu.classList.remove('open');
    canalBtn.classList.remove('open');
  });

  canalMenu.querySelectorAll('.tito-canal-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      canalMenu.querySelectorAll('.tito-canal-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      titoFiltroCanal = opt.dataset.canal;
      canalLabel.textContent = titoFiltroCanal ? opt.textContent.trim() : 'Canal';
      canalBtn.classList.toggle('active', !!titoFiltroCanal);
      canalMenu.classList.remove('open');
      canalBtn.classList.remove('open');
      titoOffset = 0;
      titoCargarCasos();
    });
  });
}

// ── ESTADÍSTICAS ──────────────────────────────────────────────
function titoBindPeriodo() {
  document.querySelectorAll('.tito-periodo-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tito-periodo-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      titoStatsPeriodo = btn.dataset.p;
      await titoCargarStats();
    });
  });
}

async function titoCargarStats() {
  const p = titoStatsPeriodo;
  try {
    const [resumen, volumen, motivos, comparativa] = await Promise.all([
      API.get(`/tito/stats/resumen?periodo=${p}`),
      API.get(`/tito/stats/volumen-diario?periodo=${p}`),
      API.get(`/tito/stats/distribucion-motivos?periodo=${p}`),
      API.get('/tito/stats/comparativa-mensual')
    ]);

    titoRenderKpis(resumen);
    titoRenderVolumen(volumen);
    titoRenderMotivos(motivos);
    titoRenderComparativa(comparativa);
  } catch (err) {
    const el = document.getElementById('titoKpis');
    if (el) el.innerHTML = `<div style="grid-column:1/-1;color:var(--text-muted);font-size:13px;padding:8px">Error cargando estadísticas: ${escHtml(err.message)}</div>`;
  }
}

function titoRenderKpis(d) {
  const el = document.getElementById('titoKpis');
  if (!el) return;

  const varHtml = (pct) => {
    if (pct === null || pct === undefined) return '';
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'neu';
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '—';
    return `<div class="tito-kpi-var ${cls}">${arrow} ${Math.abs(pct)}% vs período anterior</div>`;
  };

  el.innerHTML = `
    <div class="tito-kpi">
      <div class="tito-kpi-label">Total contactos</div>
      <div class="tito-kpi-value">${d.total ?? '—'}</div>
      ${varHtml(d.total_variacion_pct)}
    </div>
    <div class="tito-kpi">
      <div class="tito-kpi-label">WhatsApp</div>
      <div class="tito-kpi-value">${d.whatsapp ?? '—'}</div>
      <div class="tito-kpi-sub">${d.whatsapp_pct ?? 0}% del total</div>
    </div>
    <div class="tito-kpi">
      <div class="tito-kpi-label">Llamadas</div>
      <div class="tito-kpi-value">${d.llamada ?? '—'}</div>
      <div class="tito-kpi-sub">${d.llamada_pct ?? 0}% del total</div>
    </div>
    <div class="tito-kpi">
      <div class="tito-kpi-label">Auto-resueltos</div>
      <div class="tito-kpi-value">${d.auto_resueltos ?? '—'}</div>
      <div class="tito-kpi-sub">~${d.ahorro_horas_estimado ?? 0}h ahorradas</div>
    </div>`;
}

function titoRenderVolumen(d) {
  const canvas = document.getElementById('titoChartVolumen');
  if (!canvas || !d.datos) return;
  if (titoChartVolumen) titoChartVolumen.destroy();

  const labels = d.datos.map(r => {
    const [, m, day] = r.dia.split('-');
    return `${day}/${m}`;
  });

  titoChartVolumen = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'WhatsApp',
          data: d.datos.map(r => r.whatsapp),
          backgroundColor: 'rgba(37,211,102,0.7)',
          borderRadius: 4,
          borderSkipped: false
        },
        {
          label: 'Llamadas',
          data: d.datos.map(r => r.llamada),
          backgroundColor: 'rgba(41,121,255,0.7)',
          borderRadius: 4,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#888', font: { family: 'Outfit', size: 12 }, boxWidth: 10, boxHeight: 10 }
        },
        tooltip: {
          backgroundColor: '#1e1e1e',
          borderColor: '#2a2a2a',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#888',
          titleFont: { family: 'Outfit' },
          bodyFont:  { family: 'Outfit' }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#888', font: { family: 'Outfit', size: 11 }, maxRotation: 0 },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: '#888', font: { family: 'Outfit', size: 11 }, stepSize: 1 },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function titoRenderMotivos(d) {
  const el = document.getElementById('titoMotivos');
  if (!el) return;

  const total = (d.whatsapp?.total || 0) + (d.llamada?.total || 0);
  if (total === 0) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px 0">Sin datos para este período</div>`;
    return;
  }

  const motivos = [
    { label: 'Presupuestos',  key: 'presupuesto',   color: '#FF6B6B' },
    { label: 'Consultas',     key: 'consulta_datos', color: '#2979FF' },
    { label: 'Otras',         key: 'otra',           color: '#888888' }
  ];

  el.innerHTML = motivos.map(m => {
    const n = (d.whatsapp?.[m.key] || 0) + (d.llamada?.[m.key] || 0);
    const pct = total > 0 ? Math.round((n / total) * 100) : 0;
    return `
      <div class="tito-bar-row">
        <div class="tito-bar-label">
          <span>${m.label}</span>
          <span>${n} · ${pct}%</span>
        </div>
        <div class="tito-bar-track">
          <div class="tito-bar-fill" style="width:${pct}%;background:${m.color}"></div>
        </div>
      </div>`;
  }).join('') + `
    <div style="margin-top:20px">
      <div style="font-size:10px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px">Por canal</div>
      <div style="display:flex;gap:16px">
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:#25D366;display:inline-block"></span>
            <span style="font-size:12px;color:var(--text-muted)">WhatsApp</span>
          </div>
          <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700">${d.whatsapp?.total || 0}</div>
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:#2979FF;display:inline-block"></span>
            <span style="font-size:12px;color:var(--text-muted)">Llamadas</span>
          </div>
          <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700">${d.llamada?.total || 0}</div>
        </div>
      </div>
    </div>`;
}

function titoRenderComparativa(d) {
  const el = document.getElementById('titoComparativa');
  if (!el || !d.filas) return;

  const varCell = (pct) => {
    if (pct === null || pct === undefined) return `<td class="var-neu">—</td>`;
    const cls   = pct > 0 ? 'var-up' : pct < 0 ? 'var-down' : 'var-neu';
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '—';
    return `<td class="${cls}">${arrow}${Math.abs(pct)}%</td>`;
  };

  el.innerHTML = `
    <table class="tito-table">
      <thead>
        <tr>
          <th style="width:50%">Métrica</th>
          <th>Anterior</th>
          <th>Este mes</th>
          <th>Var.</th>
        </tr>
      </thead>
      <tbody>
        ${d.filas.map(f => `
          <tr>
            <td>${escHtml(f.metrica)}</td>
            <td>${f.anterior}</td>
            <td>${f.actual}</td>
            ${varCell(f.variacion_pct)}
          </tr>`).join('')}
      </tbody>
    </table>`;
}
