/* ============================================================
   VOCAI OS — Asistente (widget flotante global)
   La cara conversacional del Gerente de marketing. Vive como un
   botón circular fijo (abajo a la derecha) presente en TODO el
   dashboard. Al tocarlo abre un panel de chat. Conoce la sección
   donde estás, lee planificación y calendario y ejecuta cambios.
   Backend: POST /api/asistente/chat (motor Claude).
   ============================================================ */

let asistHistorial = [];
let asistMes = new Date().toISOString().slice(0, 7);
let asistEnviando = false;
let asistAbierto = false;

// Nombre legible de la sección actual del dashboard (para el contexto).
const ASIST_SECCIONES = {
  dashboard: 'Dashboard', clients: 'Clientes', projects: 'Proyectos',
  proposals: 'Propuestas', contracts: 'Contratos', invoices: 'Facturas',
  expenses: 'Inversión', finanzas: 'Finanzas', goals: 'Metas',
  bookings: 'Reservas de Estudio', episodes: 'Episodios', tasks: 'Tareas',
  activity: 'Actividad', contacts: 'Contactos', files: 'Archivos', notes: 'Notas',
  agents: 'Agentes n8n', mytasks: 'Mis tareas', myagenda: 'Mi agenda',
  agenda: 'Agenda', settings: 'Configuración',
  'marketing-calendar': 'Calendario editorial', 'marketing-planning': 'Planificación',
  'marketing-intelligence': 'Inteligencia', 'marketing-generator': 'Generador',
  'marketing-web': 'Web · Blog',
};

function asistInjectStyles() {
  if (document.getElementById('asist-styles')) return;
  const s = document.createElement('style');
  s.id = 'asist-styles';
  s.textContent = `
    .asist-fab{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;
      background:linear-gradient(135deg,#2979FF,#FF6B6B);border:none;cursor:pointer;z-index:9000;
      box-shadow:0 6px 20px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;
      transition:transform .18s ease,box-shadow .18s ease;}
    .asist-fab:hover{transform:scale(1.06);box-shadow:0 8px 26px rgba(41,121,255,0.45);}
    .asist-fab svg{width:28px;height:28px;color:#fff;}
    .asist-fab.hide{opacity:0;pointer-events:none;transform:scale(.8);}
    .asist-online{position:absolute;top:3px;right:3px;width:14px;height:14px;border-radius:50%;
      background:#22c55e;border:2.5px solid #141d35;box-shadow:0 0 0 0 rgba(34,197,94,0.6);
      animation:asistPulse 2s infinite;}
    @keyframes asistPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,0.55);}
      70%{box-shadow:0 0 0 7px rgba(34,197,94,0);}100%{box-shadow:0 0 0 0 rgba(34,197,94,0);}}
    .asist-bubble strong{font-weight:700;color:#fff;}
    .asist-bubble em{font-style:italic;}
    .asist-bubble code{background:rgba(255,255,255,0.12);padding:1px 5px;border-radius:5px;
      font-family:ui-monospace,monospace;font-size:12.5px;}
    .asist-panel{position:fixed;bottom:24px;right:24px;width:390px;max-width:calc(100vw - 32px);
      height:600px;max-height:calc(100vh - 48px);background:#141d35;border:1px solid rgba(255,255,255,0.12);
      border-radius:18px;z-index:9001;display:flex;flex-direction:column;overflow:hidden;
      box-shadow:0 18px 50px rgba(0,0,0,0.5);transform:translateY(16px);opacity:0;pointer-events:none;
      transition:transform .2s ease,opacity .2s ease;}
    .asist-panel.open{transform:translateY(0);opacity:1;pointer-events:auto;}
    .asist-phead{display:flex;align-items:center;gap:10px;padding:14px 16px;
      background:linear-gradient(135deg,rgba(41,121,255,0.18),rgba(255,107,107,0.12));
      border-bottom:1px solid rgba(255,255,255,0.1);}
    .asist-phead .dot{width:34px;height:34px;border-radius:50%;flex-shrink:0;
      background:linear-gradient(135deg,#2979FF,#FF6B6B);display:flex;align-items:center;justify-content:center;}
    .asist-phead .dot svg{width:18px;height:18px;color:#fff;}
    .asist-phead .ttl{font-size:15px;font-weight:600;color:#fff;line-height:1.2;}
    .asist-phead .sub{font-size:11px;color:rgba(255,255,255,0.55);}
    .asist-phead .x{margin-left:auto;background:none;border:none;color:rgba(255,255,255,0.6);
      font-size:22px;cursor:pointer;line-height:1;padding:2px 6px;}
    .asist-phead .x:hover{color:#fff;}
    .asist-feed{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;}
    .asist-msg{display:flex;flex-direction:column;max-width:88%;}
    .asist-msg.user{align-self:flex-end;align-items:flex-end;}
    .asist-msg.bot{align-self:flex-start;align-items:flex-start;}
    .asist-bubble{padding:10px 13px;border-radius:13px;font-size:13.5px;line-height:1.5;
      white-space:pre-wrap;word-wrap:break-word;}
    .asist-msg.user .asist-bubble{background:#2979FF;color:#fff;border-bottom-right-radius:4px;}
    .asist-msg.bot .asist-bubble{background:rgba(255,255,255,0.07);color:#eee;
      border:1px solid rgba(255,255,255,0.1);border-bottom-left-radius:4px;}
    .asist-acciones{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}
    .asist-chip{font-size:10.5px;padding:2px 8px;border-radius:20px;background:rgba(41,121,255,0.18);
      color:#9cc3ff;border:1px solid rgba(41,121,255,0.35);}
    .asist-chip.err{background:rgba(255,107,107,0.18);color:#ff9a9a;border-color:rgba(255,107,107,0.35);}
    .asist-empty{color:rgba(255,255,255,0.55);font-size:13px;margin:auto;text-align:center;line-height:1.6;padding:0 8px;}
    .asist-bar{display:flex;gap:8px;align-items:flex-end;padding:12px;border-top:1px solid rgba(255,255,255,0.08);}
    .asist-bar textarea{flex:1;resize:none;background:rgba(255,255,255,0.07);
      border:1px solid rgba(255,255,255,0.14);color:#fff;border-radius:11px;padding:9px 12px;
      font-size:13.5px;font-family:inherit;line-height:1.4;max-height:120px;}
    .asist-bar textarea:focus{outline:none;border-color:#2979FF;}
    .asist-send{background:#2979FF;color:#fff;border:none;border-radius:11px;width:42px;height:40px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .asist-send svg{width:18px;height:18px;}
    .asist-send:disabled{opacity:.5;cursor:not-allowed;}
    .asist-typing{display:flex;gap:4px;padding:11px 14px;}
    .asist-typing span{width:7px;height:7px;border-radius:50%;background:#9cc3ff;animation:asistBlink 1.2s infinite both;}
    .asist-typing span:nth-child(2){animation-delay:.2s;}
    .asist-typing span:nth-child(3){animation-delay:.4s;}
    @keyframes asistBlink{0%,80%,100%{opacity:.2;}40%{opacity:1;}}
    @media(max-width:480px){.asist-panel{height:calc(100vh - 32px);bottom:16px;right:16px;}}
  `;
  document.head.appendChild(s);
}

function asistRenderFeed() {
  const feed = document.getElementById('asistFeed');
  if (!feed) return;
  if (!asistHistorial.length) {
    feed.innerHTML = `<div class="asist-empty">
      Hola 👋 Soy el asistente de VOCAI. Te acompaño por todo el dashboard.<br><br>
      Pedime una recomendación ("¿cómo viene el mix de este mes?") o un cambio concreto
      ("mové la pieza del 12 al 15", "creá un reel de IA el lunes").
    </div>`;
    return;
  }
  feed.innerHTML = asistHistorial.map(m => {
    const cls = m.role === 'user' ? 'user' : 'bot';
    let acc = '';
    if (m.acciones && m.acciones.length) {
      acc = `<div class="asist-acciones">` + m.acciones.map(a =>
        `<span class="asist-chip ${a.ok ? '' : 'err'}">${escHtml(asistLabelAccion(a))}</span>`
      ).join('') + `</div>`;
    }
    const cuerpo = m.role === 'user' ? escHtml(m.content) : asistFmt(m.content);
    return `<div class="asist-msg ${cls}"><div class="asist-bubble">${cuerpo}</div>${acc}</div>`;
  }).join('');
  feed.scrollTop = feed.scrollHeight;
}

// Markdown básico → HTML, SEGURO: escapa primero (anti-XSS) y recién
// después convierte negritas, itálicas y código sobre el texto ya escapado.
function asistFmt(s) {
  let t = escHtml(s || '');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return t;
}

function asistLabelAccion(a) {
  const map = {
    ver_calendario: 'leyó el calendario', ver_planificacion: 'leyó la planificación',
    crear_pieza: 'creó una pieza', editar_pieza: 'editó una pieza', borrar_pieza: 'borró una pieza',
    ver_blog: 'revisó el blog', ver_post: 'leyó un artículo',
    redactar_post: 'redactó un artículo', crear_post: 'creó un artículo',
    editar_post: 'editó un artículo', publicar_post: 'publicó un artículo',
    despublicar_post: 'despublicó un artículo', borrar_post: 'borró un artículo',
  };
  const base = map[a.tool] || a.tool;
  return a.ok ? base : `falló: ${base}`;
}

// Sección actual del dashboard (la expone app.js en navigate()).
function asistSeccionActual() {
  const m = window.vocaiSeccionActual || 'dashboard';
  return ASIST_SECCIONES[m] || m;
}

async function asistEnviar() {
  if (asistEnviando) return;
  const ta = document.getElementById('asistInput');
  const texto = ta.value.trim();
  if (!texto) return;

  asistHistorial.push({ role: 'user', content: texto });
  ta.value = '';
  ta.style.height = 'auto';
  asistEnviando = true;
  asistRenderFeed();

  const feed = document.getElementById('asistFeed');
  const typing = document.createElement('div');
  typing.className = 'asist-msg bot';
  typing.innerHTML = `<div class="asist-bubble" style="padding:0;"><div class="asist-typing"><span></span><span></span><span></span></div></div>`;
  feed.appendChild(typing);
  feed.scrollTop = feed.scrollHeight;
  const btn = document.getElementById('asistSend');
  if (btn) btn.disabled = true;

  try {
    const messages = asistHistorial.map(m => ({ role: m.role, content: m.content }));
    const r = await API.post('/asistente/chat', {
      messages, mes: asistMes, seccion: asistSeccionActual(),
    });
    asistHistorial.push({ role: 'assistant', content: r.texto || '(sin respuesta)', acciones: r.acciones || [] });
  } catch (err) {
    asistHistorial.push({ role: 'assistant', content: `Error: ${err.message}`, acciones: [] });
  } finally {
    asistEnviando = false;
    if (btn) btn.disabled = false;
    asistRenderFeed();
  }
}

function asistToggle(forzar) {
  asistAbierto = typeof forzar === 'boolean' ? forzar : !asistAbierto;
  const panel = document.getElementById('asistPanel');
  const fab = document.getElementById('asistFab');
  if (!panel || !fab) return;
  panel.classList.toggle('open', asistAbierto);
  fab.classList.toggle('hide', asistAbierto);
  if (asistAbierto) {
    asistRenderFeed();
    setTimeout(() => { const ta = document.getElementById('asistInput'); if (ta) ta.focus(); }, 220);
  }
}

// Monta el widget una sola vez, en el body — vive sobre todo el dashboard.
function initAsistenteWidget() {
  if (document.getElementById('asistFab')) return;
  asistInjectStyles();

  const fab = document.createElement('button');
  fab.id = 'asistFab';
  fab.className = 'asist-fab';
  fab.title = 'Asistente VOCAI';
  fab.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z"/></svg><span class="asist-online" title="En línea"></span>`;
  fab.addEventListener('click', () => asistToggle(true));

  const panel = document.createElement('div');
  panel.id = 'asistPanel';
  panel.className = 'asist-panel';
  panel.innerHTML = `
    <div class="asist-phead">
      <div class="dot"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z"/></svg></div>
      <div>
        <div class="ttl">Asistente VOCAI</div>
        <div class="sub">Recomienda y ejecuta · conoce tu dashboard</div>
      </div>
      <button class="x" id="asistClose" title="Cerrar">&times;</button>
    </div>
    <div class="asist-feed" id="asistFeed"></div>
    <div class="asist-bar">
      <textarea id="asistInput" rows="1" placeholder="Escribí acá…"></textarea>
      <button class="asist-send" id="asistSend" title="Enviar">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
      </button>
    </div>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  document.getElementById('asistClose').addEventListener('click', () => asistToggle(false));
  document.getElementById('asistSend').addEventListener('click', asistEnviar);
  const ta = document.getElementById('asistInput');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); asistEnviar(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && asistAbierto) asistToggle(false); });

  asistRenderFeed();
}
