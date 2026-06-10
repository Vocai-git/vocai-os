/* ============================================================
   VOCAI OS — Marketing · Analítica (performance)
   Cierra el loop: muestra cómo rindió cada pieza publicada
   (Meta Insights) + la evolución de la cuenta de IG. Alimenta
   el Paso 0 del ciclo mensual: ¿qué funcionó, qué no?
   Reutiliza MKT_PILAR y mktCalInjectStyles de marketing-calendar.js.
   ============================================================ */

let mktAnaMes = '';      // 'YYYY-MM' en foco
let mktAnaChart = null;  // instancia Chart.js viva

const MKT_ANA_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const MKT_ANA_FORMATO = {
  reel: 'Reel', carrusel: 'Carrusel', story: 'Story', post: 'Post', otro: 'Otro',
};

function mktAnaMesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mktAnaMesLabel(mes) {
  const [y, m] = mes.split('-').map(Number);
  return `${MKT_ANA_MESES[m - 1]} ${y}`;
}

function mktAnaMover(delta) {
  const [y, m] = mktAnaMes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  mktAnaMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  navigate('marketing-analytics');
}

function mktAnaNum(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + ' M';
  if (n >= 10000) return (n / 1000).toFixed(1).replace('.', ',') + ' mil';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Variación % contra el mes anterior, como pill de color.
function mktAnaDelta(actual, anterior) {
  if (!anterior) return '';
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  const color = pct >= 0 ? '#00C48C' : '#FF6B6B';
  const signo = pct >= 0 ? '+' : '';
  return `<span style="font-size:12px;font-weight:600;color:${color};">${signo}${pct}% vs mes ant.</span>`;
}

async function renderMarketingAnalytics(el) {
  mktCalInjectStyles();
  if (!mktAnaMes) mktAnaMes = mktAnaMesActual();

  let data, web = null;
  try {
    data = await API.get(`/marketing-analytics?mes=${mktAnaMes}`);
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">Error al cargar: ${escHtml(err.message)}</div>`;
    return;
  }
  try { web = await API.get(`/track/resumen?mes=${mktAnaMes}`); }
  catch { /* sin migración web todavía — la sección no se muestra */ }

  const { piezas, cuenta, totales, mesAnterior } = data;
  const publicadas = piezas.filter(p => p.estado === 'publicada');
  const conDatos = publicadas.filter(p => p.metrics);
  const sinDatos = publicadas.filter(p => !p.metrics);

  // Seguidores: último snapshot del mes + delta contra el primero.
  const ultSnap = cuenta.length ? cuenta[cuenta.length - 1] : null;
  const priSnap = cuenta.length ? cuenta[0] : null;
  const segDelta = (ultSnap && priSnap && ultSnap.fecha !== priSnap.fecha)
    ? ultSnap.seguidores - priSnap.seguidores : null;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Analítica · Performance</h2>
      <button class="btn btn-secondary" onclick="mktAnaRefrescar()"
        title="Traer las métricas frescas de Meta ahora (tarda unos segundos)">
        ↻ Actualizar datos
      </button>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;align-items:center;gap:12px;">
      <button class="btn btn-secondary" style="padding:6px 12px;" onclick="mktAnaMover(-1)">‹</button>
      <span style="font-weight:700;font-size:15px;min-width:140px;text-align:center;">
        ${mktAnaMesLabel(mktAnaMes)}</span>
      <button class="btn btn-secondary" style="padding:6px 12px;" onclick="mktAnaMover(1)">›</button>
      <span style="margin-left:auto;font-size:13px;color:var(--text-muted);">
        ${conDatos.length} de ${publicadas.length} piezas con datos</span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
         gap:12px;margin-bottom:20px;">
      ${mktAnaCard('Seguidores', ultSnap ? mktAnaNum(ultSnap.seguidores) : '—',
        segDelta !== null
          ? `<span style="font-size:12px;font-weight:600;color:${segDelta >= 0 ? '#00C48C' : '#FF6B6B'};">${segDelta >= 0 ? '+' : ''}${segDelta} en el mes</span>`
          : '')}
      ${mktAnaCard('Alcance del mes', mktAnaNum(totales.alcance),
        mktAnaDelta(totales.alcance, mesAnterior.alcance))}
      ${mktAnaCard('Interacciones', mktAnaNum(totales.interacciones),
        mktAnaDelta(totales.interacciones, mesAnterior.interacciones))}
      ${mktAnaCard('Guardados', mktAnaNum(totales.guardados),
        mktAnaDelta(totales.guardados, mesAnterior.guardados))}
    </div>

    ${cuenta.length >= 2 ? `
      <div class="card" style="margin-bottom:20px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:10px;">Evolución de la cuenta</div>
        <div style="position:relative;height:200px;"><canvas id="mktAnaCanvas"></canvas></div>
      </div>` : ''}

    ${web ? mktAnaWeb(web) : ''}

    ${conDatos.length ? mktAnaPilares(conDatos) : ''}

    <div style="font-weight:700;font-size:14px;margin:20px 0 10px;">
      Ranking de piezas del mes</div>
    ${conDatos.length
      ? [...conDatos].sort((a, b) => (b.metrics.alcance || 0) - (a.metrics.alcance || 0))
          .map(mktAnaFila).join('')
      : `<div class="empty-state">
           <div class="empty-icon">📊</div>
           <div class="empty-title">Todavía no hay métricas este mes</div>
           <div class="empty-sub">Las métricas se actualizan solas cada día a las 08:30.
             Si ya hay piezas publicadas, tocá "Actualizar datos".</div>
         </div>`}

    ${sinDatos.length ? `
      <div class="card" style="margin-top:14px;font-size:13px;color:var(--text-muted);">
        ⚠ ${sinDatos.length} ${sinDatos.length === 1 ? 'pieza publicada todavía sin datos' : 'piezas publicadas todavía sin datos'}:
        ${sinDatos.map(p => escHtml(p.titulo)).join(' · ')}.
        Se vinculan solas en la próxima corrida (o con "Actualizar datos").
      </div>` : ''}
  `;

  if (cuenta.length >= 2) mktAnaDibujarChart(cuenta);
}

function mktAnaCard(label, valor, sub) {
  return `
    <div class="card" style="padding:14px 16px;">
      <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;
        letter-spacing:.4px;">${label}</div>
      <div style="font-size:26px;font-weight:800;margin:4px 0 2px;">${valor}</div>
      ${sub || ''}
    </div>`;
}

// ── Web (vocai.es) — tracker propio, /api/track ─────────────
function mktAnaWeb(w) {
  const ev = w.eventos || {};
  const fuentes = Object.entries(w.fuentes || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const conversiones = [
    { k: 'contacto-enviado', label: 'Formularios enviados', emoji: '📨' },
    { k: 'click-whatsapp',   label: 'Clicks a WhatsApp',    emoji: '💬' },
    { k: 'reserva-estudio',  label: 'Intentos de reserva',  emoji: '🎙' },
    { k: 'click-instagram',  label: 'Clicks a Instagram',   emoji: '📷' },
  ];
  return `
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-weight:700;font-size:14px;">Web · vocai.es</span>
        <span style="font-size:12px;color:var(--text-muted);">tracker propio, sin cookies</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
        ${mktAnaCard('Visitas', mktAnaNum(w.visitas || 0), '')}
        ${mktAnaCard('Visitantes', mktAnaNum(w.visitantes || 0), '')}
        ${conversiones.map(c => mktAnaCard(c.label, mktAnaNum(ev[c.k] || 0),
          `<span style="font-size:14px;">${c.emoji}</span>`)).join('')}
      </div>
      ${fuentes.length ? `
        <div style="margin-top:12px;font-size:13px;color:var(--text-muted);">
          <strong style="color:var(--text);">De dónde vienen:</strong>
          ${fuentes.map(([f, n]) => `${escHtml(f)} (${n})`).join(' · ')}
        </div>` : `
        <div style="margin-top:12px;font-size:13px;color:var(--text-muted);">
          Sin visitas registradas este mes todavía.
        </div>`}
    </div>`;
}

// ── Performance por pilar — qué pilar empuja y cuál no ──────
function mktAnaPilares(piezas) {
  const agg = {};
  piezas.forEach(p => {
    const k = p.pilar || 'ia';
    if (!agg[k]) agg[k] = { piezas: 0, alcance: 0, interacciones: 0 };
    agg[k].piezas++;
    agg[k].alcance += p.metrics.alcance || 0;
    agg[k].interacciones += p.metrics.interacciones || 0;
  });
  const max = Math.max(...Object.values(agg).map(a => a.alcance), 1);
  const filas = Object.entries(agg)
    .sort((a, b) => b[1].alcance - a[1].alcance)
    .map(([k, a]) => {
      const pilar = MKT_PILAR[k] || { label: k, color: '#888888' };
      return `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:600;color:${pilar.color};flex:0 0 150px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${pilar.label}</span>
          <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
            <div style="width:${Math.round((a.alcance / max) * 100)}%;height:100%;
              background:${pilar.color};border-radius:4px;"></div>
          </div>
          <span style="font-size:12px;color:var(--text-muted);flex:0 0 auto;">
            ${mktAnaNum(a.alcance)} · ${a.piezas}p</span>
        </div>`;
    }).join('');
  return `
    <div class="card" style="margin-bottom:6px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:12px;">Alcance por pilar</div>
      ${filas}
    </div>`;
}

// ── Fila del ranking ────────────────────────────────────────
function mktAnaFila(p) {
  const pilar = MKT_PILAR[p.pilar] || { label: '—', color: '#888888' };
  const m = p.metrics;
  const met = (emoji, val, title) =>
    `<span title="${title}" style="font-size:12px;color:var(--text-muted);
      white-space:nowrap;">${emoji} ${mktAnaNum(val)}</span>`;
  return `
    <div class="card" style="border-left:3px solid ${pilar.color};padding:12px 14px;
         margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <div style="font-weight:600;font-size:14px;line-height:1.3;">${escHtml(p.titulo)}</div>
          <div style="display:flex;gap:10px;margin-top:5px;flex-wrap:wrap;">
            <span style="font-size:11px;font-weight:600;color:${pilar.color};
              text-transform:uppercase;">${pilar.label}</span>
            <span style="font-size:11px;color:var(--text-muted);">
              ${MKT_ANA_FORMATO[p.formato] || p.formato} · ${escHtml(p.fecha || '')}</span>
          </div>
        </div>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
          ${met('👁', m.alcance, 'Alcance')}
          ${m.reproducciones ? met('▶', m.reproducciones, 'Reproducciones') : ''}
          ${met('❤️', m.me_gusta, 'Me gusta')}
          ${met('💬', m.comentarios, 'Comentarios')}
          ${met('🔖', m.guardados, 'Guardados')}
          ${met('↗', m.compartidos, 'Compartidos')}
        </div>
      </div>
    </div>`;
}

// ── Gráfico de la cuenta (seguidores + alcance diario) ──────
function mktAnaDibujarChart(cuenta) {
  const canvas = document.getElementById('mktAnaCanvas');
  if (!canvas || typeof Chart === 'undefined') return;
  if (mktAnaChart) { mktAnaChart.destroy(); mktAnaChart = null; }
  const labels = cuenta.map(c => {
    const m = /-(\d{2})-(\d{2})$/.exec(c.fecha);
    return m ? `${+m[2]}/${+m[1]}` : c.fecha;
  });
  mktAnaChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Seguidores', data: cuenta.map(c => c.seguidores),
          borderColor: '#2979FF', backgroundColor: 'rgba(41,121,255,.12)',
          tension: .3, fill: true, yAxisID: 'y',
        },
        {
          label: 'Alcance del día', data: cuenta.map(c => c.alcance_dia || 0),
          borderColor: '#FF6B6B', backgroundColor: 'transparent',
          tension: .3, yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: {
        y:  { position: 'left',  ticks: { font: { size: 10 } } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 10 } } },
        x:  { ticks: { font: { size: 10 } } },
      },
    },
  });
}

// ── Refrescar métricas YA (Graph API, tarda unos segundos) ──
async function mktAnaRefrescar() {
  toast('Trayendo métricas de Meta…', 'info');
  try {
    const r = await API.post('/marketing-analytics/refrescar');
    toast(`Métricas OK · ${r.actualizadas} piezas actualizadas` +
      (r.vinculadas ? ` · ${r.vinculadas} vinculadas` : '') +
      (r.errores ? ` · ${r.errores} con error` : ''), r.errores ? 'error' : 'success');
    navigate('marketing-analytics');
  } catch (err) {
    toast('No se pudieron traer las métricas: ' + err.message, 'error');
  }
}
