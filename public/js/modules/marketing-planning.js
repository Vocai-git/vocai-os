/* ============================================================
   VOCAI OS — Marketing · Planificación
   Reutiliza MKT_PILAR, MKT_MESES y mktCalInjectStyles de
   marketing-calendar.js (se carga antes que este módulo).
   ============================================================ */

let mktPlanDate = new Date();

async function renderMarketingPlanning(el) {
  mktCalInjectStyles();
  const y = mktPlanDate.getFullYear();
  const m = mktPlanDate.getMonth();
  const mesStr = `${y}-${String(m + 1).padStart(2, '0')}`;

  let data;
  try {
    data = await API.get(`/marketing-planning?mes=${mesStr}`);
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">Error al cargar: ${escHtml(err.message)}</div>`;
    return;
  }
  const plan = data.plan || {};
  const mix = data.mix || { ia: 0, estudio: 0, casos: 0, personas: 0 };
  const total = data.total || 0;

  const barras = Object.entries(MKT_PILAR).map(([k, v]) => {
    const n = mix[k] || 0;
    const pct = total > 0 ? Math.round((n / total) * 100) : 0;
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span>${v.label}</span>
          <span style="color:var(--text-muted);">
            <b style="color:var(--text);">${n}</b> piezas · ${pct}%
          </span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%;background:${v.color};"></div>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Planificación</h2>
      <div class="mkt-monthnav">
        <button onclick="mktPlanNav(-1)">&lsaquo;</button>
        <div class="mkt-monthlabel">${MKT_MESES[m]} ${y}</div>
        <button onclick="mktPlanNav(1)">&rsaquo;</button>
        <button onclick="mktPlanToday()" style="padding:0 12px;font-size:12px;">Hoy</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title" style="margin-bottom:6px;">Objetivos del mes</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">
        Se llena en la última semana del mes anterior. Del objetivo sale el foco,
        y del foco el mix de piezas del calendario.
      </p>
      <div class="form-group">
        <label class="form-label">1 · Qué pasó el mes anterior</label>
        <textarea class="form-textarea" id="mp_anterior"
          placeholder="Funcionó… / No funcionó… / Pivoteamos…">${escHtml(plan.mes_anterior)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">2 · Objetivos de este mes (1 a 3)</label>
        <textarea class="form-textarea" id="mp_objetivos"
          placeholder="Objetivos concretos del mes">${escHtml(plan.objetivos)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">3 · Foco del mes (una frase)</label>
        <input class="form-input" id="mp_foco" value="${escHtml(plan.foco)}"
          placeholder="ej. Presentarnos: que en 30 seg se entienda qué es VOCAI">
      </div>
      <div class="form-group">
        <label class="form-label">5 · Puntual del mes</label>
        <input class="form-input" id="mp_puntual" value="${escHtml(plan.puntual)}"
          placeholder="Campaña, evento, lanzamiento o pauta">
      </div>
      <button class="btn btn-primary" onclick="mktPlanSave()">Guardar objetivos</button>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:6px;">4 · Mix de pilares — ${MKT_MESES[m]}</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">
        Calculado en vivo desde el calendario: ${total} piezas planificadas este mes.
      </p>
      ${total > 0 ? barras : `
        <div class="empty-state" style="padding:20px;">
          <div class="empty-sub">Todavía no hay piezas en el calendario de este mes.</div>
        </div>`}
    </div>
  `;
}

function mktPlanNav(delta) {
  mktPlanDate = new Date(mktPlanDate.getFullYear(), mktPlanDate.getMonth() + delta, 1);
  navigate('marketing-planning');
}
function mktPlanToday() {
  mktPlanDate = new Date();
  navigate('marketing-planning');
}

async function mktPlanSave() {
  const y = mktPlanDate.getFullYear();
  const m = mktPlanDate.getMonth();
  const body = {
    mes: `${y}-${String(m + 1).padStart(2, '0')}`,
    mes_anterior: document.getElementById('mp_anterior').value.trim(),
    objetivos:    document.getElementById('mp_objetivos').value.trim(),
    foco:         document.getElementById('mp_foco').value.trim(),
    puntual:      document.getElementById('mp_puntual').value.trim(),
  };
  try {
    await API.post('/marketing-planning', body);
    toast('Objetivos guardados', 'success');
  } catch (err) { toast(err.message, 'error'); }
}
