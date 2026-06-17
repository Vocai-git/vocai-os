// ── CHATS EN VIVO — Panel de intervención ────────────────────
// Polling cada 4s para mensajes nuevos

let chatsInterval = null;
let chatConvActiva = null;
let chatBotPausado = false;
let chatMensajesVistos = 0;
let chatBusqueda = '';
let chatArchivoPendiente = null;
let chatMediaRecorder = null;
let chatRecChunks = [];
let chatRecTimer = null;
let chatRecCancelado = false;

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
  white-space: pre-wrap;   /* respeta saltos de línea y espacios al mostrar el mensaje */
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
/* Doble-check de estado de entrega (estilo WhatsApp), solo en mensajes salientes */
.chat-check { margin-left: 4px; font-weight: 700; letter-spacing: -1px; opacity: .75; }
.chat-check.leido { color: #53bdeb; opacity: 1; }   /* ✓✓ azul = leído */
.chat-check.fallido { color: #ef4444; opacity: 1; cursor: help; letter-spacing: 0; }

/* Selector de plantillas (fuera de ventana de 24h) */
.chats-tpl-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.chats-tpl-modal {
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 14px;
  width: 100%; max-width: 440px; padding: 20px;
  box-shadow: 0 12px 40px rgba(0,0,0,.3);
}
.chats-tpl-title { margin: 0 0 6px; font-size: 1.05rem; }
.chats-tpl-sub { margin: 0 0 16px; font-size: .85rem; color: var(--text-muted); line-height: 1.45; }
.chats-tpl-list { display: flex; flex-direction: column; gap: 8px; }
.chats-tpl-opt {
  text-align: left; width: 100%;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 14px; font-size: .9rem; color: var(--text); cursor: pointer;
  transition: border-color .15s, background .15s;
}
.chats-tpl-opt:hover { border-color: var(--azul); background: var(--bg); }
.chats-tpl-cancel {
  margin-top: 14px; width: 100%;
  background: transparent; border: none; color: var(--text-muted);
  padding: 8px; font-size: .85rem; cursor: pointer;
}
.chats-tpl-cancel:hover { color: var(--text); }

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

/* ── Botones de adjuntar / micrófono ── */
.chats-icon-btn {
  width: 42px; height: 42px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--border);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: all .15s;
}
.chats-icon-btn:hover { color: var(--text); border-color: var(--accent); }
.chats-icon-btn svg { width: 18px; height: 18px; }
.chats-icon-btn.grabando { background: var(--coral); border-color: var(--coral); color: #fff; animation: pulse-rec 1.2s infinite; }
@keyframes pulse-rec { 0%,100% { opacity: 1; } 50% { opacity: .55; } }

/* ── Preview de archivo a enviar ── */
.chats-file-preview {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; margin-bottom: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.chats-file-preview img { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.chats-file-preview .fp-ico { width: 40px; height: 40px; display:flex; align-items:center; justify-content:center; background: var(--surface); border-radius:6px; flex-shrink:0; }
.chats-file-preview .fp-name { flex: 1; font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chats-file-preview .fp-size { font-size: 11px; color: var(--text-muted); }
.chats-file-preview .fp-x { background:none; border:none; color: var(--text-muted); cursor:pointer; font-size:18px; line-height:1; padding:0 4px; }
.chats-rec-timer { flex:1; font-size:12px; color: var(--coral); font-weight:600; }

/* ── Burbujas de media ── */
.chat-bubble-media img { max-width: 240px; border-radius: 10px; display: block; cursor: pointer; }
.chat-bubble-media audio { max-width: 240px; display: block; }
.chat-bubble-doc {
  display: flex; align-items: center; gap: 10px;
  text-decoration: none; color: inherit;
}
.chat-bubble-doc .doc-ico { width: 34px; height: 34px; flex-shrink: 0; display:flex; align-items:center; justify-content:center; }
.chat-bubble-doc .doc-name { font-size: 13px; font-weight: 600; }
.chat-bubble-doc .doc-sub { font-size: 11px; opacity: .8; }
.chat-bubble-caption { margin-top: 6px; font-size: 13px; line-height: 1.5; }

/* ── Header: editar nombre / contacto ── */
.chats-head-icon-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); padding: 4px; border-radius: 6px;
  display: inline-flex; align-items: center;
}
.chats-head-icon-btn:hover { color: var(--accent); background: var(--surface-hover); }
.chats-head-icon-btn svg { width: 16px; height: 16px; }

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
  <div style="flex:1;min-width:0">
    <div class="chats-conv-head-name" style="display:flex;align-items:center;gap:6px">
      <span id="chatsHeadName">${escHtml(conv.cliente_nombre || conv.telefono)}</span>
      <button class="chats-head-icon-btn" title="Renombrar" onclick="chatsRenombrar('${id}')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
      </button>
    </div>
    <div class="chats-conv-head-tel">${escHtml(conv.telefono)}</div>
  </div>
  <button class="chats-head-icon-btn" title="Guardar como contacto" onclick="chatsModalContacto('${id}')" style="margin-right:4px">
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z"/></svg>
  </button>
  <button class="chats-takeover-btn ${conv.modo_manual ? 'devolver' : 'tomar'}" id="chatsTakeoverBtn"
    onclick="chatsToogleManual('${id}', ${conv.modo_manual})">
    ${conv.modo_manual ? '🤖 Devolver a Tito' : '✋ Tomar control'}
  </button>
</div>
<div class="chats-messages" id="chatsMsgs"></div>
<div class="chats-input-area ${conv.modo_manual ? '' : 'disabled'}" id="chatsInputArea">
  <div id="chatsFilePreview"></div>
  <div class="chats-input-row">
    <input type="file" id="chatsFileInput" style="display:none" onchange="chatsArchivoSeleccionado(event)">
    <button class="chats-icon-btn" id="chatsAttachBtn" title="Adjuntar archivo" onclick="document.getElementById('chatsFileInput').click()">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"/></svg>
    </button>
    <button class="chats-icon-btn" id="chatsMicBtn" title="Grabar audio" onclick="chatsToggleGrabacion('${id}')">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
    </button>
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

// Convierte el formato de texto de WhatsApp a HTML para mostrarlo en la burbuja:
//   *negrita*  _cursiva_  ~tachado~  ```mono```
// Escapa primero el HTML (seguridad); los saltos de línea los respeta el CSS pre-wrap.
function formatoWhatsApp(texto) {
  let t = escHtml(texto || '');
  t = t.replace(/```([^`]+)```/g, '<code>$1</code>');                              // ```mono```
  t = t.replace(/(^|[\s(>])\*([^*\n]+)\*(?=[\s).,!?;:<]|$)/g, '$1<strong>$2</strong>'); // *negrita*
  t = t.replace(/(^|[\s(>])~([^~\n]+)~(?=[\s).,!?;:<]|$)/g, '$1<del>$2</del>');         // ~tachado~
  t = t.replace(/(^|[\s(>])_([^_\n]+)_(?=[\s).,!?;:<]|$)/g, '$1<em>$2</em>');           // _cursiva_
  return t;
}

// Icono de estado de entrega para mensajes SALIENTES (no para los del cliente).
//   enviado   → ✓     (aceptado por WhatsApp)
//   entregado → ✓✓    (llegó al teléfono)
//   leido     → ✓✓    azul (el contacto lo abrió)
//   fallido   → ⚠ rojo (no se entregó; el motivo va en el tooltip)
function chatEstadoIcono(m) {
  if (!m.rol || m.rol === 'cliente') return '';
  if (m.estado === 'fallido') {
    const motivo = m.error_motivo || 'No se pudo entregar';
    const motivoJs = motivo.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]+/g, ' ');
    return `<span class="chat-check fallido" title="${escHtml('No entregado: ' + motivo)}" style="cursor:pointer" onclick="alert('⚠ Mensaje no entregado:\\n\\n' + '${motivoJs}')">⚠</span>`;
  }
  if (m.estado === 'leido')     return `<span class="chat-check leido" title="Leído">✓✓</span>`;
  if (m.estado === 'entregado') return `<span class="chat-check" title="Entregado">✓✓</span>`;
  // 'enviado' o sin dato (mensajes anteriores a esta función) → un check
  return `<span class="chat-check" title="Enviado">✓</span>`;
}

function chatsRenderMensajes(mensajes) {
  const el = document.getElementById('chatsMsgs');
  if (!el) return;

  el.innerHTML = mensajes.map(m => {
    const hora = m.creado_en
      ? new Date(m.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '';
    const rolLabel = m.rol === 'tito' ? 'Tito' : m.rol === 'sistema' ? 'Tito' : m.rol === 'humano' ? 'Tú' : 'Cliente';
    const showLabel = m.rol === 'humano';

    const cuerpo = (m.tipo && m.tipo !== 'texto' && m.media_url)
      ? chatMediaBubble(m)
      : `<div class="chat-bubble">${formatoWhatsApp(m.contenido || '')}</div>`;

    return `
<div class="chat-msg ${m.rol}">
  ${showLabel ? `<div class="chat-rol-label">${rolLabel}</div>` : ''}
  ${cuerpo}
  <div class="chat-msg-meta">${hora}${chatEstadoIcono(m)}</div>
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
  const texto = txt?.value?.trim() || '';

  // Si hay un archivo adjunto, se envía como media (el texto va de pie de foto)
  if (chatArchivoPendiente) {
    const file = chatArchivoPendiente;
    chatArchivoPendiente = null;
    chatsRenderPreview();
    if (txt) { txt.value = ''; txt.style.height = 'auto'; }
    try {
      await chatsEnviarMedia(id, file, texto);
      await chatsRefrescarMensajes();
    } catch (err) {
      toast('Error enviando archivo: ' + err.message, 'error');
      chatArchivoPendiente = file;
      chatsRenderPreview();
    }
    return;
  }

  if (!texto) return;
  txt.value = '';
  txt.style.height = 'auto';

  try {
    await API.post(`/tito/chats/${id}/enviar`, { texto });
    await chatsRefrescarMensajes();
  } catch (err) {
    txt.value = texto;
    if (err.codigo === 'fuera_de_ventana') {
      chatsOfrecerPlantilla(id);   // el contacto no escribió en 24h → ofrecer plantilla
    } else {
      toast('Error enviando: ' + err.message, 'error');
    }
  }
}

// Selector de plantillas: aparece cuando intentás escribir a un contacto fuera de la
// ventana de 24h. WhatsApp solo permite plantillas aprobadas para ese primer toque;
// apenas el contacto responde, ya se puede escribir libre.
async function chatsOfrecerPlantilla(id) {
  let plantillas = [];
  try {
    const r = await API.get('/tito/chats/plantillas');
    plantillas = r.plantillas || [];
  } catch (err) {
    toast('No pude cargar las plantillas: ' + err.message, 'error');
    return;
  }
  if (!plantillas.length) {
    toast('Este contacto no te ha escrito en 24h. Las plantillas de saludo aún están en revisión de Meta; cuando se aprueben podrás enviarle el primer mensaje.', 'error');
    return;
  }

  // Nombre conocido del contacto (si el encabezado no es un teléfono)
  const head = document.getElementById('chatsHeadName')?.textContent?.trim() || '';
  const nombreConocido = /^[+\d\s()-]+$/.test(head) ? '' : head;

  const ov = document.createElement('div');
  ov.className = 'chats-tpl-overlay';
  ov.innerHTML = `
<div class="chats-tpl-modal">
  <h3 class="chats-tpl-title">Fuera de la ventana de 24h</h3>
  <p class="chats-tpl-sub">Este contacto no te ha escrito en las últimas 24h, así que WhatsApp solo deja enviar una plantilla aprobada. Elegí cuál mandar — cuando responda, ya podrás escribirle libre.</p>
  <div class="chats-tpl-list">
    ${plantillas.map((p, i) => `
    <button class="chats-tpl-opt" data-i="${i}">${escHtml(p.texto)}</button>`).join('')}
  </div>
  <button class="chats-tpl-cancel">Cancelar</button>
</div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.querySelector('.chats-tpl-cancel').onclick = cerrar;
  ov.onclick = (e) => { if (e.target === ov) cerrar(); };

  ov.querySelectorAll('.chats-tpl-opt').forEach(btn => {
    btn.onclick = async () => {
      const p = plantillas[+btn.dataset.i];
      let parametro = null;
      let textoVisible = p.texto;
      if (p.tieneParametro) {
        const val = prompt('Nombre para personalizar el saludo:', nombreConocido);
        if (val === null) return;            // canceló el prompt
        parametro = val.trim();
        textoVisible = p.texto.replace(/\{\{\s*1\s*\}\}/, parametro || '');
      }
      cerrar();
      try {
        await API.post(`/tito/chats/${id}/enviar-plantilla`, { plantilla: p.name, parametro, texto: textoVisible, idioma: p.idioma });
        toast('Plantilla enviada ✓', 'success');
        await chatsRefrescarMensajes();
      } catch (err) {
        toast('Error enviando plantilla: ' + err.message, 'error');
      }
    };
  });
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
  const um = c.ultimo_mensaje;
  let preview = escHtml(um?.contenido?.slice(0, 55) || '');
  if (!preview && um?.tipo && um.tipo !== 'texto') {
    const ico = { imagen: '📷 Foto', audio: '🎤 Audio', video: '🎬 Vídeo', documento: '📎 Archivo' };
    preview = ico[um.tipo] || '📎 Archivo';
  }
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

// ── Media: render de burbujas ─────────────────────────────────

function chatMediaBubble(m) {
  const url = m.media_url;
  const cap = m.contenido ? `<div class="chat-bubble-caption">${formatoWhatsApp(m.contenido)}</div>` : '';

  if (m.tipo === 'imagen') {
    return `<div class="chat-bubble chat-bubble-media"><img src="${url}" alt="imagen" onclick="window.open('${url}','_blank')">${cap}</div>`;
  }
  if (m.tipo === 'audio') {
    return `<div class="chat-bubble chat-bubble-media"><audio controls src="${url}"></audio>${cap}</div>`;
  }
  if (m.tipo === 'video') {
    return `<div class="chat-bubble chat-bubble-media"><video controls src="${url}" style="max-width:240px;border-radius:10px"></video>${cap}</div>`;
  }
  // documento
  return `<div class="chat-bubble"><a class="chat-bubble-doc" href="${url}" target="_blank" rel="noopener">
    <span class="doc-ico"><svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg></span>
    <span><div class="doc-name">${escHtml(m.media_nombre || 'Archivo')}</div><div class="doc-sub">Descargar</div></span>
  </a>${cap}</div>`;
}

// ── Adjuntar archivo ──────────────────────────────────────────

function chatsArchivoSeleccionado(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  chatArchivoPendiente = file;
  chatsRenderPreview();
  event.target.value = ''; // permitir re-seleccionar el mismo archivo
}

function chatsRenderPreview() {
  const wrap = document.getElementById('chatsFilePreview');
  if (!wrap) return;
  if (!chatArchivoPendiente) { wrap.innerHTML = ''; return; }

  const f = chatArchivoPendiente;
  const kb = (f.size / 1024).toFixed(0);

  // Audio grabado: mostrar reproductor para escucharlo antes de enviar
  if (f.type.startsWith('audio/')) {
    wrap.innerHTML = `<div class="chats-file-preview">
      <button class="fp-x" title="Borrar audio" onclick="chatsQuitarArchivo()" style="font-size:20px">🗑</button>
      <audio controls src="${URL.createObjectURL(f)}" style="flex:1;height:36px"></audio>
      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">Pulsa enviar ▶</span>
    </div>`;
    return;
  }

  const esImg = f.type.startsWith('image/');
  const thumb = esImg
    ? `<img src="${URL.createObjectURL(f)}" alt="preview">`
    : `<div class="fp-ico"><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H8.25m2.25 0H5.625c-.621 0-1.125-.504-1.125-1.125V3.375c0-.621.504-1.125 1.125-1.125h6.75a9 9 0 019 9v8.25c0 .621-.504 1.125-1.125 1.125z"/></svg></div>`;

  wrap.innerHTML = `<div class="chats-file-preview">
    ${thumb}
    <div style="flex:1;min-width:0">
      <div class="fp-name">${escHtml(f.name)}</div>
      <div class="fp-size">${kb} KB</div>
    </div>
    <button class="fp-x" title="Quitar" onclick="chatsQuitarArchivo()">×</button>
  </div>`;
}

function chatsQuitarArchivo() {
  chatArchivoPendiente = null;
  chatsRenderPreview();
}

async function chatsEnviarMedia(id, file, caption = '') {
  const form = new FormData();
  form.append('archivo', file, file.name || 'archivo');
  if (caption) form.append('caption', caption);

  const res = await fetch(`/api/tito/chats/${id}/enviar-media`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('vocai_token')}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error enviando archivo');
}

// ── Grabar audio ──────────────────────────────────────────────

async function chatsToggleGrabacion(id) {
  // Si ya está grabando → detener (NO envía: queda en preview para escuchar/borrar/enviar)
  if (chatMediaRecorder && chatMediaRecorder.state === 'recording') {
    chatRecCancelado = false;
    chatMediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Tu navegador no permite grabar audio', 'error');
    return;
  }

  // Si había un audio o archivo en preview, lo descartamos antes de grabar uno nuevo
  chatArchivoPendiente = null;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    chatRecChunks = [];
    chatRecCancelado = false;
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    chatMediaRecorder = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      audioBitsPerSecond: 128000
    });

    chatMediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chatRecChunks.push(e.data); };
    chatMediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      chatsRecUI(false);
      const rec = chatMediaRecorder;
      chatMediaRecorder = null;

      if (chatRecCancelado) { chatRecChunks = []; return; }

      const blob = new Blob(chatRecChunks, { type: rec.mimeType || 'audio/ogg' });
      const ext = (rec.mimeType || 'ogg').includes('webm') ? 'webm' : 'ogg';
      // Dejarlo en preview; se envía con el botón de enviar (como un adjunto más)
      chatArchivoPendiente = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
      chatsRenderPreview();
    };

    chatMediaRecorder.start();
    chatsRecUI(true);
  } catch (err) {
    toast('No se pudo acceder al micrófono', 'error');
  }
}

// Cancelar la grabación en curso sin guardarla
function chatsCancelarGrabacion() {
  if (chatMediaRecorder && chatMediaRecorder.state === 'recording') {
    chatRecCancelado = true;
    chatMediaRecorder.stop();
  } else {
    chatsRecUI(false);
  }
}

function chatsRecUI(grabando) {
  const btn = document.getElementById('chatsMicBtn');
  if (btn) btn.classList.toggle('grabando', grabando);
  const wrap = document.getElementById('chatsFilePreview');
  if (!wrap) return;
  if (grabando) {
    let segs = 0;
    const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    wrap.innerHTML = `<div class="chats-file-preview">
      <button class="fp-x" title="Cancelar" onclick="chatsCancelarGrabacion()" style="font-size:20px">🗑</button>
      <span class="chats-rec-timer">● Grabando… <span id="chatsRecTime">00:00</span></span>
      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">Toca el micro para parar</span>
    </div>`;
    chatRecTimer = setInterval(() => {
      segs++;
      const t = document.getElementById('chatsRecTime');
      if (t) t.textContent = fmt(segs);
    }, 1000);
  } else {
    if (chatRecTimer) { clearInterval(chatRecTimer); chatRecTimer = null; }
    if (!chatArchivoPendiente) wrap.innerHTML = '';
  }
}

// ── Renombrar / Contacto ──────────────────────────────────────

async function chatsRenombrar(id) {
  const actual = document.getElementById('chatsHeadName')?.textContent?.trim() || '';
  const nombre = prompt('Nombre de la persona:', actual);
  if (nombre === null) return;
  const limpio = nombre.trim();
  if (!limpio) return;
  try {
    await API.patch(`/tito/chats/${id}`, { nombre: limpio });
    const el = document.getElementById('chatsHeadName');
    if (el) el.textContent = limpio;
    toast('Nombre guardado', 'success');
    await chatsCargarLista();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function chatsModalContacto(id) {
  let lead = null, telefono = '', nombre = '';
  try {
    const info = await API.get(`/tito/chats/${id}/contacto`);
    lead = info.lead; telefono = info.telefono || ''; nombre = info.cliente_nombre || lead?.nombre || '';
  } catch { /* sigue con vacíos */ }

  const inputStyle = 'width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;box-sizing:border-box';
  const labelStyle = 'font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px';

  createModal('modalContacto', lead?.es_contacto ? 'Editar contacto' : 'Guardar como contacto', `
<div style="display:flex;flex-direction:column;gap:12px">
  <div><label style="${labelStyle}">Teléfono</label>
    <input value="${escHtml(telefono)}" disabled style="${inputStyle};opacity:.6"></div>
  <div><label style="${labelStyle}">Nombre</label>
    <input id="contNombre" value="${escHtml(nombre)}" placeholder="Nombre y apellido" style="${inputStyle}"></div>
  <div><label style="${labelStyle}">Sector / nicho</label>
    <input id="contNicho" value="${escHtml(lead?.nicho || '')}" placeholder="Ej: dentista, ecommerce…" style="${inputStyle}"></div>
  <div><label style="${labelStyle}">Email</label>
    <input id="contEmail" value="${escHtml(lead?.email || '')}" placeholder="opcional" style="${inputStyle}"></div>
  <div><label style="${labelStyle}">Notas</label>
    <textarea id="contNotas" rows="2" placeholder="opcional" style="${inputStyle};resize:none">${escHtml(lead?.notas || '')}</textarea></div>
</div>`,
  `<button class="btn btn-primary" onclick="chatsGuardarContacto('${id}')">Guardar contacto</button>
   <button class="btn btn-secondary" onclick="closeModal('modalContacto')">Cancelar</button>`);
}

async function chatsGuardarContacto(id) {
  const nombre = document.getElementById('contNombre')?.value?.trim();
  const nicho  = document.getElementById('contNicho')?.value?.trim();
  const email  = document.getElementById('contEmail')?.value?.trim();
  const notas  = document.getElementById('contNotas')?.value?.trim();
  if (!nombre) { toast('Ponle al menos un nombre', 'error'); return; }
  try {
    await API.post(`/tito/chats/${id}/contacto`, { nombre, nicho, email, notas });
    closeModal('modalContacto');
    toast('Contacto guardado — Tito ya lo recuerda', 'success');
    const el = document.getElementById('chatsHeadName');
    if (el) el.textContent = nombre;
    await chatsCargarLista();
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
window.chatsArchivoSeleccionado = chatsArchivoSeleccionado;
window.chatsQuitarArchivo = chatsQuitarArchivo;
window.chatsToggleGrabacion = chatsToggleGrabacion;
window.chatsCancelarGrabacion = chatsCancelarGrabacion;
window.chatsRenombrar     = chatsRenombrar;
window.chatsModalContacto = chatsModalContacto;
window.chatsGuardarContacto = chatsGuardarContacto;
