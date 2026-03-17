async function renderDashboard(el) {
  const [data, allInvoices] = await Promise.all([
    API.get('/dashboard'),
    API.get('/invoices')
  ]);
  const { kpis, tasks, todayBookings } = data;

  // Build last 6 months revenue data
  const monthlyRevenue = buildMonthlyRevenue(allInvoices);

  el.innerHTML = `
    <!-- KPI Grid -->
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="kpi-card gradient">
        <div class="kpi-label">💰 MRR</div>
        <div class="kpi-value">${formatMoneyShort(kpis.mrr)}</div>
        <div class="kpi-sub">Ingresos recurrentes mensuales</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">👥 Clientes activos</div>
        <div class="kpi-value">${kpis.activeClients}</div>
        <div class="kpi-sub">En cartera ahora mismo</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-label">📋 Facturas pendientes</div>
        <div class="kpi-value">${kpis.pendingInvoices}</div>
        <div class="kpi-sub">${formatMoney(kpis.pendingAmount)} por cobrar</div>
      </div>
      <div class="kpi-card teal">
        <div class="kpi-label">🚀 Proyectos activos</div>
        <div class="kpi-value">${kpis.activeProjects}</div>
        <div class="kpi-sub">En curso ahora mismo</div>
      </div>
    </div>

    <!-- Chart + Tareas -->
    <div class="grid-2" style="margin-bottom:24px;">
      <div class="chart-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div>
            <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;">Ingresos últimos 6 meses</div>
            <div style="font-size:13px;color:var(--text-muted);">Facturas cobradas</div>
          </div>
          <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:#fff;">
            ${formatMoney(kpis.monthlyRevenue)}
          </div>
        </div>
        <canvas id="revenueChart"></canvas>
      </div>

      <div class="card" style="display:flex;flex-direction:column;">
        <div class="card-header">
          <h3 class="card-title">⚡ Tareas pendientes</h3>
          <button class="btn btn-sm btn-secondary" onclick="navigate('tasks')">Ver todas</button>
        </div>
        ${tasks.length === 0
          ? '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Sin tareas pendientes</div></div>'
          : `<div style="display:flex;flex-direction:column;gap:8px;flex:1;">
            ${tasks.slice(0, 6).map(t => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--border);">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:500;">${escHtml(t.titulo)}</div>
                  ${t.fecha_limite ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">📅 ${formatDate(t.fecha_limite)}</div>` : ''}
                </div>
                ${badge(t.prioridad)}
                ${responsablePill(t.responsable)}
              </div>`).join('')}
          </div>`
        }
      </div>
    </div>

    <!-- Reservas hoy + Revenue -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🎙️ Reservas hoy</h3>
          <button class="btn btn-sm btn-secondary" onclick="navigate('bookings')">Ver agenda</button>
        </div>
        ${todayBookings.length === 0
          ? '<div class="empty-state" style="padding:24px;"><div class="empty-icon">📅</div><div class="empty-title">Sin reservas hoy</div></div>'
          : `<div style="display:flex;flex-direction:column;gap:8px;">
            ${todayBookings.map(b => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--border);">
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:500;">${escHtml(b.clients?.nombre||'—')}</div>
                  <div style="font-size:11px;color:var(--text-muted);">${b.hora ? b.hora.slice(0,5) : ''} · Pack ${escHtml(b.pack||'')}</div>
                </div>
                ${badge(b.estado)}
              </div>`).join('')}
          </div>`
        }
      </div>

      <div class="card" style="display:flex;flex-direction:column;justify-content:center;">
        <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Facturado este mes</div>
        <div style="font-family:'Syne',sans-serif;font-size:52px;font-weight:800;color:#fff;line-height:1;margin-bottom:8px;">
          ${formatMoney(kpis.monthlyRevenue)}
        </div>
        <div style="font-size:13px;color:var(--text-muted);">cobrado y confirmado</div>
        <div style="margin-top:20px;">
          <button class="btn btn-primary btn-sm" onclick="navigate('invoices')">Ver facturas →</button>
        </div>
      </div>
    </div>`;

  // Init chart after DOM render
  requestAnimationFrame(() => initRevenueChart(monthlyRevenue));
}

function buildMonthlyRevenue(invoices) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      total: 0
    });
  }

  (invoices || []).filter(inv => inv.estado === 'cobrada').forEach(inv => {
    if (!inv.fecha) return;
    const d = new Date(inv.fecha);
    const m = months.find(x => x.year === d.getFullYear() && x.month === d.getMonth() + 1);
    if (m) m.total += inv.importe || 0;
  });

  return months;
}

function initRevenueChart(months) {
  const canvas = document.getElementById('revenueChart');
  if (!canvas || !window.Chart) return;

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        label: 'Ingresos',
        data: months.map(m => m.total),
        backgroundColor: months.map((m, i) =>
          i === months.length - 1
            ? '#2979FF'
            : 'rgba(255,107,107,0.4)'
        ),
        borderColor: months.map((m, i) =>
          i === months.length - 1? '#2979FF' : '#FF6B6B'
        ),
        borderWidth: 0,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1e1e',
          borderColor: '#2a2a2a',
          borderWidth: 1,
          titleColor: '#f0f0f0',
          bodyColor: '#aaa',
          callbacks: {
            label: ctx => ' ' + new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#555', font: { family: 'Outfit', size: 12 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          border: { display: false, dash: [4, 4] },
          ticks: {
            color: '#555',
            font: { family: 'Outfit', size: 11 },
            callback: v => '€' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v)
          }
        }
      }
    }
  });
}

function formatMoneyShort(n) {
  if (!n) return '€0';
  if (n >= 1000) return '€' + (n/1000).toFixed(1).replace('.0','') + 'k';
  return '€' + n;
}
