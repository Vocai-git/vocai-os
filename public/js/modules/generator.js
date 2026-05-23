/* ============================================================
   VOCAI OS — Módulo Generador de Contenido
   ============================================================ */

let _genClientes = [];
let _genPilares = [];
let _genTipos = [];
let _genState = {
  cliente_id: '',
  pilar_id: '',
  tipo_diseno_id: '',
  tipo: 'carrusel',
  cantidad: 6,
  modo_brief: 'topico_corto',
  referencias_modo: 'guardadas',
  newFiles: []
};
let _genLastResult = null;

async function renderGenerator(el) {
  _genClientes = await API.get('/generator/clientes-ready');

  el.innerHTML = `
    <div style="max-width:860px;margin:0 auto;">

      <div id="genForm">
        <!-- PASO 1: Cliente y pilar -->
        <div class="gen-card">
          <div class="gen-card-header">
            <div class="gen-step-num">1</div>
            <div class="gen-card-title">¿Para quién y sobre qué?</div>
          </div>
          ${_genClientes.length === 0 ? `
            <div class="alert" style="background:rgba(255,140,66,0.1);border:1px solid rgba(255,140,66,0.3);color:#FF8C42;padding:14px;border-radius:8px;">
              No hay clientes con ADN, pilares y tipos de diseño cargados. Andá a <b>ADN Clientes</b> y completá al menos un cliente.
            </div>
          ` : `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
              <div>
                <label class="gen-label">Cliente</label>
                <select id="genClienteSel" class="form-input">
                  <option value="">Elegí un cliente…</option>
                  ${_genClientes.map(c => `<option value="${c.id}">${escHtml(c.nombre)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="gen-label">Pilar de contenido</label>
                <select id="genPilarSel" class="form-input" disabled>
                  <option value="">Elegí primero el cliente</option>
                </select>
              </div>
            </div>
            <div>
              <label class="gen-label">Tipo de diseño</label>
              <select id="genTipoSel" class="form-input" disabled>
                <option value="">Elegí primero el cliente</option>
              </select>
            </div>
            <div id="genClientPreview" style="display:none;margin-top:10px;"></div>
          `}
        </div>

        <!-- PASO 2: Formato -->
        <div class="gen-card">
          <div class="gen-card-header">
            <div class="gen-step-num">2</div>
            <div class="gen-card-title">Formato</div>
          </div>
          <div class="gen-format-grid" style="margin-bottom:16px;">
            <div class="gen-format-btn active" data-tipo="carrusel">
              <svg class="gen-format-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="5" width="14" height="14" rx="2" stroke-width="2"/><rect x="7" y="9" width="14" height="14" rx="2" stroke-width="2" opacity="0.5"/></svg>
              <div class="gen-format-label">Carrusel</div>
              <div class="gen-format-sub">Post 1:1</div>
            </div>
            <div class="gen-format-btn" data-tipo="historia">
              <svg class="gen-format-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="7" y="3" width="10" height="18" rx="2" stroke-width="2"/></svg>
              <div class="gen-format-label">Historia</div>
              <div class="gen-format-sub">Vertical 9:16</div>
            </div>
          </div>
          <div>
            <label class="gen-label">Cantidad de slides</label>
            <div class="gen-stepper-row">
              <div class="gen-stepper">
                <button class="gen-stepper-btn" id="btnMinus" type="button">−</button>
                <input class="gen-stepper-value" id="qtyInput" type="number" value="6" min="1" max="20">
                <button class="gen-stepper-btn" id="btnPlus" type="button">+</button>
              </div>
              <div class="gen-stepper-hint">Tenés <strong><span id="qtyEcho">6</span> imágenes</strong> para generar</div>
            </div>
          </div>
        </div>

        <!-- PASO 3: Brief -->
        <div class="gen-card">
          <div class="gen-card-header">
            <div class="gen-step-num">3</div>
            <div class="gen-card-title">¿Qué querés contar?</div>
          </div>
          <div style="margin-bottom:14px;">
            <label class="gen-label">Modo</label>
            <div class="gen-radio-group" data-field="modo_brief">
              <div class="gen-radio-card active" data-value="topico_corto">
                <div class="gen-radio-dot"></div>
                <div class="gen-radio-text">
                  <div class="gen-radio-title">Tópico corto</div>
                  <div class="gen-radio-desc">Escribí el tema en una frase y la IA desarrolla el guion</div>
                </div>
              </div>
              <div class="gen-radio-card" data-value="guion_completo">
                <div class="gen-radio-dot"></div>
                <div class="gen-radio-text">
                  <div class="gen-radio-title">Guion completo</div>
                  <div class="gen-radio-desc">Ya tenés el texto escrito, la IA solo lo adapta a slides</div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label class="gen-label">Brief</label>
            <textarea id="genBrief" class="form-textarea" style="min-height:100px;" placeholder="Ej: los 3 errores más comunes al cepillarse los dientes y cómo evitarlos"></textarea>
          </div>
        </div>

        <!-- PASO 4: Referencias -->
        <div class="gen-card">
          <div class="gen-card-header">
            <div class="gen-step-num">4</div>
            <div class="gen-card-title">Referencias visuales</div>
          </div>
          <div class="gen-radio-group" data-field="referencias_modo" id="refsGroup">
            <div class="gen-radio-card active" data-value="guardadas">
              <div class="gen-radio-dot"></div>
              <div class="gen-radio-text">
                <div class="gen-radio-title">Usar las guardadas del cliente</div>
                <div class="gen-radio-desc" id="refsDescGuardadas">—</div>
              </div>
            </div>
            <div class="gen-radio-card" data-value="nuevas">
              <div class="gen-radio-dot"></div>
              <div class="gen-radio-text">
                <div class="gen-radio-title">Subir nuevas solo para esta generación</div>
                <div class="gen-radio-desc">No reemplaza las guardadas</div>
              </div>
            </div>
            <div class="gen-radio-card" data-value="ambas">
              <div class="gen-radio-dot"></div>
              <div class="gen-radio-text">
                <div class="gen-radio-title">Usar ambas</div>
                <div class="gen-radio-desc">Guardadas + nuevas para esta generación</div>
              </div>
            </div>
          </div>
          <div id="refsUploader" style="display:none;margin-top:12px;">
            <input type="file" id="genFilesInput" accept="image/*" multiple style="display:none;">
            <div class="gen-uploader" onclick="document.getElementById('genFilesInput').click()"
                 style="border:1.5px dashed var(--border-light);border-radius:8px;padding:24px 16px;text-align:center;color:var(--text-muted);cursor:pointer;background:#181818;">
              <div style="font-size:13px;font-weight:500;">Click para seleccionar imágenes</div>
              <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">JPG o PNG · máx 5MB c/u</div>
            </div>
            <div id="genNewFilesList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;margin-top:10px;"></div>
          </div>
        </div>

        <!-- Generar -->
        <button id="genSubmitBtn" class="btn btn-primary" style="width:100%;padding:18px;font-family:'Syne',sans-serif;font-size:15px;letter-spacing:1px;text-transform:uppercase;margin-top:8px;" ${_genClientes.length === 0 ? 'disabled' : ''}>
          <span id="genSubmitLabel">Generar 6 imágenes</span>
        </button>
        <div style="text-align:center;margin-top:14px;color:var(--text-muted);font-size:12px;">
          Tarda ~1 minuto · se guarda automáticamente
        </div>
      </div>

      <!-- Resultado aparece acá -->
      <div id="genResult"></div>

    </div>
  `;

  attachGeneratorHandlers();
  updateReferenciaLabel();
}

function attachGeneratorHandlers() {
  const clienteSel = document.getElementById('genClienteSel');
  if (clienteSel) clienteSel.addEventListener('change', onClienteChange);

  document.querySelectorAll('.gen-format-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.gen-format-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      _genState.tipo = b.dataset.tipo;
    });
  });

  const qtyInput = document.getElementById('qtyInput');
  const qtyEcho = document.getElementById('qtyEcho');
  const submitLabel = document.getElementById('genSubmitLabel');
  const updateQty = () => {
    let v = parseInt(qtyInput.value, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 20) v = 20;
    qtyInput.value = v;
    _genState.cantidad = v;
    qtyEcho.textContent = v;
    submitLabel.textContent = `Generar ${v} ${v === 1 ? 'imagen' : 'imágenes'}`;
  };
  document.getElementById('btnMinus').addEventListener('click', () => {
    qtyInput.value = Math.max(1, parseInt(qtyInput.value, 10) - 1);
    updateQty();
  });
  document.getElementById('btnPlus').addEventListener('click', () => {
    qtyInput.value = Math.min(20, parseInt(qtyInput.value, 10) + 1);
    updateQty();
  });
  qtyInput.addEventListener('input', updateQty);

  document.querySelectorAll('.gen-radio-group').forEach(group => {
    const field = group.dataset.field;
    group.querySelectorAll('.gen-radio-card').forEach(card => {
      card.addEventListener('click', () => {
        group.querySelectorAll('.gen-radio-card').forEach(x => x.classList.remove('active'));
        card.classList.add('active');
        _genState[field] = card.dataset.value;
        if (field === 'referencias_modo') updateReferenciaLabel();
      });
    });
  });

  const filesInput = document.getElementById('genFilesInput');
  if (filesInput) {
    filesInput.addEventListener('change', (e) => {
      _genState.newFiles = Array.from(e.target.files);
      renderNewFilesList();
    });
  }

  const submitBtn = document.getElementById('genSubmitBtn');
  if (submitBtn) submitBtn.addEventListener('click', runGenerate);
}

async function onClienteChange(e) {
  const id = e.target.value;
  _genState.cliente_id = id;
  _genState.pilar_id = '';
  _genState.tipo_diseno_id = '';
  const pilarSel = document.getElementById('genPilarSel');
  const tipoSel = document.getElementById('genTipoSel');
  const preview = document.getElementById('genClientPreview');

  if (!id) {
    pilarSel.innerHTML = '<option value="">Elegí primero el cliente</option>';
    pilarSel.disabled = true;
    tipoSel.innerHTML = '<option value="">Elegí primero el cliente</option>';
    tipoSel.disabled = true;
    preview.style.display = 'none';
    updateReferenciaLabel();
    return;
  }

  try {
    const [pilares, tipos] = await Promise.all([
      API.get(`/generator/${id}/pilares`),
      API.get(`/generator/${id}/tipos`)
    ]);
    _genPilares = pilares;
    _genTipos = tipos;

    pilarSel.innerHTML = '<option value="">Elegí un pilar…</option>' +
      _genPilares.map(p => `<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('');
    pilarSel.disabled = false;
    pilarSel.onchange = (ev) => { _genState.pilar_id = ev.target.value; };

    tipoSel.innerHTML = '<option value="">Elegí un tipo…</option>' +
      _genTipos.map(t => `<option value="${t.id}">${escHtml(t.nombre)}${t.descripcion_corta ? ' — ' + escHtml(t.descripcion_corta.slice(0,40)) : ''}</option>`).join('');
    tipoSel.disabled = false;
    tipoSel.onchange = (ev) => { _genState.tipo_diseno_id = ev.target.value; };

    const cliente = _genClientes.find(c => c.id === id);
    if (cliente) {
      preview.innerHTML = clientPreviewHtml(cliente);
      preview.style.display = 'block';
    }
    updateReferenciaLabel();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function clientPreviewHtml(c) {
  const paletaDots = (c.paleta || []).slice(0, 5).map(hex =>
    `<div style="width:14px;height:14px;border-radius:50%;background:${hex};border:1px solid rgba(255,255,255,0.1);"></div>`
  ).join('');
  const logoHtml = c.logo_url
    ? `<img src="${c.logo_url}" style="width:100%;height:100%;object-fit:contain;background:#fff;padding:2px;">`
    : c.nombre.charAt(0).toUpperCase();
  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#181818;border-radius:8px;border:1px solid var(--border);">
      <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#2979FF,#FF6B6B);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;overflow:hidden;">${logoHtml}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;">${escHtml(c.nombre)}</div>
        <div style="font-size:11px;color:var(--text-muted);">${escHtml(c.rubro || 'Sin rubro')} · ADN cargado</div>
      </div>
      <div style="display:flex;gap:4px;">${paletaDots}</div>
    </div>`;
}

function updateReferenciaLabel() {
  const desc = document.getElementById('refsDescGuardadas');
  const uploaderBlock = document.getElementById('refsUploader');
  if (!desc) return;
  const cliente = _genClientes.find(c => c.id === _genState.cliente_id);
  desc.textContent = cliente ? `Cargadas en su ADN visual` : 'Elegí un cliente para ver sus referencias';
  if (uploaderBlock) {
    uploaderBlock.style.display = (_genState.referencias_modo === 'nuevas' || _genState.referencias_modo === 'ambas') ? 'block' : 'none';
  }
}

function renderNewFilesList() {
  const list = document.getElementById('genNewFilesList');
  if (!list) return;
  list.innerHTML = _genState.newFiles.map((f, i) => `
    <div style="aspect-ratio:1;border-radius:6px;background:linear-gradient(135deg,#00C48C22,#2979FF22);border:1px solid var(--border);position:relative;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-muted);padding:4px;text-align:center;overflow:hidden;">
      ${escHtml(f.name.slice(0, 20))}
      <button onclick="removeNewFile(${i})" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.7);color:#fff;border:none;cursor:pointer;font-size:11px;">×</button>
    </div>
  `).join('');
}

function removeNewFile(idx) {
  _genState.newFiles.splice(idx, 1);
  renderNewFilesList();
}

async function runGenerate() {
  const btn = document.getElementById('genSubmitBtn');
  const result = document.getElementById('genResult');

  // Validación frontend
  if (!_genState.cliente_id) return toast('Elegí un cliente', 'error');
  if (!_genState.pilar_id) return toast('Elegí un pilar', 'error');
  if (!_genState.tipo_diseno_id) return toast('Elegí un tipo de diseño', 'error');
  const brief = document.getElementById('genBrief').value.trim();
  if (!brief) return toast('Escribí un brief', 'error');
  if ((_genState.referencias_modo === 'nuevas' || _genState.referencias_modo === 'ambas') && _genState.newFiles.length === 0) {
    return toast('Seleccioná al menos una imagen nueva', 'error');
  }

  btn.disabled = true;
  document.getElementById('genSubmitLabel').textContent = 'Generando…';
  result.innerHTML = renderLoadingPanel(_genState.cantidad);
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const fd = new FormData();
    fd.append('cliente_id', _genState.cliente_id);
    fd.append('pilar_id', _genState.pilar_id);
    fd.append('tipo_diseno_id', _genState.tipo_diseno_id);
    fd.append('tipo', _genState.tipo);
    fd.append('cantidad', _genState.cantidad);
    fd.append('brief', brief);
    fd.append('modo_brief', _genState.modo_brief);
    fd.append('referencias_modo', _genState.referencias_modo);
    _genState.newFiles.forEach(f => fd.append('files', f));

    const res = await fetch('/api/generator/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('vocai_token')}` },
      body: fd
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del servidor');

    _genLastResult = data;
    result.innerHTML = renderResultPanel(data);
    toast('Generación completada', 'success');
  } catch (err) {
    result.innerHTML = `<div class="alert alert-error" style="padding:14px;border-radius:8px;background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.3);color:#FF6B6B;">Error: ${escHtml(err.message)}</div>`;
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    document.getElementById('genSubmitLabel').textContent = `Generar ${_genState.cantidad} ${_genState.cantidad === 1 ? 'imagen' : 'imágenes'}`;
  }
}

function renderLoadingPanel(n) {
  return `
    <div style="margin-top:20px;padding:30px;background:var(--surface);border:1px solid var(--border);border-radius:12px;text-align:center;">
      <div class="spinner" style="margin:0 auto 14px;"></div>
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;margin-bottom:6px;">Generando ${n} ${n === 1 ? 'imagen' : 'imágenes'}</div>
      <div style="font-size:13px;color:var(--text-muted);">OpenAI está armando el guion y Gemini las imágenes. Esto puede tardar 30-90 segundos.</div>
    </div>
  `;
}

function renderResultPanel(data) {
  const { generacion, slides } = data;
  const isCarrusel = generacion.tipo === 'carrusel';
  return `
    <div style="margin-top:24px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px;">
        <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;margin-bottom:6px;">${escHtml(generacion.titulo)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;padding:3px 8px;border-radius:999px;background:rgba(255,107,107,0.12);color:var(--coral);">${generacion.tipo} · ${generacion.cantidad}</span>
          <span style="font-size:11px;padding:3px 8px;border-radius:999px;background:rgba(41,121,255,0.12);color:#2979FF;">${escHtml(generacion.modo_brief.replace('_',' '))}</span>
        </div>
      </div>

      <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(${isCarrusel ? '240px' : '180px'},1fr));">
        ${slides.map(s => slideCard(s, isCarrusel)).join('')}
      </div>
    </div>
  `;
}

function slideCard(s, isCarrusel) {
  const aspect = isCarrusel ? '1' : '9/16';
  if (s.error) {
    return `
      <div style="border-radius:12px;overflow:hidden;background:var(--surface);border:1px solid rgba(255,107,107,0.3);">
        <div style="aspect-ratio:${aspect};display:flex;align-items:center;justify-content:center;background:rgba(255,107,107,0.1);color:#FF6B6B;padding:10px;text-align:center;font-size:12px;">
          ⚠ Slide ${s.orden} falló<br><span style="font-size:10px;">${escHtml(s.error.slice(0,80))}</span>
        </div>
        <div style="padding:8px;font-size:11px;color:var(--text-muted);">${escHtml(s.rol || '')}</div>
      </div>
    `;
  }
  return `
    <div style="border-radius:12px;overflow:hidden;background:var(--surface);border:1px solid var(--border);">
      <div style="position:relative;aspect-ratio:${aspect};">
        <img src="${s.imagen_url}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">
        <span style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.7);color:#fff;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;">${s.orden} · ${escHtml(s.rol || '')}</span>
      </div>
      ${s.copy_slide ? `<div style="padding:10px 12px;font-size:12px;color:var(--text-muted);line-height:1.4;border-top:1px solid var(--border);">${escHtml(s.copy_slide)}</div>` : ''}
      <div style="display:flex;gap:6px;padding:10px;border-top:1px solid var(--border);">
        <a href="${s.imagen_url}" download="slide-${s.orden}.png" style="flex:1;text-decoration:none;">
          <button style="width:100%;background:transparent;border:1px solid var(--border);color:var(--text-muted);padding:6px;border-radius:6px;font-size:11px;cursor:pointer;">Descargar</button>
        </a>
      </div>
    </div>
  `;
}
