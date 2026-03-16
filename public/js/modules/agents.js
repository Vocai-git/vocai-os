async function renderAgents(el) {
  const agents = await API.get('/agents');
  window._agentsData = agents;

  const STATUS_COLORS = { activo: 'teal', pausado: 'amber', error: 'rose' };

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Agentes n8n</h2>
      <button class="btn btn-primary" onclick="newAgent()">+ Documentar agente</button>
    </div>

    <div class="alert alert-info" style="margin-bottom:20px;">
      💡 Este panel documenta las automatizaciones activas en n8n. No ejecuta los agentes directamente.
    </div>

    <div class="grid-auto">
      ${agents.length === 0
        ? `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚡</div><div class="empty-title">Sin agentes documentados</div><div class="empty-sub">Documenta tus flujos de n8n para tener un registro centralizado</div></div>`
        : agents.map(a => `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <div style="font-weight:600;font-size:15px;">${escHtml(a.nombre)}</div>
              <span class="badge badge-${STATUS_COLORS[a.estado]||'gray'}">${escHtml(a.estado)}</span>
            </div>
            ${a.descripcion ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">${escHtml(a.descripcion)}</div>` : ''}
            ${a.trigger ? `<div style="font-size:12px;margin-bottom:6px;"><strong>Trigger:</strong> ${escHtml(a.trigger)}</div>` : ''}
            ${(a.acciones||[]).length > 0 ? `
              <div style="font-size:12px;margin-bottom:12px;">
                <strong>Acciones:</strong>
                <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                  ${a.acciones.map(ac => `<span class="badge badge-gray">${escHtml(ac)}</span>`).join('')}
                </div>
              </div>` : ''}
            ${a.webhook_url ? `<div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(a.webhook_url)}">🔗 ${escHtml(a.webhook_url)}</div>` : ''}
            <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px;">
              <button class="btn btn-ghost btn-sm" onclick="editAgent('${a.id}')">✏️ Editar</button>
              <button class="btn btn-ghost btn-sm" onclick="deleteAgent('${a.id}')">🗑️</button>
            </div>
          </div>`).join('')
      }
    </div>`;
}

function newAgent() { showAgentForm(null); }

function editAgent(id) {
  const a = (window._agentsData||[]).find(x => x.id === id);
  if (a) showAgentForm(a);
}

function showAgentForm(data) {
  const isEdit = !!data;
  createModal('agentModal', isEdit ? 'Editar agente' : 'Documentar agente', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-input" id="af_nombre" value="${escHtml(data?.nombre||'')}" placeholder="ej. Lead Scorer, Invoice Bot">
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="af_estado">
          <option value="activo" ${data?.estado==='activo'||!data?'selected':''}>Activo</option>
          <option value="pausado" ${data?.estado==='pausado'?'selected':''}>Pausado</option>
          <option value="error" ${data?.estado==='error'?'selected':''}>Error</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-textarea" id="af_desc" style="min-height:80px;" placeholder="¿Qué hace este agente?">${escHtml(data?.descripcion||'')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Trigger (cómo se activa)</label>
      <input class="form-input" id="af_trigger" value="${escHtml(data?.trigger||'')}" placeholder="ej. Webhook, Cron 9:00, Formulario">
    </div>
    <div class="form-group">
      <label class="form-label">Acciones (separadas por coma)</label>
      <input class="form-input" id="af_acciones" value="${escHtml((data?.acciones||[]).join(', '))}" placeholder="ej. Enviar email, Actualizar Supabase, Notificar Telegram">
    </div>
    <div class="form-group">
      <label class="form-label">Webhook URL</label>
      <input class="form-input" id="af_webhook" value="${escHtml(data?.webhook_url||'')}" placeholder="https://n8n.vocai.es/webhook/...">
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="af_notas" style="min-height:60px;">${escHtml(data?.notas||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('agentModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveAgent(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar' : 'Documentar'}</button>
  `);
}

async function saveAgent(id) {
  const accionesRaw = document.getElementById('af_acciones').value;
  const body = {
    nombre: document.getElementById('af_nombre').value.trim(),
    estado: document.getElementById('af_estado').value,
    descripcion: document.getElementById('af_desc').value.trim(),
    trigger: document.getElementById('af_trigger').value.trim(),
    acciones: accionesRaw ? accionesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    webhook_url: document.getElementById('af_webhook').value.trim(),
    notas: document.getElementById('af_notas').value
  };
  if (!body.nombre) { toast('El nombre es obligatorio', 'error'); return; }
  try {
    if (id) await API.put(`/agents/${id}`, body);
    else await API.post('/agents', body);
    toast(id ? 'Agente actualizado' : 'Agente documentado', 'success');
    closeModal('agentModal');
    navigate('agents');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteAgent(id) {
  if (!confirm('¿Eliminar este agente?')) return;
  try {
    await API.del(`/agents/${id}`);
    toast('Agente eliminado', 'success');
    navigate('agents');
  } catch (err) { toast(err.message, 'error'); }
}
