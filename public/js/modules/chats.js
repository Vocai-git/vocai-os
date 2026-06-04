// ── CHATS EN VIVO — Panel de intervención ────────────────────
// Polling cada 4s para mensajes nuevos

let chatsInterval = null;
let chatConvActiva = null;
let chatBotPausado = false;
let chatMensajesVistos = 0;
let chatBusqueda = '';

function chatGetLastSeen() {
  try { return JSON.parse(localStorage.getItem('chats_last_seen') || '{}'); } catch { return {}; }
}
function chatSetLastSeen(id) {
  const ls = chatGetLastSeen();
  ls[id] = new Date().toISOString();
  localStorage.setItem('chats_last_seen', JSON.stringify(ls));
}

async function renderChats(container) {
  container.innerHTML = `
<style>
:root { --azul: #2563eb; --verde: #059669; --amarillo: #d97706; }

.chats-shell {
  display: flex;
  height: calc(100vh - 56px);
  overflow: hidden;
  background: var(--bg);
}

/* ── Sidebar izquierdo ── */
.chats-sidebar {
  width: 320px;
  min-width: 260px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--surface);
}
.chats-sidebar-head {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}
.chats-sidebar-title {
  font-family: 'Syne', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  flex: 1;
}
.chats-bot-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all .2s;
}
.chats-bot-btn.activo { background: rgba(5,150,105,0.15); color: #059669; }
.chats-bot-btn.pausado { background: rgba(239,68,68,0.15); color: #ef4444; }
.chats-bot-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  animation: pulse-dot 2s infinite;
}
.chats-bot-btn.activo .chats-bot-dot { background: #059669; }
.chats-bot-btn.pausado .chats-bot-dot { background: #ef4444; animation: none; }
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: .3; }
}

.chats-search-wrap {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.chats-search-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 7px 14px;
  font-size: 13px;
  color: var(--text);
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color .15s;
}
.chats-search-input::placeholder { color: var(--text-muted); }
.chats-search-input:focus { border-color: var(--accent); }

.chats-unread-badge {
  min-width: 18px; height: 18px;
  background: #25D366;
  color: #fff;
  font-size: 10px; font-weight: 700;
  border-radius: 10px;
  padding: 0 5px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.chats-list { flex: 1; overflow-y: auto; }
.chats-list::-webkit-scrollbar { width: 4px; }
.chats-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

.chats-conv {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background .15s;
  position: relative;
}
.chats-conv:hover { background: var(--surface-hover); }
.chats-conv.active { background: var(--surface-hover); border-left: 3px solid var(--accent); }
.chats-conv-top { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.chats-conv-name { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chats-conv-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.chats-conv-preview { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chats-conv-badge {
  position: absolute;
  top: 10px; right: 14px;
  font-size: 10px; font-weight: 700;
  background: var(--coral);
  color: #fff;
  border-radius: 10px;
  padding: 1px 6px;
}
.chats-mode-tag {
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 6px;
  text-transform: uppercase; letter-spacing: .04em;
}
.chats-mode-tag.manual { background: rgba(239,68,68,0.12); color: #ef4444; }
.chats-mode-tag.bot { background: rgba(5,150,105,0.12); color: #059669; }

/* ── Panel derecho ── */
.chats-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chats-panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}
.chats-panel-empty svg { opacity: .2; width: 48px; height: 48px; }

.chats-conv-head {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
}
.chats-conv-head-name {
  font-family: 'Syne', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  flex: 1;
}
.chats-conv-head-tel { font-size: 12px; color: var(--text-muted); margin-top: 1px; }

.chats-takeover-btn {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all .2s;
}
.chats-takeover-btn.tomar { background: var(--coral); color: #fff; }
.chats-takeover-btn.devolver { background: rgba(5,150,105,0.15); color: #059669; border: 1px solid rgba(5,150,105,0.3); }

.chats-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chats-messages::-webkit-scrollbar { width: 4px; }
.chats-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

.chat-msg { display: flex; flex-direction: column; max-width: 72%; }
.chat-msg.cliente { align-self: flex-start; }
.chat-msg.tito, .chat-msg.sistema { align-self: flex-end; }
.chat-msg.humano { align-self: flex-end; }

.chat-bubble {
  padding: 9px 13px;
  border-radius: 16px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.chat-msg.cliente .chat-bubble {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
.chat-msg.tito .chat-bubble, .chat-msg.sistema .chat-bubble {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.chat-msg.humano .chat-bubble {
  background: #059669;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-msg-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 3px;
  padding: 0 4px;
}
.chat-msg.tito .chat-msg-meta, .chat-msg.sistema .chat-msg-meta, .chat-msg.humano .chat-msg-meta {
  text-align: right;
}

.chat-rol-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-bottom: 3px;
  padding: 0 4px;
  color: var(--text-muted);
}
.chat-msg.humano .chat-rol-label { text-align: right; color: #059669; }

.chats-input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.chats-input-area.disabled { opacity: .5; pointer-events: none; }
.chats-input-row { display: flex; gap: 8px; align-items: flex-end; }
.chats-textarea {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text);
  font-family: inherit;
  resize: none;
  min-height: 42px;
  max-height: 120px;
  line-height: 1.5;
  transition: border-color .15s;
}
.chats-textarea:focus { outline: none; border-color: var(--accent); }
.chats-send-btn {
  width: 42px; height: 42px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  transition: opacity .15s;
}
.chats-send-btn:hover { opacity: .85; }
.chats-send-btn:active { opacity: .7; }
.chats-send-btn svg { width: 18px; height: 18px; }
.chats-input-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
  text-align: center;
}

.chat-typing {
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  background: var(--accent);
  border-radius: 16px;
  border-bottom-right-radius: 4px;
  max-width: 72px;
  opacity: 0.7;
}
.chat-typing span {
  width: 6px; height: 6px;
  background: #fff;
  border-radius: 50%;
  animation: typing-dot 1.4s infinite;
}
.chat-typing span:nth-child(2) { animation-delay: .2s; }
.chat-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes typing-dot {
  0%, 60%, 100% { opacity: .2; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

@media (max-width: 640px) {
  .chats-sidebar { width: 100%; display: none; }
  .chats-sidebar.show-mobile { display: flex; }
  .chats-panel { display: none; }
  .chats-panel.show-mobile { display: flex; }
}
</style>

<div class="chats-shell">
  <!-- Sidebar -->
  <div class="chats-sidebar">
    <div class="chats-sidebar-head">
      <span class="chats-sidebar-title">Chats en vivo</span>
      <button class="chats-bot-btn activo" id="chatsBotBtn" onclick="chatsToggleBot()">
        <div class="chats-bot-dot"></div>
        <span id="chatsBotLabel">Tito activo</span>
      </button>
    </div>
    <div style="padding:8px 12px;border-bottom:1px solid var(--border)">
      <button onclick="chatsNuevoChat()" style="width:100%;padding:7px 12px;border-radius:8px;background:var(--accent);border:none;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        Nuevo chat
      </button>
    </div>
    <div class="chats-search-wrap">
      <input class="chats-search-input" id="chatsBuscador" placeholder="Buscar conversación…" type="text" autocomplete="off">
    </div>
    <div class="chats-list" id="chatsListEl">
      <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Cargando...</div>
    </div>
  </div>

  <!-- Panel derecho -->
  <div class="chats-panel" id="chatsPanelEl">
    <div class="chats-panel-empty" id="chatsPanelEmpty">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/>
      </svg>
      <p style="font-size:14px;font-weight:500">Selecciona una conversación</p>
    </div>
    <div id="chatsPanelConv" style="display:none;flex:1;flex-direction:column;min-height:0"></div>
  </div>
</div>`;

  await Promise.all([chatsCargarLista(), chatsCargarBotStatus()]);
  chatsInterval = setInterval(chatsRefrescar, 4000);

  document.getElementById('chatsBuscador')?.addEventListener('input', (e) => {
    chatBusqueda = e.target.value.toLowerCase().trim();
    chatsCargarLista();
  });

  // Si viene desde "Tomar control" en Tito, abrir esa conversación directamente
  if (window.chatsConvPendiente) {
    const pendiente = window.chatsConvPendiente;
    window.chatsConvPendiente = null;
    await chatsAbrirConv(pendiente);
  }
}

function unmountChats() {
  if (chatsInterval) { clearInterval(chatsInterval); chatsInterval = null; }
  chatConvActiva = null;
}

// ── Carga y refresco ──────────────────────────────────────────

async function chatsCargarLista() {
  try {
    const { conversaciones } = await API.get('/tito/chats');
    const el = document.getElementById('chatsListEl');
    if (!el) return;

    const todas = conversaciones || [];
    const filtradas = chatBusqueda
      ? todas.filter(c =>
          (c.cliente_nombre || '').toLowerCase().includes(chatBusqueda) ||
          (c.telefono || '').includes(chatBusqueda))
      : todas;

    if (!filtradas.length) {
      el.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--text-muted);font-size:13px">${chatBusqueda ? 'Sin resultados' : 'Sin conversaciones activas'}</div>`;
      return;
    }

    const lastSeen = chatGetLastSeen();
    el.innerHTML = filtradas.map(c => chatConvItem(c, lastSeen)).join('');
    el.querySelectorAll('.chats-conv').forEach(row => {
      row.addEventListener('click', () => chatsAbrirConv(row.dataset.id));
    });

    if (chatConvActiva) {
      const sel = el.querySelector(`[data-id="${chatConvActiva}"]`);
      if (sel) sel.classList.add('active');
    }
  } catch (err) {
    console.error('chatsCargarLista', err);
  }
}

async function chatsCargarBotStatus() {
  try {
    const { pausado } = await API.get('/tito/chats/bot-status');
    chatBotPausado = Boolean(pausado);
    chatsActualizarBotBtn();
  } catch { /* silencioso */ }
}

async function chatsRefrescar() {
  await chatsCargarLista();
  if (chatConvActiva) await chatsRefrescarMensajes();
}

async function chatsRefrescarMensajes() {
  try {
    const { mensajes } = await API.get(`/tito/chats/${chatConvActiva}/mensajes`);
    if (mensajes?.length !== chatMensajesVistos) {
      chatMensajesVistos = mensajes?.length || 0;
      chatsRenderMensajes(mensajes || []);
    }
  } catch { /* silencioso */ }
}

// ── Abrir conversación ────────────────────────────────────────

async function chatsAbrirConv(id) {
  chatConvActiva = id;
  chatMensajesVistos = 0;
  chatSetLastSeen(id);

  document.querySelectorAll('.chats-conv').forEach(r => r.classList.toggle('active', r.dataset.id === id));

  const emptyEl = document.getElementById('chatsPanelEmpty');
  const convEl  = document.getElementById('chatsPanelConv');
  if (emptyEl) emptyEl.style.display = 'none';
  if (convEl)  { convEl.style.display = 'flex'; convEl.style.flexDirection = 'column'; }

  try {
    const { conversaciones } = await API.get('/tito/chats');
    const conv = conversaciones?.find(c => c.id === id);
    if (!conv || !convEl) return;

    convEl.innerHTML = `
<div class="chats-conv-head">
  <div style="flex:1">
    <div class="chats-conv-head-name">${escHtml(conv.cliente_nombre || conv.telefono)}</div>
    <div class="chats-conv-head-tel">${escHtml(conv.telefono)}</div>
  </div>
  <button class="chats-takeover-btn ${conv.modo_manual ? 'devolver' : 'tomar'}" id="chatsTakeoverBtn"
    onclick="chatsToogleManual('${id}', ${conv.modo_manual})">
    ${conv.modo_manual ? '🤖 Devolver a Tito' : '✋ Tomar control'}
  </button>
</div>
<div class="chats-messages" id="chatsMsgs"></div>
<div class="chats-input-area ${conv.modo_manual ? '' : 'disabled'}" id="chatsInputArea">
  <div class="chats-input-row">
    <textarea class="chats-textarea" id="chatsTxt" placeholder="Escribe como humano…" rows="1"
      onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();chatsEnviar('${id}')}"
      oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
    <button class="chats-send-btn" onclick="chatsEnviar('${id}')">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
      </svg>
    </button>
  </div>
  ${conv.modo_manual ? '' : '<div class="chats-input-hint">Toma el control para escribir</div>'}
</div>`;

    const { mensajes } = await API.get(`/tito/chats/${id}/mensajes`);
    chatMensajesVistos = mensajes?.length || 0;
    chatsRenderMensajes(mensajes || []);
  } catch (err) {
    console.error('chatsAbrirConv', err);
  }
}

// ── Render mensajes ───────────────────────────────────────────

function chatsRenderMensajes(mensajes) {
  const el = document.getElementById('chatsMsgs');
  if (!el) return;

  el.innerHTML = mensajes.map(m => {
    const hora = m.creado_en
      ? new Date(m.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '';
    const rolLabel = m.rol === 'tito' ? 'Tito' : m.rol === 'sistema' ? 'Tito' : m.rol === 'humano' ? 'Tú' : 'Cliente';
    const showLabel = m.rol === 'humano';

    return `
<div class="chat-msg ${m.rol}">
  ${showLabel ? `<div class="chat-rol-label">${rolLabel}</div>` : ''}
  <div class="chat-bubble">${escHtml(m.contenido)}</div>
  <div class="chat-msg-meta">${hora}</div>
</div>`;
  }).join('');

  // Typing indicator: si el último mensaje es del cliente y tiene < 45s, Tito está procesando
  const ultimo = mensajes[mensajes.length - 1];
  if (ultimo?.rol === 'cliente' && ultimo?.creado_en) {
    const segs = (Date.now() - new Date(ultimo.creado_en).getTime()) / 1000;
    if (segs < 45) {
      el.innerHTML += `
<div class="chat-typing" title="Tito está escribiendo…">
  <span></span><span></span><span></span>
</div>`;
    }
  }

  el.scrollTop = el.scrollHeight;
}

// ── Acciones ──────────────────────────────────────────────────

async function chatsToogleManual(id, estaManual) {
  try {
    const nuevoEstado = !estaManual;
    await API.patch(`/tito/chats/${id}/modo-manual`, { activo: nuevoEstado });
    await chatsAbrirConv(id);
    await chatsCargarLista();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function chatsEnviar(id) {
  const txt = document.getElementById('chatsTxt');
  if (!txt?.value?.trim()) return;
  const texto = txt.value.trim();
  txt.value = '';
  txt.style.height = 'auto';

  try {
    await API.post(`/tito/chats/${id}/enviar`, { texto });
    await chatsRefrescarMensajes();
  } catch (err) {
    alert('Error enviando: ' + err.message);
    txt.value = texto;
  }
}

async function chatsToggleBot() {
  const nuevo = !chatBotPausado;
  const accion = nuevo ? 'pausar' : 'reactivar';
  if (!confirm(`¿${nuevo ? 'Pausar' : 'Reactivar'} a Tito en TODAS las conversaciones?`)) return;
  try {
    await API.patch('/tito/chats/bot-status', { pausado: nuevo });
    chatBotPausado = nuevo;
    chatsActualizarBotBtn();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function chatsActualizarBotBtn() {
  const btn   = document.getElementById('chatsBotBtn');
  const label = document.getElementById('chatsBotLabel');
  if (!btn || !label) return;
  btn.className = `chats-bot-btn ${chatBotPausado ? 'pausado' : 'activo'}`;
  label.textContent = chatBotPausado ? 'Tito pausado' : 'Tito activo';
}

function chatConvItem(c, lastSeen = {}) {
  const nombre  = escHtml(c.cliente_nombre || c.telefono || 'Desconocido');
  const preview = escHtml(c.ultimo_mensaje?.contenido?.slice(0, 55) || '');
  const hora    = c.ultima_actividad
    ? new Date(c.ultima_actividad).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '';

  const ls = lastSeen[c.id];
  const tieneNoLeido = c.ultimo_mensaje?.rol === 'cliente' &&
    c.ultimo_mensaje?.creado_en &&
    (!ls || new Date(c.ultimo_mensaje.creado_en) > new Date(ls));

  return `
<div class="chats-conv" data-id="${c.id}">
  <div class="chats-conv-top">
    <span class="chats-conv-name" style="${tieneNoLeido ? 'font-weight:700;color:var(--text)' : ''}">${nombre}</span>
    <span class="chats-mode-tag ${c.modo_manual ? 'manual' : 'bot'}">${c.modo_manual ? 'manual' : 'bot'}</span>
  </div>
  <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
    ${preview ? `<span class="chats-conv-preview" style="flex:1;${tieneNoLeido ? 'font-weight:600;color:var(--text)' : ''}">${preview}</span>` : '<span style="flex:1"></span>'}
    ${tieneNoLeido ? `<span class="chats-unread-badge">1</span>` : `<span class="chats-conv-time">${hora}</span>`}
  </div>
  ${tieneNoLeido ? `<div style="display:flex;justify-content:flex-end;margin-top:1px"><span class="chats-conv-time">${hora}</span></div>` : ''}
</div>`;
}

async function chatsNuevoChat() {
  createModal('modalNuevoChat', 'Nuevo chat', `
<div style="display:flex;flex-direction:column;gap:12px">
  <div>
    <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Número de teléfono (con prefijo, ej: 34612345678)</label>
    <input id="nuevoTel" type="tel" placeholder="34612345678" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;box-sizing:border-box" autocomplete="off">
  </div>
  <div>
    <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Primer mensaje</label>
    <textarea id="nuevoMsg" rows="3" placeholder="Hola, te escribo desde VOCAI…" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;resize:none;box-sizing:border-box"></textarea>
  </div>
</div>`,
  `<button class="btn btn-primary" onclick="chatsEnviarNuevo()">Enviar mensaje</button>
   <button class="btn btn-secondary" onclick="closeModal('modalNuevoChat')">Cancelar</button>`);
}

async function chatsEnviarNuevo() {
  const tel = document.getElementById('nuevoTel')?.value?.trim();
  const msg = document.getElementById('nuevoMsg')?.value?.trim();
  if (!tel || !msg) { toast('Completa teléfono y mensaje', 'error'); return; }
  try {
    const { conversacion_id } = await API.post('/tito/chats/iniciar', { telefono: tel, texto: msg });
    closeModal('modalNuevoChat');
    toast('Mensaje enviado', 'success');
    await chatsCargarLista();
    if (conversacion_id) await chatsAbrirConv(conversacion_id);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// Exponer funciones globalmente para onclick inline
window.chatsToogleManual  = chatsToogleManual;
window.chatsEnviar        = chatsEnviar;
window.chatsToggleBot     = chatsToggleBot;
window.chatsNuevoChat     = chatsNuevoChat;
window.chatsEnviarNuevo   = chatsEnviarNuevo;
