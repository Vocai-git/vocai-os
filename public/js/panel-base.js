// Base común de las páginas del panel nuevo (/panel y /panel/...): sesión, llamadas a la API y cabecera.
// Usa la misma sesión que /app.
const ENTRADA = '/?ir=' + encodeURIComponent(location.pathname);
const token = localStorage.getItem('vocai_token');
if (!token) window.location.href = ENTRADA;

const $ = id => document.getElementById(id);
const numero = n => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const texto = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML.replace(/"/g, '&quot;'); };
const fechaCorta = f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const mayuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

async function api(metodo, ruta, cuerpo) {
  const res = await fetch('/api' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('vocai_token')}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  if (res.status === 401) { localStorage.clear(); window.location.href = ENTRADA; return new Promise(() => {}); }
  const datos = await res.json();
  if (!res.ok) throw new Error(datos.error || 'Error del servidor');
  return datos;
}

function iniciarCabecera() {
  const usuario = JSON.parse(localStorage.getItem('vocai_user') || '{}');
  const nombre = usuario.nombre || usuario.email || 'Usuario';
  $('usuarioNombre').textContent = nombre;
  $('btnSalir').textContent = nombre.charAt(0).toUpperCase();
  $('btnSalir').addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión?')) return;
    await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    localStorage.clear();
    window.location.href = ENTRADA;
  });
}
