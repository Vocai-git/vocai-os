const DASH_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
let dashObjPlan = null;
let dashObjMes = '';

async function renderDashboard(el) {
  const now = new Date();
  dashObjMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [data, allInvoices, planning] = await Promise.all([
    API.get('/dashboard'),
    API.get('/invoices'),
    API.get(`/marketing-planning?mes=${dashObjMes}`).catch(() => ({ plan: null }))
  ]);
  const { kpis, tasks, todayBookings } = data;
  dashObjPlan = planning.plan || null;

  // Build last 6 months revenue data
  const monthlyRevenue = buildMonthlyRevenue(allInvoices);

  el.innerHTML = `
    <!-- Objetivos del mes -->
    <div id="dash-objetivos" style="margin-bottom:24px;">
      ${dashObjCardHTML('view')}
    </div>

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

// ── Objetivos del mes (bloque del Dashboard) ────────────────
function dashObjMesLabel() {
  const [y, m] = dashObjMes.split('-');
  return `${DASH_MESES[parseInt(m) - 1]} ${y}`;
}

function dashObjHasContent(p) {
  if (!p) return false;
  return !!(p.mes_anterior || p.objetivos || p.foco || p.puntual);
}

function dashObjCardHTML(mode) {
  const p = dashObjPlan || {};
  const has = dashObjHasContent(p);
  const header = `
    <div class="card-header">
      <h3 class="card-title">🎯 Objetivos del mes — ${dashObjMesLabel()}</h3>
      <div style="display:flex;gap:8px;">
        ${mode === 'view' ? `
          <button class="btn btn-sm btn-secondary" onclick="dashObjEdit()">${has ? 'Editar' : 'Llenar'}</button>
          ${has ? `<button class="btn btn-sm btn-secondary" onclick="dashObjDelete()" title="Borrar objetivos del mes">Borrar</button>` : ''}
        ` : `
          <button class="btn btn-sm btn-secondary" onclick="dashObjCancel()">Cancelar</button>
          <button class="btn btn-sm btn-primary" onclick="dashObjSave()">Guardar</button>
        `}
      </div>
    </div>`;

  if (mode === 'edit') {
    return `<div class="card">
      ${header}
      <div class="form-group">
        <label class="form-label">1 · Qué pasó el mes anterior</label>
        <textarea class="form-textarea" id="dobj_anterior"
          placeholder="Funcionó… / No funcionó… / Pivoteamos…">${escHtml(p.mes_anterior || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">2 · Objetivos de este mes (1 a 3)</label>
        <textarea class="form-textarea" id="dobj_objetivos"
          placeholder="Objetivos concretos del mes">${escHtml(p.objetivos || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">3 · Foco del mes (una frase)</label>
        <input class="form-input" id="dobj_foco" value="${escHtml(p.foco || '')}"
          placeholder="ej. Presentarnos: que en 30 seg se entienda qué es VOCAI">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">4 · Puntual del mes</label>
        <input class="form-input" id="dobj_puntual" value="${escHtml(p.puntual || '')}"
          placeholder="Campaña, evento, lanzamiento o pauta">
      </div>
    </div>`;
  }

  if (!has) {
    return `<div class="card">
      ${header}
      <div class="empty-state" style="padding:20px;">
        <div class="empty-sub">Todavía no hay objetivos para ${dashObjMesLabel()}.</div>
      </div>
    </div>`;
  }

  const block = (label, val) => val ? `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
        color:var(--text-dim);margin-bottom:6px;">${label}</div>
      <div style="font-size:14px;line-height:1.5;color:var(--text);white-space:pre-wrap;">${escHtml(val)}</div>
    </div>` : '';

  return `<div class="card">
    ${header}
    ${block('Mes anterior', p.mes_anterior)}
    ${block('Objetivos', p.objetivos)}
    ${block('Foco', p.foco)}
    ${p.puntual ? `<div style="margin-bottom:0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
        color:var(--text-dim);margin-bottom:6px;">Puntual</div>
      <div style="font-size:14px;line-height:1.5;color:var(--text);white-space:pre-wrap;">${escHtml(p.puntual)}</div>
    </div>` : ''}
  </div>`;
}

function dashObjRender(mode) {
  const cont = document.getElementById('dash-objetivos');
  if (cont) cont.innerHTML = dashObjCardHTML(mode);
}

function dashObjEdit()   { dashObjRender('edit'); }
function dashObjCancel() { dashObjRender('view'); }

async function dashObjSave() {
  const body = {
    mes: dashObjMes,
    mes_anterior: document.getElementById('dobj_anterior').value.trim(),
    objetivos:    document.getElementById('dobj_objetivos').value.trim(),
    foco:         document.getElementById('dobj_foco').value.trim(),
    puntual:      document.getElementById('dobj_puntual').value.trim(),
  };
  try {
    const saved = await API.post('/marketing-planning', body);
    dashObjPlan = saved || body;
    toast('Objetivos guardados', 'success');
    dashObjRender('view');
  } catch (err) { toast(err.message, 'error'); }
}

async function dashObjDelete() {
  if (!confirm(`¿Borrar los objetivos de ${dashObjMesLabel()}? Se vacían los 4 campos.`)) return;
  const body = { mes: dashObjMes, mes_anterior: '', objetivos: '', foco: '', puntual: '' };
  try {
    const saved = await API.post('/marketing-planning', body);
    dashObjPlan = saved || body;
    toast('Objetivos borrados', 'success');
    dashObjRender('view');
  } catch (err) { toast(err.message, 'error'); }
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
  const sym = '<span style="font-size:14px;color:#888888;font-family:Outfit,sans-serif;font-weight:400;">€</span>';
  if (!n) return sym + '0';
  if (n >= 1000) return sym + (n/1000).toFixed(1).replace('.0','') + 'k';
  return sym + n;
}
