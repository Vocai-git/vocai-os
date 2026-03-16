async function renderBookings(el) {
  const today = new Date().toISOString().split('T')[0];
  const [bookings, clients, packs] = await Promise.all([
    API.get('/bookings'),
    API.get('/clients'),
    API.get('/bookings/packs')
  ]);

  window._bookingsData = bookings;
  window._packsMeta = packs;

  const PACK_COLORS = { basico:'blue', plus:'violet', graba:'teal', crea:'amber', domina:'rose' };

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Reservas de Estudio</h2>
      <button class="btn btn-primary" onclick="newBooking()">+ Nueva reserva</button>
    </div>

    <!-- Packs info -->
    <div class="grid-auto" style="margin-bottom:24px;">
      ${Object.entries(packs).map(([key, p]) => `
        <div class="kpi-card ${PACK_COLORS[key]||'blue'}">
          <div class="kpi-label">${p.nombre}</div>
          <div class="kpi-value" style="font-size:22px;">€${p.precio}</div>
          <div class="kpi-sub">por ${p.tipo}</div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="filters" style="margin-bottom:16px;">
        <div class="search-bar" style="max-width:200px;">
          <input class="form-input" type="date" id="bookDate" value="${today}" onchange="filterBookings()" style="padding-left:12px;">
        </div>
        <select class="filter-select" id="bookEstado" onchange="filterBookings()">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="confirmada">Confirmada</option>
          <option value="completada">Completada</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Cliente</th><th>Pack</th><th>Fecha</th><th>Hora</th><th>Precio</th><th>Estado</th><th></th></tr></thead>
          <tbody id="bookTableBody">${renderBookRows(bookings)}</tbody>
        </table>
      </div>
    </div>`;
}

function renderBookRows(bookings) {
  if (!bookings.length) return `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🎙️</div><div class="empty-title">Sin reservas</div></div></td></tr>`;
  return bookings.map(b => `
    <tr>
      <td>${escHtml(b.clients?.nombre||'—')}</td>
      <td><span class="badge badge-blue" style="text-transform:capitalize;">${escHtml(b.pack||'—')}</span></td>
      <td>${formatDate(b.fecha)}</td>
      <td>${b.hora ? b.hora.slice(0,5) : '—'}</td>
      <td>${b.precio ? formatMoney(b.precio) : '—'}</td>
      <td>${badge(b.estado||'pendiente')}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editBooking('${b.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteBooking('${b.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function filterBookings() {
  const date = document.getElementById('bookDate').value;
  const estado = document.getElementById('bookEstado').value;
  let filtered = window._bookingsData || [];
  if (date) filtered = filtered.filter(b => b.fecha === date);
  if (estado) filtered = filtered.filter(b => b.estado === estado);
  document.getElementById('bookTableBody').innerHTML = renderBookRows(filtered);
}

function newBooking() { showBookingForm(null); }

async function editBooking(id) {
  const b = (window._bookingsData||[]).find(x => x.id === id);
  if (b) showBookingForm(b);
}

async function showBookingForm(data) {
  const clients = await API.get('/clients');
  const isEdit = !!data;
  createModal('bookModal', isEdit ? 'Editar reserva' : 'Nueva reserva', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente</label>
        <select class="form-select" id="bf_cliente">
          <option value="">— Sin cliente —</option>
          ${clients.map(c => `<option value="${c.id}" ${data?.cliente_id===c.id?'selected':''}>${escHtml(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Pack *</label>
        <select class="form-select" id="bf_pack" onchange="updatePackPrice()">
          <option value="">— Seleccionar pack —</option>
          <option value="basico" ${data?.pack==='basico'?'selected':''}>Básico — €90/hora</option>
          <option value="plus" ${data?.pack==='plus'?'selected':''}>Plus — €190/sesión</option>
          <option value="graba" ${data?.pack==='graba'?'selected':''}>Graba — €349/mes</option>
          <option value="crea" ${data?.pack==='crea'?'selected':''}>Crea — €850/mes</option>
          <option value="domina" ${data?.pack==='domina'?'selected':''}>Domina — €1.400/mes</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input class="form-input" id="bf_fecha" type="date" value="${data?.fecha||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Hora</label>
        <input class="form-input" id="bf_hora" type="time" value="${data?.hora||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Precio (€)</label>
        <input class="form-input" id="bf_precio" type="number" value="${data?.precio||''}" placeholder="Auto">
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="bf_estado">
          <option value="pendiente" ${data?.estado==='pendiente'?'selected':''}>Pendiente</option>
          <option value="confirmada" ${data?.estado==='confirmada'||!data?'selected':''}>Confirmada</option>
          <option value="completada" ${data?.estado==='completada'?'selected':''}>Completada</option>
          <option value="cancelada" ${data?.estado==='cancelada'?'selected':''}>Cancelada</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="bf_notas" style="min-height:60px;">${escHtml(data?.notas||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('bookModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveBooking(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar' : 'Crear reserva'}</button>
  `);
}

function updatePackPrice() {
  const pack = document.getElementById('bf_pack').value;
  const prices = { basico:90, plus:190, graba:349, crea:850, domina:1400 };
  if (prices[pack]) document.getElementById('bf_precio').value = prices[pack];
}

async function saveBooking(id) {
  const body = {
    cliente_id: document.getElementById('bf_cliente').value || null,
    pack: document.getElementById('bf_pack').value,
    fecha: document.getElementById('bf_fecha').value,
    hora: document.getElementById('bf_hora').value || null,
    precio: parseFloat(document.getElementById('bf_precio').value) || null,
    estado: document.getElementById('bf_estado').value,
    notas: document.getElementById('bf_notas').value
  };
  if (!body.fecha || !body.pack) { toast('Fecha y pack son obligatorios', 'error'); return; }
  try {
    if (id) await API.put(`/bookings/${id}`, body);
    else await API.post('/bookings', body);
    toast(id ? 'Reserva actualizada' : 'Reserva creada', 'success');
    closeModal('bookModal');
    navigate('bookings');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteBooking(id) {
  if (!confirm('¿Eliminar esta reserva?')) return;
  try {
    await API.del(`/bookings/${id}`);
    toast('Reserva eliminada', 'success');
    navigate('bookings');
  } catch (err) { toast(err.message, 'error'); }
}
