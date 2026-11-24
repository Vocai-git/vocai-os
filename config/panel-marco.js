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

const MENU = [['/panel', 'Asistentes'], ['/panel/clientes', 'Clientes'], ['/panel/finanzas', 'Finanzas'], ['/panel/estadisticas', 'Estadísticas']];

// Vista heredada de Finanzas (/panel/finanzas/completo?ver=…): abre la pestaña pedida desde el resumen nuevo.
// La inversión ya tiene sitio propio en el menú de arriba, así que aquí su pestaña se oculta (panel-piel.css).
const PESTANA = `
  <script>
    document.documentElement.classList.add('fin-completo');
    // La primera pestaña («Resumen del mes») vuelve al resumen nuevo en vez de abrir el heredado.
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.money-tabs button');
      if (!b || b !== b.parentNode.firstElementChild) return;
      e.preventDefault(); e.stopPropagation();
      location.href = '/panel/finanzas';
    }, true);
    (function () {
      var q = new URLSearchParams(location.search), ver = q.get('ver'), intentos = 0;
      if (['records', 'invoices', 'documents', 'bank', 'home'].indexOf(ver) < 0) ver = 'records';
      var reloj = setInterval(function () {
        if (++intentos > 100) return clearInterval(reloj);
        if (typeof moneyState === 'undefined' || !moneyState.data || !document.querySelector('.money-tabs')) return;
        clearInterval(reloj);
        ver === 'records' ? moneyOpenRecords() : moneyView(ver);
        if (q.get('nuevo') && !moneyState.data.review) moneyForm('expense');
      }, 150);
    })();
  </script>`;

// Registro de aportes y compensaciones (/panel/inversion): se llega desde Finanzas › Socios y se vuelve ahí.
const VOLVER = `
  <script>
    document.documentElement.classList.add('fin-aportes');
    document.addEventListener('DOMContentLoaded', function () {
      var a = document.createElement('a');
      a.className = 'volver-socios'; a.href = '/panel/finanzas/socios'; a.textContent = '← Volver a Socios';
      var c = document.querySelector('.page-content') || document.body; c.parentNode.insertBefore(a, c);
    });
  </script>`;

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
    if (location.hash.slice(1) !== ${modulo}) history.replaceState(null, '', location.pathname + location.search + '#' + ${modulo});
  </script>${seccion === 'finanzas' ? PESTANA : seccion === 'inversion' ? VOLVER : ''}
</head>`;
  const enlaces = MENU.map(([ruta, nombre]) => `<a${ruta === '/panel/' + (seccion === 'inversion' ? 'finanzas' : seccion) ? ' class="on"' : ''} href="${ruta}">${nombre}</a>`).join('');
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
