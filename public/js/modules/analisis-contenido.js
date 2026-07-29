/* ============================================================
   VOCAI OS — Análisis de contenido
   Mira TODO lo publicado en Instagram (incluidos los reels que se
   suben a mano) y saca conclusiones: qué ángulos rinden, qué temas
   interesan, retención de reels, y conclusiones accionables de IA.
   Fuente: /api/analisis-contenido (tabla ig_media_inventory).
   No usa import/export — scripts globales, mobile-first.
   ============================================================ */

let acDias = 90;           // ventana en foco
let acCargando = false;

const AC_ANGULO_LABEL = {
  'educativo': 'Educativo', 'problema-solucion': 'Problema → solución',
  'detras-de-escena': 'Detrás de escena', 'dato-resultado': 'Dato / resultado',
  'contraintuitivo': 'Contraintuitivo', 'testimonial': 'Testimonial',
  'oferta-servicio': 'Oferta / servicio', 'inspiracional': 'Inspiracional',
  'novedad': 'Novedad', 'otro': 'Otro',
};
const AC_GANCHO_LABEL = {
  'pregunta': 'Pregunta', 'dato-impactante': 'Dato impactante',
  'afirmacion-fuerte': 'Afirmación fuerte', 'historia': 'Historia',
  'promesa': 'Promesa', 'curiosidad': 'Curiosidad', 'negacion': 'Negación', 'otro': 'Otro',
};
const AC_FORMATO_LABEL = {
  'REELS': 'Reels', 'FEED': 'Feed', 'CAROUSEL': 'Carrusel', 'CAROUSEL_ALBUM': 'Carrusel',
};
const AC_PILAR_LABEL = {
  'ia': 'IA / automatización', 'estudio': 'Estudio', 'casos': 'Casos', 'personas': 'Personas',
};

function acNum(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + ' M';
  if (n >= 10000) return (n / 1000).toFixed(1).replace('.', ',') + ' mil';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function acCard(label, valor, sub) {
  return `
    <div class="card" style="padding:14px 16px;">
      <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">${label}</div>
      <div style="font-size:26px;font-weight:800;margin:4px 0 2px;">${valor}</div>
      ${sub || ''}
    </div>`;
}

// Bloque de barras horizontales ordenadas por tasa de interacción.
// filas: [{clave,n,alcanceMedio,interaccionMedia,guardadosMedios,tasaInteraccion,watchMedioSeg}]
function acBarras(titulo, filas, labels, ayuda) {
  if (!filas || !filas.length) return '';
  const max = Math.max(...filas.map(f => f.tasaInteraccion), 0.01);
  const cuerpo = filas.map(f => {
    const label = (labels && labels[f.clave]) || f.clave;
    const pct = Math.max(3, Math.round((f.tasaInteraccion / max) * 100));
    const extra = f.watchMedioSeg ? ` · ▶ ${f.watchMedioSeg}s` : '';
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:3px;">
          <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(label)}</span>
          <span style="color:var(--text-muted);flex:0 0 auto;">${f.tasaInteraccion}% eng · ${acNum(f.alcanceMedio)} alc · ${f.n}p${extra}</span>
        </div>
        <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:#2979FF;border-radius:4px;"></div>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${titulo}</div>
      ${ayuda ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">${ayuda}</div>` : '<div style="height:6px;"></div>'}
      ${cuerpo}
    </div>`;
}

// Ranking de retención de reels.
function acReels(reels) {
  if (!reels || !reels.length) {
    return `<div class="card" style="margin-bottom:16px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;">Retención de reels</div>
      <div style="font-size:13px;color:var(--text-muted);">Todavía no hay reels con datos de visualización en esta ventana.</div>
    </div>`;
  }
  const filas = reels.map(r => {
    const ret = r.retencionPct !== null && r.retencionPct !== undefined
      ? `${Math.round(r.retencionPct)}% ret.`
      : `${r.watchMedioSeg}s vistos`;
    const cap = (r.caption || '').replace(/\n/g, ' ').trim() || '(sin texto)';
    return `
      <div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);">
        ${r.thumbnail_url ? `<img src="${escHtml(r.thumbnail_url)}" alt="" style="width:38px;height:38px;border-radius:6px;object-fit:cover;flex:0 0 auto;">` : ''}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(cap.slice(0, 80))}</div>
          <div style="font-size:11px;color:var(--text-muted);">
            ${r.angulo ? escHtml(AC_ANGULO_LABEL[r.angulo] || r.angulo) : ''}${r.tema ? ' · ' + escHtml(r.tema) : ''}
          </div>
        </div>
        <div style="text-align:right;flex:0 0 auto;">
          <div style="font-size:13px;font-weight:700;color:#2979FF;">${ret}</div>
          <div style="font-size:11px;color:var(--text-muted);">👁 ${acNum(r.alcance)}</div>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Retención de reels</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
        Ordenados por tiempo medio de visualización. La API de Instagram no da la curva
        segundo a segundo — esto es el mejor proxy de retención disponible.
      </div>
      ${filas}
    </div>`;
}

// Conclusiones de IA (última generada).
function acConclusiones(ins) {
  const bloque = (titulo, arr, color) => {
    if (!arr || !arr.length) return '';
    return `
      <div style="margin-top:12px;">
        <div style="font-size:12px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">${titulo}</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.55;">
          ${arr.map(x => `<li style="margin-bottom:4px;">${escHtml(x)}</li>`).join('')}
        </ul>
      </div>`;
  };
  let contenido;
  if (ins && ins.conclusiones) {
    const c = ins.conclusiones;
    const cuando = ins.generado_at ? new Date(ins.generado_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    contenido = `
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px;">
        Generado ${cuando} · sobre ${ins.n_piezas || '?'} piezas de ${ins.ventana_dias || acDias} días
      </div>
      ${bloque('Qué funciona', c.hallazgos, '#00C48C')}
      ${bloque('Recomendaciones', c.recomendaciones, '#2979FF')}
      ${bloque('Qué evitar', c.que_evitar, '#FF6B6B')}`;
  } else {
    contenido = `<div style="font-size:13px;color:var(--text-muted);">
      Todavía no generaste conclusiones. Tocá el botón y la IA analiza el período y te dice
      qué ángulos, ganchos y temas rinden más.</div>`;
  }
  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
        <div style="font-weight:700;font-size:14px;">🧠 Conclusiones de IA</div>
        <button class="btn btn-primary" style="padding:6px 12px;" onclick="acGenerarConclusiones()">Generar conclusiones</button>
      </div>
      ${contenido}
    </div>`;
}

async function renderAnalisisContenido(el) {
  el.innerHTML = `<div class="card"><div style="color:var(--text-muted);">Cargando análisis…</div></div>`;

  let data, ins = null;
  try {
    data = await API.get(`/analisis-contenido?dias=${acDias}`);
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">Error al cargar: ${escHtml(err.message)}</div>`;
    return;
  }
  try { ins = await API.get('/analisis-contenido/conclusiones'); } catch { /* sin conclusiones aún */ }

  const r = data.resumen || {};
  const ventanas = [30, 90, 180, 365];
  const selVentana = ventanas.map(d =>
    `<button class="btn ${d === acDias ? 'btn-primary' : 'btn-secondary'}" style="padding:5px 11px;"
       onclick="acCambiarVentana(${d})">${d}d</button>`).join('');

  el.innerHTML = `
    <div class="section-header" style="flex-wrap:wrap;gap:10px;">
      <h2 class="section-title">Análisis de contenido</h2>
      <button class="btn btn-secondary" onclick="acSincronizar()"
        title="Traer de Instagram todo lo publicado (incluidos reels) y clasificarlo">
        ↻ Sincronizar contenido
      </button>
    </div>

    <div class="card" style="margin-bottom:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--text-muted);">Período:</span>
      ${selVentana}
      <span style="margin-left:auto;font-size:12px;color:var(--text-muted);">
        ${r.piezas || 0} piezas · ${r.reels || 0} reels analizados</span>
    </div>

    ${r.sinClasificar ? `
      <div class="card" style="margin-bottom:16px;font-size:13px;color:var(--text-muted);">
        ⚠ ${r.sinClasificar} ${r.sinClasificar === 1 ? 'pieza sin clasificar' : 'piezas sin clasificar'}.
        Tocá "Sincronizar contenido" para que la IA las etiquete.
      </div>` : ''}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">
      ${acCard('Piezas', acNum(r.piezas || 0), `<span style="font-size:12px;color:var(--text-muted);">últimos ${acDias} días</span>`)}
      ${acCard('Reels', acNum(r.reels || 0), '')}
      ${acCard('Alcance total', acNum(r.alcanceTotal || 0), '')}
      ${acCard('Interacciones', acNum(r.interaccionesTotal || 0), '')}
    </div>

    ${acConclusiones(ins)}
    ${acReels(data.rankingReels)}
    ${acBarras('Ángulos que funcionan', data.porAngulo, AC_ANGULO_LABEL,
        'Ordenados por tasa de interacción (interacciones ÷ alcance). "alc" = alcance medio, "p" = nº de piezas.')}
    ${acBarras('Ganchos que funcionan', data.porGancho, AC_GANCHO_LABEL, 'Con qué recurso abre el copy.')}
    ${acBarras('Temas de interés', data.porTema, null, 'Los asuntos que más enganchan, según la clasificación de IA.')}
    ${acBarras('Por formato', data.porFormato, AC_FORMATO_LABEL, null)}
    ${acBarras('Por pilar', data.porPilar, AC_PILAR_LABEL, null)}

    <div style="font-size:11px;color:var(--text-muted);text-align:center;margin:8px 0 20px;">
      El inventario se sincroniza solo cada día a las 08:45.
    </div>
  `;
}

function acCambiarVentana(d) {
  acDias = d;
  navigate('analisis-contenido');
}

async function acSincronizar() {
  if (acCargando) return;
  acCargando = true;
  toast('Trayendo contenido de Instagram y clasificando… (puede tardar)', 'info');
  try {
    const r = await API.post('/analisis-contenido/sincronizar', {});
    const inv = r.inventario || {}, clas = r.clasificacion || {};
    toast(`Listo · ${inv.actualizadas || 0} medias (${inv.reels || 0} reels) · ${clas.clasificadas || 0} clasificadas`
      + (inv.errores || clas.errores ? ` · ${(inv.errores || 0) + (clas.errores || 0)} con error` : ''),
      (inv.errores || clas.errores) ? 'error' : 'success');
    navigate('analisis-contenido');
  } catch (err) {
    toast('No se pudo sincronizar: ' + err.message, 'error');
  } finally {
    acCargando = false;
  }
}

async function acGenerarConclusiones() {
  if (acCargando) return;
  acCargando = true;
  toast('La IA está analizando el contenido…', 'info');
  try {
    await API.post('/analisis-contenido/conclusiones', { dias: acDias });
    toast('Conclusiones generadas', 'success');
    navigate('analisis-contenido');
  } catch (err) {
    toast('No se pudieron generar: ' + err.message, 'error');
  } finally {
    acCargando = false;
  }
}
