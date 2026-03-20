let projectsData = [];

async function renderProjects(el) {
  projectsData = await API.get('/projects');

  const cols = {
    briefing: { label: 'Briefing', color: 'violet' },
    diseño: { label: 'Diseño', color: 'blue' },
    desarrollo: { label: 'Desarrollo', color: 'amber' },
    produccion: { label: 'Producción', color: 'teal' },
    completado: { label: 'Completado', color: 'gray' }
  };

  const grouped = {};
  Object.keys(cols).forEach(k => grouped[k] = []);
  projectsData.forEach(p => {
    if (grouped[p.estado]) grouped[p.estado].push(p);
    else grouped['briefing'].push(p);
  });

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Proyectos</h2>
      <button class="btn btn-primary" onclick="newProject()">+ Nuevo proyecto</button>
    </div>
    <div class="kanban-board" id="kanbanBoard">
      ${Object.entries(cols).map(([key, col]) => `
        <div class="kanban-col ${key}" data-col="${key}"
             ondragover="event.preventDefault()"
             ondrop="dropProject(event,'${key}')">
          <div class="kanban-col-header">
            <span class="kanban-col-title">${col.label}</span>
            <span class="kanban-col-count">${grouped[key].length}</span>
          </div>
          <div class="kanban-cards" id="col-${key}">
            ${grouped[key].map(p => projectCard(p)).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
}

function projectCard(p) {
  const tasks = p.tasks || [];
  const done = tasks.filter(t => t.estado === 'completada').length;
  return `
    <div class="kanban-card" draggable="true" data-id="${p.id}"
         ondragstart="dragStart(event)"
         onclick="openProject('${p.id}')">
      <div class="kanban-card-title">${escHtml(p.nombre)}</div>
      ${p.clients?.nombre ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">👤 ${escHtml(p.clients.nombre)}</div>` : ''}
      <div class="progress-bar" style="margin-bottom:8px;">
        <div class="progress-fill" style="width:${p.progreso||0}%"></div>
      </div>
      <div class="kanban-card-meta">
        <span>${tasks.length > 0 ? `✅ ${done}/${tasks.length}` : '—'}</span>
        ${responsablePill(p.responsable)}
        ${p.fecha_entrega ? `<span>📅 ${formatDate(p.fecha_entrega)}</span>` : ''}
      </div>
    </div>`;
}

function dragStart(e) {
  e.dataTransfer.setData('projectId', e.currentTarget.dataset.id);
  e.currentTarget.classList.add('dragging');
}

async function dropProject(e, newState) {
  e.preventDefault();
  const id = e.dataTransfer.getData('projectId');
  document.querySelectorAll('.kanban-card').forEach(c => c.classList.remove('dragging'));
  try {
    await API.put(`/projects/${id}`, { estado: newState });
    navigate('projects');
  } catch (err) { toast(err.message, 'error'); }
}

async function openProject(id) {
  const p = await API.get(`/projects/${id}`);
  const comments = await API.get(`/projects/${id}/comments`);
  const clients = await API.get('/clients');

  createModal('projectModal', p.nombre, `
    <div class="tabs">
      <div class="tab active" onclick="switchTab(event,'tab-info')">Info</div>
      <div class="tab" onclick="switchTab(event,'tab-tasks')">Tareas (${(p.tasks||[]).length})</div>
      <div class="tab" onclick="switchTab(event,'tab-comments')">Comentarios</div>
    </div>

    <div id="tab-info">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-select" id="pe_estado">
            <option value="briefing" ${p.estado==='briefing'?'selected':''}>Briefing</option>
            <option value="diseño" ${p.estado==='diseño'?'selected':''}>Diseño</option>
            <option value="desarrollo" ${p.estado==='desarrollo'?'selected':''}>Desarrollo</option>
            <option value="produccion" ${p.estado==='produccion'?'selected':''}>Producción</option>
            <option value="completado" ${p.estado==='completado'?'selected':''}>Completado</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Progreso (${p.progreso||0}%)</label>
          <input class="form-input" type="range" id="pe_progreso" min="0" max="100" value="${p.progreso||0}" oninput="this.previousElementSibling.textContent='Progreso ('+this.value+'%)'">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Responsable</label>
          <select class="form-select" id="pe_responsable">
            <option value="">—</option>
            <option value="agus" ${p.responsable==='agus'?'selected':''}>Agus</option>
            <option value="santi" ${p.responsable==='santi'?'selected':''}>Santi</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de entrega</label>
          <input class="form-input" type="date" id="pe_fecha" value="${p.fecha_entrega||''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-textarea" id="pe_desc">${escHtml(p.descripcion||'')}</textarea>
      </div>
    </div>

    <div id="tab-tasks" style="display:none;">
      <div style="margin-bottom:12px;"><button class="btn btn-primary btn-sm" onclick="newTaskForProject('${p.id}')">+ Nueva tarea</button></div>
      ${(p.tasks||[]).length === 0
        ? '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">Sin tareas</div></div>'
        : `<div style="display:flex;flex-direction:column;gap:8px;">
          ${(p.tasks||[]).map(t => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
              <input type="checkbox" ${t.estado==='completada'?'checked':''} onchange="toggleTask('${t.id}',this.checked)" style="width:16px;height:16px;cursor:pointer;">
              <div style="flex:1;">
                <div style="font-size:14px;${t.estado==='completada'?'text-decoration:line-through;opacity:0.5;':''}">${escHtml(t.titulo)}</div>
                <div style="font-size:12px;color:var(--text-muted);">${t.fecha_limite ? '📅 '+formatDate(t.fecha_limite) : ''}</div>
              </div>
              ${badge(t.prioridad)}
              ${responsablePill(t.responsable)}
            </div>`).join('')}
        </div>`
      }
    </div>

    <div id="tab-comments" style="display:none;">
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;max-height:200px;overflow-y:auto;">
        ${comments.length === 0
          ? '<div class="text-muted text-sm">Sin comentarios todavía</div>'
          : comments.map(c => `
            <div style="background:var(--bg);padding:12px;border-radius:8px;">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${escHtml(c.usuario)} · ${formatDate(c.created_at)}</div>
              <div style="font-size:14px;">${escHtml(c.texto)}</div>
            </div>`).join('')
        }
      </div>
      <div style="display:flex;gap:8px;">
        <input class="form-input" id="commentInput" placeholder="Escribe un comentario...">
        <button class="btn btn-primary btn-sm" onclick="addComment('${p.id}')">Enviar</button>
      </div>
    </div>
  `, `
    <button class="btn btn-danger btn-sm" onclick="deleteProject('${p.id}')">Eliminar</button>
    <button class="btn btn-secondary" onclick="closeModal('projectModal')">Cerrar</button>
    <button class="btn btn-primary" onclick="saveProject('${p.id}')">Guardar cambios</button>
  `, 'modal-lg');
}

function switchTab(e, tabId) {
  e.target.closest('.modal').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  ['tab-info','tab-tasks','tab-comments'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? '' : 'none';
  });
}

async function saveProject(id) {
  try {
    await API.put(`/projects/${id}`, {
      estado: document.getElementById('pe_estado').value,
      progreso: parseInt(document.getElementById('pe_progreso').value),
      responsable: document.getElementById('pe_responsable').value || null,
      fecha_entrega: document.getElementById('pe_fecha').value || null,
      descripcion: document.getElementById('pe_desc').value
    });
    toast('Proyecto actualizado', 'success');
    closeModal('projectModal');
    navigate('projects');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteProject(id) {
  if (!confirm('¿Eliminar este proyecto?')) return;
  try {
    await API.del(`/projects/${id}`);
    toast('Proyecto eliminado', 'success');
    closeModal('projectModal');
    navigate('projects');
  } catch (err) { toast(err.message, 'error'); }
}

async function addComment(projectId) {
  const input = document.getElementById('commentInput');
  const texto = input.value.trim();
  if (!texto) return;
  try {
    await API.post(`/projects/${projectId}/comments`, { texto });
    input.value = '';
    openProject(projectId);
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleTask(taskId, done) {
  await API.put(`/tasks/${taskId}`, { estado: done ? 'completada' : 'pendiente' });
}

async function newTaskForProject(projectId) {
  closeModal('projectModal');
  navigate('tasks');
}

function newProject() {
  showProjectForm(null);
}

async function showProjectForm(data) {
  const clients = await API.get('/clients');
  const isEdit = !!data;
  createModal('projectFormModal', isEdit ? 'Editar proyecto' : 'Nuevo proyecto', `
    <div class="form-group">
      <label class="form-label">Nombre *</label>
      <input class="form-input" id="pf_nombre" value="${escHtml(data?.nombre||'')}" placeholder="Nombre del proyecto">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente</label>
        <select class="form-select" id="pf_cliente">
          <option value="">— Sin cliente —</option>
          ${clients.map(c => `<option value="${c.id}" ${data?.cliente_id===c.id?'selected':''}>${escHtml(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Responsable</label>
        <select class="form-select" id="pf_resp">
          <option value="">—</option>
          <option value="agus" ${data?.responsable==='agus'?'selected':''}>Agus</option>
          <option value="santi" ${data?.responsable==='santi'?'selected':''}>Santi</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Estado inicial</label>
        <select class="form-select" id="pf_estado">
          <option value="briefing">Briefing</option>
          <option value="diseño">Diseño</option>
          <option value="desarrollo">Desarrollo</option>
          <option value="produccion">Producción</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de entrega</label>
        <input class="form-input" type="date" id="pf_fecha" value="${data?.fecha_entrega||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-textarea" id="pf_desc" placeholder="Descripción del proyecto...">${escHtml(data?.descripcion||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('projectFormModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveNewProject()">Crear proyecto</button>
  `);
}

async function saveNewProject() {
  const body = {
    nombre: document.getElementById('pf_nombre').value.trim(),
    cliente_id: document.getElementById('pf_cliente').value || null,
    responsable: document.getElementById('pf_resp').value || null,
    estado: document.getElementById('pf_estado').value,
    fecha_entrega: document.getElementById('pf_fecha').value || null,
    descripcion: document.getElementById('pf_desc').value
  };
  if (!body.nombre) { toast('El nombre es obligatorio', 'error'); return; }
  try {
    await API.post('/projects', body);
    toast('Proyecto creado', 'success');
    closeModal('projectFormModal');
    navigate('projects');
  } catch (err) { toast(err.message, 'error'); }
}
