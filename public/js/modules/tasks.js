async function renderTasks(el) {
  const [tasks, projects] = await Promise.all([API.get('/tasks'), API.get('/projects')]);
  window._tasksData = tasks;
  window._projectsData = projects;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Tareas</h2>
      <button class="btn btn-primary" onclick="newTask()">+ Nueva tarea</button>
    </div>
    <div class="card">
      <div class="filters" style="margin-bottom:16px;">
        <select class="filter-select" id="taskResp" onchange="filterTasks()">
          <option value="">Todos</option>
          <option value="agus">Agus</option>
          <option value="santi">Santi</option>
        </select>
        <select class="filter-select" id="taskEstado" onchange="filterTasks()">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_curso">En curso</option>
          <option value="completada">Completada</option>
        </select>
        <select class="filter-select" id="taskPrioridad" onchange="filterTasks()">
          <option value="">Todas las prioridades</option>
          <option value="urgente">Urgente</option>
          <option value="alta">Alta</option>
          <option value="normal">Normal</option>
          <option value="baja">Baja</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th></th><th>Tarea</th><th>Proyecto</th><th>Prioridad</th><th>Estado</th><th>Responsable</th><th>Fecha límite</th><th></th></tr></thead>
          <tbody id="taskTableBody">${renderTaskRows(tasks)}</tbody>
        </table>
      </div>
    </div>`;
}

function renderTaskRows(tasks) {
  if (!tasks.length) return `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Sin tareas</div></div></td></tr>`;
  return tasks.map(t => {
    const isLate = t.fecha_limite && new Date(t.fecha_limite) < new Date() && t.estado !== 'completada';
    return `<tr>
      <td><input type="checkbox" ${t.estado==='completada'?'checked':''} onchange="quickToggleTask('${t.id}',this.checked)" style="width:16px;height:16px;cursor:pointer;"></td>
      <td><div style="${t.estado==='completada'?'text-decoration:line-through;opacity:0.5;':''};font-weight:500;">${escHtml(t.titulo)}</div></td>
      <td style="color:var(--text-muted);font-size:13px;">${escHtml(t.projects?.nombre||'—')}</td>
      <td>${badge(t.prioridad||'normal')}</td>
      <td>${badge(t.estado||'pendiente')}</td>
      <td>${responsablePill(t.responsable)}</td>
      <td style="${isLate?'color:var(--rose);font-weight:500;':''}">${t.fecha_limite ? formatDate(t.fecha_limite) : '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editTask('${t.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteTask('${t.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterTasks() {
  const resp = document.getElementById('taskResp').value;
  const estado = document.getElementById('taskEstado').value;
  const prior = document.getElementById('taskPrioridad').value;
  let filtered = window._tasksData || [];
  if (resp) filtered = filtered.filter(t => t.responsable === resp);
  if (estado) filtered = filtered.filter(t => t.estado === estado);
  if (prior) filtered = filtered.filter(t => t.prioridad === prior);
  document.getElementById('taskTableBody').innerHTML = renderTaskRows(filtered);
}

async function quickToggleTask(id, done) {
  await API.put(`/tasks/${id}`, { estado: done ? 'completada' : 'pendiente' });
  window._tasksData = await API.get('/tasks');
  filterTasks();
}

function newTask() { showTaskForm(null); }

function editTask(id) {
  const t = (window._tasksData||[]).find(x => x.id === id);
  if (t) showTaskForm(t);
}

function showTaskForm(data) {
  const isEdit = !!data;
  const projects = window._projectsData || [];
  createModal('taskModal', isEdit ? 'Editar tarea' : 'Nueva tarea', `
    <div class="form-group">
      <label class="form-label">Título *</label>
      <input class="form-input" id="tf_titulo" value="${escHtml(data?.titulo||'')}" placeholder="¿Qué hay que hacer?">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Responsable</label>
        <select class="form-select" id="tf_resp">
          <option value="">—</option>
          <option value="agus" ${data?.responsable==='agus'?'selected':''}>Agus</option>
          <option value="santi" ${data?.responsable==='santi'?'selected':''}>Santi</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Prioridad</label>
        <select class="form-select" id="tf_prior">
          <option value="baja" ${data?.prioridad==='baja'?'selected':''}>Baja</option>
          <option value="normal" ${data?.prioridad==='normal'||!data?'selected':''}>Normal</option>
          <option value="alta" ${data?.prioridad==='alta'?'selected':''}>Alta</option>
          <option value="urgente" ${data?.prioridad==='urgente'?'selected':''}>Urgente</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Proyecto</label>
        <select class="form-select" id="tf_proyecto">
          <option value="">— Sin proyecto —</option>
          ${projects.map(p => `<option value="${p.id}" ${data?.proyecto_id===p.id?'selected':''}>${escHtml(p.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha límite</label>
        <input class="form-input" id="tf_fecha" type="date" value="${data?.fecha_limite||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Estado</label>
      <select class="form-select" id="tf_estado">
        <option value="pendiente" ${data?.estado==='pendiente'||!data?'selected':''}>Pendiente</option>
        <option value="en_curso" ${data?.estado==='en_curso'?'selected':''}>En curso</option>
        <option value="completada" ${data?.estado==='completada'?'selected':''}>Completada</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-textarea" id="tf_desc" style="min-height:60px;">${escHtml(data?.descripcion||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('taskModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveTask(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar' : 'Crear tarea'}</button>
  `);
}

async function saveTask(id) {
  const body = {
    titulo: document.getElementById('tf_titulo').value.trim(),
    responsable: document.getElementById('tf_resp').value || null,
    prioridad: document.getElementById('tf_prior').value,
    proyecto_id: document.getElementById('tf_proyecto').value || null,
    fecha_limite: document.getElementById('tf_fecha').value || null,
    estado: document.getElementById('tf_estado').value,
    descripcion: document.getElementById('tf_desc').value
  };
  if (!body.titulo) { toast('El título es obligatorio', 'error'); return; }
  try {
    if (id) await API.put(`/tasks/${id}`, body);
    else await API.post('/tasks', body);
    toast(id ? 'Tarea actualizada' : 'Tarea creada', 'success');
    closeModal('taskModal');
    navigate('tasks');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteTask(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  try {
    await API.del(`/tasks/${id}`);
    toast('Tarea eliminada', 'success');
    navigate('tasks');
  } catch (err) { toast(err.message, 'error'); }
}
