// Secciones que todavía usan los módulos de /app (Finanzas, Inversión, Estadísticas) servidas dentro
// del panel nuevo: la misma página app.html, con la cabecera y la piel del panel nuevo por encima.
// No modifica /app: app.html se lee tal cual y solo se le añade lo de aquí.
const fs = require('fs');
const path = require('path');

const SECCIONES = {
  finanzas: { modulo: 'finanzasV2', titulo: 'Finanzas' },
  inversion: { modulo: 'inversionV2', titulo: 'Inversión' },
  estadisticas: { modulo: 'marketing-analytics', titulo: 'Estadísticas' }
};

const MENU = [['/panel', 'Asistentes'], ['/panel/clientes', 'Clientes'], ['/panel/finanzas', 'Finanzas'], ['/panel/inversion', 'Inversión'], ['/panel/estadisticas', 'Estadísticas']];

function pagina(seccion) {
  const s = Object.hasOwn(SECCIONES, seccion) ? SECCIONES[seccion] : null;
  if (!s) return null;
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.html'), 'utf8');
  const modulo = JSON.stringify(s.modulo);
  const cabeza = `
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/panel-piel.css?v=1">
  <link rel="icon" href="/img/logo.png">
  <script>
    document.documentElement.classList.add('piel-nueva');
    document.documentElement.setAttribute('data-theme', 'dark');
    if (location.hash.slice(1) !== ${modulo}) history.replaceState(null, '', location.pathname + '#' + ${modulo});
  </script>
</head>`;
  const enlaces = MENU.map(([ruta, nombre]) => `<a${ruta === '/panel/' + seccion ? ' class="on"' : ''} href="${ruta}">${nombre}</a>`).join('');
  const cima = `<body>
<header class="cima">
  <a class="logo" href="/panel">VOCAI</a>
  <nav class="nav">${enlaces}</nav>
  <div class="usuario">
    <a class="anterior" href="/app">Panel anterior</a>
    <span id="usuarioNombre"></span>
    <button class="avatar" id="btnSalir" title="Cerrar sesión" aria-label="Cerrar sesión"></button>
  </div>
</header>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    var u = JSON.parse(localStorage.getItem('vocai_user') || '{}'), n = u.nombre || u.email || 'Usuario';
    document.getElementById('usuarioNombre').textContent = n;
    document.getElementById('btnSalir').textContent = n.charAt(0).toUpperCase();
    document.getElementById('btnSalir').addEventListener('click', function () {
      if (confirm('¿Cerrar sesión?')) document.getElementById('btnLogout').click();
    });
  });
</script>`;
  return html.replace('<title>VOCAI OS</title>', `<title>VOCAI — ${s.titulo}</title>`).replace('</head>', cabeza).replace('<body>', cima);
}

module.exports = { pagina };
