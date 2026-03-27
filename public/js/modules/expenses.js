async function renderExpenses(el) {
  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  let expenses = await API.get(`/expenses?mes=${mesActual}`);
  window._expensesAll = expenses;

  renderExpensesUI(el, expenses, mesActual, 'todos');
}

function renderExpensesUI(el, expenses, mes, filtroResp) {
  const filtered = filtroResp === 'todos' ? expenses : expenses.filter(e => (e.responsable||'').toLowerCase() === filtroResp.toLowerCase());

  const totalMes = expenses.reduce((s,e) => s+(e.importe||0), 0);
  const totalAgus = expenses.filter(e => (e.responsable||'').toLowerCase() === 'agus').reduce((s,e) => s+(e.importe||0), 0);
  const totalSanti = expenses.filter(e => (e.responsable||'').toLowerCase() === 'santi').reduce((s,e) => s+(e.importe||0), 0);

  const byCat = {};
  filtered.forEach(e => { byCat[e.categoria||'otros'] = (byCat[e.categoria||'otros']||0) + e.importe; });

  const catColors = {
    software: '#2979FF', marketing: '#FF6B6B', oficina: '#FF8C42',
    personal: '#9D7FE8', servicios: '#00C48C', otros: '#888888'
  };

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Gastos</h2>
      <div style="display:flex;gap:10px;align-items:center;">
        <input class="form-input" type="month" id="expMes" value="${mes}" style="width:180px;" onchange="reloadExpenses()">
        <button class="btn btn-primary" onclick="newExpense()">+ Nuevo gasto</button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div class="card" style="padding:20px;text-align:center;">
        <div style="font-size:13px;color:#888;margin-bottom:8px;">Total del mes</div>
        <div style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:#fff;">
          <span style="font-size:14px;color:#888;font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalMes.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
      <div class="card" style="padding:20px;text-align:center;cursor:pointer;${filtroResp==='Agus'?'border-color:#FF6B6B44;':''}" onclick="filterExpByResp('${filtroResp==='Agus'?'todos':'Agus'}')">
        <div style="font-size:13px;color:#888;margin-bottom:8px;">Agus</div>
        <div style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:#fff;">
          <span style="font-size:14px;color:#888;font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalAgus.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
      <div class="card" style="padding:20px;text-align:center;cursor:pointer;${filtroResp==='Santi'?'border-color:#FF6B6B44;':''}" onclick="filterExpByResp('${filtroResp==='Santi'?'todos':'Santi'}')">
        <div style="font-size:13px;color:#888;margin-bottom:8px;">Santi</div>
        <div style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:#fff;">
          <span style="font-size:14px;color:#888;font-family:Outfit,sans-serif;font-weight:400;">€</span>${totalSanti.toLocaleString('es-ES',{minimumFractionDigits:2})}
        </div>
      </div>
    </div>

    <!-- Filtros por categoría -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn ${filtroResp==='todos'?'btn-primary':'btn-secondary'}" style="font-size:12px;padding:6px 12px;" onclick="filterExpByResp('todos')">Todos</button>
      <button class="btn ${filtroResp==='Agus'?'btn-primary':'btn-secondary'}" style="font-size:12px;padding:6px 12px;" onclick="filterExpByResp('Agus')">Agus</button>
      <button class="btn ${filtroResp==='Santi'?'btn-primary':'btn-secondary'}" style="font-size:12px;padding:6px 12px;" onclick="filterExpByResp('Santi')">Santi</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;">
      <!-- Lista de gastos -->
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Concepto</th><th>Categoría</th><th>Responsable</th><th>Importe</th><th>Fecha</th><th></th></tr></thead>
            <tbody id="expTableBody">
              ${renderExpRows(filtered)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Resumen por categoría -->
      <div class="card" style="padding:20px;height:fit-content;">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px;">Por categoría</div>
        ${Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => {
          const color = catColors[cat] || '#888';
          const pct = totalMes > 0 ? (amt / totalMes * 100) : 0;
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
        }).join('') || '<div style="font-size:13px;color:#888;">Sin gastos este mes</div>'}
      </div>
    </div>`;

  window._expFiltroResp = filtroResp;
  window._expMes = mes;
}

function renderExpRows(expenses) {
  if (expenses.length === 0) return `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">Sin gastos</div></div></td></tr>`;
  const catColors = {
    software: '#2979FF', marketing: '#FF6B6B', oficina: '#FF8C42',
    personal: '#9D7FE8', servicios: '#00C48C', otros: '#888888'
  };
  return expenses.map(e => {
    const color = catColors[e.categoria] || '#888';
    return `
    <tr>
      <td><strong>${escHtml(e.nombre)}</strong></td>
      <td><span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;text-transform:capitalize;background:${color}22;color:${color};border:1px solid ${color}44;">${escHtml(e.categoria||'otros')}</span></td>
      <td>${responsablePill(e.responsable||'—')}</td>
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

function filterExpByResp(resp) {
  const el = document.getElementById('page');
  const mes = window._expMes || document.getElementById('expMes')?.value;
  renderExpensesUI(el, window._expensesAll || [], mes, resp);
}

async function reloadExpenses() {
  const mes = document.getElementById('expMes').value;
  const expenses = await API.get(`/expenses?mes=${mes}`);
  window._expensesAll = expenses;
  const el = document.getElementById('page');
  renderExpensesUI(el, expenses, mes, 'todos');
}

function newExpense() { showExpenseForm(null); }

async function editExpense(id) {
  const allExp = await API.get('/expenses');
  const e = allExp.find(x => x.id === id);
  showExpenseForm(e);
}

function showExpenseForm(data) {
  const isEdit = !!data;
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
          <option value="Agus" ${data?.responsable==='Agus'?'selected':''}>Agus</option>
          <option value="Santi" ${data?.responsable==='Santi'?'selected':''}>Santi</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="ef_fecha" type="date" value="${data?.fecha||new Date().toISOString().split('T')[0]}">
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
    navigate('expenses');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteExpense(id) {
  if (!window.confirm('¿Eliminar este gasto?')) return;
  try {
    await API.del(`/expenses/${id}`);
    toast('Gasto eliminado', 'success');
    navigate('expenses');
  } catch (err) { toast(err.message, 'error'); }
}
