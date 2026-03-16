async function renderEpisodes(el) {
  const [episodes, clients] = await Promise.all([API.get('/episodes'), API.get('/clients')]);
  window._episodesData = episodes;

  const byEstado = {
    pendiente: episodes.filter(e=>e.estado==='pendiente').length,
    grabado: episodes.filter(e=>e.estado==='grabado').length,
    editando: episodes.filter(e=>e.estado==='editando').length,
    revision: episodes.filter(e=>e.estado==='revision').length,
    publicado: episodes.filter(e=>e.estado==='publicado').length,
  };

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Episodios</h2>
      <button class="btn btn-primary" onclick="newEpisode()">+ Nuevo episodio</button>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:20px;overflow-x:auto;padding-bottom:4px;">
      ${Object.entries(byEstado).map(([k,v]) => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 20px;text-align:center;min-width:100px;">
          <div style="font-size:20px;font-weight:700;">${v}</div>
          <div style="font-size:12px;color:var(--text-muted);text-transform:capitalize;">${k}</div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="filters" style="margin-bottom:16px;">
        <select class="filter-select" id="epEstado" onchange="filterEpisodes()">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="grabado">Grabado</option>
          <option value="editando">Editando</option>
          <option value="revision">Revisión</option>
          <option value="publicado">Publicado</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>#</th><th>Título</th><th>Cliente / Podcast</th><th>Estado</th><th>Grabación</th><th>Publicación</th><th></th></tr></thead>
          <tbody id="epTableBody">${renderEpRows(episodes)}</tbody>
        </table>
      </div>
    </div>`;
}

function renderEpRows(episodes) {
  if (!episodes.length) return `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🎙️</div><div class="empty-title">Sin episodios</div></div></td></tr>`;
  return episodes.map(e => `
    <tr>
      <td><span style="font-family:'Syne',sans-serif;font-weight:700;color:var(--text-muted);">#${e.numero||'—'}</span></td>
      <td><div style="font-weight:500;">${escHtml(e.titulo)}</div></td>
      <td>${escHtml(e.clients?.nombre||'—')}</td>
      <td>${badge(e.estado||'pendiente')}</td>
      <td>${e.fecha_grabacion ? formatDate(e.fecha_grabacion) : '—'}</td>
      <td>${e.fecha_publicacion ? formatDate(e.fecha_publicacion) : '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editEpisode('${e.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteEpisode('${e.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function filterEpisodes() {
  const estado = document.getElementById('epEstado').value;
  let filtered = window._episodesData || [];
  if (estado) filtered = filtered.filter(e => e.estado === estado);
  document.getElementById('epTableBody').innerHTML = renderEpRows(filtered);
}

function newEpisode() { showEpisodeForm(null); }

function editEpisode(id) {
  const e = (window._episodesData||[]).find(x => x.id === id);
  if (e) showEpisodeForm(e);
}

async function showEpisodeForm(data) {
  const clients = await API.get('/clients');
  const isEdit = !!data;
  createModal('epModal', isEdit ? 'Editar episodio' : 'Nuevo episodio', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-input" id="ef2_titulo" value="${escHtml(data?.titulo||'')}" placeholder="Título del episodio">
      </div>
      <div class="form-group">
        <label class="form-label">Número</label>
        <input class="form-input" id="ef2_num" type="number" value="${data?.numero||''}" placeholder="ej. 42">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente / Podcast</label>
        <select class="form-select" id="ef2_cliente">
          <option value="">— Sin cliente —</option>
          ${clients.map(c => `<option value="${c.id}" ${data?.cliente_id===c.id?'selected':''}>${escHtml(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="ef2_estado">
          <option value="pendiente" ${data?.estado==='pendiente'||!data?'selected':''}>Pendiente</option>
          <option value="grabado" ${data?.estado==='grabado'?'selected':''}>Grabado</option>
          <option value="editando" ${data?.estado==='editando'?'selected':''}>Editando</option>
          <option value="revision" ${data?.estado==='revision'?'selected':''}>Revisión</option>
          <option value="publicado" ${data?.estado==='publicado'?'selected':''}>Publicado</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha de grabación</label>
        <input class="form-input" id="ef2_grab" type="date" value="${data?.fecha_grabacion||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de publicación</label>
        <input class="form-input" id="ef2_pub" type="date" value="${data?.fecha_publicacion||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="ef2_notas" style="min-height:60px;">${escHtml(data?.notas||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('epModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveEpisode(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar' : 'Crear episodio'}</button>
  `);
}

async function saveEpisode(id) {
  const body = {
    titulo: document.getElementById('ef2_titulo').value.trim(),
    numero: parseInt(document.getElementById('ef2_num').value) || null,
    cliente_id: document.getElementById('ef2_cliente').value || null,
    estado: document.getElementById('ef2_estado').value,
    fecha_grabacion: document.getElementById('ef2_grab').value || null,
    fecha_publicacion: document.getElementById('ef2_pub').value || null,
    notas: document.getElementById('ef2_notas').value
  };
  if (!body.titulo) { toast('El título es obligatorio', 'error'); return; }
  try {
    if (id) await API.put(`/episodes/${id}`, body);
    else await API.post('/episodes', body);
    toast(id ? 'Episodio actualizado' : 'Episodio creado', 'success');
    closeModal('epModal');
    navigate('episodes');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteEpisode(id) {
  if (!confirm('¿Eliminar este episodio?')) return;
  try {
    await API.del(`/episodes/${id}`);
    toast('Episodio eliminado', 'success');
    navigate('episodes');
  } catch (err) { toast(err.message, 'error'); }
}
