async function renderTasks(el) {
  const [tasks, projects] = await Promise.all([API.get('/tasks'), API.get('/projects')]);
  window._tasksData = tasks;
  window._projectsData = projects;

  const activas = sortTasks(tasks.filter(t => t.estado !== 'completada'), 'prioridad');
  const completadas = tasks.filter(t => t.estado === 'completada');

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Tareas</h2>
      <button class="btn btn-primary" onclick="newTask()">+ Nueva tarea</button>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:4px;margin-bottom:16px;">
      <button class="btn" id="tabActivas" onclick="switchTaskTab('activas')"
        style="background:#FF6B6B;color:white;font-weight:600;">
        Activas (${activas.length})
      </button>
      <button class="btn" id="tabCompletadas" onclick="switchTaskTab('completadas')"
        style="background:var(--border);color:var(--text-muted);">
        Completadas (${completadas.length})
      </button>
    </div>

    <!-- Tab: Activas -->
    <div id="panelActivas" class="card">
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
        </select>
        <select class="filter-select" id="taskPrioridad" onchange="filterTasks()">
          <option value="">Todas las prioridades</option>
          <option value="urgente">Urgente</option>
          <option value="alta">Alta</option>
          <option value="normal">Normal</option>
          <option value="baja">Baja</option>
        </select>
        <select class="filter-select" id="taskOrden" onchange="filterTasks()">
          <option value="prioridad">Ordenar por prioridad</option>
          <option value="fecha">Ordenar por fecha límite</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th></th><th>Tarea</th><th>Proyecto</th><th>Prioridad</th><th>Estado</th><th>Responsable</th><th>Fecha límite</th><th></th></tr></thead>
          <tbody id="taskTableBody">${renderTaskRows(activas)}</tbody>
        </table>
      </div>
    </div>

    <!-- Tab: Completadas -->
    <div id="panelCompletadas" style="display:none;">
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-weight:600;">Historial de tareas completadas</div>
            <div style="font-size:13px;color:var(--text-muted);">${completadas.length} tarea${completadas.length !== 1 ? 's' : ''} en el historial</div>
          </div>
          <button class="btn" style="background:#FF6B6B;color:white;" onclick="showCleanupDialog()" ${completadas.length === 0 ? 'disabled' : ''}>
            Limpiar historial
          </button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Tarea</th><th>Proyecto</th><th>Prioridad</th><th>Responsable</th><th>Completada</th><th></th></tr></thead>
            <tbody id="completedTableBody">${renderCompletedRows(completadas)}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function renderTaskRows(tasks) {
  if (!tasks.length) return `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Sin tareas activas</div></div></td></tr>`;
  return tasks.map(t => {
    const isLate = t.fecha_limite && new Date(t.fecha_limite) < new Date() && t.estado !== 'completada';
    return `<tr>
      <td><input type="checkbox" ${t.estado==='completada'?'checked':''} onchange="quickToggleTask('${t.id}',this.checked)" style="width:16px;height:16px;cursor:pointer;"></td>
      <td><div style="${t.estado==='completada'?'text-decoration:line-through;opacity:0.5;':''};font-weight:500;">${escHtml(t.titulo)}</div></td>
      <td style="color:var(--text-muted);font-size:13px;">${escHtml(t.projects?.nombre||'—')}</td>
      <td>${badge(t.prioridad||'normal')}</td>
      <td>${badge(t.estado||'pendiente')}</td>
      <td>${responsablePill(t.responsable)}</td>
      <td style="${isLate?'color:#FF6B6B;font-weight:500;':''}">${t.fecha_limite ? formatDate(t.fecha_limite) : '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editTask('${t.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteTask('${t.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderCompletedRows(tasks) {
  if (!tasks.length) return `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No hay tareas completadas</div></div></td></tr>`;
  return tasks.map(t => `<tr style="opacity:0.7;">
    <td><div style="text-decoration:line-through;">${escHtml(t.titulo)}</div></td>
    <td style="color:var(--text-muted);font-size:13px;">${escHtml(t.projects?.nombre||'—')}</td>
    <td>${badge(t.prioridad||'normal')}</td>
    <td>${responsablePill(t.responsable)}</td>
    <td style="font-size:13px;color:var(--text-muted);">${t.updated_at ? formatDate(t.updated_at) : '—'}</td>
    <td>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="quickToggleTask('${t.id}',false)" title="Reactivar">↩️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteTask('${t.id}')" title="Eliminar">🗑️</button>
      </div>
    </td>
  </tr>`).join('');
}

function switchTaskTab(tab) {
  const activas = document.getElementById('panelActivas');
  const completadas = document.getElementById('panelCompletadas');
  const btnA = document.getElementById('tabActivas');
  const btnC = document.getElementById('tabCompletadas');

  if (tab === 'activas') {
    activas.style.display = '';
    completadas.style.display = 'none';
    btnA.style.background = '#FF6B6B';
    btnA.style.color = 'white';
    btnC.style.background = 'var(--border)';
    btnC.style.color = 'var(--text-muted)';
  } else {
    activas.style.display = 'none';
    completadas.style.display = '';
    btnC.style.background = '#FF6B6B';
    btnC.style.color = 'white';
    btnA.style.background = 'var(--border)';
    btnA.style.color = 'var(--text-muted)';
  }
}

const PRIORIDAD_ORDEN = { urgente: 0, alta: 1, normal: 2, baja: 3 };

function sortTasks(tasks, criterio) {
  return [...tasks].sort((a, b) => {
    if (criterio === 'prioridad') {
      const pa = PRIORIDAD_ORDEN[a.prioridad] ?? 2;
      const pb = PRIORIDAD_ORDEN[b.prioridad] ?? 2;
      if (pa !== pb) return pa - pb;
      // Desempate por fecha límite
      const fa = a.fecha_limite ? new Date(a.fecha_limite) : new Date('2099-12-31');
      const fb = b.fecha_limite ? new Date(b.fecha_limite) : new Date('2099-12-31');
      return fa - fb;
    } else {
      // Por fecha límite, sin fecha al final
      const fa = a.fecha_limite ? new Date(a.fecha_limite) : new Date('2099-12-31');
      const fb = b.fecha_limite ? new Date(b.fecha_limite) : new Date('2099-12-31');
      return fa - fb;
    }
  });
}

function filterTasks() {
  const resp = document.getElementById('taskResp').value;
  const estado = document.getElementById('taskEstado').value;
  const prior = document.getElementById('taskPrioridad').value;
  const orden = document.getElementById('taskOrden').value;
  let filtered = (window._tasksData || []).filter(t => t.estado !== 'completada');
  if (resp) filtered = filtered.filter(t => t.responsable === resp);
  if (estado) filtered = filtered.filter(t => t.estado === estado);
  if (prior) filtered = filtered.filter(t => t.prioridad === prior);
  filtered = sortTasks(filtered, orden);
  document.getElementById('taskTableBody').innerHTML = renderTaskRows(filtered);
}

async function quickToggleTask(id, done) {
  await API.put(`/tasks/${id}`, { estado: done ? 'completada' : 'pendiente' });
  navigate('tasks');
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
  if (!window.confirm('¿Eliminar esta tarea?')) return;
  try {
    await API.del(`/tasks/${id}`);
    toast('Tarea eliminada', 'success');
    navigate('tasks');
  } catch (err) { toast('Error al eliminar: ' + err.message, 'error'); }
}

function showCleanupDialog() {
  const completadas = (window._tasksData || []).filter(t => t.estado === 'completada');
  const now = new Date();
  const count30 = completadas.filter(t => t.updated_at && (now - new Date(t.updated_at)) > 30 * 86400000).length;
  const count90 = completadas.filter(t => t.updated_at && (now - new Date(t.updated_at)) > 90 * 86400000).length;
  const count365 = completadas.filter(t => t.updated_at && (now - new Date(t.updated_at)) > 365 * 86400000).length;

  createModal('cleanupModal', 'Limpiar historial de tareas', `
    <p style="color:var(--text-muted);margin-bottom:20px;">Elegí qué tareas completadas querés eliminar:</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button class="btn btn-secondary" onclick="confirmCleanup('30')" style="text-align:left;padding:14px 16px;">
        <div style="font-weight:600;">Más de 30 días</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${count30} tarea${count30 !== 1 ? 's' : ''} se eliminarán</div>
      </button>
      <button class="btn btn-secondary" onclick="confirmCleanup('90')" style="text-align:left;padding:14px 16px;">
        <div style="font-weight:600;">Más de 90 días</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${count90} tarea${count90 !== 1 ? 's' : ''} se eliminarán</div>
      </button>
      <button class="btn btn-secondary" onclick="confirmCleanup('365')" style="text-align:left;padding:14px 16px;">
        <div style="font-weight:600;">Más de 1 año</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${count365} tarea${count365 !== 1 ? 's' : ''} se eliminarán</div>
      </button>
      <button class="btn" onclick="confirmCleanup('all')" style="background:#FF6B6B;color:white;text-align:left;padding:14px 16px;">
        <div style="font-weight:600;">Todo el historial</div>
        <div style="font-size:12px;opacity:0.8;margin-top:2px;">${completadas.length} tarea${completadas.length !== 1 ? 's' : ''} se eliminarán</div>
      </button>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('cleanupModal')">Cancelar</button>
  `);
}

async function confirmCleanup(periodo) {
  const label = periodo === 'all' ? 'TODO el historial' : `tareas de más de ${periodo} días`;
  if (!window.confirm(`¿Estás seguro? Se eliminará ${label}. Esta acción no se puede deshacer.`)) return;
  try {
    const result = await API.del(`/tasks/bulk-completed?periodo=${periodo}`);
    toast(`${result.eliminadas} tarea${result.eliminadas !== 1 ? 's' : ''} eliminada${result.eliminadas !== 1 ? 's' : ''}`, 'success');
    closeModal('cleanupModal');
    navigate('tasks');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}
