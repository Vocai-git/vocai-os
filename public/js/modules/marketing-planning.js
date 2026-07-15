/* ============================================================
   VOCAI OS — Marketing · Planificación
   Reutiliza MKT_PILAR, MKT_MESES y mktCalInjectStyles de
   marketing-calendar.js (se carga antes que este módulo).
   ============================================================ */

let mktPlanDate = new Date();
let mktPlanPropuesta = [];      // plan de historias propuesto por la IA (editable)
let mktPlanProponiendo = false; // spinner mientras la IA arma el plan
let mktPlanProduciendo = false; // evita doble clic mientras se carga una pieza suelta

const MKT_PLAN_CATEGORIAS = {
  novedad: 'Novedad', educativo: 'Educativo', caso: 'Caso real', interno: 'VOCAI por dentro',
};
const MKT_PLAN_DISENOS = { clasico: 'Clásico', brutal: 'Brutal', aurora: 'Aurora' };

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

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title" style="margin-bottom:6px;">Planificar historias con IA</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.5;">
        Decile cuántas historias querés para ${MKT_MESES[m]} y la IA arma el plan con los
        objetivos del mes y el banco de temas del Radar. Editás lo que quieras y lo cargás
        al calendario como ideas — después las producís una a una desde el Calendario.
      </p>
      <div class="form-row">
        <div class="form-group" style="max-width:140px;">
          <label class="form-label">Cantidad</label>
          <input class="form-input" type="number" id="mplan_cantidad" min="1" max="40" value="20">
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label">Indicaciones (opcional)</label>
          <input class="form-input" id="mplan_indicaciones"
            placeholder="ej. este mes empujamos el estudio · nada de novedades técnicas">
        </div>
      </div>
      <button class="btn btn-primary" onclick="mktPlanProponer()" ${mktPlanProponiendo ? 'disabled' : ''}>
        ${mktPlanProponiendo ? 'Armando el plan…' : '✨ Proponer plan'}
      </button>
      <div id="mplan_propuesta">${mktPlanPropuestaHTML()}</div>
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

/* ── Planificador de historias con IA ──────────────────────── */

function mktPlanPropuestaHTML() {
  if (mktPlanProponiendo) {
    return `<div style="text-align:center;padding:26px 0 8px;">
      <div class="loader"><div class="spinner"></div></div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:12px;">
        La IA está armando el plan… puede tardar medio minuto.</div>
    </div>`;
  }
  if (!mktPlanPropuesta.length) return '';
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) =>
    `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const filas = mktPlanPropuesta.map((p, i) => `
    <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;
                border-left:3px solid ${(MKT_PILAR[p.pilar] || MKT_PILAR.ia).color};">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div class="form-group" style="margin:0;max-width:150px;">
          <label class="form-label" style="font-size:10px;">Fecha</label>
          <input class="form-input" type="date" value="${p.fecha}"
            onchange="mktPlanEditar(${i},'fecha',this.value)">
        </div>
        <div class="form-group" style="margin:0;flex:1;min-width:220px;">
          <label class="form-label" style="font-size:10px;">Título</label>
          <input class="form-input" value="${escHtml(p.titulo)}"
            onchange="mktPlanEditar(${i},'titulo',this.value)">
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:10px;">Pilar</label>
          <select class="form-select" onchange="mktPlanEditar(${i},'pilar',this.value)">
            ${Object.entries(MKT_PILAR).map(([k, v]) =>
              `<option value="${k}" ${k === p.pilar ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:10px;">Categoría</label>
          <select class="form-select" onchange="mktPlanEditar(${i},'categoria',this.value)">
            ${opt(MKT_PLAN_CATEGORIAS, p.categoria)}</select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:10px;">Diseño</label>
          <select class="form-select" onchange="mktPlanEditar(${i},'diseno',this.value)">
            ${opt(MKT_PLAN_DISENOS, p.diseno)}</select>
        </div>
        <button class="btn btn-primary" style="margin-left:auto;" ${mktPlanProduciendo ? 'disabled' : ''}
          title="La carga al calendario y abre el Generador con esta idea"
          onclick="mktPlanProducir(${i})">🎨 Producir</button>
        <button class="btn btn-secondary" title="Quitar del plan"
          onclick="mktPlanQuitar(${i})">✕</button>
      </div>
      ${p.angulo ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.4;">
        ${escHtml(p.angulo)}</div>` : ''}
    </div>`).join('');
  return `
    <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;
                  gap:10px;margin-bottom:14px;">
        <div style="font-weight:700;font-size:14px;">Propuesta · ${mktPlanPropuesta.length} historias</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="mktPlanDescartar()">Descartar</button>
          <button class="btn btn-primary" onclick="mktPlanCargar()">
            Cargar ${mktPlanPropuesta.length} al calendario</button>
        </div>
      </div>
      ${filas}
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5;">
        Se cargan como <b>ideas</b> en Calendario · Historias. Nada se publica solo:
        cada una se produce desde el calendario y la publicás vos.
      </div>
    </div>`;
}

function mktPlanRepintarPropuesta() {
  const el = document.getElementById('mplan_propuesta');
  if (el) el.innerHTML = mktPlanPropuestaHTML();
}

async function mktPlanProponer() {
  const y = mktPlanDate.getFullYear();
  const m = mktPlanDate.getMonth();
  const cantidad = parseInt(document.getElementById('mplan_cantidad').value) || 20;
  const indicaciones = document.getElementById('mplan_indicaciones').value.trim();
  mktPlanProponiendo = true;
  mktPlanRepintarPropuesta();
  try {
    const data = await API.post('/marketing-planning/proponer', {
      mes: `${y}-${String(m + 1).padStart(2, '0')}`, cantidad, indicaciones,
    });
    mktPlanPropuesta = data.piezas || [];
    toast(`Plan propuesto: ${mktPlanPropuesta.length} historias — revisalo y cargalo`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktPlanProponiendo = false;
    mktPlanRepintarPropuesta();
  }
}

function mktPlanEditar(i, campo, valor) {
  if (mktPlanPropuesta[i]) mktPlanPropuesta[i][campo] = valor;
  if (campo === 'pilar') mktPlanRepintarPropuesta();
}

/* Carga UNA pieza de la propuesta al calendario y abre el Generador
   con la idea precargada y la placa enganchada a esa pieza (mismo
   circuito que el botón Producir del calendario). */
async function mktPlanProducir(i) {
  const p = mktPlanPropuesta[i];
  if (!p || mktPlanProduciendo) return;
  mktPlanProduciendo = true;
  mktPlanRepintarPropuesta();
  try {
    const r = await API.post('/marketing-planning/cargar', { piezas: [p] });
    const creada = (r.piezas || [])[0];
    if (!creada) throw new Error('No se pudo cargar la pieza al calendario');
    mktPlanPropuesta.splice(i, 1);

    // Precargar el Generador igual que mktCalProducir (marketing-calendar.js)
    mktGenSeccion = 'historias';
    mktGenIdea = p.titulo + (p.angulo ? '. ' + p.angulo : '');
    mktGenCategoria = p.categoria || 'educativo';
    if (MKT_GEN_DISENOS[p.diseno]) mktGenDiseno = p.diseno;
    mktGenUltimo = null;
    mktGenPiezaDestino = { id: creada.id, fecha: creada.fecha, titulo: creada.titulo };
    toast('Idea cargada al calendario — producila en el Generador', 'success');
    navigate('marketing-generator');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktPlanProduciendo = false;
    mktPlanRepintarPropuesta();
  }
}

function mktPlanQuitar(i) {
  mktPlanPropuesta.splice(i, 1);
  mktPlanRepintarPropuesta();
}

function mktPlanDescartar() {
  if (mktPlanPropuesta.length && !confirm('¿Descartar la propuesta completa?')) return;
  mktPlanPropuesta = [];
  mktPlanRepintarPropuesta();
}

async function mktPlanCargar() {
  if (!mktPlanPropuesta.length) return;
  try {
    const r = await API.post('/marketing-planning/cargar', { piezas: mktPlanPropuesta });
    toast(`${r.creadas} historias cargadas al calendario como ideas`, 'success');
    mktPlanPropuesta = [];
    mktCalCanal = 'historias';
    mktCalDate = new Date(mktPlanDate);
    navigate('marketing-calendar');
  } catch (err) { toast(err.message, 'error'); }
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
