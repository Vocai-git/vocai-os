// Asistentes personales de clientes: qué tiene conectado cada uno, cuánto lleva gastado de IA
// en el mes y la cuota fija de VOCAI. El gasto se carga a mano desde la consola del proveedor.
const AC_ESTADOS = { activo: 'teal', pausado: 'amber', baja: 'gray' };
const acUsd = n => 'USD ' + Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const acEur = n => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const acFecha = f => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');

async function renderAsistentesClientes(el) {
  const lista = await API.get('/assistants');
  window._acDatos = lista;
  const activos = lista.filter(a => a.estado === 'activo');
  const gasto = activos.reduce((s, a) => s + Number(a.gasto_mes_usd || 0), 0);
  const cuotas = activos.reduce((s, a) => s + Number(a.cuota_fija_eur || 0), 0);

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Asistentes</h2>
      <button class="btn btn-primary" onclick="acFormulario(null)">+ Nuevo asistente</button>
    </div>

    <div class="kpi-grid ac-kpis">
      <div class="kpi-card"><div class="kpi-label">Asistentes activos</div><div class="kpi-value">${activos.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Gasto de IA del mes</div><div class="kpi-value">${acUsd(gasto)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Cuotas fijas al mes</div><div class="kpi-value">${acEur(cuotas)}</div></div>
    </div>

    <div class="grid-auto">
      ${lista.length === 0
        ? `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🤖</div><div class="empty-title">Sin asistentes cargados</div><div class="empty-sub">Agrega el asistente de cada cliente con sus conectores y su cuota.</div></div>`
        : lista.map(acTarjeta).join('')}
    </div>`;
}

function acTarjeta(a) {
  const conectores = a.conectores || [];
  return `
    <div class="card ac-card">
      <div class="ac-cabecera">
        <div>
          <div class="ac-cliente">${escHtml(a.cliente)}</div>
          <div class="ac-nombre">${escHtml(a.nombre)}${a.equipo ? ' · ' + escHtml(a.equipo) : ''}</div>
        </div>
        <span class="badge badge-${AC_ESTADOS[a.estado] || 'gray'}">${escHtml(a.estado)}</span>
      </div>

      <div class="ac-bloque">
      <div class="ac-etiqueta">Conectores</div>
      <div class="ac-conectores">
        ${conectores.length ? conectores.map(c => `<span class="badge badge-blue">${escHtml(c)}</span>`).join('') : '<span class="ac-vacio">Ninguno cargado</span>'}
      </div>
      </div>

      <div class="ac-importes">
        <div>
          <div class="ac-etiqueta">Gasto de IA</div>
          <div class="ac-importe">${acUsd(a.gasto_mes_usd)}</div>
          <div class="ac-vacio">${a.gasto_actualizado ? 'este mes, al ' + acFecha(a.gasto_actualizado) : 'sin actualizar'}</div>
        </div>
        <div>
          <div class="ac-etiqueta">Cuota fija</div>
          <div class="ac-importe">${acEur(a.cuota_fija_eur)}</div>
          <div class="ac-vacio">al mes</div>
        </div>
      </div>

      <div class="ac-acciones">
        <button class="btn btn-ghost btn-sm" onclick="acFormulario('${a.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="acEliminar('${a.id}')">Eliminar</button>
      </div>
    </div>`;
}

function acFormulario(id) {
  const a = id ? (window._acDatos || []).find(x => x.id === id) : null;
  const hoy = new Date().toISOString().slice(0, 10);
  createModal('acModal', a ? 'Editar asistente' : 'Nuevo asistente', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente *</label>
        <input class="form-input" id="ac_cliente" value="${escHtml(a?.cliente || '')}" placeholder="ej. Luis Gestoría">
      </div>
      <div class="form-group">
        <label class="form-label">Nombre del asistente *</label>
        <input class="form-input" id="ac_nombre" value="${escHtml(a?.nombre || '')}" placeholder="ej. Asistente de Luis">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="ac_estado">
          ${Object.keys(AC_ESTADOS).map(e => `<option value="${e}" ${(a?.estado || 'activo') === e ? 'selected' : ''}>${e.charAt(0).toUpperCase() + e.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Dónde corre</label>
        <input class="form-input" id="ac_equipo" value="${escHtml(a?.equipo || '')}" placeholder="ej. PC del cliente">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Conectores (separados por coma)</label>
      <input class="form-input" id="ac_conectores" value="${escHtml((a?.conectores || []).join(', '))}" placeholder="ej. WhatsApp, Gmail, Calendar, ElevenLabs">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Gasto de IA del mes (USD)</label>
        <input class="form-input" id="ac_gasto" type="number" min="0" step="0.01" value="${a?.gasto_mes_usd ?? ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Gasto actualizado el</label>
        <input class="form-input" id="ac_gasto_fecha" type="date" value="${a?.gasto_actualizado || hoy}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cuota fija al mes (€)</label>
        <input class="form-input" id="ac_cuota" type="number" min="0" step="0.01" value="${a?.cuota_fija_eur ?? ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Nombre de la clave de API</label>
        <input class="form-input" id="ac_clave" value="${escHtml(a?.clave_api || '')}" placeholder="solo el nombre, nunca la clave">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-textarea" id="ac_notas" style="min-height:60px;">${escHtml(a?.notas || '')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('acModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="acGuardar(${a ? `'${a.id}'` : 'null'})">Guardar</button>
  `);
}

async function acGuardar(id) {
  const valor = campo => document.getElementById(campo).value.trim();
  const body = {
    cliente: valor('ac_cliente'),
    nombre: valor('ac_nombre'),
    estado: valor('ac_estado'),
    equipo: valor('ac_equipo'),
    conectores: valor('ac_conectores').split(',').map(s => s.trim()).filter(Boolean),
    gasto_mes_usd: Number(valor('ac_gasto')) || 0,
    gasto_actualizado: valor('ac_gasto_fecha') || null,
    cuota_fija_eur: Number(valor('ac_cuota')) || 0,
    clave_api: valor('ac_clave'),
    notas: valor('ac_notas')
  };
  if (!body.cliente || !body.nombre) { toast('Cliente y nombre son obligatorios', 'error'); return; }
  try {
    if (id) await API.put(`/assistants/${id}`, body);
    else await API.post('/assistants', body);
    toast('Asistente guardado', 'success');
    closeModal('acModal');
    navigate('asistentes');
  } catch (err) { toast(err.message, 'error'); }
}

async function acEliminar(id) {
  if (!confirm('¿Eliminar este asistente del panel?')) return;
  try {
    await API.del(`/assistants/${id}`);
    toast('Asistente eliminado', 'success');
    navigate('asistentes');
  } catch (err) { toast(err.message, 'error'); }
}
