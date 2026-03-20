async function renderClients(el) {
  let clients = await API.get('/clients');

  function render() {
    const search = document.getElementById('clientSearch')?.value?.toLowerCase() || '';
    const estado = document.getElementById('clientEstado')?.value || '';
    const responsable = document.getElementById('clientResp')?.value || '';

    let filtered = clients.filter(c => {
      if (search && !c.nombre.toLowerCase().includes(search) && !(c.email||'').toLowerCase().includes(search)) return false;
      if (estado && c.estado !== estado) return false;
      if (responsable && c.responsable !== responsable) return false;
      return true;
    });

    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = filtered.length === 0
      ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Sin clientes</div><div class="empty-sub">Agrega tu primer cliente</div></div></td></tr>`
      : filtered.map(c => `
        <tr>
          <td><div style="font-weight:500;">${escHtml(c.nombre)}</div><div style="font-size:12px;color:var(--text-muted);">${escHtml(c.email||'')}</div></td>
          <td>${escHtml(c.tipo_servicio||'—')}</td>
          <td>${badge(c.estado || 'prospecto')}</td>
          <td>${c.mrr ? formatMoney(c.mrr) : '—'}</td>
          <td>${responsablePill(c.responsable)}</td>
          <td>${c.ultimo_contacto ? formatDate(c.ultimo_contacto) : '—'}</td>
          <td>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-ghost btn-icon btn-sm" onclick="editClient('${c.id}')" title="Editar">✏️</button>
              <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteClient('${c.id}','${escHtml(c.nombre)}')" title="Eliminar">🗑️</button>
            </div>
          </td>
        </tr>`).join('');
  }

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Clientes</h2>
      <button class="btn btn-primary" onclick="newClient()">+ Nuevo cliente</button>
    </div>
    <div class="card">
      <div class="filters" style="margin-bottom:16px;">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input class="search-input" id="clientSearch" placeholder="Buscar cliente...">
        </div>
        <select class="filter-select" id="clientEstado">
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="prospecto">Prospecto</option>
          <option value="pausado">Pausado</option>
          <option value="inactivo">Inactivo</option>
        </select>
        <select class="filter-select" id="clientResp">
          <option value="">Todos</option>
          <option value="agus">Agus</option>
          <option value="santi">Santi</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Cliente</th><th>Servicio</th><th>Estado</th><th>MRR</th><th>Responsable</th><th>Último contacto</th><th></th>
          </tr></thead>
          <tbody id="clientsTableBody"></tbody>
        </table>
      </div>
    </div>`;

  render();

  document.getElementById('clientSearch').addEventListener('input', render);
  document.getElementById('clientEstado').addEventListener('change', render);
  document.getElementById('clientResp').addEventListener('change', render);
}

function newClient() {
  showClientForm(null);
}

async function editClient(id) {
  const c = await API.get(`/clients/${id}`);
  showClientForm(c);
}

function showClientForm(data) {
  const isEdit = !!data;
  createModal('clientModal', isEdit ? 'Editar cliente' : 'Nuevo cliente', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-input" id="cf_nombre" value="${escHtml(data?.nombre||'')}" placeholder="Nombre del cliente">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="cf_email" type="email" value="${escHtml(data?.email||'')}" placeholder="email@empresa.com">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input class="form-input" id="cf_telefono" value="${escHtml(data?.telefono||'')}" placeholder="+34 600 000 000">
      </div>
      <div class="form-group">
        <label class="form-label">Empresa</label>
        <input class="form-input" id="cf_empresa" value="${escHtml(data?.empresa||'')}" placeholder="Nombre empresa">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tipo de servicio</label>
        <select class="form-select" id="cf_tipo">
          <option value="">— Seleccionar —</option>
          <option value="estudio" ${data?.tipo_servicio==='estudio'?'selected':''}>Estudio y contenido</option>
          <option value="marketing" ${data?.tipo_servicio==='marketing'?'selected':''}>Marketing digital</option>
          <option value="ia" ${data?.tipo_servicio==='ia'?'selected':''}>Inteligencia Artificial</option>
          <option value="full" ${data?.tipo_servicio==='full'?'selected':''}>Servicio completo</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="cf_estado">
          <option value="prospecto" ${data?.estado==='prospecto'?'selected':''}>Prospecto</option>
          <option value="activo" ${data?.estado==='activo'?'selected':''}>Activo</option>
          <option value="pausado" ${data?.estado==='pausado'?'selected':''}>Pausado</option>
          <option value="inactivo" ${data?.estado==='inactivo'?'selected':''}>Inactivo</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">MRR (€/mes)</label>
        <input class="form-input" id="cf_mrr" type="number" value="${data?.mrr||0}" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Responsable</label>
        <select class="form-select" id="cf_responsable">
          <option value="">— Seleccionar —</option>
          <option value="agus" ${data?.responsable==='agus'?'selected':''}>Agus</option>
          <option value="santi" ${data?.responsable==='santi'?'selected':''}>Santi</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Último contacto</label>
        <input class="form-input" id="cf_contacto" type="date" value="${data?.ultimo_contacto||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Cumpleaños</label>
        <input class="form-input" id="cf_cumple" type="date" value="${data?.cumpleanos||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="cf_notas" placeholder="Notas internas...">${escHtml(data?.notas||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('clientModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveClient(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar cambios' : 'Crear cliente'}</button>
  `);
}

async function saveClient(id) {
  const body = {
    nombre: document.getElementById('cf_nombre').value.trim(),
    email: document.getElementById('cf_email').value.trim(),
    telefono: document.getElementById('cf_telefono').value.trim(),
    empresa: document.getElementById('cf_empresa').value.trim(),
    tipo_servicio: document.getElementById('cf_tipo').value,
    estado: document.getElementById('cf_estado').value,
    mrr: parseFloat(document.getElementById('cf_mrr').value) || 0,
    responsable: document.getElementById('cf_responsable').value || null,
    ultimo_contacto: document.getElementById('cf_contacto').value || null,
    cumpleanos: document.getElementById('cf_cumple').value || null,
    notas: document.getElementById('cf_notas').value
  };

  if (!body.nombre) { toast('El nombre es obligatorio', 'error'); return; }

  try {
    if (id) await API.put(`/clients/${id}`, body);
    else await API.post('/clients', body);
    toast(id ? 'Cliente actualizado' : 'Cliente creado', 'success');
    closeModal('clientModal');
    navigate('clients');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteClient(id, name) {
  if (!confirm(`¿Eliminar el cliente "${name}"? Esta acción no se puede deshacer.`)) return;
  try {
    await API.del(`/clients/${id}`);
    toast('Cliente eliminado', 'success');
    navigate('clients');
  } catch (err) {
    toast(err.message, 'error');
  }
}
