async function renderDashboard(el) {
  const data = await API.get('/dashboard');
  const { kpis, tasks, todayBookings } = data;

  el.innerHTML = `
    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card teal">
        <div class="kpi-icon">💰</div>
        <div class="kpi-label">MRR</div>
        <div class="kpi-value">${formatMoney(kpis.mrr)}</div>
        <div class="kpi-sub">Ingresos recurrentes</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-icon">👥</div>
        <div class="kpi-label">Clientes activos</div>
        <div class="kpi-value">${kpis.activeClients}</div>
        <div class="kpi-sub">En cartera</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-icon">📋</div>
        <div class="kpi-label">Facturas pendientes</div>
        <div class="kpi-value">${kpis.pendingInvoices}</div>
        <div class="kpi-sub">${formatMoney(kpis.pendingAmount)} por cobrar</div>
      </div>
      <div class="kpi-card violet">
        <div class="kpi-icon">🚀</div>
        <div class="kpi-label">Proyectos activos</div>
        <div class="kpi-value">${kpis.activeProjects}</div>
        <div class="kpi-sub">En curso</div>
      </div>
    </div>

    <div class="grid-2">
      <!-- Tareas del día -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">⚡ Tareas pendientes</h3>
          <button class="btn btn-sm btn-primary" onclick="navigate('tasks')">Ver todas</button>
        </div>
        ${tasks.length === 0
          ? '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Sin tareas pendientes</div></div>'
          : `<div style="display:flex;flex-direction:column;gap:8px;">
            ${tasks.slice(0, 6).map(t => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:14px;font-weight:500;truncate">${escHtml(t.titulo)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${t.fecha_limite ? '📅 ' + formatDate(t.fecha_limite) : ''}</div>
                </div>
                ${badge(t.prioridad)}
                ${responsablePill(t.responsable)}
              </div>
            `).join('')}
          </div>`
        }
      </div>

      <!-- Reservas de hoy -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🎙️ Reservas hoy</h3>
          <button class="btn btn-sm btn-secondary" onclick="navigate('bookings')">Ver agenda</button>
        </div>
        ${todayBookings.length === 0
          ? '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Sin reservas hoy</div></div>'
          : `<div style="display:flex;flex-direction:column;gap:8px;">
            ${todayBookings.map(b => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
                <div style="flex:1;">
                  <div style="font-size:14px;font-weight:500;">${escHtml(b.clients?.nombre || '—')}</div>
                  <div style="font-size:12px;color:var(--text-muted);">${b.hora ? b.hora.slice(0,5) : ''} · Pack ${escHtml(b.pack)}</div>
                </div>
                ${badge(b.estado)}
              </div>
            `).join('')}
          </div>`
        }
      </div>
    </div>

    <!-- Revenue este mes -->
    <div class="card mt-4">
      <div class="card-header">
        <h3 class="card-title">💵 Facturado este mes</h3>
        <button class="btn btn-sm btn-secondary" onclick="navigate('invoices')">Ver facturas</button>
      </div>
      <div style="display:flex;align-items:center;gap:24px;">
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:40px;font-weight:800;color:var(--teal);">${formatMoney(kpis.monthlyRevenue)}</div>
          <div style="font-size:13px;color:var(--text-muted);">cobrado este mes</div>
        </div>
      </div>
    </div>
  `;
}
