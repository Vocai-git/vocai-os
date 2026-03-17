async function renderNotes(el) {
  const notes = await API.get('/notes');
  window._notesData = notes;

  const COLORS = ['#1e1e1e','#1e1e1e','#1e1e1e','#1e1e1e','#1e1e1e'];

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Notas</h2>
      <button class="btn btn-primary" onclick="newNote()">+ Nueva nota</button>
    </div>

    <div id="notesGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;">
      ${notes.length === 0
        ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📝</div><div class="empty-title">Sin notas</div><div class="empty-sub">Escribe tu primera nota rápida</div></div>'
        : notes.map(n => noteCard(n)).join('')
      }
    </div>`;
}

function noteCard(n) {
  const timeAgo = timeSince(n.updated_at || n.created_at);
  return `
    <div style="background:${n.color||'var(--surface)'};border:1px solid var(--border);border-radius:12px;padding:20px;cursor:pointer;"
         onclick="editNote('${n.id}')">
      ${n.titulo ? `<div style="font-weight:600;font-size:15px;margin-bottom:8px;">${escHtml(n.titulo)}</div>` : ''}
      <div style="font-size:14px;color:var(--text-muted);white-space:pre-wrap;line-height:1.6;">${escHtml((n.contenido||'').slice(0, 200))}${(n.contenido||'').length > 200 ? '...' : ''}</div>
      <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:11px;color:var(--text-dim);">
        <span>${escHtml(n.autor||'')}</span>
        <span>${timeAgo}</span>
      </div>
    </div>`;
}

function timeSince(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs/24)}d`;
}

function newNote() { showNoteForm(null); }

function editNote(id) {
  const n = (window._notesData||[]).find(x => x.id === id);
  if (n) showNoteForm(n);
}

function showNoteForm(data) {
  const isEdit = !!data;
  createModal('noteModal', isEdit ? 'Editar nota' : 'Nueva nota', `
    <div class="form-group">
      <label class="form-label">Título (opcional)</label>
      <input class="form-input" id="nf_titulo" value="${escHtml(data?.titulo||'')}" placeholder="Título de la nota">
    </div>
    <div class="form-group">
      <label class="form-label">Contenido *</label>
      <textarea class="form-textarea" id="nf_contenido" style="min-height:160px;" placeholder="Escribe tu nota aquí...">${escHtml(data?.contenido||'')}</textarea>
    </div>
  `, `
    ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="deleteNote('${data.id}')">Eliminar</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal('noteModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveNote(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar' : 'Crear nota'}</button>
  `);
}

async function saveNote(id) {
  const body = {
    titulo: document.getElementById('nf_titulo').value.trim(),
    contenido: document.getElementById('nf_contenido').value.trim()
  };
  if (!body.contenido) { toast('El contenido es obligatorio', 'error'); return; }
  try {
    if (id) await API.put(`/notes/${id}`, body);
    else await API.post('/notes', body);
    toast(id ? 'Nota actualizada' : 'Nota creada', 'success');
    closeModal('noteModal');
    navigate('notes');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteNote(id) {
  if (!confirm('¿Eliminar esta nota?')) return;
  try {
    await API.del(`/notes/${id}`);
    toast('Nota eliminada', 'success');
    closeModal('noteModal');
    navigate('notes');
  } catch (err) { toast(err.message, 'error'); }
}
