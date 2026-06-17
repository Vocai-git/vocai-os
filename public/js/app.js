/* ============================================================
   VOCAI OS — App Core
   ============================================================ */

// ── Auth guard ──────────────────────────────────────────────
const token = localStorage.getItem('vocai_token');
if (!token) window.location.href = '/';

// ── Auto-refresh token (mantener sesión 7 días) ─────────────
async function refreshToken() {
  const rt = localStorage.getItem('vocai_refresh_token');
  if (!rt) return;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('vocai_token', data.token);
      localStorage.setItem('vocai_refresh_token', data.refresh_token);
    }
  } catch (e) { /* silencioso */ }
}
// Refrescar cada 50 minutos
setInterval(refreshToken, 50 * 60 * 1000);
refreshToken();

// ── API helper ──────────────────────────────────────────────
const API = {
  async req(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('vocai_token')}`
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`/api${path}`, opts);
    if (res.status === 401) {
      localStorage.clear();
      window.location.href = '/';
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      const e = new Error(data.error || 'Error del servidor');
      e.status = res.status;
      e.codigo = data.codigo;   // p.ej. 'fuera_de_ventana'
      e.data = data;            // body completo (p.ej. conversacion_id)
      throw e;
    }
    return data;
  },
  get: (path) => API.req('GET', path),
  post: (path, body) => API.req('POST', path, body),
  put: (path, body) => API.req('PUT', path, body),
  patch: (path, body) => API.req('PATCH', path, body),
  del: (path) => API.req('DELETE', path),
};

// ── Toast ────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Modal ────────────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
function createModal(id, title, bodyHTML, footerHTML = '', size = '') {
  let m = document.getElementById(id);
  if (m) m.remove();
  m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = id;
  m.innerHTML = `
    <div class="modal ${size}">
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close" onclick="closeModal('${id}')">&times;</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
    </div>`;
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(id); });
  document.body.appendChild(m);
  setTimeout(() => m.classList.add('open'), 10);
}

// ── Lightbox / visor ampliado ────────────────────────────────
let _lbItems = [];
let _lbActions = [];
let _lbIdx = 0;

// items: [{ url, caption }]   actions: [{ label, tipo, fn(item, idx) }]
function openLightbox(items, start = 0, actions = []) {
  if (!items || !items.length) return;
  _lbItems = items;
  _lbActions = actions || [];
  _lbIdx = Math.max(0, Math.min(start, items.length - 1));
  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.className = 'lightbox';
    lb.innerHTML = `
      <button class="lb-close" aria-label="Cerrar">&times;</button>
      <button class="lb-nav lb-prev" aria-label="Anterior">&#8249;</button>
      <button class="lb-nav lb-next" aria-label="Siguiente">&#8250;</button>
      <div class="lb-stage"><img class="lb-img" id="lbImg" alt=""></div>
      <div class="lb-footer">
        <div class="lb-actions" id="lbActions"></div>
        <div class="lb-counter" id="lbCounter"></div>
        <div class="lb-caption" id="lbCaption"></div>
      </div>`;
    lb.querySelector('.lb-close').addEventListener('click', closeLightbox);
    lb.querySelector('.lb-prev').addEventListener('click', () => lbMove(-1));
    lb.querySelector('.lb-next').addEventListener('click', () => lbMove(1));
    lb.querySelector('.lb-stage').addEventListener('click', (e) => {
      if (e.target.classList.contains('lb-stage')) closeLightbox();
    });
    document.body.appendChild(lb);
  }
  lbRender();
  requestAnimationFrame(() => lb.classList.add('open'));
  document.addEventListener('keydown', _lbKey);
}

function lbRender() {
  const it = _lbItems[_lbIdx];
  if (!it) return;
  document.getElementById('lbImg').src = it.url;
  const multi = _lbItems.length > 1;
  document.querySelector('.lb-prev').style.display = multi ? '' : 'none';
  document.querySelector('.lb-next').style.display = multi ? '' : 'none';
  document.getElementById('lbCounter').textContent =
    multi ? (_lbIdx + 1) + ' / ' + _lbItems.length : '';
  document.getElementById('lbCaption').textContent = it.caption || '';
  const cont = document.getElementById('lbActions');
  cont.innerHTML = '';
  _lbActions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn btn-' + (a.tipo || 'secondary');
    b.textContent = a.label;
    b.addEventListener('click', () => a.fn(_lbItems[_lbIdx], _lbIdx));
    cont.appendChild(b);
  });
}

function lbMove(d) {
  if (_lbItems.length < 2) return;
  _lbIdx = (_lbIdx + d + _lbItems.length) % _lbItems.length;
  lbRender();
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('open');
  document.removeEventListener('keydown', _lbKey);
}

function _lbKey(e) {
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') lbMove(-1);
  else if (e.key === 'ArrowRight') lbMove(1);
}

// ── Format helpers ───────────────────────────────────────────
function formatMoney(n) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function badge(status) {
  const map = {
    activo:     ['#00C48C22','#00C48C','#00C48C44'],
    cobrada:    ['#00C48C22','#00C48C','#00C48C44'],
    completada: ['#00C48C22','#00C48C','#00C48C44'],
    completado: ['#00C48C22','#00C48C','#00C48C44'],
    confirmada: ['#00C48C22','#00C48C','#00C48C44'],
    confirmado: ['#00C48C22','#00C48C','#00C48C44'],
    publicado:  ['#00C48C22','#00C48C','#00C48C44'],
    aceptada:   ['#00C48C22','#00C48C','#00C48C44'],
    enviada:    ['#2979FF22','#2979FF','#2979FF44'],
    en_curso:   ['#2979FF22','#2979FF','#2979FF44'],
    prospecto:  ['#2979FF22','#2979FF','#2979FF44'],
    editando:   ['#2979FF22','#2979FF','#2979FF44'],
    normal:     ['#2979FF22','#2979FF','#2979FF44'],
    urgente:    ['#FF6B6B22','#FF6B6B','#FF6B6B44'],
    vencida:    ['#FF6B6B22','#FF6B6B','#FF6B6B44'],
    cancelada:  ['#FF6B6B22','#FF6B6B','#FF6B6B44'],
    cancelado:  ['#FF6B6B22','#FF6B6B','#FF6B6B44'],
    rechazada:  ['#FF6B6B22','#FF6B6B','#FF6B6B44'],
    error:      ['#FF6B6B22','#FF6B6B','#FF6B6B44'],
    alta:       ['#FF8C4222','#FF8C42','#FF8C4244'],
    pausado:    ['#FF8C4222','#FF8C42','#FF8C4244'],
    revision:   ['#FF8C4222','#FF8C42','#FF8C4244'],
    grabado:    ['#9D7FE822','#9D7FE8','#9D7FE844'],
    borrador:   ['rgba(255,255,255,0.06)','#888888','rgba(255,255,255,0.12)'],
    pendiente:  ['rgba(255,255,255,0.06)','#888888','rgba(255,255,255,0.12)'],
    inactivo:   ['rgba(255,255,255,0.06)','#888888','rgba(255,255,255,0.12)'],
    baja:       ['rgba(255,255,255,0.06)','#888888','rgba(255,255,255,0.12)'],
  };
  const [bg, color, border] = map[status] || ['rgba(255,255,255,0.06)','#888888','rgba(255,255,255,0.12)'];
  const label = status.replace(/_/g,' ');
  return `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:500;white-space:nowrap;background:${bg};color:${color};border:1px solid ${border};">${label}</span>`;
}
function responsablePill(r) {
  if (!r) return '—';
  const name = r.toLowerCase() === 'agus' ? 'Agus' : 'Santi';
  return `<span class="avatar-pill ${r}">${name}</span>`;
}
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}


// ── Modules registry ─────────────────────────────────────────
const MODULES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  clients:   { title: 'Clientes',  render: renderClients },
  projects:  { title: 'Proyectos', render: renderProjects },
  proposals: { title: 'Propuestas', render: renderProposals },
  contracts: { title: 'Contratos', render: renderContracts },
  invoices:  { title: 'Facturas',  render: renderInvoices },
  expenses:  { title: 'Inversión', render: renderExpenses },
  finanzas:  { title: 'Finanzas',  render: renderFinanzas },
  goals:     { title: 'Metas',     render: renderGoals },
  bookings:  { title: 'Reservas de Estudio', render: renderBookings },
  episodes:  { title: 'Episodios', render: renderEpisodes },
  tito:      { title: 'Tito — Atención al cliente', render: renderTito, unmount: unmountTito },
  chats:     { title: 'Chats en vivo', render: renderChats, unmount: unmountChats },
  tasks:     { title: 'Tareas',    render: renderTasks },
  activity:  { title: 'Actividad', render: renderActivity },
  contacts:  { title: 'Contactos', render: renderContacts },
  files:     { title: 'Archivos',  render: renderFiles },
  notes:     { title: 'Notas',     render: renderNotes },
  agents:    { title: 'Agentes n8n', render: renderAgents },
  mytasks:   { title: 'Mis tareas', render: renderMytasks },
  myagenda:  { title: 'Mi agenda', render: renderMyagenda },
  agenda:    { title: 'Agenda', render: renderAgenda },
  settings:  { title: 'Configuración', render: renderSettings },
  'marketing-calendar': { title: 'Calendario', render: renderMarketingCalendar },
  'marketing-planning': { title: 'Planificación', render: renderMarketingPlanning },
  'marketing-intelligence': { title: 'Inteligencia', render: renderMarketingIntelligence },
  'marketing-analytics': { title: 'Analítica', render: renderMarketingAnalytics },
  'marketing-generator': { title: 'Generador', render: renderMarketingGenerator },
  'marketing-web': { title: 'Web · Blog', render: renderMarketingWeb },
};

// ── Router ───────────────────────────────────────────────────
let currentModule = null;

async function navigate(module) {
  if (!MODULES[module]) return;
  // Llamar unmount del módulo anterior si existe
  if (currentModule && MODULES[currentModule]?.unmount) {
    try { MODULES[currentModule].unmount(); } catch { /* silencioso */ }
  }
  currentModule = module;
  window.vocaiSeccionActual = module;

  // Update sidebar active
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === module);
  });

  // Update topbar title
  document.getElementById('topbarTitle').textContent = MODULES[module].title;

  // Update URL hash
  window.location.hash = module;

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');

  // Render
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    await MODULES[module].render(content);
  } catch (err) {
    content.innerHTML = `<div class="alert alert-error">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// ── Init ─────────────────────────────────────────────────────
function init() {
  // User info
  const user = JSON.parse(localStorage.getItem('vocai_user') || '{}');
  const name = user.nombre || user.email || 'Usuario';
  document.getElementById('userName').textContent = name;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();

  // Date
  const now = new Date();
  document.getElementById('currentDate').textContent = now.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  // Sidebar nav clicks
  document.querySelectorAll('.nav-item[data-module]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.module));
  });

  // Hamburger
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  });

  // Logout
  document.getElementById('btnLogout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
    localStorage.clear();
    window.location.href = '/';
  });

  // Initial route
  const hash = window.location.hash.slice(1);
  navigate(hash && MODULES[hash] ? hash : 'dashboard');

  // Asistente flotante — vive sobre todo el dashboard.
  if (typeof initAsistenteWidget === 'function') initAsistenteWidget();
}

document.addEventListener('DOMContentLoaded', init);
