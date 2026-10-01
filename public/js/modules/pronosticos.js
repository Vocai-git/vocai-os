/* ============================================================
   VOCAI OS — Pronósticos de reels
   Cada día cada uno ordena los 3 reels del día según cuál va a
   tener más engagement. A las 48 h se miden (IG + TikTok) y se
   suman puntos por pares: de 0 a 3 por red y por día; ordenando
   al azar el promedio es 1,5.
   Fuente: /api/pronosticos. No usa import/export — scripts
   globales, mobile-first.
   ============================================================ */

let _pr = null;          // respuesta de /api/pronosticos
let _prContent = null;   // contenedor del módulo
const _prOrden = {};     // tandaId → ['B', 'A'] mientras se ordena

const PR_RED = { ig: 'Instagram', tt: 'TikTok' };
const PR_VERDE = '#00C48C', PR_CORAL = '#FF6B6B', PR_AMBAR = '#FFB020';

// ── Formatos ────────────────────────────────────────────────
function prNum(n, dec = 2) {
  return n == null ? '—' : Number(n).toFixed(dec).replace('.', ',');
}
function prPts(n) {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : prNum(n, 1);
}
function prPct(x, dec = 1) {
  return x == null ? '—' : (x * 100).toFixed(dec).replace('.', ',') + '%';
}
function prFecha(f) {
  const s = new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function prHora(iso) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function prDiaHora(iso) {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function prNombre(id) {
  return (_pr.nombres && _pr.nombres[id]) || 'Alguien';
}
function prOrdenTxt(orden) {
  return orden.join(' › ');
}
function prPill(texto, color) {
  return `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;background:${color}22;color:${color};border:1px solid ${color}44;">${texto}</span>`;
}
function prSubtitulo(txt) {
  return `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.2px;margin:0 0 10px 2px;">${txt}</div>`;
}
// Misma fórmula que el server: IG sobre alcance, TikTok sobre views.
function prTasa(red, m) {
  if (!m) return null;
  if (red === 'ig') return m.alcance ? (m.me_gusta + m.comentarios + m.guardados + m.compartidos) / m.alcance : 0;
  return m.reproducciones ? (m.me_gusta + m.comentarios + m.compartidos) / m.reproducciones : 0;
}

// ── Carga y pintado ─────────────────────────────────────────
async function renderPronosticos(content) {
  _prContent = content;
  await prCargar();
}

async function prCargar() {
  try {
    _pr = await API.get('/pronosticos');
  } catch (err) {
    _prContent.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
    return;
  }
  prPintar();
}

function prPintar() {
  const tandas = _pr.tandas;
  const abiertas = tandas.filter(t => t.estado === 'abierta');
  const midiendo = tandas.filter(t => t.estado === 'midiendo');
  const terminadas = tandas.filter(t => t.estado === 'terminada');
  const hayHoy = tandas.some(t => t.fecha === _pr.hoy);

  _prContent.innerHTML = `
    <div style="max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:22px;">
      ${hayHoy && !abiertas.length ? '' : `<div>${prSubtitulo('Para votar')}<div style="display:flex;flex-direction:column;gap:14px;">
        ${hayHoy ? '' : prFormTanda()}
        ${abiertas.map(prCardAbierta).join('')}
      </div></div>`}
      ${prRanking()}
      ${midiendo.length ? `<div>${prSubtitulo('Esperando métricas')}<div style="display:flex;flex-direction:column;gap:14px;">${midiendo.map(prCardMidiendo).join('')}</div></div>` : ''}
      ${terminadas.length ? `<div>${prSubtitulo('Historial')}<div style="display:flex;flex-direction:column;gap:14px;">${terminadas.map(prCardTerminada).join('')}</div></div>` : ''}
      ${prConexiones()}
    </div>`;

  _prContent.querySelectorAll('[data-pr]').forEach(el => {
    el.addEventListener('click', () => prAccion(el));
  });
}

// ── Tanda de hoy (alta) ─────────────────────────────────────
function prFormTanda() {
  const campos = ['A', 'B', 'C'].map(l => `
    <div style="display:flex;align-items:center;gap:10px;">
      <label for="prTitulo${l}" style="flex:0 0 28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;background:var(--surface-hover);border:1px solid var(--border);">${l}</label>
      <input class="form-input" id="prTitulo${l}" placeholder="Nombre corto del clip ${l}" maxlength="80" style="flex:1;min-width:0;">
    </div>`).join('');
  return `<div class="card">
    <div class="card-header" style="margin-bottom:4px;flex-wrap:wrap;gap:6px;">
      <div class="card-title">Tanda de hoy</div>
      <span class="text-sm text-muted">${prFecha(_pr.hoy)}</span>
    </div>
    <p class="text-sm text-muted" style="margin-bottom:16px;">Cargá los 3 reels que salen hoy. Con un nombre que los identifique alcanza.</p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">${campos}</div>
    <button class="btn btn-primary" data-pr="crear" style="width:100%;justify-content:center;">Cargar los 3 clips</button>
  </div>`;
}

// ── Tanda abierta: ordenar y votar ──────────────────────────
function prCardAbierta(t) {
  if (!_prOrden[t.id]) _prOrden[t.id] = t.mi_voto ? t.mi_voto.slice() : [];
  const sel = _prOrden[t.id];
  const guardado = t.mi_voto && t.mi_voto.join() === sel.join();

  const clips = t.clips.map(c => {
    const pos = sel.indexOf(c.letra);
    const on = pos >= 0;
    return `<button type="button" data-pr="clip" data-tanda="${t.id}" data-letra="${c.letra}"
      style="display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:10px 14px;background:${on ? 'var(--coral-dim)' : 'var(--surface-hover)'};border:1px solid ${on ? 'var(--coral)' : 'var(--border)'};border-radius:10px;color:var(--text);font:inherit;text-align:left;cursor:pointer;">
      <span style="flex:0 0 34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;${on ? 'background:var(--coral);color:#fff;' : 'border:1.5px dashed var(--border-light);color:var(--text-dim);'}">${on ? (pos + 1) + 'º' : ''}</span>
      <span style="flex:0 0 auto;font-size:12px;font-weight:700;color:var(--text-muted);">${c.letra}</span>
      <span style="flex:1;min-width:0;font-weight:500;overflow-wrap:anywhere;">${escHtml(c.titulo)}</span>
    </button>`;
  }).join('');

  const equipo = Object.keys(_pr.nombres);
  const votaron = equipo.filter(id => t.votaron.includes(id)).length;
  const chips = equipo.map(id => {
    const ok = t.votaron.includes(id);
    return `<span style="font-size:12px;padding:3px 9px;border-radius:20px;border:1px solid ${ok ? PR_VERDE + '55' : 'var(--border)'};color:${ok ? PR_VERDE : 'var(--text-muted)'};white-space:nowrap;">${ok ? '✓ ' : ''}${escHtml(prNombre(id))}</span>`;
  }).join('');

  const cierre = t.cierre
    ? `Se puede votar hasta las <strong style="color:var(--text);">${prHora(t.cierre)}</strong>.`
    : 'Se puede votar hasta 15 min después de que salga el primer reel.';

  return `<div class="card">
    <div class="card-header" style="margin-bottom:6px;flex-wrap:wrap;gap:8px;">
      <div class="card-title">${prFecha(t.fecha)}</div>
      ${prPill(t.cierre ? 'Cierra ' + prHora(t.cierre) : 'Votación abierta', t.cierre ? PR_AMBAR : PR_VERDE)}
    </div>
    <p class="text-sm text-muted" style="margin-bottom:14px;">Tocá los clips en orden: primero el que creés que va a tener más engagement. ${cierre}</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">${clips}</div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;min-height:38px;">
      ${guardado
        ? `<span class="text-sm" style="color:${PR_VERDE};">✓ Tu orden está guardado.</span><span class="text-sm text-muted">Tocá un clip para cambiarlo.</span>`
        : `<button class="btn btn-primary" data-pr="guardar" data-tanda="${t.id}" ${sel.length < 3 ? 'disabled' : ''}>${t.mi_voto ? 'Guardar cambios' : 'Guardar mi orden'}</button>
           ${sel.length ? `<button class="btn btn-ghost btn-sm" data-pr="borrar" data-tanda="${t.id}">Empezar de nuevo</button>` : ''}`}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:14px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="text-xs text-muted" style="margin-right:4px;">Votaron ${votaron} de ${equipo.length}</span>${chips}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${t.publicado_at ? '' : `<button class="btn btn-secondary btn-sm" data-pr="publicado" data-tanda="${t.id}">Ya publicamos</button>`}
        <button class="btn btn-secondary btn-sm" data-pr="vincular" data-tanda="${t.id}">Vincular reels</button>
      </div>
    </div>
  </div>`;
}

// ── Estado de un clip en una red (midiendo) ─────────────────
function prEstadoRed(c, red) {
  const r = c[red];
  const nombre = red === 'ig' ? 'IG' : 'TikTok';
  if (!r.id) return `<span class="text-xs" style="color:var(--text-dim);">${nombre} sin vincular</span>`;
  if (r.metricas) return `<span class="text-xs" style="color:${PR_VERDE};">${nombre} ${prPct(prTasa(red, r.metricas))}</span>`;
  const mide = new Date(new Date(r.publicado_at).getTime() + 48 * 3600 * 1000).toISOString();
  return `<span class="text-xs text-muted">${nombre} se mide el ${prDiaHora(mide)}</span>`;
}

function prVotosRevelados(t) {
  if (!t.votos.length) return '<p class="text-sm text-muted">Nadie votó en esta tanda.</p>';
  return t.votos.map(v => `
    <div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
      <span>${escHtml(prNombre(v.user_id))}${v.a_tiempo ? '' : ' <span class="text-xs" style="color:' + PR_CORAL + ';">fuera de tiempo</span>'}</span>
      <span style="font-weight:600;letter-spacing:.5px;">${prOrdenTxt(v.orden)}</span>
    </div>`).join('');
}

function prCardMidiendo(t) {
  const disponibles = { ig: _pr.conexiones.ig, tt: _pr.conexiones.tiktok_conectado };
  const faltaVincular = t.clips.some(c => (disponibles.ig && !c.ig.id) || (disponibles.tt && !c.tt.id));
  const clips = t.clips.map(c => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:14px;min-width:0;overflow-wrap:anywhere;"><strong style="color:var(--text-muted);margin-right:6px;">${c.letra}</strong>${escHtml(c.titulo)}</span>
      <span style="display:flex;gap:10px;flex-wrap:wrap;">${prEstadoRed(c, 'ig')}${prEstadoRed(c, 'tt')}</span>
    </div>`).join('');
  return `<div class="card">
    <div class="card-header" style="margin-bottom:6px;flex-wrap:wrap;gap:8px;">
      <div class="card-title">${prFecha(t.fecha)}</div>
      ${prPill('Midiendo', PR_AMBAR)}
    </div>
    <p class="text-sm text-muted" style="margin-bottom:10px;">La votación cerró. Cada reel se mide solo a las 48 h de publicado.</p>
    <div style="margin-bottom:16px;">${clips}</div>
    ${prSubtitulo('Votos')}
    <div style="margin-bottom:${faltaVincular ? 14 : 0}px;">${prVotosRevelados(t)}</div>
    ${faltaVincular ? `<button class="btn btn-secondary btn-sm" data-pr="vincular" data-tanda="${t.id}">Vincular reels</button>` : ''}
  </div>`;
}

// ── Tanda terminada (historial) ─────────────────────────────
function prCardTerminada(t) {
  const redes = ['ig', 'tt'].filter(red => t.resultados[red]);
  const reales = redes.map(red => {
    const r = t.resultados[red];
    return `<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:13px;padding:4px 0;">
      <span class="text-muted" style="flex:0 0 74px;">${PR_RED[red]}</span>
      <span style="font-weight:600;">${r.orden.map(l => `${l} <span class="text-muted" style="font-weight:400;">${prPct(r.tasas[l])}</span>`).join(' › ')}</span>
    </div>`;
  }).join('');
  const leyenda = t.clips.map(c => `<span style="white-space:nowrap;"><strong>${c.letra}</strong> ${escHtml(c.titulo)}</span>`).join('<span style="color:var(--text-dim);"> · </span>');

  const filas = t.votos.map(v => `
    <tr>
      <td style="padding:7px 8px 7px 0;">${escHtml(prNombre(v.user_id))}${v.a_tiempo ? '' : ' <span class="text-xs" style="color:' + PR_CORAL + ';">fuera de tiempo</span>'}</td>
      <td style="padding:7px 8px;font-weight:600;white-space:nowrap;">${prOrdenTxt(v.orden)}</td>
      ${redes.map(red => `<td style="padding:7px 0 7px 8px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:${v.puntos[red] == null ? 'var(--text-dim)' : v.puntos[red] >= 2 ? PR_VERDE : v.puntos[red] < 1.5 ? PR_CORAL : 'var(--text)'};">${prPts(v.puntos[red])}</td>`).join('')}
    </tr>`).join('');

  return `<div class="card" style="padding:16px 18px;">
    <div class="card-header" style="margin-bottom:8px;"><div class="card-title">${prFecha(t.fecha)}</div></div>
    <div class="text-xs text-muted" style="line-height:1.6;margin-bottom:10px;">${leyenda}</div>
    <div style="background:var(--surface-hover);border-radius:8px;padding:8px 12px;margin-bottom:12px;">${reales}</div>
    ${t.votos.length ? `<div class="table-wrapper"><table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="color:var(--text-muted);font-size:11px;text-align:left;">
        <th style="padding:0 8px 4px 0;font-weight:600;">Persona</th>
        <th style="padding:0 8px 4px;font-weight:600;">Orden</th>
        ${redes.map(red => `<th style="padding:0 0 4px 8px;font-weight:600;text-align:right;">${red === 'ig' ? 'IG' : 'TikTok'}</th>`).join('')}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table></div>` : '<p class="text-sm text-muted">Nadie votó en esta tanda.</p>'}
  </div>`;
}

// ── Tabla de posiciones ─────────────────────────────────────
function prRanking() {
  const filas = _pr.ranking;
  const cabecera = `<div class="card-header" style="margin-bottom:4px;flex-wrap:wrap;gap:6px;">
    <div class="card-title">Tabla de posiciones</div>
    <span class="text-xs text-muted">Promedio de puntos por día · de 0 a 3</span>
  </div>`;
  if (!filas.length) {
    return `<div class="card">${cabecera}
      <p class="text-sm text-muted" style="margin-top:8px;">Todavía no hay resultados. La tabla arranca cuando se mide la primera tanda, 48 h después de publicar.</p>
    </div>`;
  }

  const barra = (v) => `<div style="position:relative;height:6px;border-radius:3px;background:var(--surface-hover);margin:7px 0 6px;">
      <div style="width:${Math.max(2, (v / 3) * 100)}%;height:100%;border-radius:3px;background:${v > 1.5 ? PR_VERDE : v < 1.5 ? PR_CORAL : 'var(--text-muted)'};"></div>
      <div title="Azar: 1,5" style="position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;border-radius:1px;background:var(--text-muted);"></div>
    </div>`;

  const personas = filas.map((r, i) => `
    <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
      <span style="flex:0 0 18px;font-weight:700;color:var(--text-muted);padding-top:2px;">${i + 1}</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
          <span style="font-weight:600;">${escHtml(prNombre(r.user_id))}</span>
          <span style="font-family:'Syne',sans-serif;font-weight:800;font-size:20px;font-variant-numeric:tabular-nums;">${prNum(r.total)}</span>
        </div>
        ${barra(r.total)}
        <div class="text-xs text-muted" style="display:flex;gap:4px 12px;flex-wrap:wrap;">
          <span>IG ${prNum(r.ig)}</span><span>TikTok ${prNum(r.tt)}</span>
          <span>Acierta el 1º ${prPct(r.primeros_pct, 0)}</span>
          <span>${r.dias} ${r.dias === 1 ? 'día' : 'días'}</span>
        </div>
      </div>
    </div>`).join('');

  const maxDias = Math.max(...filas.map(r => r.dias));
  const aviso = maxDias < 20
    ? `Van ${maxDias} ${maxDias === 1 ? 'día' : 'días'} con resultados. Con menos de 20 la diferencia todavía puede ser pura suerte.`
    : 'Arriba de 1,5 sostenido en el tiempo es ojo de verdad, no suerte.';

  return `<div class="card">${cabecera}
    ${personas}
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:10px 0 2px 30px;color:var(--text-muted);font-size:13px;">
      <span>Al azar · acierta el 1º 33%</span>
      <span style="font-variant-numeric:tabular-nums;font-weight:700;">1,50</span>
    </div>
    <p class="text-xs text-muted" style="margin-top:10px;line-height:1.5;">${aviso}</p>
  </div>`;
}

// ── Conexiones ──────────────────────────────────────────────
function prConexiones() {
  const c = _pr.conexiones;
  const punto = ok => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ok ? PR_VERDE : 'var(--text-dim)'};margin-right:6px;"></span>`;
  const tt = c.tiktok_conectado ? 'conectado'
    : c.tiktok_configurado ? 'sin conectar'
    : 'falta crear la app';
  return `<div class="card" style="padding:14px 16px;">
    <div style="display:flex;flex-wrap:wrap;gap:10px 20px;align-items:center;font-size:13px;">
      <span>${punto(c.ig)}Instagram: ${c.ig ? 'conectado' : 'falta configurar'}</span>
      <span>${punto(c.tiktok_conectado)}TikTok: ${tt}</span>
      ${c.tiktok_configurado && !c.tiktok_conectado ? '<button class="btn btn-secondary btn-sm" data-pr="tiktok">Conectar TikTok</button>' : ''}
    </div>
  </div>`;
}

// ── Vincular cada clip con su reel ──────────────────────────
function prOpciones(lista, actual) {
  let html = '<option value="">— Sin vincular —</option>';
  if (actual.id && !lista.some(p => p.id === actual.id)) {
    html += `<option value="${escHtml(actual.id)}" selected>Vinculado (${prDiaHora(actual.publicado_at)})</option>`;
  }
  return html + lista.map(p => `<option value="${escHtml(p.id)}" ${p.id === actual.id ? 'selected' : ''}>${prDiaHora(p.fecha)} · ${escHtml(p.texto || 'sin texto')}</option>`).join('');
}

async function prAbrirVincular(tandaId, boton) {
  const t = _pr.tandas.find(x => x.id === tandaId);
  boton.disabled = true;
  let pubs;
  try {
    pubs = await API.get('/pronosticos/publicaciones');
  } catch (err) {
    toast(err.message, 'error');
    boton.disabled = false;
    return;
  }
  boton.disabled = false;

  const hayIg = _pr.conexiones.ig, hayTt = _pr.conexiones.tiktok_conectado;
  const avisos = pubs.errores.map(e => `<div class="alert alert-error" style="margin-bottom:12px;">${escHtml(e)}</div>`).join('')
    + (!hayIg ? '<div class="alert alert-info" style="margin-bottom:12px;">Instagram todavía no está configurado.</div>' : '')
    + (!hayTt ? '<div class="alert alert-info" style="margin-bottom:12px;">TikTok todavía no está conectado.</div>' : '');

  const bloques = t.clips.map(c => `
    <div style="padding:14px 0;border-top:1px solid var(--border);">
      <div style="font-weight:600;margin-bottom:10px;overflow-wrap:anywhere;"><span class="text-muted" style="margin-right:6px;">${c.letra}</span>${escHtml(c.titulo)}</div>
      ${hayIg ? `<div class="form-group" style="margin-bottom:10px;"><label class="form-label" for="prIg${c.letra}">Instagram</label>
        <select class="form-select" id="prIg${c.letra}">${prOpciones(pubs.ig, c.ig)}</select></div>` : ''}
      ${hayTt ? `<div class="form-group" style="margin-bottom:0;"><label class="form-label" for="prTt${c.letra}">TikTok</label>
        <select class="form-select" id="prTt${c.letra}">${prOpciones(pubs.tt, c.tt)}</select></div>` : ''}
    </div>`).join('');

  createModal('prVincularModal', 'Vincular reels',
    `${avisos}<p class="text-sm text-muted" style="margin-bottom:12px;">Elegí qué publicación es cada clip. Aparecen los últimos reels de cada cuenta.</p>${bloques}`,
    `<button class="btn btn-secondary" onclick="closeModal('prVincularModal')">Cancelar</button>
     <button class="btn btn-primary" id="prVincularGuardar" ${hayIg || hayTt ? '' : 'disabled'}>Guardar</button>`);

  document.getElementById('prVincularGuardar').addEventListener('click', async () => {
    const body = {};
    for (const c of t.clips) {
      const ig = document.getElementById('prIg' + c.letra);
      const tt = document.getElementById('prTt' + c.letra);
      body[c.letra] = { ig: ig ? ig.value : (c.ig.id || ''), tt: tt ? tt.value : (c.tt.id || '') };
    }
    try {
      await API.put(`/pronosticos/tandas/${t.id}/vincular`, body);
      closeModal('prVincularModal');
      toast('Reels vinculados', 'success');
      await prCargar();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ── Acciones ────────────────────────────────────────────────
async function prAccion(el) {
  const accion = el.dataset.pr;
  const id = el.dataset.tanda;
  try {
    if (accion === 'clip') {
      const sel = _prOrden[id];
      const i = sel.indexOf(el.dataset.letra);
      if (i >= 0) sel.splice(i, 1);
      else if (sel.length < 3) sel.push(el.dataset.letra);
      prPintar();
    } else if (accion === 'borrar') {
      _prOrden[id] = [];
      prPintar();
    } else if (accion === 'guardar') {
      el.disabled = true;
      await API.put(`/pronosticos/tandas/${id}/voto`, { orden: _prOrden[id] });
      toast('Orden guardado', 'success');
      await prCargar();
    } else if (accion === 'crear') {
      const titulos = ['A', 'B', 'C'].map(l => document.getElementById('prTitulo' + l).value.trim());
      if (titulos.some(x => !x)) return toast('Poné el nombre de los 3 clips', 'error');
      el.disabled = true;
      await API.post('/pronosticos/tandas', { titulos });
      toast('Tanda de hoy cargada', 'success');
      await prCargar();
    } else if (accion === 'publicado') {
      if (!confirm('¿Ya salió el primer reel? Desde ahora quedan 15 minutos para votar.')) return;
      await API.post(`/pronosticos/tandas/${id}/publicado`);
      await prCargar();
    } else if (accion === 'vincular') {
      await prAbrirVincular(id, el);
    } else if (accion === 'tiktok') {
      const { url } = await API.post('/pronosticos/tiktok/url');
      window.location.href = url;
    }
  } catch (err) {
    el.disabled = false;
    toast(err.message, 'error');
  }
}
