/* ============================================================
   VOCAI OS — Asistente (cara conversacional del Gerente de mkt)
   Chat con acceso al contexto del dashboard. Lee planificación y
   calendario y puede ejecutar cambios sobre el calendario editorial.
   Backend: POST /api/asistente/chat (motor Claude).
   ============================================================ */

// Historial de la conversación en memoria (se pierde al recargar).
let asistHistorial = [];
let asistMes = new Date().toISOString().slice(0, 7);
let asistEnviando = false;

function asistInjectStyles() {
  if (document.getElementById('asist-styles')) return;
  const s = document.createElement('style');
  s.id = 'asist-styles';
  s.textContent = `
    .asist-wrap{display:flex;flex-direction:column;height:calc(100vh - 140px);max-width:860px;margin:0 auto;}
    .asist-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
    .asist-head .asist-sub{font-size:13px;color:var(--text-muted,#9aa);}
    .asist-mes{display:flex;align-items:center;gap:6px;font-size:13px;}
    .asist-mes input{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
      color:var(--text,#fff);border-radius:8px;padding:6px 10px;font-size:13px;font-family:inherit;}
    .asist-feed{flex:1;overflow-y:auto;padding:8px 4px;display:flex;flex-direction:column;gap:14px;}
    .asist-msg{display:flex;flex-direction:column;max-width:82%;}
    .asist-msg.user{align-self:flex-end;align-items:flex-end;}
    .asist-msg.bot{align-self:flex-start;align-items:flex-start;}
    .asist-bubble{padding:11px 15px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;}
    .asist-msg.user .asist-bubble{background:#2979FF;color:#fff;border-bottom-right-radius:4px;}
    .asist-msg.bot .asist-bubble{background:rgba(255,255,255,0.06);color:var(--text,#eee);
      border:1px solid rgba(255,255,255,0.1);border-bottom-left-radius:4px;}
    .asist-acciones{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;}
    .asist-chip{font-size:11px;padding:3px 9px;border-radius:20px;background:rgba(41,121,255,0.15);
      color:#7eb0ff;border:1px solid rgba(41,121,255,0.3);}
    .asist-chip.err{background:rgba(255,107,107,0.15);color:#ff9a9a;border-color:rgba(255,107,107,0.3);}
    .asist-empty{text-align:center;color:var(--text-muted,#9aa);font-size:14px;margin:auto;max-width:480px;line-height:1.6;}
    .asist-bar{display:flex;gap:10px;align-items:flex-end;margin-top:12px;
      border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;}
    .asist-bar textarea{flex:1;resize:none;background:rgba(255,255,255,0.06);
      border:1px solid rgba(255,255,255,0.12);color:var(--text,#fff);border-radius:12px;
      padding:11px 14px;font-size:14px;font-family:inherit;line-height:1.4;max-height:140px;}
    .asist-bar textarea:focus{outline:none;border-color:#2979FF;}
    .asist-send{background:#2979FF;color:#fff;border:none;border-radius:12px;padding:0 20px;
      height:44px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;}
    .asist-send:disabled{opacity:0.5;cursor:not-allowed;}
    .asist-typing{display:flex;gap:4px;padding:12px 16px;}
    .asist-typing span{width:7px;height:7px;border-radius:50%;background:#7eb0ff;
      animation:asistBlink 1.2s infinite both;}
    .asist-typing span:nth-child(2){animation-delay:.2s;}
    .asist-typing span:nth-child(3){animation-delay:.4s;}
    @keyframes asistBlink{0%,80%,100%{opacity:.2;}40%{opacity:1;}}
  `;
  document.head.appendChild(s);
}

function asistRenderFeed() {
  const feed = document.getElementById('asistFeed');
  if (!feed) return;
  if (!asistHistorial.length) {
    feed.innerHTML = `<div class="asist-empty">
      Soy el asistente de marketing de VOCAI. Tengo a la vista la planificación y el
      calendario del mes en foco.<br><br>
      Pedime una recomendación ("¿cómo viene el mix de abril?") o un cambio concreto
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
    return `<div class="asist-msg ${cls}">
      <div class="asist-bubble">${escHtml(m.content)}</div>${acc}
    </div>`;
  }).join('');
  feed.scrollTop = feed.scrollHeight;
}

function asistLabelAccion(a) {
  const map = {
    ver_calendario: 'leyó el calendario',
    ver_planificacion: 'leyó la planificación',
    crear_pieza: 'creó una pieza',
    editar_pieza: 'editó una pieza',
    borrar_pieza: 'borró una pieza',
  };
  const base = map[a.tool] || a.tool;
  return a.ok ? base : `falló: ${base}`;
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
  document.getElementById('asistSend').disabled = true;

  try {
    // Mandamos solo role+content (el backend no necesita las acciones).
    const messages = asistHistorial.map(m => ({ role: m.role, content: m.content }));
    const r = await API.post('/asistente/chat', { messages, mes: asistMes });
    asistHistorial.push({ role: 'assistant', content: r.texto || '(sin respuesta)', acciones: r.acciones || [] });
  } catch (err) {
    asistHistorial.push({ role: 'assistant', content: `Error: ${err.message}`, acciones: [] });
  } finally {
    asistEnviando = false;
    document.getElementById('asistSend').disabled = false;
    asistRenderFeed();
  }
}

function asistRender(el) {
  asistInjectStyles();
  const hoy = new Date().toISOString().slice(0, 7);
  if (!asistMes) asistMes = hoy;
  el.innerHTML = `
    <div class="asist-wrap">
      <div class="asist-head">
        <div>
          <h2 class="section-title" style="margin:0;">Asistente</h2>
          <div class="asist-sub">Conoce tu planificación y calendario. Recomienda y ejecuta cambios.</div>
        </div>
        <label class="asist-mes">Mes en foco
          <input type="month" id="asistMes" value="${asistMes}">
        </label>
      </div>
      <div class="asist-feed" id="asistFeed"></div>
      <div class="asist-bar">
        <textarea id="asistInput" rows="1" placeholder="Escribí acá… (Enter envía, Shift+Enter salto de línea)"></textarea>
        <button class="asist-send" id="asistSend" onclick="asistEnviar()">Enviar</button>
      </div>
    </div>
  `;
  asistRenderFeed();

  const ta = document.getElementById('asistInput');
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); asistEnviar(); }
  });
  document.getElementById('asistMes').addEventListener('change', (e) => {
    asistMes = e.target.value || hoy;
  });
  ta.focus();
}

// Alias para el registry (renderAsistente).
const renderAsistente = asistRender;
