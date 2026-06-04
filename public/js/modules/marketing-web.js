/* ============================================================
   VOCAI OS — Marketing · Web (blog de vocai.es)
   CRUD de posts del blog. Genera con IA (modo blog del generador),
   edita, y publica → la web vocai.es los lee desde Supabase.
   Reutiliza MKT_PILAR de marketing-calendar.js.
   ============================================================ */

let mktWebPosts = [];
let mktWebFEstado = '';

const MKT_WEB_ESTADO = {
  borrador:    { label: 'Borrador',     color: '#888888' },
  en_revision: { label: 'En revisión',  color: '#FF8C42' },
  publicado:   { label: 'Publicado',    color: '#00C48C' },
};

async function renderMarketingWeb(el) {
  let posts;
  try {
    posts = await API.get('/marketing-web/posts');
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">Error al cargar: ${escHtml(err.message)}</div>`;
    return;
  }
  mktWebPosts = posts;

  let vis = posts;
  if (mktWebFEstado) vis = vis.filter(p => p.estado === mktWebFEstado);

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Web · Blog</h2>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" onclick="mktWebGenerar()">✨ Generar con IA</button>
        <button class="btn btn-primary" onclick="mktWebEditor()">+ Nuevo post</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--text-muted);">Filtrar:</span>
      <select class="filter-select" onchange="mktWebSetEstado(this.value)">
        <option value="">Todos los estados</option>
        ${Object.entries(MKT_WEB_ESTADO).map(([k, v]) =>
          `<option value="${k}" ${mktWebFEstado === k ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
      <span style="margin-left:auto;font-size:13px;color:var(--text-muted);">
        ${vis.length} de ${posts.length} posts
      </span>
    </div>

    ${vis.length ? `<div class="card" style="padding:0;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="text-align:left;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border);">
            <th style="padding:12px 16px;">Título</th>
            <th style="padding:12px 16px;">Pilar</th>
            <th style="padding:12px 16px;">Estado</th>
            <th style="padding:12px 16px;">Actualizado</th>
            <th style="padding:12px 16px;"></th>
          </tr>
        </thead>
        <tbody>
          ${vis.map(mktWebFila).join('')}
        </tbody>
      </table>
    </div>` : `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-title">Todavía no hay posts</div>
        <div class="empty-sub">Generá uno con IA o creá uno a mano. Cuando lo
          publiques, aparece en vocai.es/blog.</div>
      </div>`}
  `;
}

function mktWebFila(p) {
  const est = MKT_WEB_ESTADO[p.estado] || MKT_WEB_ESTADO.borrador;
  const pilar = p.pilar && MKT_PILAR[p.pilar] ? MKT_PILAR[p.pilar] : null;
  const fecha = p.updated_at ? new Date(p.updated_at).toLocaleDateString('es-ES') : '';
  const pub = p.estado === 'publicado';
  return `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:12px 16px;">
        <div style="font-weight:600;">${escHtml(p.titulo || 'Sin título')}</div>
        <div style="font-size:12px;color:var(--text-muted);">/blog/${escHtml(p.slug || '')}</div>
      </td>
      <td style="padding:12px 16px;font-size:13px;">
        ${pilar ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${pilar.color};margin-right:6px;"></span>${pilar.label}` : '<span style="color:var(--text-muted);">—</span>'}
      </td>
      <td style="padding:12px 16px;">
        <span style="font-size:12px;padding:3px 10px;border-radius:12px;background:${est.color}22;color:${est.color};">${est.label}</span>
      </td>
      <td style="padding:12px 16px;font-size:13px;color:var(--text-muted);">${fecha}</td>
      <td style="padding:12px 16px;text-align:right;white-space:nowrap;">
        <button class="btn btn-sm btn-secondary" onclick="mktWebPreview('${p.id}')">👁 Vista previa</button>
        <button class="btn btn-sm btn-secondary" onclick="mktWebEditor('${p.id}')">Editar</button>
        ${pub
          ? `<button class="btn btn-sm btn-secondary" onclick="mktWebDespublicar('${p.id}')">Despublicar</button>`
          : `<button class="btn btn-sm btn-primary" onclick="mktWebPublicar('${p.id}')">Publicar</button>`}
        <button class="btn btn-sm btn-danger" onclick="mktWebBorrar('${p.id}')">🗑</button>
      </td>
    </tr>`;
}

function mktWebSetEstado(v) { mktWebFEstado = v; navigate('marketing-web'); }

// Vista previa: abre la página REAL de vocai.es con el borrador, idéntica a
// como saldría publicada. Lee el borrador vía service key (ruta /blog/preview).
function mktWebPreview(id) {
  window.open(`https://www.vocai.es/blog/preview/${id}`, '_blank', 'noopener');
}

// ── Editor (crear/editar) ───────────────────────────────────
function mktWebEditor(id) {
  const p = id ? mktWebPosts.find(x => x.id === id) : {};
  const v = p || {};
  const pilarOpts = Object.entries(MKT_PILAR).map(([k, val]) =>
    `<option value="${k}" ${v.pilar === k ? 'selected' : ''}>${val.label}</option>`).join('');
  const estadoOpts = Object.entries(MKT_WEB_ESTADO).map(([k, val]) =>
    `<option value="${k}" ${v.estado === k ? 'selected' : ''}>${val.label}</option>`).join('');

  const body = `
    <input type="hidden" id="mw-id" value="${v.id || ''}">
    <div class="form-group">
      <label>Título</label>
      <input class="form-input" id="mw-titulo" value="${escHtml(v.titulo || '')}" placeholder="Título del post (H1)">
    </div>
    <div class="form-row" style="display:flex;gap:12px;">
      <div class="form-group" style="flex:1;">
        <label>Slug (URL)</label>
        <input class="form-input" id="mw-slug" value="${escHtml(v.slug || '')}" placeholder="auto del título si lo dejás vacío">
      </div>
      <div class="form-group" style="flex:1;">
        <label>Keyword SEO</label>
        <input class="form-input" id="mw-keyword" value="${escHtml(v.keyword || '')}" placeholder="palabra clave objetivo">
      </div>
    </div>
    <div class="form-row" style="display:flex;gap:12px;">
      <div class="form-group" style="flex:1;">
        <label>Pilar</label>
        <select class="form-input" id="mw-pilar"><option value="">—</option>${pilarOpts}</select>
      </div>
      <div class="form-group" style="flex:1;">
        <label>Estado</label>
        <select class="form-input" id="mw-estado">${estadoOpts || '<option value="borrador">Borrador</option>'}</select>
      </div>
    </div>
    <div class="form-group">
      <label>Meta description <span id="mw-metacount" style="color:var(--text-muted);font-size:12px;"></span></label>
      <textarea class="form-input" id="mw-meta" rows="2" maxlength="170" placeholder="Resumen para Google (≤160 caracteres)" oninput="mktWebMetaCount()">${escHtml(v.meta_description || '')}</textarea>
    </div>
    <div class="form-group">
      <label>Extracto</label>
      <textarea class="form-input" id="mw-excerpt" rows="2" placeholder="Resumen que se muestra en el listado del blog">${escHtml(v.excerpt || '')}</textarea>
    </div>
    <div class="form-group">
      <label>Imagen de portada (URL)</label>
      <input class="form-input" id="mw-cover" value="${escHtml(v.cover_image || '')}" placeholder="https://…">
    </div>
    <div class="form-group">
      <label>Cuerpo (Markdown)</label>
      <textarea class="form-input" id="mw-body" rows="16" style="font-family:monospace;font-size:13px;" placeholder="## Subtítulo&#10;&#10;Texto del post en markdown…">${escHtml(v.body_md || '')}</textarea>
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal('mw-modal')">Cancelar</button>
    <button class="btn btn-primary" onclick="mktWebGuardar()">Guardar</button>`;
  createModal('mw-modal', id ? 'Editar post' : 'Nuevo post', body, footer, 'modal-lg');
  mktWebMetaCount();
}

function mktWebMetaCount() {
  const t = document.getElementById('mw-meta');
  const c = document.getElementById('mw-metacount');
  if (t && c) c.textContent = `${t.value.length}/160`;
}

function mktWebFormData() {
  return {
    titulo: document.getElementById('mw-titulo').value.trim(),
    slug: document.getElementById('mw-slug').value.trim(),
    keyword: document.getElementById('mw-keyword').value.trim(),
    pilar: document.getElementById('mw-pilar').value || null,
    estado: document.getElementById('mw-estado').value,
    meta_description: document.getElementById('mw-meta').value.trim(),
    excerpt: document.getElementById('mw-excerpt').value.trim(),
    cover_image: document.getElementById('mw-cover').value.trim(),
    body_md: document.getElementById('mw-body').value,
  };
}

async function mktWebGuardar() {
  const id = document.getElementById('mw-id').value;
  const data = mktWebFormData();
  if (!data.titulo) { toast('Falta el título', 'error'); return; }
  try {
    if (id) await API.put(`/marketing-web/posts/${id}`, data);
    else    await API.post('/marketing-web/posts', data);
    closeModal('mw-modal');
    toast('Post guardado', 'success');
    navigate('marketing-web');
  } catch (err) { toast(err.message, 'error'); }
}

async function mktWebPublicar(id) {
  try { await API.post(`/marketing-web/posts/${id}/publicar`); toast('Publicado', 'success'); navigate('marketing-web'); }
  catch (err) { toast(err.message, 'error'); }
}

async function mktWebDespublicar(id) {
  try { await API.post(`/marketing-web/posts/${id}/despublicar`); toast('Despublicado', 'info'); navigate('marketing-web'); }
  catch (err) { toast(err.message, 'error'); }
}

async function mktWebBorrar(id) {
  if (!confirm('¿Borrar este post? No se puede deshacer.')) return;
  try { await API.del(`/marketing-web/posts/${id}`); toast('Borrado', 'info'); navigate('marketing-web'); }
  catch (err) { toast(err.message, 'error'); }
}

// ── Generar con IA (modo blog del generador) ────────────────
function mktWebGenerar() {
  const body = `
    <div class="form-group">
      <label>Tema del post</label>
      <input class="form-input" id="mwg-tema" placeholder="Ej: cómo la IA ahorra horas en una pyme">
    </div>
    <div class="form-row" style="display:flex;gap:12px;">
      <div class="form-group" style="flex:1;">
        <label>Keyword SEO (opcional)</label>
        <input class="form-input" id="mwg-keyword" placeholder="palabra clave objetivo">
      </div>
      <div class="form-group" style="flex:1;">
        <label>Pilar</label>
        <select class="form-input" id="mwg-pilar">
          <option value="">—</option>
          ${Object.entries(MKT_PILAR).map(([k, val]) => `<option value="${k}">${val.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Ángulo (opcional)</label>
      <input class="form-input" id="mwg-angulo" placeholder="Ej: práctico, sin tecnicismos, con ejemplo real">
    </div>
    <p style="font-size:12px;color:var(--text-muted);">Genera un borrador SEO en markdown. Después lo editás y publicás.</p>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal('mwg-modal')">Cancelar</button>
    <button class="btn btn-primary" id="mwg-btn" onclick="mktWebGenerarRun()">Generar</button>`;
  createModal('mwg-modal', '✨ Generar post con IA', body, footer);
}

async function mktWebGenerarRun() {
  const tema = document.getElementById('mwg-tema').value.trim();
  if (!tema) { toast('Escribí un tema', 'error'); return; }
  const payload = {
    tema,
    keyword: document.getElementById('mwg-keyword').value.trim(),
    pilar: document.getElementById('mwg-pilar').value || null,
    angulo: document.getElementById('mwg-angulo').value.trim(),
  };
  const btn = document.getElementById('mwg-btn');
  btn.disabled = true; btn.textContent = 'Generando…';
  try {
    const post = await API.post('/marketing-generator/blog', payload);
    closeModal('mwg-modal');
    toast('Borrador generado', 'success');
    mktWebPosts.push(post);
    mktWebEditor(post.id);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false; btn.textContent = 'Generar';
  }
}
