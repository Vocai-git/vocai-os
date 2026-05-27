async function renderInvoices(el) {
  const [invoices, clients] = await Promise.all([API.get('/invoices'), API.get('/clients')]);

  const totals = {
    cobrada: invoices.filter(i=>i.estado==='cobrada').reduce((s,i)=>s+(i.total||0),0),
    enviada: invoices.filter(i=>i.estado==='enviada').reduce((s,i)=>s+(i.total||0),0),
    vencida: invoices.filter(i=>i.estado==='vencida').reduce((s,i)=>s+(i.total||0),0),
  };

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Facturas</h2>
      <button class="btn btn-primary" onclick="newInvoice()">+ Nueva factura</button>
    </div>

    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">
      <div class="kpi-card teal"><div class="kpi-label">Cobrado</div><div class="kpi-value" style="font-size:22px;">${formatMoney(totals.cobrada)}</div></div>
      <div class="kpi-card blue"><div class="kpi-label">Pendiente de cobro</div><div class="kpi-value" style="font-size:22px;">${formatMoney(totals.enviada)}</div></div>
      <div class="kpi-card rose"><div class="kpi-label">Vencido</div><div class="kpi-value" style="font-size:22px;">${formatMoney(totals.vencida)}</div></div>
    </div>

    <div class="card">
      <div class="filters" style="margin-bottom:16px;">
        <select class="filter-select" id="invEstado" onchange="filterInvoices()">
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="enviada">Enviada</option>
          <option value="cobrada">Cobrada</option>
          <option value="vencida">Vencida</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Número</th><th>Cliente</th><th>Concepto</th><th>Base</th><th>IVA</th><th>IRPF</th><th>Total</th><th>Estado</th><th>Fecha</th><th></th>
          </tr></thead>
          <tbody id="invoicesTableBody">
            ${invoices.map(i => invoiceRow(i)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  window._invoicesData = invoices;
}

function invoiceRow(i) {
  return `<tr>
    <td><span style="font-family:'Syne',sans-serif;font-size:13px;">${escHtml(i.numero||'—')}</span></td>
    <td>${escHtml(i.clients?.nombre||'—')}</td>
    <td style="max-width:200px;"><div class="truncate">${escHtml(i.concepto||'—')}</div></td>
    <td>${formatMoney(i.importe)}</td>
    <td style="color:var(--teal);">+${formatMoney(i.iva)}</td>
    <td style="color:var(--rose);">-${formatMoney(i.irpf)}</td>
    <td><strong>${formatMoney(i.total)}</strong></td>
    <td>${badge(i.estado||'borrador')}</td>
    <td>${formatDate(i.fecha)}</td>
    <td>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="previewInvoice('${i.id}')" title="Ver">👁️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="editInvoice('${i.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteInvoice('${i.id}')" title="Eliminar">🗑️</button>
      </div>
    </td>
  </tr>`;
}

function filterInvoices() {
  const estado = document.getElementById('invEstado').value;
  const filtered = estado ? window._invoicesData.filter(i => i.estado === estado) : window._invoicesData;
  document.getElementById('invoicesTableBody').innerHTML = filtered.map(i => invoiceRow(i)).join('');
}

function newInvoice() { showInvoiceForm(null); }

async function editInvoice(id) {
  const inv = await API.get(`/invoices/${id}`);
  showInvoiceForm(inv);
}

async function showInvoiceForm(data) {
  const clients = await API.get('/clients');
  const isEdit = !!data;
  createModal('invoiceModal', isEdit ? 'Editar factura' : 'Nueva factura', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente</label>
        <select class="form-select" id="if_cliente">
          <option value="">— Sin cliente —</option>
          ${clients.map(c => `<option value="${c.id}" ${data?.cliente_id===c.id?'selected':''}>${escHtml(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="if_estado">
          <option value="borrador" ${data?.estado==='borrador'?'selected':''}>Borrador</option>
          <option value="enviada" ${data?.estado==='enviada'?'selected':''}>Enviada</option>
          <option value="cobrada" ${data?.estado==='cobrada'?'selected':''}>Cobrada</option>
          <option value="vencida" ${data?.estado==='vencida'?'selected':''}>Vencida</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Concepto *</label>
      <input class="form-input" id="if_concepto" value="${escHtml(data?.concepto||'')}" placeholder="Descripción del servicio">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Importe base (€) * <span style="font-size:11px;color:#888;font-weight:400;">bruto, sin IVA</span></label>
        <input class="form-input" id="if_importe" type="number" step="0.01" value="${data?.importe||''}" placeholder="0.00" oninput="calcInvoice()">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="if_fecha" type="date" value="${data?.fecha||new Date().toISOString().split('T')[0]}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="if_lleva_iva" ${(data?.iva||0) > 0 ? 'checked' : ''} style="width:16px;height:16px;" onchange="calcInvoice()">
        <label for="if_lleva_iva" style="font-size:14px;cursor:pointer;">Lleva IVA (21%)</label>
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="if_lleva_irpf" ${(data?.irpf||0) > 0 ? 'checked' : ''} style="width:16px;height:16px;" onchange="calcInvoice()">
        <label for="if_lleva_irpf" style="font-size:14px;cursor:pointer;">Lleva IRPF (-15%)</label>
      </div>
    </div>
    <div style="background:var(--bg);border-radius:8px;padding:16px;margin-top:8px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;">
        <span>Base imponible</span><span id="calc_base">${formatMoney(data?.importe||0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;color:var(--teal);">
        <span>IVA 21%</span><span id="calc_iva">${formatMoney(data?.iva||0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:14px;color:var(--rose);">
        <span>IRPF -15%</span><span id="calc_irpf">-${formatMoney(data?.irpf||0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:700;border-top:1px solid var(--border);padding-top:10px;">
        <span>Total</span><span id="calc_total">${formatMoney(data?.total != null ? data.total : (data?.importe||0))}</span>
      </div>
    </div>
    <div class="form-group" style="margin-top:16px;">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="if_notas" style="min-height:60px;">${escHtml(data?.notas||'')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('invoiceModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveInvoice(${isEdit ? `'${data.id}'` : 'null'})">${isEdit ? 'Guardar cambios' : 'Crear factura'}</button>
  `);
}

function calcInvoice() {
  const base = parseFloat(document.getElementById('if_importe')?.value) || 0;
  const llevaIva  = document.getElementById('if_lleva_iva')?.checked;
  const llevaIrpf = document.getElementById('if_lleva_irpf')?.checked;
  const iva  = llevaIva  ? base * 0.21 : 0;
  const irpf = llevaIrpf ? base * 0.15 : 0;
  const total = base + iva - irpf;
  document.getElementById('calc_base').textContent = formatMoney(base);
  document.getElementById('calc_iva').textContent = formatMoney(iva);
  document.getElementById('calc_irpf').textContent = '-' + formatMoney(irpf);
  document.getElementById('calc_total').textContent = formatMoney(total);
}

async function saveInvoice(id) {
  const base = parseFloat(document.getElementById('if_importe').value) || 0;
  const llevaIva  = document.getElementById('if_lleva_iva').checked;
  const llevaIrpf = document.getElementById('if_lleva_irpf').checked;
  const iva  = llevaIva  ? +(base * 0.21).toFixed(2) : 0;
  const irpf = llevaIrpf ? +(base * 0.15).toFixed(2) : 0;
  const total = +(base + iva - irpf).toFixed(2);
  const body = {
    cliente_id: document.getElementById('if_cliente').value || null,
    concepto: document.getElementById('if_concepto').value.trim(),
    importe: base,
    iva,
    irpf,
    total,
    estado: document.getElementById('if_estado').value,
    fecha: document.getElementById('if_fecha').value,
    notas: document.getElementById('if_notas').value
  };
  if (!body.concepto || !body.importe) { toast('Concepto e importe son obligatorios', 'error'); return; }
  try {
    if (id) await API.put(`/invoices/${id}`, body);
    else await API.post('/invoices', body);
    toast(id ? 'Factura actualizada' : 'Factura creada', 'success');
    closeModal('invoiceModal');
    navigate(typeof currentModule !== 'undefined' && currentModule ? currentModule : 'invoices');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteInvoice(id) {
  if (!confirm('¿Eliminar esta factura?')) return;
  try {
    await API.del(`/invoices/${id}`);
    toast('Factura eliminada', 'success');
    navigate(typeof currentModule !== 'undefined' && currentModule ? currentModule : 'invoices');
  } catch (err) { toast(err.message, 'error'); }
}

async function previewInvoice(id) {
  const inv = await API.get(`/invoices/${id}`);
  const client = inv.clients || {};
  createModal('invPreviewModal', `Factura ${inv.numero || ''}`, `
    <div style="background:white;color:#1a1a1a;padding:32px;border-radius:8px;font-family:'Outfit',sans-serif;">
      <div style="display:flex;justify-content:space-between;margin-bottom:32px;">
        <div>
          <img src="/img/logo.png" alt="VOCAI" style="height:48px;">
          <div style="font-size:12px;color:#666;margin-top:4px;">Camino del Faro 37, Cabo las Huertas<br>Alicante, España</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;">${escHtml(inv.numero||'BORRADOR')}</div>
          <div style="font-size:13px;color:#666;">Fecha: ${formatDate(inv.fecha)}</div>
        </div>
      </div>
      <div style="margin-bottom:24px;padding:16px;background:#f8f9fa;border-radius:8px;">
        <div style="font-size:12px;color:#666;margin-bottom:4px;">FACTURAR A</div>
        <div style="font-weight:600;font-size:16px;">${escHtml(client.nombre||'—')}</div>
        ${client.email ? `<div style="font-size:13px;color:#666;">${escHtml(client.email)}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead><tr style="border-bottom:2px solid #e0e0e0;">
          <th style="text-align:left;padding:8px 0;font-size:12px;color:#666;">CONCEPTO</th>
          <th style="text-align:right;padding:8px 0;font-size:12px;color:#666;">IMPORTE</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:12px 0;font-size:14px;">${escHtml(inv.concepto||'—')}</td><td style="text-align:right;padding:12px 0;">${formatMoney(inv.importe)}</td></tr>
        </tbody>
      </table>
      <div style="border-top:1px solid #e0e0e0;padding-top:16px;max-width:240px;margin-left:auto;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;"><span>Subtotal</span><span>${formatMoney(inv.importe)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;color:#888;"><span>IVA (21%)</span><span>+${formatMoney(inv.iva)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:14px;color:#FF6B6B;"><span>IRPF (15%)</span><span>-${formatMoney(inv.irpf)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;border-top:2px solid #1a1a1a;padding-top:10px;"><span>TOTAL</span><span>${formatMoney(inv.total)}</span></div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('invPreviewModal')">Cerrar</button>
    <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / PDF</button>
  `, 'modal-lg');
}
