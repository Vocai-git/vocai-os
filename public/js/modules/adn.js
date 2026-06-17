/* ============================================================
   VOCAI OS — Módulo ADN de Cliente (v2)
   Incluye: paleta estructurada · tipografías · tipos de diseño
   ============================================================ */

let _adnClients = [];
let _adnCurrent = null; // { cliente, adn, pilares, referencias, tipos_diseno }

const POSICION_LOGO_OPCIONES = [
  { value: 'nunca', label: 'Nunca (sin logo)' },
  { value: 'solo-primero-ultimo', label: 'Solo primero y último slide' },
  { value: 'todos', label: 'En todos los slides' },
  { value: 'watermark', label: 'Marca de agua sutil' }
];

async function adnUpload(path, formData) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('vocai_token')}` },
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al subir archivo');
  return data;
}

async function renderAdn(el) {
  _adnClients = await API.get('/adn');

  el.innerHTML = `
    <div style="max-width:860px;margin:0 auto;">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
        <select id="adnClientSelect" class="form-input" style="flex:1;min-width:200px;">
          <option value="">Elegí un cliente…</option>
          ${_adnClients.map(c => `
            <option value="${c.id}">${escHtml(c.nombre)}${c.tiene_adn ? ' · ADN cargado' : ''}</option>
          `).join('')}
        </select>
      </div>
      <div id="adnBody"></div>
    </div>
  `;

  document.getElementById('adnClientSelect').addEventListener('change', (e) => {
    if (e.target.value) loadAdnClient(e.target.value);
    else document.getElementById('adnBody').innerHTML = emptyAdnState();
  });

  document.getElementById('adnBody').innerHTML = emptyAdnState();
}

function emptyAdnState() {
  return `
    <div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
      <div style="font-size:48px;margin-bottom:12px;">🧬</div>
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px;">
        Elegí un cliente para cargar o editar su ADN
      </div>
      <div style="font-size:13px;">ADN global + tipos de diseño + pilares = material que usa el Generador.</div>
    </div>
  `;
}

async function loadAdnClient(clientId) {
  const body = document.getElementById('adnBody');
  body.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    _adnCurrent = await API.get(`/adn/${clientId}`);
    if (!_adnCurrent.adn) _adnCurrent.adn = {};
    renderAdnBody();
  } catch (err) {
    body.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  }
}

function renderAdnBody() {
  const { cliente, adn, pilares, referencias, tipos_diseno } = _adnCurrent;
  const p = paletaStructured();

  document.getElementById('adnBody').innerHTML = `
    <!-- Info básica -->
    <div class="adn-card">
      <div class="adn-card-title">📋 Información básica</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="adn-label">Rubro</label>
          <input id="adn_rubro" class="form-input" value="${escHtml(adn.rubro||'')}" placeholder="Ej: Medicina integrativa">
        </div>
        <div>
          <label class="adn-label">Público objetivo</label>
          <input id="adn_publico" class="form-input" value="${escHtml(adn.publico_objetivo||'')}" placeholder="Ej: Mujeres 35-55, salud hormonal">
        </div>
      </div>
    </div>

    <!-- Logo -->
    <div class="adn-card">
      <div class="adn-card-title">🏷️ Logo</div>
      <div style="display:flex;gap:14px;align-items:center;">
        <div id="adnLogoPreview" class="adn-logo-preview">
          ${adn.logo_url
            ? `<img src="${adn.logo_url}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:8px;background:#fff;padding:4px;">`
            : cliente.nombre.charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;">
          <input type="file" id="adnLogoInput" accept="image/png,image/jpeg,image/webp" style="display:none;">
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('adnLogoInput').click()">
            ${adn.logo_url ? 'Cambiar logo' : 'Subir logo'}
          </button>
          <div style="font-size:11px;color:var(--text-dim);margin-top:6px;">PNG con fondo transparente, máx 5MB</div>
        </div>
      </div>
    </div>

    <!-- Paleta estructurada -->
    <div class="adn-card">
      <div class="adn-card-title">🎨 Paleta estructurada <span style="font-size:11px;color:var(--text-muted);font-weight:400;">· colores con rol</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
        ${paletaSlotEstructurado('fondo', 'Fondo', p.fondo)}
        ${paletaSlotEstructurado('primario', 'Primario', p.primario)}
        ${paletaSlotEstructurado('secundario', 'Secundario', p.secundario)}
        ${paletaSlotEstructurado('acento', 'Acento', p.acento)}
      </div>
    </div>

    <!-- Tipografías -->
    <div class="adn-card">
      <div class="adn-card-title">✒️ Tipografías y formato</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="adn-label">Tipografía primaria</label>
          <input id="adn_tipo_primaria" class="form-input" value="${escHtml(adn.tipografias_primaria||'')}" placeholder="Ej: Lora serif (protagonista)">
        </div>
        <div>
          <label class="adn-label">Tipografía secundaria</label>
          <input id="adn_tipo_secundaria" class="form-input" value="${escHtml(adn.tipografias_secundaria||'')}" placeholder="Ej: Montserrat sans-serif">
        </div>
      </div>
      <div style="margin-top:12px;">
        <label class="adn-label">Formato de exportación</label>
        <input id="adn_formato" class="form-input" value="${escHtml(adn.formato_export||'')}" placeholder="Ej: 1080x1350px (4:5 Instagram)">
      </div>
    </div>

    <!-- Tono -->
    <div class="adn-card">
      <div class="adn-card-title">🗣️ Tono de marca</div>
      <textarea id="adn_tono" class="form-textarea" style="min-height:80px;" placeholder="Cómo comunica la marca, 3-4 líneas">${escHtml(adn.tono||'')}</textarea>
    </div>

    <!-- Referencias -->
    <div class="adn-card">
      <div class="adn-card-title">🖼️ Referencias visuales <span style="font-size:11px;color:var(--text-muted);font-weight:400;">· imágenes del feed actual</span></div>
      <div id="adnRefsGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
        ${referencias.map(r => refSlot(r)).join('')}
        <input type="file" id="adnRefsInput" accept="image/png,image/jpeg,image/webp" multiple style="display:none;">
        <button class="adn-ref-add" onclick="document.getElementById('adnRefsInput').click()">
          <div style="font-size:20px;">+</div>
          <div>Subir</div>
        </button>
      </div>
    </div>

    <!-- Pilares -->
    <div class="adn-card">
      <div class="adn-card-title">🏛️ Pilares de contenido <span style="font-size:11px;color:var(--text-muted);font-weight:400;">· 3 a 5 pilares</span></div>
      <div id="adnPilaresList" style="display:flex;flex-direction:column;gap:10px;">
        ${pilares.map(p => pilarItem(p)).join('')}
        <button class="adn-pilar-add" onclick="addPilar()">+ Agregar pilar</button>
      </div>
    </div>

    <!-- Tipos de diseño -->
    <div class="adn-card">
      <div class="adn-card-title">🎭 Tipos de diseño <span style="font-size:11px;color:var(--text-muted);font-weight:400;">· sistema visual por categoría</span></div>
      <div id="adnTiposList" style="display:flex;flex-direction:column;gap:10px;">
        ${tipos_diseno.map(t => tipoDisenoCard(t)).join('')}
        <button class="adn-pilar-add" onclick="addTipoDiseno()">+ Agregar tipo de diseño</button>
      </div>
    </div>

    <!-- Reglas globales + errores -->
    <div class="adn-card">
      <div class="adn-card-title">📐 Reglas globales y errores frecuentes</div>
      <div style="margin-bottom:12px;">
        <label class="adn-label">Reglas globales (aplican a todos los tipos)</label>
        <textarea id="adn_reglas" class="form-textarea" style="min-height:80px;" placeholder="Ej: Todos los slides mantienen mismo fondo. Formato 4:5. Paleta única.">${escHtml(adn.reglas_globales||'')}</textarea>
      </div>
      <div>
        <label class="adn-label">Errores frecuentes a corregir</label>
        <textarea id="adn_errores" class="form-textarea" style="min-height:80px;" placeholder="Ej: Gemini duplica palabras, omite puntos finales, reinterpreta isotipo…">${escHtml(adn.errores_frecuentes||'')}</textarea>
      </div>
    </div>

    <!-- Guardar -->
    <div style="position:sticky;bottom:16px;margin-top:16px;">
      <button id="adnSaveBtn" class="btn btn-primary" style="width:100%;padding:14px;font-family:'Syne',sans-serif;letter-spacing:0.8px;" onclick="saveAdnBasic()">
        GUARDAR ADN
      </button>
    </div>
  `;

  document.getElementById('adnLogoInput').addEventListener('change', onLogoChange);
  document.getElementById('adnRefsInput').addEventListener('change', onRefsChange);
}

// === Paleta estructurada ==================================

function paletaStructured() {
  const def = { fondo: '', primario: '', secundario: '', acento: '' };
  const p = _adnCurrent.adn.paleta_hex_estructurada || def;
  return { ...def, ...p };
}

function paletaSlotEstructurado(key, label, hex) {
  const val = hex || '#000000';
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;align-items:center;gap:10px;">
      <input type="color" value="${val}" data-paleta-key="${key}"
             onchange="updatePaletaStructured('${key}', this.value)"
             style="width:44px;height:44px;border:none;border-radius:8px;cursor:pointer;background:transparent;padding:0;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${label}</div>
        <div id="paleta_hex_${key}" style="font-family:monospace;font-size:12px;color:var(--text);">${hex || '—'}</div>
      </div>
    </div>
  `;
}

function updatePaletaStructured(key, hex) {
  const p = paletaStructured();
  p[key] = hex.toUpperCase();
  _adnCurrent.adn.paleta_hex_estructurada = p;
  const el = document.getElementById(`paleta_hex_${key}`);
  if (el) el.textContent = p[key];
}

// === Slots simples ========================================

function refSlot(r) {
  return `
    <div class="adn-ref" data-id="${r.id}" style="aspect-ratio:1;border-radius:8px;position:relative;background:var(--surface);border:1px solid var(--border);overflow:hidden;">
      <img src="${r.imagen_url}" style="width:100%;height:100%;object-fit:cover;">
      <button class="adn-ref-remove" onclick="removeReference('${r.id}')"
              style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.7);color:#fff;border:none;cursor:pointer;font-size:13px;">×</button>
    </div>
  `;
}

function pilarItem(p) {
  return `
    <div class="adn-pilar" data-id="${p.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;gap:10px;align-items:flex-start;">
      <div style="flex:1;">
        <input class="adn-pilar-nombre" onblur="updatePilar('${p.id}')" value="${escHtml(p.nombre||'')}" placeholder="Nombre del pilar"
               style="width:100%;background:transparent;border:none;color:var(--text);font-family:inherit;font-size:14px;font-weight:600;margin-bottom:4px;outline:none;">
        <textarea class="adn-pilar-desc" onblur="updatePilar('${p.id}')" placeholder="Descripción corta"
                  style="width:100%;background:transparent;border:none;color:var(--text-muted);font-family:inherit;font-size:13px;outline:none;resize:none;min-height:20px;">${escHtml(p.descripcion||'')}</textarea>
      </div>
      <button onclick="deletePilar('${p.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:16px;padding:4px;">🗑</button>
    </div>
  `;
}

// === Tipos de diseño =====================================

function tipoDisenoCard(t) {
  const opts = POSICION_LOGO_OPCIONES.map(o =>
    `<option value="${o.value}" ${t.posicion_logo === o.value ? 'selected' : ''}>${o.label}</option>`
  ).join('');

  return `
    <details class="adn-tipo" data-id="${t.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
      <summary style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none;">
        <span style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--coral);">${escHtml(t.nombre||'Sin nombre')}</span>
        <span style="flex:1;font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(t.descripcion_corta||'')}</span>
        <button onclick="event.stopPropagation();event.preventDefault();deleteTipo('${t.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:4px;">🗑</button>
        <span style="color:var(--text-muted);font-size:11px;">▾</span>
      </summary>
      <div style="padding:14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px;">
        <div>
          <label class="adn-label">Nombre</label>
          <input class="form-input t-nombre" onblur="updateTipo('${t.id}')" value="${escHtml(t.nombre||'')}">
        </div>
        <div>
          <label class="adn-label">Descripción corta</label>
          <input class="form-input t-descripcion_corta" onblur="updateTipo('${t.id}')" value="${escHtml(t.descripcion_corta||'')}">
        </div>
        <div>
          <label class="adn-label">Referencias estéticas</label>
          <input class="form-input t-referencias_esteticas" onblur="updateTipo('${t.id}')" value="${escHtml(t.referencias_esteticas||'')}" placeholder="Ej: Goop, Kinfolk, Estée Lauder">
        </div>
        <div>
          <label class="adn-label">Sensación</label>
          <input class="form-input t-sensacion" onblur="updateTipo('${t.id}')" value="${escHtml(t.sensacion||'')}" placeholder="Ej: Libro ilustrado premium">
        </div>
        <div>
          <label class="adn-label">ADN visual (reglas completas)</label>
          <textarea class="form-textarea t-adn_visual" onblur="updateTipo('${t.id}')" style="min-height:120px;">${escHtml(t.adn_visual||'')}</textarea>
        </div>
        <div>
          <label class="adn-label">Prompt positivo (lo que SÍ)</label>
          <textarea class="form-textarea t-prompt_positivo" onblur="updateTipo('${t.id}')" style="min-height:70px;" placeholder="Ej: Editorial magazine style, centered composition…">${escHtml(t.prompt_positivo||'')}</textarea>
        </div>
        <div>
          <label class="adn-label">Prompt negativo (lo que NO)</label>
          <textarea class="form-textarea t-prompt_negativo" onblur="updateTipo('${t.id}')" style="min-height:70px;" placeholder="Ej: No photographs, no sans-serif, no bright colors">${escHtml(t.prompt_negativo||'')}</textarea>
        </div>
        <div>
          <label class="adn-label">Posición del logo</label>
          <select class="form-input t-posicion_logo" onchange="updateTipo('${t.id}')">${opts}</select>
        </div>
      </div>
    </details>
  `;
}

async function addTipoDiseno() {
  try {
    const nuevo = await API.post(`/adn/${_adnCurrent.cliente.id}/tipos`, {
      nombre: 'Nuevo tipo',
      posicion_logo: 'nunca'
    });
    _adnCurrent.tipos_diseno.push(nuevo);
    refreshTiposList();
    setTimeout(() => {
      const card = document.querySelector(`.adn-tipo[data-id="${nuevo.id}"]`);
      if (card) { card.open = true; card.querySelector('.t-nombre').focus(); card.querySelector('.t-nombre').select(); }
    }, 50);
  } catch (err) { toast(err.message, 'error'); }
}

async function updateTipo(id) {
  const card = document.querySelector(`.adn-tipo[data-id="${id}"]`);
  if (!card) return;
  const body = {
    nombre: card.querySelector('.t-nombre').value.trim(),
    descripcion_corta: card.querySelector('.t-descripcion_corta').value.trim(),
    referencias_esteticas: card.querySelector('.t-referencias_esteticas').value.trim(),
    sensacion: card.querySelector('.t-sensacion').value.trim(),
    adn_visual: card.querySelector('.t-adn_visual').value.trim(),
    prompt_positivo: card.querySelector('.t-prompt_positivo').value.trim(),
    prompt_negativo: card.querySelector('.t-prompt_negativo').value.trim(),
    posicion_logo: card.querySelector('.t-posicion_logo').value
  };
  try {
    const updated = await API.put(`/adn/tipos/${id}`, body);
    const idx = _adnCurrent.tipos_diseno.findIndex(t => t.id === id);
    if (idx > -1) _adnCurrent.tipos_diseno[idx] = updated;
    // Actualizar el summary sin re-render completo
    const summary = card.querySelector('summary span:first-child');
    if (summary) summary.textContent = updated.nombre || 'Sin nombre';
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteTipo(id) {
  if (!confirm('¿Eliminar este tipo de diseño?')) return;
  try {
    await API.del(`/adn/tipos/${id}`);
    _adnCurrent.tipos_diseno = _adnCurrent.tipos_diseno.filter(t => t.id !== id);
    refreshTiposList();
    toast('Tipo eliminado', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

function refreshTiposList() {
  const list = document.getElementById('adnTiposList');
  list.innerHTML = _adnCurrent.tipos_diseno.map(t => tipoDisenoCard(t)).join('')
    + '<button class="adn-pilar-add" onclick="addTipoDiseno()">+ Agregar tipo de diseño</button>';
}

// === Actions globales =====================================

async function saveAdnBasic() {
  const btn = document.getElementById('adnSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const body = {
      rubro: document.getElementById('adn_rubro').value.trim(),
      publico_objetivo: document.getElementById('adn_publico').value.trim(),
      tono: document.getElementById('adn_tono').value.trim(),
      paleta_hex_estructurada: _adnCurrent.adn.paleta_hex_estructurada || {},
      tipografias_primaria: document.getElementById('adn_tipo_primaria').value.trim(),
      tipografias_secundaria: document.getElementById('adn_tipo_secundaria').value.trim(),
      formato_export: document.getElementById('adn_formato').value.trim(),
      reglas_globales: document.getElementById('adn_reglas').value.trim(),
      errores_frecuentes: document.getElementById('adn_errores').value.trim()
    };
    const updated = await API.put(`/adn/${_adnCurrent.cliente.id}`, body);
    _adnCurrent.adn = updated;
    toast('ADN guardado', 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally {
    btn.disabled = false;
    btn.textContent = 'GUARDAR ADN';
  }
}

// === Logo ===================================================

async function onLogoChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { logo_url } = await adnUpload(`/adn/${_adnCurrent.cliente.id}/logo`, fd);
    _adnCurrent.adn.logo_url = logo_url;
    document.getElementById('adnLogoPreview').innerHTML =
      `<img src="${logo_url}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:8px;background:#fff;padding:4px;">`;
    toast('Logo actualizado', 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally { e.target.value = ''; }
}

// === Referencias ============================================

async function onRefsChange(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  try {
    const nuevas = await adnUpload(`/adn/${_adnCurrent.cliente.id}/referencias`, fd);
    _adnCurrent.referencias.push(...nuevas);
    refreshRefsGrid();
    toast(`${nuevas.length} imagen${nuevas.length > 1 ? 'es' : ''} subida${nuevas.length > 1 ? 's' : ''}`, 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally { e.target.value = ''; }
}

async function removeReference(id) {
  if (!confirm('¿Eliminar esta referencia?')) return;
  try {
    await API.del(`/adn/referencias/${id}`);
    _adnCurrent.referencias = _adnCurrent.referencias.filter(r => r.id !== id);
    refreshRefsGrid();
    toast('Referencia eliminada', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

function refreshRefsGrid() {
  const grid = document.getElementById('adnRefsGrid');
  grid.innerHTML = _adnCurrent.referencias.map(r => refSlot(r)).join('')
    + `<input type="file" id="adnRefsInput" accept="image/png,image/jpeg,image/webp" multiple style="display:none;">
       <button class="adn-ref-add" onclick="document.getElementById('adnRefsInput').click()">
         <div style="font-size:20px;">+</div>
         <div>Subir</div>
       </button>`;
  document.getElementById('adnRefsInput').addEventListener('change', onRefsChange);
}

// === Pilares =================================================

async function addPilar() {
  try {
    const nuevo = await API.post(`/adn/${_adnCurrent.cliente.id}/pilares`, {
      nombre: 'Nuevo pilar',
      descripcion: ''
    });
    _adnCurrent.pilares.push(nuevo);
    refreshPilares();
    setTimeout(() => {
      const el = document.querySelector(`.adn-pilar[data-id="${nuevo.id}"] .adn-pilar-nombre`);
      if (el) { el.focus(); el.select(); }
    }, 50);
  } catch (err) { toast(err.message, 'error'); }
}

async function updatePilar(id) {
  const item = document.querySelector(`.adn-pilar[data-id="${id}"]`);
  if (!item) return;
  const nombre = item.querySelector('.adn-pilar-nombre').value.trim();
  const descripcion = item.querySelector('.adn-pilar-desc').value.trim();
  const pilar = _adnCurrent.pilares.find(p => p.id === id);
  if (pilar && pilar.nombre === nombre && pilar.descripcion === descripcion) return;
  try {
    const updated = await API.put(`/adn/pilares/${id}`, { nombre, descripcion });
    const idx = _adnCurrent.pilares.findIndex(p => p.id === id);
    if (idx > -1) _adnCurrent.pilares[idx] = updated;
  } catch (err) { toast(err.message, 'error'); }
}

async function deletePilar(id) {
  if (!confirm('¿Eliminar este pilar?')) return;
  try {
    await API.del(`/adn/pilares/${id}`);
    _adnCurrent.pilares = _adnCurrent.pilares.filter(p => p.id !== id);
    refreshPilares();
  } catch (err) { toast(err.message, 'error'); }
}

function refreshPilares() {
  const list = document.getElementById('adnPilaresList');
  list.innerHTML = _adnCurrent.pilares.map(p => pilarItem(p)).join('')
    + '<button class="adn-pilar-add" onclick="addPilar()">+ Agregar pilar</button>';
}
