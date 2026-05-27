// Módulo Finanzas — P&L mensual: ingresos vs gastos recurrentes + inversión acumulada
window._finYear = null;
window._finMonth = null;

const FIN_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

async function renderFinanzas(el) {
  const now = new Date();
  window._finYear = now.getFullYear();
  window._finMonth = now.getMonth() + 1;
  await cargarFinanzasMes(el);
}

async function cargarFinanzasMes(el) {
  const mes = `${window._finYear}-${String(window._finMonth).padStart(2,'0')}`;
  const [invoices, expRecurrentes, expInversion] = await Promise.all([
    API.get('/invoices'),
    API.get(`/expenses?mes=${mes}&tipo=recurrente`),
    API.get('/expenses?tipo=inversion')
  ]);

  // Ingresos del mes (facturas cobradas)
  const [y, m] = mes.split('-').map(Number);
  const ingresosMes = (invoices || [])
    .filter(i => i.estado === 'cobrada' && i.fecha)
    .filter(i => {
      const d = new Date(i.fecha);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  const totalIngresos = ingresosMes.reduce((s,i) => s + (i.importe || 0), 0);
  const totalGastos = (expRecurrentes || []).reduce((s,e) => s + (e.importe || 0), 0);
  const resultado = totalIngresos - totalGastos;
  const totalInversion = (expInversion || []).reduce((s,e) => s + (e.importe || 0), 0);

  // Evolución últimos 6 meses
  const evol = buildEvolucion(invoices, window._finYear, window._finMonth);
  // expRecurrentes solo trae el mes actual; para el chart necesitamos todos los meses
  const allExpensesYear = await API.get(`/expenses?year=${window._finYear}`);
  fillEvolucionGastos(evol, allExpensesYear);
  // Si el rango cruza años hacia atrás, traemos también el año anterior
  const needPrev = evol.some(m => m.year < window._finYear);
  if (needPrev) {
    const prev = await API.get(`/expenses?year=${window._finYear - 1}`);
    fillEvolucionGastos(evol, prev);
  }

  buildFinanzasHTML(el || document.getElementById('pageContent'), {
    totalIngresos, totalGastos, resultado, totalInversion,
    ingresosMes, expRecurrentes, expInversion, evol
  });
}

function finMesLabel() {
  return `${FIN_MESES[window._finMonth - 1]} ${window._finYear}`;
}

function finMesAnterior() {
  if (window._finMonth === 1) { window._finMonth = 12; window._finYear--; }
  else { window._finMonth--; }
  cargarFinanzasMes();
}

function finMesSiguiente() {
  if (window._finMonth === 12) { window._finMonth = 1; window._finYear++; }
  else { window._finMonth++; }
  cargarFinanzasMes();
}

function buildEvolucion(invoices, year, month) {
  const months = [];
  const base = new Date(year, month - 1, 1);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      ingresos: 0,
      gastos: 0
    });
  }
  (invoices || []).filter(i => i.estado === 'cobrada' && i.fecha).forEach(i => {
    const d = new Date(i.fecha);
    const m = months.find(x => x.year === d.getFullYear() && x.month === d.getMonth() + 1);
    if (m) m.ingresos += i.importe || 0;
  });
  return months;
}

function fillEvolucionGastos(months, expenses) {
  (expenses || []).forEach(e => {
    const tipo = e.tipo || (e.recurrente ? 'recurrente' : 'inversion');
    if (tipo !== 'recurrente' || !e.fecha) return;
    const d = new Date(e.fecha);
    const m = months.find(x => x.year === d.getFullYear() && x.month === d.getMonth() + 1);
    if (m) m.gastos += e.importe || 0;
  });
}

function buildFinanzasHTML(el, d) {
  const { totalIngresos, totalGastos, resultado, totalInversion,
    ingresosMes, expRecurrentes, expInversion, evol } = d;

  const resColor = resultado >= 0 ? '#00C48C' : '#FF6B6B';
  const resSign = resultado >= 0 ? '+' : '−';
  const resAbs = Math.abs(resultado);

  // Top 5 gastos del mes ordenados desc
  const topGastos = [...(expRecurrentes || [])].sort((a,b) => (b.importe||0) - (a.importe||0)).slice(0,5);
  const topIngresos = [...ingresosMes].sort((a,b) => (b.importe||0) - (a.importe||0)).slice(0,5);

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Finanzas</h2>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:8px;padding:6px 12px;">
          <button type="button" id="btnFinAnt" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;padding:4px 8px;">&#8249;</button>
          <span style="font-size:14px;font-weight:600;color:#fff;min-width:140px;text-align:center;">${finMesLabel()}</span>
          <button type="button" id="btnFinSig" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;padding:4px 8px;">&#8250;</button>
        </div>
      </div>
    </div>

    <!-- Resumen del mes -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div class="card" style="padding:24px;text-align:center;border-left:3px solid #00C48C;">
        <div style="font-size:13px;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Ingresos</div>
        <div style="font-family:'Syne',sans-serif;font-size:34px;font-weight:800;color:#00C48C;">
          <span style="font-size:16px;font-family:Outfit,sans-serif;font-weight:400;opacity:.7;">€</span>${totalIngresos.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
        <div style="font-size:11px;color:#666;margin-top:6px;">${ingresosMes.length} factura${ingresosMes.length===1?'':'s'} cobrada${ingresosMes.length===1?'':'s'}</div>
      </div>
      <div class="card" style="padding:24px;text-align:center;border-left:3px solid #FF6B6B;">
        <div style="font-size:13px;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Gastos recurrentes</div>
        <div style="font-family:'Syne',sans-serif;font-size:34px;font-weight:800;color:#FF6B6B;">
          <span style="font-size:16px;font-family:Outfit,sans-serif;font-weight:400;opacity:.7;">€</span>${totalGastos.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
        <div style="font-size:11px;color:#666;margin-top:6px;">${(expRecurrentes||[]).length} movimiento${(expRecurrentes||[]).length===1?'':'s'}</div>
      </div>
      <div class="card" style="padding:24px;text-align:center;border-left:3px solid ${resColor};background:${resColor}11;">
        <div style="font-size:13px;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Resultado del mes</div>
        <div style="font-family:'Syne',sans-serif;font-size:34px;font-weight:800;color:${resColor};">
          ${resSign}<span style="font-size:16px;font-family:Outfit,sans-serif;font-weight:400;opacity:.7;">€</span>${resAbs.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
        <div style="font-size:11px;color:#666;margin-top:6px;">${resultado >= 0 ? 'Ganancia' : 'Pérdida'}</div>
      </div>
    </div>

    <!-- Inversión acumulada -->
    <div class="card" style="padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;">
      <div>
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Inversión acumulada (capital inicial)</div>
        <div style="font-size:12px;color:#666;">${(expInversion||[]).length} movimiento${(expInversion||[]).length===1?'':'s'} — no entra en el cálculo mensual</div>
      </div>
      <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:#9D7FE8;">
        <span style="font-size:14px;font-family:Outfit,sans-serif;font-weight:400;opacity:.7;">€</span>${totalInversion.toLocaleString('es-ES',{minimumFractionDigits:2})}
      </div>
    </div>

    <!-- Gráfico de evolución 6 meses -->
    <div class="chart-card" style="margin-bottom:20px;padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;">Evolución últimos 6 meses</div>
          <div style="font-size:13px;color:var(--text-muted);">Ingresos vs gastos recurrentes</div>
        </div>
      </div>
      <canvas id="finChart"></canvas>
    </div>

    <!-- Desglose: top ingresos / top gastos -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card">
        <div class="card-header"><h3 class="card-title" style="color:#00C48C;">Top ingresos del mes</h3></div>
        ${topIngresos.length === 0
          ? '<div class="empty-state" style="padding:20px;"><div class="empty-sub">Sin facturas cobradas este mes</div></div>'
          : `<div style="display:flex;flex-direction:column;gap:8px;">
            ${topIngresos.map(i => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:13px;">${escHtml(i.concepto || i.numero || '—')}</div>
                <strong style="color:#00C48C;">${formatMoney(i.importe)}</strong>
              </div>`).join('')}
          </div>`
        }
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title" style="color:#FF6B6B;">Top gastos del mes</h3></div>
        ${topGastos.length === 0
          ? '<div class="empty-state" style="padding:20px;"><div class="empty-sub">Sin gastos recurrentes este mes</div></div>'
          : `<div style="display:flex;flex-direction:column;gap:8px;">
            ${topGastos.map(e => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:13px;">${escHtml(e.nombre || '—')}</div>
                <strong style="color:#FF6B6B;">${formatMoney(e.importe)}</strong>
              </div>`).join('')}
          </div>`
        }
      </div>
    </div>`;

  document.getElementById('btnFinAnt').addEventListener('click', finMesAnterior);
  document.getElementById('btnFinSig').addEventListener('click', finMesSiguiente);

  requestAnimationFrame(() => initFinChart(evol));
}

function initFinChart(months) {
  const canvas = document.getElementById('finChart');
  if (!canvas || !window.Chart) return;
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        {
          label: 'Ingresos',
          data: months.map(m => m.ingresos),
          backgroundColor: 'rgba(0,196,140,0.6)',
          borderColor: '#00C48C',
          borderWidth: 0,
          borderRadius: 6
        },
        {
          label: 'Gastos',
          data: months.map(m => m.gastos),
          backgroundColor: 'rgba(255,107,107,0.5)',
          borderColor: '#FF6B6B',
          borderWidth: 0,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#aaa', font: { family: 'Outfit', size: 12 } }
        },
        tooltip: {
          backgroundColor: '#1e1e1e',
          borderColor: '#2a2a2a',
          borderWidth: 1,
          titleColor: '#f0f0f0',
          bodyColor: '#aaa',
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ` + new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(ctx.raw)
          }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#666', font: { family: 'Outfit', size: 12 } } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { display: false },
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
