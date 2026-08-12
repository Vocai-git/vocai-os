// Módulo Finanzas — P&L mensual: ingresos vs gastos recurrentes + inversión acumulada
window._finYear = null;
window._finMonth = null;
// Vista de ingresos: 'cobradas' (solo estado=cobrada) | 'facturadas' (todas las emitidas, excluye borrador)
window._finIngresoVista = 'cobradas';

function finMatchIngreso(inv, vista) {
  if (!inv || !inv.estado) return false;
  if (vista === 'facturadas') return inv.estado !== 'borrador';
  return inv.estado === 'cobrada';
}

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

  // Ingresos del mes — según vista activa (cobradas o todas las facturadas)
  const vista = window._finIngresoVista || 'cobradas';
  const [y, m] = mes.split('-').map(Number);
  const ingresosMes = (invoices || [])
    .filter(i => finMatchIngreso(i, vista) && i.fecha)
    .filter(i => {
      const d = new Date(i.fecha);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  // Para los totales usamos `total` (importe + iva − irpf) si está calculado, si no caemos al importe.
  const montoOf = x => (x.total != null ? x.total : (x.importe || 0));
  const totalIngresos = ingresosMes.reduce((s,i) => s + montoOf(i), 0);
  const totalGastos = (expRecurrentes || []).reduce((s,e) => s + montoOf(e), 0);
  const resultado = totalIngresos - totalGastos;
  const totalInversion = (expInversion || []).reduce((s,e) => s + montoOf(e), 0);

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
    ingresosMes, expRecurrentes, expInversion, evol, invoices
  });
}

function finCambiarVistaIngresos(vista) {
  if (vista !== 'cobradas' && vista !== 'facturadas') return;
  window._finIngresoVista = vista;
  cargarFinanzasMes();
}

// Filtra in-memory las filas de una tabla por una query libre
// (compara contra el data-search de cada <tr>).
function finFiltrarFilas(rowClass, query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('.' + rowClass).forEach(tr => {
    const blob = tr.dataset.search || '';
    tr.style.display = (!q || blob.includes(q)) ? '' : 'none';
  });
}

// Wrapper para crear un gasto recurrente desde Finanzas:
// fija el tipo del modal en 'recurrente' antes de abrir el form.
function finNewGastoRecurrente() {
  window._expTipo = 'recurrente';
  newExpense();
}

// Abre un modal con la lista de gastos recurrentes del mes anterior y
// permite elegir cuáles copiar al mes actual. Por defecto vienen todos
// los que aún no existen tildados; los que ya existen aparecen marcados
// como "ya cargado".
async function finCopiarRecurrentes() {
  const mesTo = `${window._finYear}-${String(window._finMonth).padStart(2,'0')}`;
  const [y, m] = mesTo.split('-').map(Number);
  const mesFrom = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2,'0')}`;

  let prevExpenses, currExpenses;
  try {
    [prevExpenses, currExpenses] = await Promise.all([
      API.get(`/expenses?mes=${mesFrom}&tipo=recurrente`),
      API.get(`/expenses?mes=${mesTo}&tipo=recurrente`)
    ]);
  } catch (err) { toast(err.message, 'error'); return; }

  if (!prevExpenses || prevExpenses.length === 0) {
    toast(`No hay gastos recurrentes en ${mesFrom} para copiar`, 'info');
    return;
  }

  const yaExiste = new Set(
    (currExpenses || []).map(e => `${(e.nombre||'').toLowerCase().trim()}|${(e.responsable||'').toLowerCase().trim()}`)
  );

  const montoOf = x => (x.total != null ? x.total : (x.importe || 0));
  const filas = prevExpenses.map(e => {
    const key = `${(e.nombre||'').toLowerCase().trim()}|${(e.responsable||'').toLowerCase().trim()}`;
    const yaCopiado = yaExiste.has(key);
    return `
      <label style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);cursor:${yaCopiado?'not-allowed':'pointer'};opacity:${yaCopiado?0.5:1};">
        <input type="checkbox" class="finCopyChk" value="${e.id}" ${yaCopiado ? 'disabled' : 'checked'} style="width:16px;height:16px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:500;">${escHtml(e.nombre || '—')}</div>
          <div style="font-size:11px;color:var(--text-muted);">${escHtml(e.categoria || 'otros')} · ${escHtml(e.responsable || '—')}${yaCopiado ? ' · <span style=\"color:#FF8C42;\">ya cargado este mes</span>' : ''}</div>
        </div>
        <strong style="color:#FF6B6B;font-size:13px;">${formatMoney(montoOf(e))}</strong>
      </label>`;
  }).join('');

  createModal('finCopyModal', `Copiar gastos recurrentes de ${mesFrom} a ${mesTo}`, `
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Destildá los que no quieras copiar. Los que ya están cargados en ${mesTo} aparecen deshabilitados.</div>
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button type="button" class="btn btn-secondary btn-sm" onclick="finCopyTogglePicked(true)">Tildar todos</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="finCopyTogglePicked(false)">Destildar todos</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto;">
      ${filas}
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('finCopyModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="finCopyConfirm('${mesFrom}','${mesTo}')">Copiar seleccionados</button>
  `);
}

function finCopyTogglePicked(checked) {
  document.querySelectorAll('.finCopyChk:not([disabled])').forEach(chk => { chk.checked = checked; });
}

async function finCopyConfirm(mesFrom, mesTo) {
  const ids = [...document.querySelectorAll('.finCopyChk:checked')].map(chk => chk.value);
  if (ids.length === 0) {
    toast('No seleccionaste ningún gasto para copiar', 'error');
    return;
  }
  try {
    const r = await API.post('/expenses/copy-recurring', { from: mesFrom, to: mesTo, ids });
    if (r.copiados === 0) {
      toast('Nada que copiar (ya estaban cargados)', 'info');
    } else {
      toast(`${r.copiados} copiados${r.omitidos ? `, ${r.omitidos} omitidos` : ''}`, 'success');
    }
    closeModal('finCopyModal');
    cargarFinanzasMes();
  } catch (err) { toast(err.message, 'error'); }
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
  const vista = window._finIngresoVista || 'cobradas';
  const montoOf = x => (x.total != null ? x.total : (x.importe || 0));
  (invoices || []).filter(i => finMatchIngreso(i, vista) && i.fecha).forEach(i => {
    const d = new Date(i.fecha);
    const m = months.find(x => x.year === d.getFullYear() && x.month === d.getMonth() + 1);
    if (m) m.ingresos += montoOf(i);
  });
  return months;
}

function fillEvolucionGastos(months, expenses) {
  const montoOf = x => (x.total != null ? x.total : (x.importe || 0));
  (expenses || []).forEach(e => {
    const tipo = e.tipo || (e.recurrente ? 'recurrente' : 'inversion');
    if (tipo !== 'recurrente' || !e.fecha) return;
    const d = new Date(e.fecha);
    const m = months.find(x => x.year === d.getFullYear() && x.month === d.getMonth() + 1);
    if (m) m.gastos += montoOf(e);
  });
}

function buildFinanzasHTML(el, d) {
  const { totalIngresos, totalGastos, resultado, totalInversion,
    ingresosMes, expRecurrentes, expInversion, evol, invoices } = d;

  const resColor = resultado >= 0 ? '#00C48C' : '#FF6B6B';
  const resSign = resultado >= 0 ? '+' : '−';
  const resAbs = Math.abs(resultado);

  // Listas completas del mes (orden por total desc, fallback a importe si no hay desglose)
  const montoOf = x => (x.total != null ? x.total : (x.importe || 0));
  const gastosOrdenados = [...(expRecurrentes || [])].sort((a,b) => montoOf(b) - montoOf(a));
  const ingresosOrdenados = [...ingresosMes].sort((a,b) => montoOf(b) - montoOf(a));

  // Cacheo para que los botones de editar/mover encuentren el dato sin volver a pedir
  window._expensesAll = expRecurrentes;
  window._invoicesData = invoices;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Finanzas</h2>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 12px;">
          <button type="button" id="btnFinAnt" style="background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;padding:4px 8px;">&#8249;</button>
          <span style="font-size:14px;font-weight:600;color:var(--text);min-width:140px;text-align:center;">${finMesLabel()}</span>
          <button type="button" id="btnFinSig" style="background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;padding:4px 8px;">&#8250;</button>
        </div>
      </div>
    </div>

    <!-- Resumen del mes -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div class="card" style="padding:24px;text-align:center;border-left:3px solid #00C48C;">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Ingresos ${(window._finIngresoVista||'cobradas')==='facturadas'?'(facturados)':'(cobrados)'}</div>
        <div style="font-family:'Syne',sans-serif;font-size:34px;font-weight:800;color:#00C48C;">
          <span style="font-size:16px;font-family:Outfit,sans-serif;font-weight:400;opacity:.7;">€</span>${totalIngresos.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;">${ingresosMes.length} factura${ingresosMes.length===1?'':'s'} ${(window._finIngresoVista||'cobradas')==='facturadas'?'emitida':'cobrada'}${ingresosMes.length===1?'':'s'}</div>
      </div>
      <div class="card" style="padding:24px;text-align:center;border-left:3px solid #FF6B6B;">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Gastos recurrentes</div>
        <div style="font-family:'Syne',sans-serif;font-size:34px;font-weight:800;color:#FF6B6B;">
          <span style="font-size:16px;font-family:Outfit,sans-serif;font-weight:400;opacity:.7;">€</span>${totalGastos.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;">${(expRecurrentes||[]).length} movimiento${(expRecurrentes||[]).length===1?'':'s'}</div>
      </div>
      <div class="card" style="padding:24px;text-align:center;border-left:3px solid ${resColor};background:${resColor}11;">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Resultado del mes</div>
        <div style="font-family:'Syne',sans-serif;font-size:34px;font-weight:800;color:${resColor};">
          ${resSign}<span style="font-size:16px;font-family:Outfit,sans-serif;font-weight:400;opacity:.7;">€</span>${resAbs.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;">${resultado >= 0 ? 'Ganancia' : 'Pérdida'}</div>
      </div>
    </div>

    <!-- Inversión acumulada -->
    <div class="card" style="padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;background:var(--surface);">
      <div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Inversión acumulada (capital inicial)</div>
        <div style="font-size:12px;color:var(--text-dim);">${(expInversion||[]).length} movimiento${(expInversion||[]).length===1?'':'s'} — no entra en el cálculo mensual</div>
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

    <!-- Listas completas con CRUD: ingresos / gastos recurrentes -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">

      <!-- Ingresos del mes (facturas) -->
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <h3 class="card-title" style="color:#00C48C;">Ingresos del mes</h3>
            <div style="display:flex;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:3px;">
              <button type="button" onclick="finCambiarVistaIngresos('cobradas')"
                style="background:${(window._finIngresoVista||'cobradas')==='cobradas'?'#00C48C':'transparent'};color:${(window._finIngresoVista||'cobradas')==='cobradas'?'#fff':'var(--text-muted)'};border:none;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;border-radius:6px;">Cobradas</button>
              <button type="button" onclick="finCambiarVistaIngresos('facturadas')"
                style="background:${(window._finIngresoVista||'cobradas')==='facturadas'?'#2979FF':'transparent'};color:${(window._finIngresoVista||'cobradas')==='facturadas'?'#fff':'var(--text-muted)'};border:none;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;border-radius:6px;">Facturadas</button>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="newInvoice()">+ Nueva factura</button>
        </div>
        ${ingresosOrdenados.length === 0
          ? '<div class="empty-state" style="padding:20px;"><div class="empty-sub">Sin facturas cobradas este mes</div></div>'
          : `<input type="search" placeholder="Buscar en ingresos…"
              oninput="finFiltrarFilas('finIngresoRow', this.value)"
              style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;margin-bottom:12px;">
            <div class="table-wrapper">
              <table>
                <thead><tr>
                  <th>Concepto</th><th>Cliente</th><th>Estado</th><th>Importe</th><th>Fecha</th><th></th>
                </tr></thead>
                <tbody>
                  ${ingresosOrdenados.map(i => {
                    const blob = `${i.concepto||''} ${i.numero||''} ${invoiceCliente(i)} ${i.estado||''} ${i.notas||''}`.toLowerCase();
                    const estCol = { cobrada:'#00C48C', enviada:'#2979FF', vencida:'#FF6B6B', borrador:'#888' }[i.estado] || '#888';
                    return `
                    <tr class="finIngresoRow" data-search="${escHtml(blob)}">
                      <td><strong>${escHtml(i.concepto || i.numero || '—')}</strong></td>
                      <td style="color:var(--text-muted);">${escHtml(invoiceCliente(i) || '—')}</td>
                      <td><span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;text-transform:capitalize;background:${estCol}22;color:${estCol};border:1px solid ${estCol}44;">${escHtml(i.estado || '—')}</span></td>
                      <td><strong style="color:#00C48C;">${formatMoney(montoOf(i))}</strong></td>
                      <td style="color:var(--text-muted);">${formatDate(i.fecha)}</td>
                      <td>
                        <div style="display:flex;gap:4px;">
                          <button class="btn btn-ghost btn-icon btn-sm" onclick="editInvoice('${i.id}')" title="Editar">✏️</button>
                          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteInvoice('${i.id}')" title="Eliminar">🗑️</button>
                        </div>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>

      <!-- Gastos recurrentes del mes -->
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <h3 class="card-title" style="color:#FF6B6B;">Gastos recurrentes del mes</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="finCopiarRecurrentes()" title="Copia los gastos recurrentes del mes anterior a este mes. No duplica los que ya existen.">📋 Copiar del mes anterior</button>
            <button class="btn btn-primary btn-sm" onclick="finNewGastoRecurrente()">+ Nuevo gasto</button>
          </div>
        </div>
        ${gastosOrdenados.length === 0
          ? '<div class="empty-state" style="padding:20px;"><div class="empty-sub">Sin gastos recurrentes este mes</div></div>'
          : `<input type="search" placeholder="Buscar en gastos recurrentes…"
              oninput="finFiltrarFilas('finGastoRow', this.value)"
              style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;margin-bottom:12px;">
            <div class="table-wrapper">
              <table>
                <thead><tr>
                  <th>Concepto</th><th>Categoría</th><th>Importe</th><th>Fecha</th><th></th>
                </tr></thead>
                <tbody>
                  ${gastosOrdenados.map(e => {
                    const blob = `${e.nombre||''} ${e.categoria||''} ${e.responsable||''} ${e.notas||''}`.toLowerCase();
                    return `
                    <tr class="finGastoRow" data-search="${escHtml(blob)}">
                      <td><strong>${escHtml(e.nombre || '—')}</strong></td>
                      <td style="color:var(--text-muted);text-transform:capitalize;">${escHtml(e.categoria || 'otros')}</td>
                      <td><strong style="color:#FF6B6B;">${formatMoney(montoOf(e))}</strong></td>
                      <td style="color:var(--text-muted);">${formatDate(e.fecha)}</td>
                      <td>
                        <div style="display:flex;gap:4px;">
                          <button class="btn btn-ghost btn-icon btn-sm" onclick="moverTipoExp('${e.id}','inversion')" title="Mover a Inversión" style="font-size:14px;">↔️</button>
                          <button class="btn btn-ghost btn-icon btn-sm" onclick="editExpense('${e.id}')" title="Editar">✏️</button>
                          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteExpense('${e.id}')" title="Eliminar">🗑️</button>
                        </div>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
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
