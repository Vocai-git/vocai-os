async function renderContacts(el) {
  let contacts = await API.get('/contacts');
  window._contactsData = contacts;

  // Upcoming birthdays (next 30 days)
  const today = new Date();
  const soon = contacts.filter(c => {
    if (!c.cumpleanos) return false;
    const bday = new Date(c.cumpleanos);
    const next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const diff = (next - today) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  }).sort((a, b) => {
    const dateA = new Date(a.cumpleanos);
    const dateB = new Date(b.cumpleanos);
    return dateA.getMonth() - dateB.getMonth() || dateA.getDate() - dateB.getDate();
  });

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Contactos</h2>
      <button class="btn btn-primary" onclick="newContact()">+ Nuevo contacto</button>
    </div>

    ${soon.length > 0 ? `
      <div class="alert alert-info" style="margin-bottom:20px;">
        🎂 Próximos cumpleaños: ${soon.map(c => `<strong>${escHtml(c.nombre)}</strong> (${formatDate(c.cumpleanos)})`).join(', ')}
      </div>
    ` : ''}

    <div class="card">
      <div class="filters" style="margin-bottom:16px;">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input class="search-input" id="conSearch" placeholder="Buscar contacto..." oninput="filterContacts()">
        </div>
        <select class="filter-select" id="conTipo" onchange="filterContacts()">
          <option value="">Todos los tipos</option>
          <option value="cliente">Clientes</option>
          <option value="proveedor">Proveedores</option>
          <option value="colaborador">Colaboradores</option>
          <option value="otro">Otros</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Nombre</th><th>Empresa</th><th>Email</th><th>Teléfono</th><th>Tipo</th><th>Cumpleaños</th><th></th></tr></thead>
          <tbody id="conTableBody">${renderConRows(contacts)}</tbody>
        </table>
      </div>
    </div>`;
}

function renderConRows(contacts) {
  if (!contacts.length) return `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">Sin contactos</div></div></td></tr>`;
  return contacts.map(c => `
    <tr>
      <td><div style="font-weight:500;">${escHtml(c.nombre)}</div></td>
      <td>${escHtml(c.empresa||'—')}</td>
      <td>${c.email ? `<a href="mailto:${escHtml(c.email)}" style="color:var(--blue);">${escHtml(c.email)}</a>` : '—'}</td>
      <td>${escHtml(c.telefono||'—')}</td>
      <td><span class="badge badge-blue" style="text-transform:capitalize;">${escHtml(c.tipo||'cliente')}</span></td>
      <td>${c.cumpleanos ? '🎂 ' + formatDate(c.cumpleanos) : '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editContact('${c.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteContact('${c.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function filterContacts() {
  const search = document.getElementById('conSearch').value.toLowerCase();
  const tipo = document.getElementById('conTipo').value;
  let filtered = window._contactsData || [];
  if (search) filtered = filtered.filter(c => c.nombre.toLowerCase().includes(search) || (c.empresa||'').toLowerCase().includes(search) || (c.email||'').toLowerCase().includes(search));
  if (tipo) filtered = filtered.filter(c => c.tipo === tipo);
  document.getElementById('conTableBody').innerHTML = renderConRows(filtered);
}

function newContact() { showContactForm(null); }

function editContact(id) {
  const c = (window._contactsData||[]).find(x => x.id === id);
  if (c) showContactForm(c);
}

function showContactForm(data) {
  const isEdit = !!data;
  createModal('conModal', isEdit ? 'Editar contacto' : 'Nuevo contacto', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-input" id="cnf_nombre" value="${escHtml(data?.nombre||'')}" placeholder="Nombre completo">
      </div>
      <div class="form-group">
        <label class="form-label">Empresa</label>
        <input class="form-input" id="cnf_empresa" value="${escHtml(data?.empresa||'')}" placeholder="Empresa">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="cnf_email" type="email" value="${escHtml(data?.email||'')}" placeholder="email@empresa.com">
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input class="form-input" id="cnf_tel" value="${escHtml(data?.telefono||'')}" placeholder="+34 600 000 000">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select class="form-select" id="cnf_tipo">
          <option value="cliente" ${data?.tipo==='cliente'||!data?'selected':''}>Cliente</option>
          <option value="proveedor" ${data?.tipo==='proveedor'?'selected':''}>Proveedor</option>
          <option value="colaborador" ${data?.tipo==='colaborador'?'selected':''}>Colaborador</option>
          <option value="otro" ${data?.tipo==='otro'?'selected':''}>Otro</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Cumpleaños</label>
        <input class="form-input" id="cnf_cumple" type="date" value="${data?.cumpleanos||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="cnf_notas" style="min-height:60px;">${escHtml(data?.notas||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('conModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveContact(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar' : 'Crear contacto'}</button>
  `);
}

async function saveContact(id) {
  const body = {
    nombre: document.getElementById('cnf_nombre').value.trim(),
    empresa: document.getElementById('cnf_empresa').value.trim(),
    email: document.getElementById('cnf_email').value.trim(),
    telefono: document.getElementById('cnf_tel').value.trim(),
    tipo: document.getElementById('cnf_tipo').value,
    cumpleanos: document.getElementById('cnf_cumple').value || null,
    notas: document.getElementById('cnf_notas').value
  };
  if (!body.nombre) { toast('El nombre es obligatorio', 'error'); return; }
  try {
    if (id) await API.put(`/contacts/${id}`, body);
    else await API.post('/contacts', body);
    toast(id ? 'Contacto actualizado' : 'Contacto creado', 'success');
    closeModal('conModal');
    navigate('contacts');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteContact(id) {
  if (!confirm('¿Eliminar este contacto?')) return;
  try {
    await API.del(`/contacts/${id}`);
    toast('Contacto eliminado', 'success');
    navigate('contacts');
  } catch (err) { toast(err.message, 'error'); }
}
