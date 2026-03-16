async function renderProposals(el) {
  const [proposals, clients, templates] = await Promise.all([
    API.get('/proposals'),
    API.get('/clients'),
    API.get('/proposals/templates')
  ]);
  window._proposalsData = proposals;
  window._propTemplates = templates;
  window._propClients = clients;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Propuestas</h2>
      <button class="btn btn-primary" onclick="newProposal()">+ Nueva propuesta</button>
    </div>

    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Título</th><th>Cliente</th><th>Tipo</th><th>Importe</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            ${proposals.length === 0
              ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">Sin propuestas</div></div></td></tr>`
              : proposals.map(p => `
                <tr>
                  <td><div style="font-weight:500;">${escHtml(p.titulo)}</div></td>
                  <td>${escHtml(p.clients?.nombre||'—')}</td>
                  <td><span class="badge badge-blue" style="text-transform:capitalize;">${escHtml(p.tipo||'—')}</span></td>
                  <td>${p.importe ? formatMoney(p.importe) : '—'}</td>
                  <td>${badge(p.estado||'borrador')}</td>
                  <td>${formatDate(p.created_at)}</td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <button class="btn btn-ghost btn-icon btn-sm" onclick="previewProposal('${p.id}')" title="Ver">👁️</button>
                      <button class="btn btn-ghost btn-icon btn-sm" onclick="editProposal('${p.id}')" title="Editar">✏️</button>
                      <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteProposal('${p.id}')" title="Eliminar">🗑️</button>
                    </div>
                  </td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    </div>`;
}

function newProposal() {
  const templates = window._propTemplates || {};
  const clients = window._propClients || [];
  createModal('propModal', 'Nueva propuesta', `
    <div class="form-group">
      <label class="form-label">Tipo de propuesta</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">
        ${Object.entries(templates).map(([key, t]) => `
          <div onclick="selectPropType('${key}')" id="pt_${key}"
               style="padding:14px;background:var(--bg);border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.2s;">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${escHtml(t.nombre)}</div>
            <div style="font-size:12px;color:var(--text-muted);">${(t.servicios||[]).slice(0,2).join(', ')}</div>
          </div>
        `).join('')}
      </div>
      <input type="hidden" id="pf_tipo" value="">
    </div>
    <div class="form-group">
      <label class="form-label">Título *</label>
      <input class="form-input" id="pf_titulo" placeholder="Propuesta de servicios para...">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente</label>
        <select class="form-select" id="pf_cliente">
          <option value="">— Sin cliente —</option>
          ${clients.map(c => `<option value="${c.id}">${escHtml(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Importe (€)</label>
        <input class="form-input" id="pf_importe" type="number" placeholder="0">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción / Contenido</label>
      <textarea class="form-textarea" id="pf_contenido" style="min-height:100px;" placeholder="Describe los servicios, condiciones, etc."></textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('propModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveProposal(null)">Crear propuesta</button>
  `);
}

function selectPropType(key) {
  document.querySelectorAll('[id^="pt_"]').forEach(el => el.style.borderColor = 'var(--border)');
  document.getElementById(`pt_${key}`).style.borderColor = 'var(--blue)';
  document.getElementById('pf_tipo').value = key;
  const t = (window._propTemplates||{})[key];
  if (t) {
    document.getElementById('pf_titulo').value = document.getElementById('pf_titulo').value || `Propuesta ${t.nombre}`;
    if (!document.getElementById('pf_contenido').value) {
      document.getElementById('pf_contenido').value = t.intro + '\n\nServicios incluidos:\n' + (t.servicios||[]).map(s => '• ' + s).join('\n');
    }
  }
}

async function saveProposal(id) {
  const body = {
    titulo: document.getElementById('pf_titulo').value.trim(),
    tipo: document.getElementById('pf_tipo').value || null,
    cliente_id: document.getElementById('pf_cliente').value || null,
    importe: parseFloat(document.getElementById('pf_importe').value) || null,
    contenido: { descripcion: document.getElementById('pf_contenido').value },
    estado: 'borrador'
  };
  if (!body.titulo) { toast('El título es obligatorio', 'error'); return; }
  try {
    if (id) await API.put(`/proposals/${id}`, body);
    else await API.post('/proposals', body);
    toast('Propuesta guardada', 'success');
    closeModal('propModal');
    navigate('proposals');
  } catch (err) { toast(err.message, 'error'); }
}

async function editProposal(id) {
  const p = (window._proposalsData||[]).find(x => x.id === id);
  if (!p) return;
  const clients = window._propClients || [];
  createModal('propEditModal', 'Editar propuesta', `
    <div class="form-group">
      <label class="form-label">Título *</label>
      <input class="form-input" id="pe_titulo" value="${escHtml(p.titulo||'')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente</label>
        <select class="form-select" id="pe_cliente">
          <option value="">— Sin cliente —</option>
          ${clients.map(c => `<option value="${c.id}" ${p.cliente_id===c.id?'selected':''}>${escHtml(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="pe_estado">
          <option value="borrador" ${p.estado==='borrador'?'selected':''}>Borrador</option>
          <option value="enviada" ${p.estado==='enviada'?'selected':''}>Enviada</option>
          <option value="aceptada" ${p.estado==='aceptada'?'selected':''}>Aceptada</option>
          <option value="rechazada" ${p.estado==='rechazada'?'selected':''}>Rechazada</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Importe (€)</label>
      <input class="form-input" id="pe_importe" type="number" value="${p.importe||''}">
    </div>
    <div class="form-group">
      <label class="form-label">Contenido</label>
      <textarea class="form-textarea" id="pe_contenido" style="min-height:120px;">${escHtml(p.contenido?.descripcion||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-danger btn-sm" onclick="deleteProposal('${p.id}')">Eliminar</button>
    <button class="btn btn-secondary" onclick="closeModal('propEditModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="updateProposal('${p.id}')">Guardar cambios</button>
  `);
}

async function updateProposal(id) {
  const body = {
    titulo: document.getElementById('pe_titulo').value.trim(),
    cliente_id: document.getElementById('pe_cliente').value || null,
    estado: document.getElementById('pe_estado').value,
    importe: parseFloat(document.getElementById('pe_importe').value) || null,
    contenido: { descripcion: document.getElementById('pe_contenido').value }
  };
  try {
    await API.put(`/proposals/${id}`, body);
    toast('Propuesta actualizada', 'success');
    closeModal('propEditModal');
    navigate('proposals');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteProposal(id) {
  if (!confirm('¿Eliminar esta propuesta?')) return;
  try {
    await API.del(`/proposals/${id}`);
    toast('Propuesta eliminada', 'success');
    closeModal('propModal'); closeModal('propEditModal');
    navigate('proposals');
  } catch (err) { toast(err.message, 'error'); }
}

function previewProposal(id) {
  const p = (window._proposalsData||[]).find(x => x.id === id);
  if (!p) return;
  const t = (window._propTemplates||{})[p.tipo] || {};
  createModal('propPreviewModal', p.titulo, `
    <div style="background:white;color:#1a1a1a;padding:32px;border-radius:8px;font-family:'Outfit',sans-serif;">
      <div style="display:flex;justify-content:space-between;margin-bottom:32px;align-items:flex-start;">
        <div>
          <img src="/img/logo.png" alt="VOCAI" style="height:48px;mix-blend-mode:multiply;">
          <div style="font-size:12px;color:#666;">Alicante, España · www.vocai.es</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:700;color:#111;">${escHtml(p.titulo)}</div>
          <div style="font-size:13px;color:#666;">${formatDate(p.created_at)}</div>
        </div>
      </div>
      ${p.importe ? `<div style="background:#f0f9ff;padding:16px;border-radius:8px;margin-bottom:24px;"><div style="font-size:12px;color:#666;">INVERSIÓN PROPUESTA</div><div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#1d4ed8;">${formatMoney(p.importe)}</div></div>` : ''}
      ${t.servicios ? `<div style="margin-bottom:24px;"><div style="font-weight:600;margin-bottom:12px;">Servicios incluidos</div>${t.servicios.map(s => `<div style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;">✓ ${escHtml(s)}</div>`).join('')}</div>` : ''}
      <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;">${escHtml(p.contenido?.descripcion||'')}</div>
      <div style="margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
        VOCAI · Camino del Faro 37, Cabo las Huertas, Alicante · www.vocai.es
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('propPreviewModal')">Cerrar</button>
    <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / PDF</button>
  `, 'modal-lg');
}
