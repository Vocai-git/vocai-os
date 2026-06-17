const MT_PRIORIDAD_ORDEN = { urgente: 0, alta: 1, normal: 2, baja: 3 };

async function renderMytasks(el) {
  const tasks = await API.get('/my-tasks');
  window._myTasksData = tasks;

  const activas = tasks.filter(t => t.estado !== 'completada')
    .sort((a, b) => (MT_PRIORIDAD_ORDEN[a.prioridad] ?? 2) - (MT_PRIORIDAD_ORDEN[b.prioridad] ?? 2));
  const completadas = tasks.filter(t => t.estado === 'completada');

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Mis tareas</h2>
      <button class="btn btn-primary" onclick="newMyTask()">+ Nueva tarea</button>
    </div>

    <div style="display:flex;gap:4px;margin-bottom:16px;">
      <button class="btn" id="mtTabActivas" onclick="switchMyTaskTab('activas')" style="background:#FF6B6B;color:white;font-weight:600;">
        Activas (${activas.length})
      </button>
      <button class="btn" id="mtTabCompletadas" onclick="switchMyTaskTab('completadas')" style="background:var(--border);color:var(--text-muted);">
        Completadas (${completadas.length})
      </button>
    </div>

    <div id="mtPanelActivas" class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th></th><th>Tarea</th><th>Prioridad</th><th>Estado</th><th>Fecha límite</th><th></th></tr></thead>
          <tbody id="mtTableBody">${renderMyTaskRows(activas)}</tbody>
        </table>
      </div>
    </div>

    <div id="mtPanelCompletadas" style="display:none;" class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Tarea</th><th>Prioridad</th><th>Completada</th><th></th></tr></thead>
          <tbody>${completadas.length === 0
            ? '<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Sin tareas completadas</div></div></td></tr>'
            : completadas.map(t => `<tr style="opacity:0.7;">
                <td style="text-decoration:line-through;">${escHtml(t.titulo)}</td>
                <td>${badge(t.prioridad||'normal')}</td>
                <td style="font-size:13px;color:var(--text-muted);">${t.updated_at ? formatDate(t.updated_at) : '—'}</td>
                <td><button class="btn btn-ghost btn-icon btn-sm" onclick="deleteMyTask('${t.id}')">🗑️</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderMyTaskRows(tasks) {
  if (!tasks.length) return '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Sin tareas</div></div></td></tr>';
  return tasks.map(t => {
    const isLate = t.fecha_limite && new Date(t.fecha_limite) < new Date() && t.estado !== 'completada';
    return `<tr>
      <td><input type="checkbox" ${t.estado==='completada'?'checked':''} onchange="toggleMyTask('${t.id}',this.checked)" style="width:16px;height:16px;cursor:pointer;"></td>
      <td style="font-weight:500;${t.estado==='completada'?'text-decoration:line-through;opacity:0.5;':''}">${escHtml(t.titulo)}</td>
      <td>${badge(t.prioridad||'normal')}</td>
      <td>${badge(t.estado||'pendiente')}</td>
      <td style="${isLate?'color:#FF6B6B;font-weight:500;':''}">${t.fecha_limite ? formatDate(t.fecha_limite) : '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editMyTask('${t.id}')">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteMyTask('${t.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function switchMyTaskTab(tab) {
  const a = document.getElementById('mtPanelActivas');
  const c = document.getElementById('mtPanelCompletadas');
  const btnA = document.getElementById('mtTabActivas');
  const btnC = document.getElementById('mtTabCompletadas');
  if (tab === 'activas') {
    a.style.display = ''; c.style.display = 'none';
    btnA.style.background = '#FF6B6B'; btnA.style.color = 'white';
    btnC.style.background = 'var(--border)'; btnC.style.color = 'var(--text-muted)';
  } else {
    a.style.display = 'none'; c.style.display = '';
    btnC.style.background = '#FF6B6B'; btnC.style.color = 'white';
    btnA.style.background = 'var(--border)'; btnA.style.color = 'var(--text-muted)';
  }
}

async function toggleMyTask(id, done) {
  await API.put(`/my-tasks/${id}`, { estado: done ? 'completada' : 'pendiente' });
  navigate('mytasks');
}

function newMyTask() { showMyTaskForm(null); }
function editMyTask(id) {
  const t = (window._myTasksData||[]).find(x => x.id === id);
  if (t) showMyTaskForm(t);
}

function showMyTaskForm(data) {
  const isEdit = !!data;
  createModal('myTaskModal', isEdit ? 'Editar tarea' : 'Nueva tarea personal', `
    <div class="form-group">
      <label class="form-label">Título *</label>
      <input class="form-input" id="mt_titulo" value="${escHtml(data?.titulo||'')}" placeholder="¿Qué tenés que hacer?">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Prioridad</label>
        <select class="form-select" id="mt_prior">
          <option value="baja" ${data?.prioridad==='baja'?'selected':''}>Baja</option>
          <option value="normal" ${data?.prioridad==='normal'||!data?'selected':''}>Normal</option>
          <option value="alta" ${data?.prioridad==='alta'?'selected':''}>Alta</option>
          <option value="urgente" ${data?.prioridad==='urgente'?'selected':''}>Urgente</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha límite</label>
        <input class="form-input" id="mt_fecha" type="date" value="${data?.fecha_limite||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Estado</label>
      <select class="form-select" id="mt_estado">
        <option value="pendiente" ${data?.estado==='pendiente'||!data?'selected':''}>Pendiente</option>
        <option value="en_curso" ${data?.estado==='en_curso'?'selected':''}>En curso</option>
        <option value="completada" ${data?.estado==='completada'?'selected':''}>Completada</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-textarea" id="mt_desc" style="min-height:60px;">${escHtml(data?.descripcion||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('myTaskModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveMyTask(${isEdit?`'${data.id}'`:'null'})">${isEdit?'Guardar':'Crear'}</button>
  `);
}

async function saveMyTask(id) {
  const body = {
    titulo: document.getElementById('mt_titulo').value.trim(),
    prioridad: document.getElementById('mt_prior').value,
    fecha_limite: document.getElementById('mt_fecha').value || null,
    estado: document.getElementById('mt_estado').value,
    descripcion: document.getElementById('mt_desc').value
  };
  if (!body.titulo) { toast('El título es obligatorio', 'error'); return; }
  try {
    if (id) await API.put(`/my-tasks/${id}`, body);
    else await API.post('/my-tasks', body);
    toast(id ? 'Tarea actualizada' : 'Tarea creada', 'success');
    closeModal('myTaskModal');
    navigate('mytasks');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteMyTask(id) {
  if (!window.confirm('¿Eliminar esta tarea?')) return;
  try {
    await API.del(`/my-tasks/${id}`);
    toast('Tarea eliminada', 'success');
    navigate('mytasks');
  } catch (err) { toast(err.message, 'error'); }
}
