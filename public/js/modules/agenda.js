async function renderAgenda(el) {
  const events = await API.get('/business-events');
  window._agendaData = events;

  const today = new Date().toISOString().split('T')[0];
  const upcoming = events.filter(e => e.fecha >= today);
  const past = events.filter(e => e.fecha < today);

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Agenda</h2>
      <button class="btn btn-primary" onclick="newAgendaEvent()">+ Nuevo evento</button>
    </div>

    <div style="display:flex;gap:4px;margin-bottom:16px;">
      <button class="btn" id="agTabProx" onclick="switchAgendaTab('prox')" style="background:#FF6B6B;color:white;font-weight:600;">
        Próximos (${upcoming.length})
      </button>
      <button class="btn" id="agTabPast" onclick="switchAgendaTab('past')" style="background:#2a2a2a;color:#888;">
        Pasados (${past.length})
      </button>
    </div>

    <div id="agPanelProx">
      ${upcoming.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Sin eventos próximos</div></div></div>'
        : '<div style="display:flex;flex-direction:column;gap:12px;">' + upcoming.map(e => renderAgendaCard(e)).join('') + '</div>'}
    </div>

    <div id="agPanelPast" style="display:none;">
      ${past.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Sin eventos pasados</div></div></div>'
        : '<div style="display:flex;flex-direction:column;gap:12px;">' + past.map(e => renderAgendaCard(e, true)).join('') + '</div>'}
    </div>`;
}

function renderAgendaCard(e, isPast = false) {
  const dateStr = formatDate(e.fecha);
  const timeStr = e.hora ? e.hora.slice(0, 5) : '';
  const asignadoLabel = e.asignado_a === 'ambos' ? 'Agus y Santi' : e.asignado_a === 'agus' ? 'Agus' : 'Santi';
  const gcIcon = e.google_event_id ? ' <span title="Sincronizado con Google Calendar" style="font-size:12px;">📲</span>' : '';

  return `<div class="card" style="${isPast?'opacity:0.6;':''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div style="flex:1;">
        <div style="font-weight:600;font-size:15px;">${escHtml(e.titulo)}${gcIcon}</div>
        <div style="display:flex;gap:12px;margin-top:6px;font-size:13px;color:#888;flex-wrap:wrap;">
          <span>📅 ${dateStr}</span>
          ${timeStr ? `<span>🕐 ${timeStr}</span>` : ''}
          <span>👤 ${asignadoLabel}</span>
        </div>
        ${e.descripcion ? `<div style="margin-top:8px;font-size:13px;color:#aaa;">${escHtml(e.descripcion)}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="editAgendaEvent('${e.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteAgendaEvent('${e.id}')">🗑️</button>
      </div>
    </div>
  </div>`;
}

function switchAgendaTab(tab) {
  const prox = document.getElementById('agPanelProx');
  const past = document.getElementById('agPanelPast');
  const btnP = document.getElementById('agTabProx');
  const btnA = document.getElementById('agTabPast');
  if (tab === 'prox') {
    prox.style.display = ''; past.style.display = 'none';
    btnP.style.background = '#FF6B6B'; btnP.style.color = 'white';
    btnA.style.background = '#2a2a2a'; btnA.style.color = '#888';
  } else {
    prox.style.display = 'none'; past.style.display = '';
    btnA.style.background = '#FF6B6B'; btnA.style.color = 'white';
    btnP.style.background = '#2a2a2a'; btnP.style.color = '#888';
  }
}

function newAgendaEvent() { showAgendaForm(null); }
function editAgendaEvent(id) {
  const e = (window._agendaData||[]).find(x => x.id === id);
  if (e) showAgendaForm(e);
}

function showAgendaForm(data) {
  const isEdit = !!data;
  createModal('agendaModal', isEdit ? 'Editar evento' : 'Nuevo evento de negocio', `
    <div class="form-group">
      <label class="form-label">Título *</label>
      <input class="form-input" id="ag_titulo" value="${escHtml(data?.titulo||'')}" placeholder="Nombre del evento">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input class="form-input" id="ag_fecha" type="date" value="${data?.fecha||''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Hora</label>
        <input class="form-input" id="ag_hora" type="time" value="${data?.hora ? data.hora.slice(0,5) : ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Asignado a</label>
      <select class="form-select" id="ag_asignado">
        <option value="ambos" ${data?.asignado_a==='ambos'||!data?'selected':''}>Ambos</option>
        <option value="agus" ${data?.asignado_a==='agus'?'selected':''}>Agus</option>
        <option value="santi" ${data?.asignado_a==='santi'?'selected':''}>Santi</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-textarea" id="ag_desc" style="min-height:60px;">${escHtml(data?.descripcion||'')}</textarea>
    </div>
    <div style="padding:10px;background:rgba(41,121,255,0.08);border-radius:8px;font-size:12px;color:#888;margin-top:4px;">
      📲 Si tenés Google Calendar conectado, el evento se agrega automáticamente al calendario del asignado.
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('agendaModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveAgendaEvent(${isEdit?`'${data.id}'`:'null'})">${isEdit?'Guardar':'Crear'}</button>
  `);
}

async function saveAgendaEvent(id) {
  const body = {
    titulo: document.getElementById('ag_titulo').value.trim(),
    fecha: document.getElementById('ag_fecha').value,
    hora: document.getElementById('ag_hora').value || null,
    asignado_a: document.getElementById('ag_asignado').value,
    descripcion: document.getElementById('ag_desc').value
  };
  if (!body.titulo || !body.fecha) { toast('Título y fecha son obligatorios', 'error'); return; }
  try {
    if (id) await API.put(`/business-events/${id}`, body);
    else await API.post('/business-events', body);
    toast(id ? 'Evento actualizado' : 'Evento creado', 'success');
    closeModal('agendaModal');
    navigate('agenda');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteAgendaEvent(id) {
  if (!window.confirm('¿Eliminar este evento?')) return;
  try {
    await API.del(`/business-events/${id}`);
    toast('Evento eliminado', 'success');
    navigate('agenda');
  } catch (err) { toast(err.message, 'error'); }
}
