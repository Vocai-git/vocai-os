const CONTRACT_TEMPLATES = {
  estudio: {
    nombre: 'Contrato de Servicios de Estudio',
    clausulas: [
      'El PROVEEDOR (VOCAI) se compromete a prestar los servicios de producción audiovisual acordados.',
      'La duración del contrato será la establecida en el presupuesto adjunto.',
      'El pago se realizará según las condiciones indicadas en la propuesta comercial.',
      'El CLIENTE autoriza el uso de su imagen y voz con fines de producción del contenido contratado.',
      'Los derechos de propiedad intelectual del material producido pertenecerán al CLIENTE una vez efectuado el pago completo.',
      'Cualquier modificación del alcance del proyecto requerirá un nuevo presupuesto.',
      'Ambas partes se comprometen a mantener la confidencialidad de la información compartida.'
    ]
  },
  marketing: {
    nombre: 'Contrato de Servicios de Marketing Digital',
    clausulas: [
      'El PROVEEDOR (VOCAI) se compromete a gestionar los servicios de marketing digital acordados.',
      'El contrato tiene una duración mínima de 3 meses, renovable automáticamente.',
      'El CLIENTE facilitará los accesos necesarios a sus plataformas digitales.',
      'Los informes de resultados se entregarán mensualmente.',
      'El pago mensual se realizará por adelantado antes del día 5 de cada mes.',
      'La cancelación anticipada requiere preaviso de 30 días.',
      'VOCAI no se hace responsable de cambios en algoritmos de plataformas externas.'
    ]
  },
  ia: {
    nombre: 'Contrato de Servicios de Inteligencia Artificial',
    clausulas: [
      'El PROVEEDOR (VOCAI) desarrollará las automatizaciones e integraciones de IA acordadas.',
      'Los desarrollos se entregarán en los plazos establecidos en el plan de proyecto.',
      'El CLIENTE facilitará las credenciales y accesos necesarios para las integraciones.',
      'Se incluyen 30 días de soporte técnico tras la entrega de cada desarrollo.',
      'El código y las automatizaciones desarrolladas son propiedad del CLIENTE una vez pagado.',
      'VOCAI mantendrá la confidencialidad de todos los datos del CLIENTE.',
      'Cualquier ampliación del alcance se cotizará por separado.'
    ]
  }
};

async function renderContracts(el) {
  const clients = await API.get('/clients');
  window._contractClients = clients;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Contratos</h2>
      <button class="btn btn-primary" onclick="newContract()">+ Generar contrato</button>
    </div>

    <div class="grid-3" style="margin-bottom:24px;">
      ${Object.entries(CONTRACT_TEMPLATES).map(([key, t]) => `
        <div class="card" style="cursor:pointer;transition:all 0.2s;" onclick="newContractType('${key}')"
             onmouseenter="this.style.borderColor='var(--blue)'" onmouseleave="this.style.borderColor='var(--border)'">
          <div style="font-size:28px;margin-bottom:12px;">${key==='estudio'?'🎙️':key==='marketing'?'📱':'🤖'}</div>
          <div style="font-weight:600;font-size:15px;margin-bottom:4px;">${t.nombre}</div>
          <div style="font-size:12px;color:var(--text-muted);">${t.clausulas.length} cláusulas incluidas</div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div style="color:var(--text-muted);font-size:14px;padding:20px;text-align:center;">
        💡 Selecciona un tipo de contrato arriba para generar y personalizar la plantilla
      </div>
    </div>`;
}

function newContract() { newContractType('estudio'); }

function newContractType(type) {
  const t = CONTRACT_TEMPLATES[type];
  const clients = window._contractClients || [];
  if (!t) return;

  createModal('contractModal', `Generar contrato — ${t.nombre}`, `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente *</label>
        <select class="form-select" id="ct_cliente" onchange="updateContractPreview()">
          <option value="">— Seleccionar cliente —</option>
          ${clients.map(c => `<option value="${c.id}" data-nombre="${escHtml(c.nombre)}">${escHtml(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de inicio</label>
        <input class="form-input" id="ct_fecha" type="date" value="${new Date().toISOString().split('T')[0]}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Importe mensual / total (€)</label>
        <input class="form-input" id="ct_importe" type="number" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Duración</label>
        <input class="form-input" id="ct_duracion" placeholder="ej. 6 meses, indefinido">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Cláusulas (editable)</label>
      <textarea class="form-textarea" id="ct_clausulas" style="min-height:180px;">${t.clausulas.map((c,i) => `${i+1}. ${c}`).join('\n\n')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('contractModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="previewContract('${type}')">👁️ Vista previa e imprimir</button>
  `, 'modal-lg');
}

function previewContract(type) {
  const t = CONTRACT_TEMPLATES[type];
  const select = document.getElementById('ct_cliente');
  const clientNombre = select.options[select.selectedIndex]?.dataset?.nombre || 'CLIENTE';
  const fecha = document.getElementById('ct_fecha').value;
  const importe = document.getElementById('ct_importe').value;
  const duracion = document.getElementById('ct_duracion').value;
  const clausulas = document.getElementById('ct_clausulas').value;

  closeModal('contractModal');

  createModal('contractPreviewModal', t.nombre, `
    <div id="contractDoc" style="background:white;color:#1a1a1a;padding:40px;font-family:'Outfit',sans-serif;line-height:1.8;">
      <div style="text-align:center;margin-bottom:40px;">
        <div style="font-family:'Syne',sans-serif;font-size:32px;font-weight:800;">VOCAI</div>
        <div style="font-size:18px;font-weight:600;margin:12px 0;">${escHtml(t.nombre)}</div>
        <div style="font-size:13px;color:#666;">Alicante, ${formatDate(fecha)}</div>
      </div>

      <div style="margin-bottom:24px;padding:16px;background:#f8f9fa;border-radius:8px;">
        <p><strong>PROVEEDOR:</strong> VOCAI · CIF: XXXXXXXX · Camino del Faro 37, Cabo las Huertas, Alicante</p>
        <p style="margin-top:8px;"><strong>CLIENTE:</strong> ${escHtml(clientNombre)}</p>
        ${importe ? `<p style="margin-top:8px;"><strong>IMPORTE:</strong> ${formatMoney(parseFloat(importe))}</p>` : ''}
        ${duracion ? `<p style="margin-top:8px;"><strong>DURACIÓN:</strong> ${escHtml(duracion)}</p>` : ''}
      </div>

      <div style="margin-bottom:24px;">
        <div style="font-weight:700;font-size:16px;margin-bottom:16px;">CLÁUSULAS</div>
        ${clausulas.split('\n\n').filter(c => c.trim()).map(c => `<p style="margin-bottom:12px;font-size:14px;">${escHtml(c)}</p>`).join('')}
      </div>

      <div style="margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px;">
        <div>
          <div style="font-weight:600;margin-bottom:8px;">VOCAI</div>
          <div style="border-bottom:1px solid #333;height:50px;margin-bottom:8px;"></div>
          <div style="font-size:12px;color:#666;">Firma y fecha</div>
        </div>
        <div>
          <div style="font-weight:600;margin-bottom:8px;">${escHtml(clientNombre)}</div>
          <div style="border-bottom:1px solid #333;height:50px;margin-bottom:8px;"></div>
          <div style="font-size:12px;color:#666;">Firma y fecha</div>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('contractPreviewModal')">Volver</button>
    <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  `, 'modal-lg');
}
