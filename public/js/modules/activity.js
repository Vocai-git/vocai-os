async function renderActivity(el) {
  const activity = await API.get('/activity?limit=100');

  const MOD_ICONS = {
    clientes: '👥', proyectos: '🚀', facturas: '📋', tareas: '✅',
    estudio: '🎙️', contactos: '👤', notas: '📝', archivos: '📁', default: '⚡'
  };

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Registro de actividad</h2>
    </div>

    <div class="card">
      ${activity.length === 0
        ? '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Sin actividad registrada</div></div>'
        : `<div style="display:flex;flex-direction:column;">
          ${activity.map((a, i) => `
            <div style="display:flex;gap:14px;padding:14px 0;${i < activity.length-1 ? 'border-bottom:1px solid var(--border);' : ''}">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">
                ${MOD_ICONS[a.modulo] || MOD_ICONS.default}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:500;">${escHtml(a.detalle || a.accion)}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                  <strong>${escHtml(a.usuario)}</strong> · ${escHtml(a.modulo)} · ${formatDate(a.fecha)} ${new Date(a.fecha).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>
              <div>
                <span class="badge badge-gray" style="text-transform:capitalize;">${escHtml(a.accion)}</span>
              </div>
            </div>
          `).join('')}
        </div>`
      }
    </div>`;
}
