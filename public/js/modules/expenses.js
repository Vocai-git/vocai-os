async function renderExpenses(el) {
  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  let expenses = await API.get(`/expenses?mes=${mesActual}`);

  const totalMes = expenses.reduce((s,e) => s+(e.importe||0), 0);
  const byCat = {};
  expenses.forEach(e => {
    byCat[e.categoria] = (byCat[e.categoria]||0) + e.importe;
  });

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Gastos</h2>
      <div style="display:flex;gap:10px;align-items:center;">
        <input class="form-input" type="month" id="expMes" value="${mesActual}" style="width:180px;" onchange="reloadExpenses()">
        <button class="btn btn-primary" onclick="newExpense()">+ Nuevo gasto</button>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:20px;">
      <div class="kpi-card rose">
        <div class="kpi-icon">💸</div>
        <div class="kpi-label">Total gastos ${mesActual}</div>
        <div class="kpi-value" style="font-size:26px;">${formatMoney(totalMes)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="card-title" style="margin-bottom:12px;">Por categoría</div>
        ${Object.entries(byCat).map(([cat, amt]) => `
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
            <span style="text-transform:capitalize;">${cat||'otros'}</span>
            <strong>${formatMoney(amt)}</strong>
          </div>
        `).join('') || '<div class="text-muted text-sm">Sin gastos este mes</div>'}
      </div>
    </div>

    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Concepto</th><th>Categoría</th><th>Importe</th><th>Fecha</th><th>Recurrente</th><th></th></tr></thead>
          <tbody id="expTableBody">
            ${renderExpRows(expenses)}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderExpRows(expenses) {
  if (expenses.length === 0) return `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">Sin gastos este mes</div></div></td></tr>`;
  return expenses.map(e => `
    <tr>
      <td>${escHtml(e.nombre)}</td>
      <td><span class="badge badge-gray" style="text-transform:capitalize;">${escHtml(e.categoria||'otros')}</span></td>
      <td><strong style="color:var(--rose);">${formatMoney(e.importe)}</strong></td>
      <td>${formatDate(e.fecha)}</td>
      <td>${e.recurrente ? '🔄 Sí' : '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editExpense('${e.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteExpense('${e.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

async function reloadExpenses() {
  const mes = document.getElementById('expMes').value;
  const expenses = await API.get(`/expenses?mes=${mes}`);
  document.getElementById('expTableBody').innerHTML = renderExpRows(expenses);
}

function newExpense() { showExpenseForm(null); }

async function editExpense(id) {
  const expenses = window._expensesData || [];
  // re-fetch from page context — simple approach: fetch all
  const allExp = await API.get('/expenses');
  const e = allExp.find(x => x.id === id);
  showExpenseForm(e);
}

function showExpenseForm(data) {
  const isEdit = !!data;
  createModal('expModal', isEdit ? 'Editar gasto' : 'Nuevo gasto', `
    <div class="form-group">
      <label class="form-label">Nombre *</label>
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
        <label class="form-label">Fecha</label>
        <input class="form-input" id="ef_fecha" type="date" value="${data?.fecha||new Date().toISOString().split('T')[0]}">
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px;padding-top:24px;">
        <input type="checkbox" id="ef_rec" ${data?.recurrente?'checked':''} style="width:16px;height:16px;">
        <label for="ef_rec" style="font-size:14px;cursor:pointer;">Gasto recurrente</label>
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

async function saveExpense(id) {
  const body = {
    nombre: document.getElementById('ef_nombre').value.trim(),
    categoria: document.getElementById('ef_cat').value,
    importe: parseFloat(document.getElementById('ef_importe').value) || 0,
    fecha: document.getElementById('ef_fecha').value,
    recurrente: document.getElementById('ef_rec').checked,
    notas: document.getElementById('ef_notas').value
  };
  if (!body.nombre || !body.importe) { toast('Nombre e importe obligatorios', 'error'); return; }
  try {
    if (id) await API.put(`/expenses/${id}`, body);
    else await API.post('/expenses', body);
    toast(id ? 'Gasto actualizado' : 'Gasto añadido', 'success');
    closeModal('expModal');
    navigate('expenses');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteExpense(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  try {
    await API.del(`/expenses/${id}`);
    toast('Gasto eliminado', 'success');
    navigate('expenses');
  } catch (err) { toast(err.message, 'error'); }
}
