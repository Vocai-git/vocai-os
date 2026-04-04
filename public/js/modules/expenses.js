// Estado global del módulo
window._expYear = null;
window._expMonth = null;

const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

async function renderExpenses(el) {
  const now = new Date();
  window._expYear = now.getFullYear();
  window._expMonth = now.getMonth() + 1; // 1-12

  await cargarGastosMes(el);
}

async function cargarGastosMes(el) {
  const mes = `${window._expYear}-${String(window._expMonth).padStart(2,'0')}`;
  let expenses = await API.get(`/expenses?mes=${mes}`);
  window._expensesAll = expenses;

  buildExpensesHTML(el || document.getElementById('page'), expenses);
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

function buildExpensesHTML(el, expenses) {
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
      <h2 class="section-title">Gastos</h2>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:8px;padding:6px 12px;">
          <button onclick="mesAnterior()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;padding:4px 8px;">&lsaquo;</button>
          <span id="expMesLabel" style="font-size:14px;font-weight:600;color:#fff;min-width:140px;text-align:center;">${mesLabel()}</span>
          <button onclick="mesSiguiente()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;padding:4px 8px;">&rsaquo;</button>
        </div>
        <button class="btn btn-primary" onclick="newExpense()">+ Nuevo gasto</button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div class="card" style="padding:20px;text-align:center;cursor:pointer;" onclick="filtrarGastos('todos')" id="kpiTotal">
        <div style="font-size:13px;color:#888;margin-bottom:8px;">Total del mes</div>
        <div id="kpiTotalVal" style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:#fff;">
          <span style="font-size:14px;color:#888;font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalMes.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
      <div class="card" style="padding:20px;text-align:center;cursor:pointer;" onclick="filtrarGastos('Agus')" id="kpiAgus">
        <div style="font-size:13px;color:#888;margin-bottom:8px;">Agus</div>
        <div style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:#fff;">
          <span style="font-size:14px;color:#888;font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalAgus.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
      <div class="card" style="padding:20px;text-align:center;cursor:pointer;" onclick="filtrarGastos('Santi')" id="kpiSanti">
        <div style="font-size:13px;color:#888;margin-bottom:8px;">Santi</div>
        <div style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:#fff;">
          <span style="font-size:14px;color:#888;font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalSanti.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div id="expFiltros" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn btn-primary" style="font-size:12px;padding:6px 12px;" data-filtro="todos" onclick="filtrarGastos('todos')">Todos</button>
      <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px;" data-filtro="Agus" onclick="filtrarGastos('Agus')">Agus</button>
      <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px;" data-filtro="Santi" onclick="filtrarGastos('Santi')">Santi</button>
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
}

function renderCatSummary(byCat, totalRef, catColors) {
  const entries = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  if (entries.length === 0) return '<div style="font-size:13px;color:#888;">Sin gastos</div>';
  return entries.map(([cat, amt]) => {
    const color = catColors[cat] || '#888';
    const pct = totalRef > 0 ? (amt / totalRef * 100) : 0;
    return `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <span style="text-transform:capitalize;color:#ccc;">${cat}</span>
          <strong style="color:#fff;">${formatMoney(amt)}</strong>
        </div>
        <div style="height:4px;background:#2a2a2a;border-radius:2px;overflow:hidden;">
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
    return `
    <tr class="gasto-fila" data-responsable="${escHtml(resp)}" data-importe="${e.importe||0}" data-categoria="${escHtml(e.categoria||'otros')}">
      <td><strong>${escHtml(e.nombre)}</strong></td>
      <td><span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;text-transform:capitalize;background:${color}22;color:${color};border:1px solid ${color}44;">${escHtml(e.categoria||'otros')}</span></td>
      <td>${responsablePill(resp||'—')}</td>
      <td><strong style="color:#FF6B6B;">${formatMoney(e.importe)}</strong></td>
      <td style="color:#888;">${formatDate(e.fecha)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editExpense('${e.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteExpense('${e.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filtrarGastos(responsable) {
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

    if (responsable === 'todos' || resp.toLowerCase() === responsable.toLowerCase()) {
      fila.style.display = '';
      totalVisible += importe;
      byCat[cat] = (byCat[cat] || 0) + importe;
    } else {
      fila.style.display = 'none';
    }
  });

  const kpiTotal = document.getElementById('kpiTotalVal');
  if (kpiTotal) {
    kpiTotal.innerHTML = `<span style="font-size:14px;color:#888;font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalVisible.toLocaleString('es-ES',{minimumFractionDigits:2})}`;
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
  createModal('expModal', isEdit ? 'Editar gasto' : 'Nuevo gasto', `
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
        <label class="form-label">Importe (€) *</label>
        <input class="form-input" id="ef_importe" type="number" step="0.01" value="${data?.importe||''}" placeholder="0.00">
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
    <div class="form-group" style="display:flex;align-items:center;gap:10px;">
      <input type="checkbox" id="ef_rec" ${data?.recurrente?'checked':''} style="width:16px;height:16px;">
      <label for="ef_rec" style="font-size:14px;cursor:pointer;">Gasto recurrente</label>
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

async function saveExpense(id) {
  const body = {
    nombre: document.getElementById('ef_nombre').value.trim(),
    categoria: document.getElementById('ef_cat').value,
    importe: parseFloat(document.getElementById('ef_importe').value) || 0,
    fecha: document.getElementById('ef_fecha').value,
    responsable: document.getElementById('ef_responsable').value,
    recurrente: document.getElementById('ef_rec').checked,
    notas: document.getElementById('ef_notas').value
  };
  if (!body.nombre || !body.importe) { toast('Concepto e importe obligatorios', 'error'); return; }
  try {
    if (id) await API.put(`/expenses/${id}`, body);
    else await API.post('/expenses', body);
    toast(id ? 'Gasto actualizado' : 'Gasto añadido', 'success');
    closeModal('expModal');
    cargarGastosMes();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteExpense(id) {
  if (!window.confirm('¿Eliminar este gasto?')) return;
  try {
    await API.del(`/expenses/${id}`);
    toast('Gasto eliminado', 'success');
    cargarGastosMes();
  } catch (err) { toast(err.message, 'error'); }
}
