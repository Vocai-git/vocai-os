// Estado global del módulo — este módulo ahora solo muestra Inversión.
// Los gastos recurrentes viven en el módulo Finanzas.
window._expYear = null;
window._expMonth = null;
window._expTipo = 'inversion';

const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

async function renderExpenses(el) {
  const now = new Date();
  window._expYear = now.getFullYear();
  window._expMonth = now.getMonth() + 1; // 1-12
  window._expTipo = 'inversion'; // Este módulo solo muestra inversión.

  await cargarGastosMes(el);
}

async function cargarGastosMes(el) {
  const mes = `${window._expYear}-${String(window._expMonth).padStart(2,'0')}`;
  const tipo = window._expTipo;
  const [expensesAll, yearExpensesAll] = await Promise.all([
    API.get(`/expenses?mes=${mes}`),
    API.get(`/expenses?year=${window._expYear}`)
  ]);
  // Tratamos los gastos sin 'tipo' (datos viejos) como 'recurrente' por defecto.
  const tipoOf = e => e.tipo || (e.recurrente ? 'recurrente' : 'inversion');
  const expenses = expensesAll.filter(e => tipoOf(e) === tipo);
  const yearExpenses = yearExpensesAll.filter(e => tipoOf(e) === tipo);
  window._expensesAll = expenses;

  const acumulado = {
    total: yearExpenses.reduce((s,e) => s+(e.importe||0), 0),
    agus: yearExpenses.filter(e => (e.responsable||'').toLowerCase() === 'agus').reduce((s,e) => s+(e.importe||0), 0),
    santi: yearExpenses.filter(e => (e.responsable||'').toLowerCase() === 'santi').reduce((s,e) => s+(e.importe||0), 0)
  };

  buildExpensesHTML(el || document.getElementById('pageContent'), expenses, acumulado);
}

function cambiarTipoExp(tipo) {
  if (tipo !== 'inversion' && tipo !== 'recurrente') return;
  window._expTipo = tipo;
  cargarGastosMes();
}

// Después de crear/editar/borrar/mover un gasto, refrescamos la vista
// activa: si estamos en el módulo Gastos refrescamos local, si estamos
// en otro módulo (típicamente Finanzas) hacemos navigate para recargar.
function refreshExpenseView() {
  if (typeof currentModule !== 'undefined' && currentModule && currentModule !== 'expenses') {
    navigate(currentModule);
  } else {
    cargarGastosMes();
  }
}

function mesLabel() {
  return `${MESES_NOMBRE[window._expMonth - 1]} ${window._expYear}`;
}

function mesAnterior() {
  if (window._expMonth === 1) {
    window._expMonth = 12;
    window._expYear--;
  } else {
    window._expMonth--;
  }
  cargarGastosMes();
}

function mesSiguiente() {
  if (window._expMonth === 12) {
    window._expMonth = 1;
    window._expYear++;
  } else {
    window._expMonth++;
  }
  cargarGastosMes();
}

function buildExpensesHTML(el, expenses, acumulado) {
  const totalMes = expenses.reduce((s,e) => s+(e.importe||0), 0);
  const totalAgus = expenses.filter(e => (e.responsable||'').toLowerCase() === 'agus').reduce((s,e) => s+(e.importe||0), 0);
  const totalSanti = expenses.filter(e => (e.responsable||'').toLowerCase() === 'santi').reduce((s,e) => s+(e.importe||0), 0);

  const catColors = {
    software: '#2979FF', marketing: '#FF6B6B', oficina: '#FF8C42',
    personal: '#9D7FE8', servicios: '#00C48C', otros: '#888888'
  };

  const byCat = {};
  expenses.forEach(e => { byCat[e.categoria||'otros'] = (byCat[e.categoria||'otros']||0) + e.importe; });

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Inversión</h2>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 12px;">
          <button type="button" id="btnMesAnt" style="background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;padding:4px 8px;">&#8249;</button>
          <span id="expMesLabel" style="font-size:14px;font-weight:600;color:var(--text);min-width:140px;text-align:center;">${mesLabel()}</span>
          <button type="button" id="btnMesSig" style="background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;padding:4px 8px;">&#8250;</button>
        </div>
        <button class="btn btn-primary" onclick="newExpense()">+ Nueva inversión</button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div class="card" style="padding:20px;text-align:center;cursor:pointer;" onclick="filtrarGastos('todos')" id="kpiTotal">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Total del mes</div>
        <div id="kpiTotalVal" style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:var(--text);">
          <span style="font-size:14px;color:var(--text-muted);font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalMes.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
      <div class="card" style="padding:20px;text-align:center;cursor:pointer;" onclick="filtrarGastos('Agus')" id="kpiAgus">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Agus</div>
        <div style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:var(--text);">
          <span style="font-size:14px;color:var(--text-muted);font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalAgus.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
      <div class="card" style="padding:20px;text-align:center;cursor:pointer;" onclick="filtrarGastos('Santi')" id="kpiSanti">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Santi</div>
        <div style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:var(--text);">
          <span style="font-size:14px;color:var(--text-muted);font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalSanti.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
    </div>

    <!-- KPIs Acumulado Año -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;padding-top:16px;border-top:1px solid var(--border);">
      <div class="card" style="padding:14px;text-align:center;">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Acumulado ${window._expYear}</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--text);">
          <span style="font-size:12px;color:var(--text-dim);font-family:Outfit,sans-serif;font-weight:400;">€</span>${(acumulado?.total||0).toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
      <div class="card" style="padding:14px;text-align:center;">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Agus ${window._expYear}</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--text);">
          <span style="font-size:12px;color:var(--text-dim);font-family:Outfit,sans-serif;font-weight:400;">€</span>${(acumulado?.agus||0).toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
      <div class="card" style="padding:14px;text-align:center;">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Santi ${window._expYear}</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--text);">
          <span style="font-size:12px;color:var(--text-dim);font-family:Outfit,sans-serif;font-weight:400;">€</span>${(acumulado?.santi||0).toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
    </div>

    <!-- Filtros + buscador -->
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
      <div id="expFiltros" style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" style="font-size:12px;padding:6px 12px;" data-filtro="todos" onclick="filtrarGastos('todos')">Todos</button>
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px;" data-filtro="Agus" onclick="filtrarGastos('Agus')">Agus</button>
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px;" data-filtro="Santi" onclick="filtrarGastos('Santi')">Santi</button>
      </div>
      <input id="expSearch" type="search" placeholder="Buscar por concepto, categoría o responsable…"
        oninput="filtrarBusquedaGastos(this.value)"
        style="flex:1;min-width:220px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;">
    </div>

    <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;">
      <!-- Lista de gastos -->
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Concepto</th><th>Categoría</th><th>Responsable</th><th>Importe</th><th>Fecha</th><th></th></tr></thead>
            <tbody id="expTableBody">
              ${renderExpRows(expenses)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Resumen por categoría -->
      <div class="card" style="padding:20px;height:fit-content;" id="expCatResumen">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px;">Por categoría</div>
        ${renderCatSummary(byCat, totalMes, catColors)}
      </div>
    </div>`;

  // Adjuntar eventos después del render
  document.getElementById('btnMesAnt').addEventListener('click', function() { mesAnterior(); });
  document.getElementById('btnMesSig').addEventListener('click', function() { mesSiguiente(); });
}

function renderCatSummary(byCat, totalRef, catColors) {
  const entries = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  if (entries.length === 0) return '<div style="font-size:13px;color:var(--text-muted);">Sin gastos</div>';
  return entries.map(([cat, amt]) => {
    const color = catColors[cat] || '#888';
    const pct = totalRef > 0 ? (amt / totalRef * 100) : 0;
    return `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <span style="text-transform:capitalize;color:var(--text-muted);">${cat}</span>
          <strong style="color:var(--text);">${formatMoney(amt)}</strong>
        </div>
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;"></div>
        </div>
      </div>`;
  }).join('');
}

function renderExpRows(expenses) {
  if (expenses.length === 0) return `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">Sin gastos este mes</div></div></td></tr>`;
  const catColors = {
    software: '#2979FF', marketing: '#FF6B6B', oficina: '#FF8C42',
    personal: '#9D7FE8', servicios: '#00C48C', otros: '#888888'
  };
  return expenses.map(e => {
    const color = catColors[e.categoria] || '#888';
    const resp = e.responsable || '';
    const tipoActual = e.tipo || (e.recurrente ? 'recurrente' : 'inversion');
    const tipoDestino = tipoActual === 'recurrente' ? 'inversion' : 'recurrente';
    const tipoDestinoLabel = tipoDestino === 'inversion' ? 'Inversión' : 'Recurrentes';
    const searchBlob = `${e.nombre||''} ${e.categoria||''} ${resp} ${e.notas||''}`.toLowerCase();
    return `
    <tr class="gasto-fila" data-responsable="${escHtml(resp)}" data-importe="${e.importe||0}" data-categoria="${escHtml(e.categoria||'otros')}" data-search="${escHtml(searchBlob)}">
      <td><strong>${escHtml(e.nombre)}</strong></td>
      <td><span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;text-transform:capitalize;background:${color}22;color:${color};border:1px solid ${color}44;">${escHtml(e.categoria||'otros')}</span></td>
      <td>${responsablePill(resp||'—')}</td>
      <td><strong style="color:#FF6B6B;">${formatMoney(e.importe)}</strong></td>
      <td style="color:var(--text-muted);">${formatDate(e.fecha)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="moverTipoExp('${e.id}','${tipoDestino}')" title="Mover a ${tipoDestinoLabel}" style="font-size:14px;">↔️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editExpense('${e.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteExpense('${e.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filtrarGastos(responsable) {
  window._expRespFiltro = responsable;
  aplicarFiltrosExp();
}

function filtrarBusquedaGastos(q) {
  window._expSearchQuery = (q || '').toLowerCase().trim();
  aplicarFiltrosExp();
}

function aplicarFiltrosExp() {
  const responsable = window._expRespFiltro || 'todos';
  const q = window._expSearchQuery || '';
  const filas = document.querySelectorAll('.gasto-fila');
  let totalVisible = 0;
  const byCat = {};
  const catColors = {
    software: '#2979FF', marketing: '#FF6B6B', oficina: '#FF8C42',
    personal: '#9D7FE8', servicios: '#00C48C', otros: '#888888'
  };

  filas.forEach(fila => {
    const resp = fila.dataset.responsable || '';
    const importe = parseFloat(fila.dataset.importe) || 0;
    const cat = fila.dataset.categoria || 'otros';
    const blob = fila.dataset.search || '';
    const okResp = (responsable === 'todos' || resp.toLowerCase() === responsable.toLowerCase());
    const okSearch = (!q || blob.includes(q));

    if (okResp && okSearch) {
      fila.style.display = '';
      totalVisible += importe;
      byCat[cat] = (byCat[cat] || 0) + importe;
    } else {
      fila.style.display = 'none';
    }
  });

  const kpiTotal = document.getElementById('kpiTotalVal');
  if (kpiTotal) {
    kpiTotal.innerHTML = `<span style="font-size:14px;color:var(--text-muted);font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalVisible.toLocaleString('es-ES',{minimumFractionDigits:2})}`;
  }

  document.querySelectorAll('#expFiltros button').forEach(btn => {
    btn.className = btn.dataset.filtro === responsable ? 'btn btn-primary' : 'btn btn-secondary';
  });

  ['kpiTotal','kpiAgus','kpiSanti'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '';
  });
  if (responsable === 'Agus') document.getElementById('kpiAgus').style.borderColor = '#FF6B6B44';
  else if (responsable === 'Santi') document.getElementById('kpiSanti').style.borderColor = '#FF6B6B44';

  const resumen = document.getElementById('expCatResumen');
  if (resumen) {
    resumen.innerHTML = `<div style="font-size:14px;font-weight:600;margin-bottom:16px;">Por categoría</div>` + renderCatSummary(byCat, totalVisible, catColors);
  }
}

function newExpense() { showExpenseForm(null); }

async function editExpense(id) {
  const allExp = window._expensesAll || [];
  const e = allExp.find(x => x.id === id);
  if (e) showExpenseForm(e);
  else {
    const fetched = await API.get('/expenses');
    showExpenseForm(fetched.find(x => x.id === id));
  }
}

function showExpenseForm(data) {
  const isEdit = !!data;
  const hoy = new Date().toISOString().split('T')[0];
  // El tipo se hereda del módulo activo: 'inversion' desde Gastos, 'recurrente' desde Finanzas.
  const tipoDefault = data?.tipo || window._expTipo || 'recurrente';
  const tipoLabel = tipoDefault === 'inversion' ? 'inversión' : 'gasto recurrente';
  createModal('expModal', isEdit ? `Editar ${tipoLabel}` : `Nueva ${tipoLabel}`, `
    <input type="hidden" id="ef_tipo" value="${tipoDefault}">
    <div class="form-group">
      <label class="form-label">Concepto *</label>
      <input class="form-input" id="ef_nombre" value="${escHtml(data?.nombre||'')}" placeholder="ej. Supabase, Adobe, Oficina">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="ef_cat">
          <option value="software" ${data?.categoria==='software'?'selected':''}>Software</option>
          <option value="marketing" ${data?.categoria==='marketing'?'selected':''}>Marketing</option>
          <option value="oficina" ${data?.categoria==='oficina'?'selected':''}>Oficina</option>
          <option value="personal" ${data?.categoria==='personal'?'selected':''}>Personal</option>
          <option value="servicios" ${data?.categoria==='servicios'?'selected':''}>Servicios</option>
          <option value="otros" ${data?.categoria==='otros'?'selected':''}>Otros</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Importe base (€) * <span style="font-size:11px;color:var(--text-muted);font-weight:400;">bruto, sin IVA</span></label>
        <input class="form-input" id="ef_importe" type="number" step="0.01" value="${data?.importe||''}" placeholder="0.00" oninput="calcExpense()">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="ef_iva" ${(data?.iva||0) > 0 ? 'checked' : ''} style="width:16px;height:16px;" onchange="calcExpense()">
        <label for="ef_iva" style="font-size:14px;cursor:pointer;">Lleva IVA (21%)</label>
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="ef_irpf" ${(data?.irpf||0) > 0 ? 'checked' : ''} style="width:16px;height:16px;" onchange="calcExpense()">
        <label for="ef_irpf" style="font-size:14px;cursor:pointer;">Lleva IRPF (-15%)</label>
      </div>
    </div>
    <div style="background:var(--bg);border-radius:8px;padding:14px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;">
        <span>Base imponible</span><span id="expCalcBase">${formatMoney(data?.importe||0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:var(--text-muted);">
        <span>IVA</span><span id="expCalcIva">${formatMoney(data?.iva||0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;color:var(--text-muted);">
        <span>IRPF</span><span id="expCalcIrpf">-${formatMoney(data?.irpf||0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;border-top:1px solid var(--border);padding-top:8px;">
        <span>Total a pagar</span><span id="expCalcTotal">${formatMoney(data?.total != null ? data.total : (data?.importe||0))}</span>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Responsable</label>
        <select class="form-select" id="ef_responsable">
          <option value="Agus" ${(data?.responsable||'').toLowerCase()==='agus'?'selected':''}>Agus</option>
          <option value="Santi" ${(data?.responsable||'').toLowerCase()==='santi'?'selected':''}>Santi</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="ef_fecha" type="date" value="${data?.fecha||hoy}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="ef_notas" style="min-height:60px;">${escHtml(data?.notas||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('expModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveExpense(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar' : 'Crear gasto'}</button>
  `);
}

function calcExpense() {
  const base = parseFloat(document.getElementById('ef_importe')?.value) || 0;
  const llevaIva  = document.getElementById('ef_iva')?.checked;
  const llevaIrpf = document.getElementById('ef_irpf')?.checked;
  const iva  = llevaIva  ? base * 0.21 : 0;
  const irpf = llevaIrpf ? base * 0.15 : 0;
  const total = base + iva - irpf;
  document.getElementById('expCalcBase').textContent  = formatMoney(base);
  document.getElementById('expCalcIva').textContent   = formatMoney(iva);
  document.getElementById('expCalcIrpf').textContent  = '-' + formatMoney(irpf);
  document.getElementById('expCalcTotal').textContent = formatMoney(total);
}

async function saveExpense(id) {
  const tipo = document.getElementById('ef_tipo').value;
  const base = parseFloat(document.getElementById('ef_importe').value) || 0;
  const llevaIva  = document.getElementById('ef_iva').checked;
  const llevaIrpf = document.getElementById('ef_irpf').checked;
  const iva  = llevaIva  ? +(base * 0.21).toFixed(2) : 0;
  const irpf = llevaIrpf ? +(base * 0.15).toFixed(2) : 0;
  const total = +(base + iva - irpf).toFixed(2);
  const body = {
    nombre: document.getElementById('ef_nombre').value.trim(),
    categoria: document.getElementById('ef_cat').value,
    importe: base,
    iva,
    irpf,
    total,
    fecha: document.getElementById('ef_fecha').value,
    responsable: document.getElementById('ef_responsable').value,
    recurrente: tipo === 'recurrente',
    tipo: tipo,
    notas: document.getElementById('ef_notas').value
  };
  if (!body.nombre || !body.importe) { toast('Concepto e importe obligatorios', 'error'); return; }
  try {
    if (id) await API.put(`/expenses/${id}`, body);
    else await API.post('/expenses', body);
    toast(id ? 'Gasto actualizado' : 'Gasto añadido', 'success');
    closeModal('expModal');
    refreshExpenseView();
  } catch (err) { toast(err.message, 'error'); }
}

async function moverTipoExp(id, nuevoTipo) {
  const e = (window._expensesAll || []).find(x => x.id === id);
  if (!e) { toast('Gasto no encontrado', 'error'); return; }
  const body = {
    nombre: e.nombre,
    categoria: e.categoria,
    importe: e.importe,
    iva: e.iva || 0,
    irpf: e.irpf || 0,
    total: e.total != null ? e.total : e.importe,
    fecha: e.fecha,
    responsable: e.responsable,
    recurrente: nuevoTipo === 'recurrente',
    tipo: nuevoTipo,
    notas: e.notas || ''
  };
  try {
    await API.put(`/expenses/${id}`, body);
    toast(`Movido a ${nuevoTipo === 'inversion' ? 'Inversión' : 'Gastos recurrentes'}`, 'success');
    refreshExpenseView();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteExpense(id) {
  if (!window.confirm('¿Eliminar este gasto?')) return;
  try {
    await API.del(`/expenses/${id}`);
    toast('Gasto eliminado', 'success');
    refreshExpenseView();
  } catch (err) { toast(err.message, 'error'); }
}
