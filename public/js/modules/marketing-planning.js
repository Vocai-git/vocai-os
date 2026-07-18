/* ============================================================
   VOCAI OS — Marketing · Planificación
   Reutiliza MKT_PILAR, MKT_MESES y mktCalInjectStyles de
   marketing-calendar.js (se carga antes que este módulo).
   ============================================================ */

let mktPlanDate = new Date();
let mktPlanPropuesta = [];      // plan de historias propuesto por la IA (editable)
let mktPlanProponiendo = false; // spinner mientras la IA arma el plan
let mktPlanProduciendo = false; // evita doble clic mientras se carga una pieza suelta
let mktPlanSemana = mktPlanInicioSemana(new Date());
let mktPlanSemanalSemanaCargada = '';
let mktPlanSemanalGenerando = false;
let mktPlanSemanalCargando = false;
let mktPlanSemanalInputs = {
  prioridad: '', contexto: '', materiales: '', disponibilidad: '', cantidad: 3,
};
let mktPlanSemanalPropuesta = { foco: '', criterio: '', piezas: [] };

const MKT_PLAN_CATEGORIAS = {
  novedad: 'Novedad', educativo: 'Educativo', caso: 'Caso real', interno: 'VOCAI por dentro',
};
const MKT_PLAN_DISENOS = { clasico: 'Clásico', brutal: 'Brutal', aurora: 'Aurora' };

async function renderMarketingPlanning(el) {
  mktPlanSemanalAsegurarSemana();
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

    ${mktPlanSemanalCardHTML()}

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

/* ── Cerebro semanal ────────────────────────────────────────── */

function mktPlanFechaISO(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(String(fecha) + 'T12:00:00');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dia;
}

function mktPlanInicioSemana(fecha) {
  const d = fecha instanceof Date ? new Date(fecha) : new Date(String(fecha) + 'T12:00:00');
  d.setHours(12, 0, 0, 0);
  const dia = d.getDay() || 7;
  d.setDate(d.getDate() - dia + 1);
  return mktPlanFechaISO(d);
}

function mktPlanSumarDias(fecha, dias) {
  const d = new Date(String(fecha) + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return mktPlanFechaISO(d);
}

function mktPlanSemanalClave() {
  return 'vocai-plan-semanal:' + mktPlanSemana;
}

function mktPlanSemanalAsegurarSemana(forzar = false) {
  if (!forzar && mktPlanSemanalSemanaCargada === mktPlanSemana) return;
  mktPlanSemanalSemanaCargada = mktPlanSemana;
  mktPlanSemanalInputs = {
    prioridad: '', contexto: '', materiales: '', disponibilidad: '', cantidad: 3,
  };
  mktPlanSemanalPropuesta = { foco: '', criterio: '', piezas: [] };
  try {
    const guardado = JSON.parse(localStorage.getItem(mktPlanSemanalClave()) || 'null');
    if (guardado && guardado.inputs) {
      mktPlanSemanalInputs = { ...mktPlanSemanalInputs, ...guardado.inputs };
      mktPlanSemanalInputs.cantidad = Math.min(
        Math.max(parseInt(mktPlanSemanalInputs.cantidad) || 3, 2), 7
      );
    }
    if (guardado && guardado.propuesta && Array.isArray(guardado.propuesta.piezas)) {
      mktPlanSemanalPropuesta = guardado.propuesta;
    }
  } catch (e) { /* localStorage puede no estar disponible */ }
}

function mktPlanSemanalGuardar() {
  try {
    localStorage.setItem(mktPlanSemanalClave(), JSON.stringify({
      inputs: mktPlanSemanalInputs,
      propuesta: mktPlanSemanalPropuesta,
    }));
  } catch (e) { /* el borrador sigue vivo en memoria */ }
}

function mktPlanSemanalLeerInputs() {
  const valor = id => (document.getElementById(id) || {}).value || '';
  mktPlanSemanalInputs = {
    prioridad: valor('mps_prioridad').trim(),
    contexto: valor('mps_contexto').trim(),
    materiales: valor('mps_materiales').trim(),
    disponibilidad: valor('mps_disponibilidad').trim(),
    cantidad: Math.min(Math.max(parseInt(valor('mps_cantidad')) || 3, 2), 7),
  };
}

function mktPlanSemanalGuardarInputs() {
  mktPlanSemanalLeerInputs();
  mktPlanSemanalGuardar();
}

function mktPlanSemanalRangoHTML() {
  const hasta = mktPlanSumarDias(mktPlanSemana, 6);
  const fmt = fecha => new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short',
  });
  return fmt(mktPlanSemana) + ' — ' + fmt(hasta);
}

function mktPlanSemanalCardHTML() {
  const i = mktPlanSemanalInputs;
  return `
    <div class="card" id="mplan_semanal_card" style="margin-bottom:20px;border-top:3px solid var(--primary);">
      <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <div class="card-title" style="margin-bottom:6px;">Cerebro semanal</div>
          <p style="font-size:13px;color:var(--text-muted);line-height:1.5;max-width:720px;">
            Contale qué está pasando y qué material tienen. El sistema cruza ese contexto con
            objetivos, calendario, Radar y resultados para proponer una estrategia ejecutable.
          </p>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="mktPlanSemanaMover(-1)">←</button>
          <input class="form-input" type="date" value="${mktPlanSemana}"
            onchange="mktPlanSemanaCambiar(this.value)" style="width:150px;">
          <button class="btn btn-secondary" onclick="mktPlanSemanaHoy()">Hoy</button>
          <button class="btn btn-secondary" onclick="mktPlanSemanaMover(1)">→</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--primary);font-weight:700;margin:12px 0 16px;">
        Semana ${mktPlanSemanalRangoHTML()}
      </div>
      <div class="form-group">
        <label class="form-label">¿Qué necesitamos conseguir esta semana?</label>
        <input class="form-input" id="mps_prioridad" value="${escHtml(i.prioridad)}"
          oninput="mktPlanSemanalGuardarInputs()"
          placeholder="Ej. posicionar el estudio y conseguir consultas de empresas de Alicante">
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
        <div class="form-group">
          <label class="form-label">Contexto, ideas y oportunidades</label>
          <textarea class="form-textarea" id="mps_contexto" oninput="mktPlanSemanalGuardarInputs()"
            placeholder="Qué está pasando, qué querés contar, preguntas de clientes, novedades…">${escHtml(i.contexto)}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Material disponible</label>
          <textarea class="form-textarea" id="mps_materiales" oninput="mktPlanSemanalGuardarInputs()"
            placeholder="Vídeos grabados, fotos, testimonios, demos, guiones o enlaces…">${escHtml(i.materiales)}</textarea>
        </div>
      </div>
      <div class="form-row" style="align-items:flex-end;">
        <div class="form-group" style="flex:1;">
          <label class="form-label">Disponibilidad y límites</label>
          <input class="form-input" id="mps_disponibilidad" value="${escHtml(i.disponibilidad)}"
            oninput="mktPlanSemanalGuardarInputs()"
            placeholder="Ej. Agus graba el jueves · máximo 2 reels · esta semana no vender">
        </div>
        <div class="form-group" style="max-width:130px;">
          <label class="form-label">Piezas</label>
          <input class="form-input" id="mps_cantidad" type="number" min="2" max="7"
            value="${i.cantidad}" oninput="mktPlanSemanalGuardarInputs()">
        </div>
        <div class="form-group">
          <button class="btn btn-primary" onclick="mktPlanSemanalProponer()"
            ${mktPlanSemanalGenerando ? 'disabled' : ''}>
            ${mktPlanSemanalGenerando ? 'Pensando la semana…' : '✦ Armar plan semanal'}
          </button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:-4px;">
        El contexto se guarda como borrador en este navegador. Nada entra al calendario sin tu aprobación.
      </div>
      <div id="mplan_semanal_propuesta">${mktPlanSemanalPropuestaHTML()}</div>
    </div>`;
}

function mktPlanSemanalPropuestaHTML() {
  if (mktPlanSemanalGenerando) {
    return `<div style="text-align:center;padding:28px 0 8px;">
      <div class="loader"><div class="spinner"></div></div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:12px;">
        Revisando contexto, calendario, Radar y resultados…</div>
    </div>`;
  }
  const plan = mktPlanSemanalPropuesta;
  if (!plan.piezas || !plan.piezas.length) return '';
  const formatos = { reel: 'Reel', story: 'Historia', carrusel: 'Carrusel', post: 'Post' };
  const responsables = ['Santi', 'Agus', 'Ambos', 'Sin definir'];
  const opciones = (obj, seleccionado) => Object.entries(obj).map(([k, v]) =>
    `<option value="${k}" ${k === seleccionado ? 'selected' : ''}>${v}</option>`).join('');
  const pilares = Object.fromEntries(Object.entries(MKT_PILAR).map(([k, v]) => [k, v.label]));
  const filas = plan.piezas.map((p, idx) => `
    <div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-top:12px;
                border-left:4px solid ${(MKT_PILAR[p.pilar] || MKT_PILAR.ia).color};">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px;">
        <div style="font-weight:700;font-size:13px;">Pieza ${idx + 1}</div>
        <button class="btn btn-secondary" onclick="mktPlanSemanalQuitar(${idx})"
          title="Quitar del plan">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:minmax(130px,160px) 1fr;gap:10px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Fecha</label>
          <input class="form-input" type="date" value="${escHtml(p.fecha || '')}"
            onchange="mktPlanSemanalEditar(${idx},'fecha',this.value)">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Título de trabajo</label>
          <input class="form-input" value="${escHtml(p.titulo)}"
            oninput="mktPlanSemanalEditar(${idx},'titulo',this.value)">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Formato</label>
          <select class="form-select" onchange="mktPlanSemanalEditar(${idx},'formato',this.value)">
            ${opciones(formatos, p.formato)}</select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Pilar</label>
          <select class="form-select" onchange="mktPlanSemanalEditar(${idx},'pilar',this.value)">
            ${opciones(pilares, p.pilar)}</select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Responsable</label>
          <select class="form-select" onchange="mktPlanSemanalEditar(${idx},'responsable',this.value)">
            ${responsables.map(r => `<option ${r === p.responsable ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
      </div>
      <details style="margin-top:12px;">
        <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--primary);">
          Ver y editar la estrategia de esta pieza
        </summary>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:10px;">
          ${mktPlanSemanalCampo(idx, 'objetivo', 'Objetivo de la pieza', p.objetivo)}
          ${mktPlanSemanalCampo(idx, 'audiencia', 'Audiencia', p.audiencia)}
          ${mktPlanSemanalCampo(idx, 'razon', 'Por qué esta semana', p.razon)}
          ${mktPlanSemanalCampo(idx, 'hook', 'Hook o enfoque', p.hook)}
          ${mktPlanSemanalCampo(idx, 'material', 'Material / qué grabar', p.material)}
          ${mktPlanSemanalCampo(idx, 'cta', 'CTA', p.cta)}
        </div>
      </details>
    </div>`).join('');

  return `
    <div style="border-top:1px solid var(--border);margin-top:20px;padding-top:18px;">
      <div class="form-group">
        <label class="form-label">Foco de la semana</label>
        <input class="form-input" value="${escHtml(plan.foco)}"
          oninput="mktPlanSemanalEditarCabecera('foco',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">Por qué este plan</label>
        <textarea class="form-textarea" oninput="mktPlanSemanalEditarCabecera('criterio',this.value)"
          style="min-height:80px;">${escHtml(plan.criterio)}</textarea>
      </div>
      ${filas}
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:16px;">
        <button class="btn btn-secondary" onclick="mktPlanSemanalDescartar()">Descartar propuesta</button>
        <button class="btn btn-primary" onclick="mktPlanSemanalCargar()"
          ${mktPlanSemanalCargando ? 'disabled' : ''}>
          ${mktPlanSemanalCargando ? 'Cargando…' : 'Aprobar y cargar ' + plan.piezas.length + ' ideas'}
        </button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px;">
        Se crearán como ideas editables. No se programará ni publicará nada.
      </div>
    </div>`;
}

function mktPlanSemanalCampo(i, campo, etiqueta, valor) {
  return `<div class="form-group" style="margin:0;">
    <label class="form-label">${etiqueta}</label>
    <textarea class="form-textarea" style="min-height:72px;"
      oninput="mktPlanSemanalEditar(${i},'${campo}',this.value)">${escHtml(valor || '')}</textarea>
  </div>`;
}

function mktPlanSemanalRepintar() {
  const card = document.getElementById('mplan_semanal_card');
  if (card) card.outerHTML = mktPlanSemanalCardHTML();
}

function mktPlanSemanaCambiar(fecha) {
  if (!fecha) return;
  mktPlanSemana = mktPlanInicioSemana(fecha);
  mktPlanSemanalAsegurarSemana(true);
  navigate('marketing-planning');
}

function mktPlanSemanaMover(direccion) {
  mktPlanSemanaCambiar(mktPlanSumarDias(mktPlanSemana, direccion * 7));
}

function mktPlanSemanaHoy() {
  mktPlanSemanaCambiar(mktPlanInicioSemana(new Date()));
}

async function mktPlanSemanalProponer() {
  if (mktPlanSemanalGenerando) return;
  mktPlanSemanalLeerInputs();
  const i = mktPlanSemanalInputs;
  if (!i.prioridad && !i.contexto && !i.materiales) {
    toast('Contame una prioridad, contexto o material disponible', 'error');
    return;
  }
  mktPlanSemanalGuardar();
  mktPlanSemanalGenerando = true;
  mktPlanSemanalRepintar();
  try {
    const data = await API.post('/marketing-planning/proponer-semana', {
      semana: mktPlanSemana,
      cantidad: i.cantidad,
      prioridad: i.prioridad,
      contexto: i.contexto,
      materiales: i.materiales,
      disponibilidad: i.disponibilidad,
    });
    mktPlanSemanalPropuesta = {
      foco: data.foco || '',
      criterio: data.criterio || '',
      piezas: data.piezas || [],
    };
    mktPlanSemanalGuardar();
    toast('Plan semanal listo para revisar', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktPlanSemanalGenerando = false;
    mktPlanSemanalRepintar();
  }
}

function mktPlanSemanalEditar(i, campo, valor) {
  if (!mktPlanSemanalPropuesta.piezas[i]) return;
  mktPlanSemanalPropuesta.piezas[i][campo] = valor;
  mktPlanSemanalGuardar();
}

function mktPlanSemanalEditarCabecera(campo, valor) {
  mktPlanSemanalPropuesta[campo] = valor;
  mktPlanSemanalGuardar();
}

function mktPlanSemanalQuitar(i) {
  mktPlanSemanalPropuesta.piezas.splice(i, 1);
  mktPlanSemanalGuardar();
  mktPlanSemanalRepintar();
}

function mktPlanSemanalDescartar() {
  if (!confirm('¿Descartar esta propuesta semanal? El contexto escrito se conservará.')) return;
  mktPlanSemanalPropuesta = { foco: '', criterio: '', piezas: [] };
  mktPlanSemanalGuardar();
  mktPlanSemanalRepintar();
}

async function mktPlanSemanalCargar() {
  const piezas = mktPlanSemanalPropuesta.piezas || [];
  if (!piezas.length || mktPlanSemanalCargando) return;
  if (!confirm('¿Aprobar y cargar ' + piezas.length + ' piezas al calendario como ideas?')) return;
  mktPlanSemanalCargando = true;
  mktPlanSemanalRepintar();
  try {
    const r = await API.post('/marketing-planning/cargar-semana', {
      semana: mktPlanSemana,
      piezas,
    });
    mktPlanSemanalPropuesta = { foco: '', criterio: '', piezas: [] };
    mktPlanSemanalGuardar();
    toast(r.creadas + ' ideas cargadas. Nada fue programado ni publicado.', 'success');
    mktCalDate = new Date(mktPlanSemana + 'T12:00:00');
    mktCalCanal = 'feed';
    navigate('marketing-calendar');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    mktPlanSemanalCargando = false;
    mktPlanSemanalRepintar();
  }
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
