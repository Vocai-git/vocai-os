// Layout compartido entre maquetas — inyecta sidebar y marca el activo
(function () {
  const path = location.pathname;
  const active = (p) => path.endsWith(p) ? 'active' : '';

  const sidebarHTML = `
    <div class="maqueta-badge">Maqueta · no funcional</div>
    <aside class="sidebar">
      <div class="sidebar-logo">
        <img src="/img/logo.png" alt="VOCAI" style="width:120px;display:block;margin:0 auto;mix-blend-mode:screen;">
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">
          <div class="nav-section-title">Inicio</div>
          <a class="nav-item" href="#">
            <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            Dashboard
          </a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Contenido</div>
          <a class="nav-item ${active('generador.html') || active('resultado.html')}" href="/maquetas/generador.html">
            <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
            Generador
          </a>
          <a class="nav-item ${active('historial.html')}" href="/maquetas/historial.html">
            <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Historial
          </a>
          <a class="nav-item ${active('adn.html')}" href="/maquetas/adn.html">
            <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            ADN Clientes
          </a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Negocio</div>
          <a class="nav-item" href="#">
            <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Clientes
          </a>
        </div>
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="user-avatar">A</div>
          <div class="user-info">
            <div class="user-name">Agus Moledo</div>
            <div class="user-role">Fundador</div>
          </div>
        </div>
      </div>
    </aside>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.getElementById('sidebar-slot');
    if (slot) slot.innerHTML = sidebarHTML;
  });
})();
