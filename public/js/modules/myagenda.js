async function renderMyagenda(el) {
  const events = await API.get('/my-events');
  window._myEventsData = events;

  const today = new Date().toISOString().split('T')[0];
  const upcoming = events.filter(e => e.fecha >= today);
  const past = events.filter(e => e.fecha < today);

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Mi agenda</h2>
      <button class="btn btn-primary" onclick="newMyEvent()">+ Nuevo evento</button>
    </div>

    <div style="display:flex;gap:4px;margin-bottom:16px;">
      <button class="btn" id="meTabProx" onclick="switchMyEventTab('prox')" style="background:#FF6B6B;color:white;font-weight:600;">
        Próximos (${upcoming.length})
      </button>
      <button class="btn" id="meTabPast" onclick="switchMyEventTab('past')" style="background:var(--border);color:var(--text-muted);">
        Pasados (${past.length})
      </button>
    </div>

    <div id="mePanelProx">
      ${upcoming.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Sin eventos próximos</div></div></div>'
        : '<div style="display:flex;flex-direction:column;gap:12px;">' + upcoming.map(e => renderMyEventCard(e)).join('') + '</div>'}
    </div>

    <div id="mePanelPast" style="display:none;">
      ${past.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Sin eventos pasados</div></div></div>'
        : '<div style="display:flex;flex-direction:column;gap:12px;">' + past.map(e => renderMyEventCard(e, true)).join('') + '</div>'}
    </div>`;
}

function renderMyEventCard(e, isPast = false) {
  const dateStr = formatDate(e.fecha);
  const timeStr = e.hora ? e.hora.slice(0, 5) : '';
  return `<div class="card" style="${isPast?'opacity:0.6;':''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div style="flex:1;">
        <div style="font-weight:600;font-size:15px;">${escHtml(e.titulo)}</div>
        <div style="display:flex;gap:12px;margin-top:6px;font-size:13px;color:var(--text-muted);">
          <span>📅 ${dateStr}</span>
          ${timeStr ? `<span>🕐 ${timeStr}</span>` : ''}
        </div>
        ${e.descripcion ? `<div style="margin-top:8px;font-size:13px;color:var(--text-muted);">${escHtml(e.descripcion)}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="editMyEvent('${e.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteMyEvent('${e.id}')">🗑️</button>
      </div>
    </div>
  </div>`;
}

function switchMyEventTab(tab) {
  const prox = document.getElementById('mePanelProx');
  const past = document.getElementById('mePanelPast');
  const btnP = document.getElementById('meTabProx');
  const btnA = document.getElementById('meTabPast');
  if (tab === 'prox') {
    prox.style.display = ''; past.style.display = 'none';
    btnP.style.background = '#FF6B6B'; btnP.style.color = 'white';
    btnA.style.background = 'var(--border)'; btnA.style.color = 'var(--text-muted)';
  } else {
    prox.style.display = 'none'; past.style.display = '';
    btnA.style.background = '#FF6B6B'; btnA.style.color = 'white';
    btnP.style.background = 'var(--border)'; btnP.style.color = 'var(--text-muted)';
  }
}

function newMyEvent() { showMyEventForm(null); }
function editMyEvent(id) {
  const e = (window._myEventsData||[]).find(x => x.id === id);
  if (e) showMyEventForm(e);
}

function showMyEventForm(data) {
  const isEdit = !!data;
  createModal('myEventModal', isEdit ? 'Editar evento' : 'Nuevo evento personal', `
    <div class="form-group">
      <label class="form-label">Título *</label>
      <input class="form-input" id="me_titulo" value="${escHtml(data?.titulo||'')}" placeholder="Nombre del evento">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input class="form-input" id="me_fecha" type="date" value="${data?.fecha||''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Hora</label>
        <input class="form-input" id="me_hora" type="time" value="${data?.hora ? data.hora.slice(0,5) : ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-textarea" id="me_desc" style="min-height:60px;">${escHtml(data?.descripcion||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('myEventModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveMyEvent(${isEdit?`'${data.id}'`:'null'})">${isEdit?'Guardar':'Crear'}</button>
  `);
}

async function saveMyEvent(id) {
  const body = {
    titulo: document.getElementById('me_titulo').value.trim(),
    fecha: document.getElementById('me_fecha').value,
    hora: document.getElementById('me_hora').value || null,
    descripcion: document.getElementById('me_desc').value
  };
  if (!body.titulo || !body.fecha) { toast('Título y fecha son obligatorios', 'error'); return; }
  try {
    if (id) await API.put(`/my-events/${id}`, body);
    else await API.post('/my-events', body);
    toast(id ? 'Evento actualizado' : 'Evento creado', 'success');
    closeModal('myEventModal');
    navigate('myagenda');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteMyEvent(id) {
  if (!window.confirm('¿Eliminar este evento?')) return;
  try {
    await API.del(`/my-events/${id}`);
    toast('Evento eliminado', 'success');
    navigate('myagenda');
  } catch (err) { toast(err.message, 'error'); }
}
