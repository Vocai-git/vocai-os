/* ============================================================
   VOCAI OS — App Core
   ============================================================ */

// ── Auth guard ──────────────────────────────────────────────
const token = localStorage.getItem('vocai_token');
if (!token) window.location.href = '/';

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
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    return data;
  },
  get: (path) => API.req('GET', path),
  post: (path, body) => API.req('POST', path, body),
  put: (path, body) => API.req('PUT', path, body),
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

// ── Format helpers ───────────────────────────────────────────
function formatMoney(n) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function badge(status) {
  return `<span class="badge badge-${status}">${status.replace('_', ' ')}</span>`;
}
function responsablePill(r) {
  if (!r) return '—';
  const name = r === 'agus' ? 'Agus' : 'Santi';
  return `<span class="avatar-pill ${r}">${name}</span>`;
}
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ── Confirm dialog ───────────────────────────────────────────
function confirm(msg) {
  return window.confirm(msg);
}

// ── Modules registry ─────────────────────────────────────────
const MODULES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  clients:   { title: 'Clientes',  render: renderClients },
  projects:  { title: 'Proyectos', render: renderProjects },
  proposals: { title: 'Propuestas', render: renderProposals },
  contracts: { title: 'Contratos', render: renderContracts },
  invoices:  { title: 'Facturas',  render: renderInvoices },
  expenses:  { title: 'Gastos',    render: renderExpenses },
  goals:     { title: 'Metas',     render: renderGoals },
  bookings:  { title: 'Reservas de Estudio', render: renderBookings },
  episodes:  { title: 'Episodios', render: renderEpisodes },
  tasks:     { title: 'Tareas',    render: renderTasks },
  activity:  { title: 'Actividad', render: renderActivity },
  contacts:  { title: 'Contactos', render: renderContacts },
  files:     { title: 'Archivos',  render: renderFiles },
  notes:     { title: 'Notas',     render: renderNotes },
  agents:    { title: 'Agentes n8n', render: renderAgents },
  settings:  { title: 'Configuración', render: renderSettings },
};

// ── Router ───────────────────────────────────────────────────
let currentModule = null;

async function navigate(module) {
  if (!MODULES[module]) return;
  currentModule = module;

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
}

document.addEventListener('DOMContentLoaded', init);
