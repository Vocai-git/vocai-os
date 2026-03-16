async function renderGoals(el) {
  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const data = await API.get(`/goals?mes=${mesActual}`);

  const objetivo = data.goal?.objetivo || 0;
  const actual = data.actual || 0;
  const pct = objetivo > 0 ? Math.min(100, Math.round((actual / objetivo) * 100)) : 0;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Metas</h2>
      <button class="btn btn-primary" onclick="setGoal('${mesActual}', ${objetivo})">
        ${objetivo > 0 ? '✏️ Editar meta' : '+ Establecer meta'}
      </button>
    </div>

    <div class="goal-meter" style="margin-bottom:20px;">
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;">Meta de ${mesActual}</div>
      <div class="goal-numbers">
        <div>
          <div class="goal-current">${formatMoney(actual)}</div>
          <div style="font-size:13px;color:var(--text-muted);">facturado y cobrado</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;">${formatMoney(objetivo)}</div>
          <div class="goal-target">objetivo del mes</div>
        </div>
      </div>
      <div class="goal-bar">
        <div class="goal-bar-fill" style="width:${pct}%;"></div>
      </div>
      <div class="goal-pct">${pct}% conseguido</div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px;">📊 Resumen del mes</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;padding:12px;background:var(--bg);border-radius:8px;">
            <span style="font-size:14px;">Facturado y cobrado</span>
            <strong style="color:var(--teal);">${formatMoney(actual)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:12px;background:var(--bg);border-radius:8px;">
            <span style="font-size:14px;">Meta mensual</span>
            <strong style="color:var(--blue);">${formatMoney(objetivo)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:12px;background:var(--bg);border-radius:8px;">
            <span style="font-size:14px;">Diferencia</span>
            <strong style="color:${actual >= objetivo ? 'var(--teal)' : 'var(--rose)'};">${formatMoney(actual - objetivo)}</strong>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:16px;">🎯 Estado</div>
        <div style="text-align:center;padding:20px;">
          <div style="font-size:64px;margin-bottom:12px;">
            ${pct >= 100 ? '🎉' : pct >= 75 ? '💪' : pct >= 50 ? '📈' : pct >= 25 ? '🔥' : '🚀'}
          </div>
          <div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:700;margin-bottom:4px;">${pct}%</div>
          <div style="font-size:14px;color:var(--text-muted);">
            ${pct >= 100 ? '¡Meta superada!' : pct >= 75 ? 'Muy cerca de la meta' : pct >= 50 ? 'Buen ritmo' : 'Hay que acelerar'}
          </div>
          ${objetivo === 0 ? '<div style="font-size:13px;color:var(--amber);margin-top:8px;">⚠️ No hay meta establecida para este mes</div>' : ''}
        </div>
      </div>
    </div>`;
}

function setGoal(mes, currentGoal) {
  createModal('goalModal', 'Establecer meta mensual', `
    <div class="form-group">
      <label class="form-label">Mes</label>
      <input class="form-input" id="gf_mes" type="month" value="${mes}">
    </div>
    <div class="form-group">
      <label class="form-label">Objetivo de facturación (€) *</label>
      <input class="form-input" id="gf_obj" type="number" step="100" value="${currentGoal||''}" placeholder="5000">
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <input class="form-input" id="gf_desc" placeholder="ej. Cerrar 2 clientes nuevos">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal('goalModal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveGoal()">Guardar meta</button>
  `, 'modal-sm');
}

async function saveGoal() {
  const body = {
    mes: document.getElementById('gf_mes').value,
    objetivo: parseFloat(document.getElementById('gf_obj').value) || 0,
    descripcion: document.getElementById('gf_desc').value
  };
  if (!body.objetivo) { toast('El objetivo es obligatorio', 'error'); return; }
  try {
    await API.post('/goals', body);
    toast('Meta guardada', 'success');
    closeModal('goalModal');
    navigate('goals');
  } catch (err) { toast(err.message, 'error'); }
}
