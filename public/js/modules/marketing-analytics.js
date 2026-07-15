/* ============================================================
   VOCAI OS — Marketing · Analítica (performance)
   Cierra el loop: muestra cómo rindió cada pieza publicada
   (Meta Insights) + la evolución de la cuenta de IG. Alimenta
   el Paso 0 del ciclo mensual: ¿qué funcionó, qué no?
   Reutiliza MKT_PILAR y mktCalInjectStyles de marketing-calendar.js.
   ============================================================ */

let mktAnaMes = '';         // 'YYYY-MM' en foco
let mktAnaChart = null;     // instancia Chart.js viva (cuenta IG)
let mktAnaWebChart = null;  // instancia Chart.js viva (visitas web por día)

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
  let webDetalle = null;
  try { web = await API.get(`/track/resumen?mes=${mktAnaMes}`); }
  catch { /* sin migración web todavía — la sección no se muestra */ }
  try { if (web) webDetalle = await API.get(`/track/visitas?mes=${mktAnaMes}`); }
  catch { /* sin detalle — la sección web se muestra igual */ }

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

    ${web ? mktAnaWeb(web, webDetalle) : ''}

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
  if (web && Object.keys(web.por_dia || {}).length) mktAnaDibujarWebChart(web.por_dia);
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

// 'ES' → 🇪🇸 (regional indicators). Sin país devuelve ''.
function mktAnaBandera(cc) {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1A5 + c.charCodeAt(0)));
}

// 'ES' → 'España'. En Windows la bandera emoji no se renderiza, así que
// el nombre es lo que realmente identifica al país.
function mktAnaPais(cc) {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(cc.toUpperCase()) || cc;
  } catch { return cc; }
}

// Punto de color estable por hash de visitante: misma persona en el día
// = mismo color. Para distinguir "quién" sin guardar datos personales.
function mktAnaPuntoVisitante(hash) {
  if (!hash) return '';
  const hue = parseInt(hash.slice(0, 4), 16) % 360;
  return `<span title="Visitante ${escHtml(hash)}" style="display:inline-block;width:8px;height:8px;
    border-radius:50%;background:hsl(${hue},70%,55%);flex:0 0 auto;"></span>`;
}

// Desglose horizontal: "chrome (5) · safari (3)" con etiqueta al frente.
function mktAnaDesglose(label, obj, format) {
  const entradas = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!entradas.length) return '';
  return `
    <div style="font-size:13px;color:var(--text-muted);margin-top:8px;">
      <strong style="color:var(--text);">${label}:</strong>
      ${entradas.map(([k, n]) => `${format ? format(k) : escHtml(k)} (${n})`).join(' · ')}
    </div>`;
}

const MKT_ANA_EVENTO = {
  'click-whatsapp':   { label: 'WhatsApp',   emoji: '💬' },
  'reserva-estudio':  { label: 'Reserva',    emoji: '🎙' },
  'contacto-enviado': { label: 'Formulario', emoji: '📨' },
  'click-instagram':  { label: 'Instagram',  emoji: '📷' },
};

// Fila de la tabla de últimas visitas: fecha/hora · fuente · página ·
// dispositivo · país · navegador. Un evento se pinta como acción.
function mktAnaVisitaFila(v) {
  const f = new Date(v.ts).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const esEvento = v.tipo === 'evento';
  const ev = esEvento ? (MKT_ANA_EVENTO[v.evento] || { label: v.evento, emoji: '⚡' }) : null;
  const lugar = [mktAnaBandera(v.pais), v.ciudad ? escHtml(v.ciudad) : (v.pais ? escHtml(mktAnaPais(v.pais)) : '')]
    .filter(Boolean).join(' ');
  const detalle = [
    v.dispositivo === 'movil' ? '📱' : '🖥',
    v.navegador ? escHtml(v.navegador) : '',
    lugar,
  ].filter(Boolean).join(' · ');
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;
         border-bottom:1px solid var(--border);font-size:12px;flex-wrap:wrap;">
      ${mktAnaPuntoVisitante(v.visitante)}
      <span style="color:var(--text-muted);flex:0 0 84px;white-space:nowrap;">${f}</span>
      <span style="font-weight:600;flex:0 0 auto;">${escHtml(v.fuente || 'directo')}</span>
      ${esEvento
        ? `<span style="color:#00C48C;font-weight:600;">${ev.emoji} ${escHtml(ev.label)}${v.origen ? ` · ${escHtml(v.origen)}` : ''}</span>`
        : `<span style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;
             white-space:nowrap;max-width:160px;">${escHtml(v.path || '/')}</span>`}
      <span style="color:var(--text-muted);margin-left:auto;white-space:nowrap;">${detalle}</span>
    </div>`;
}

function mktAnaWeb(w, det) {
  const ev = w.eventos || {};
  const fuentes = Object.entries(w.fuentes || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const conversiones = [
    { k: 'contacto-enviado', label: 'Formularios enviados', emoji: '📨' },
    { k: 'click-whatsapp',   label: 'Clicks a WhatsApp',    emoji: '💬' },
    { k: 'reserva-estudio',  label: 'Intentos de reserva',  emoji: '🎙' },
    { k: 'click-instagram',  label: 'Clicks a Instagram',   emoji: '📷' },
  ];
  const hayDias = Object.keys(w.por_dia || {}).length > 0;
  const ultimas = det && det.ultimas ? det.ultimas : [];
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
      ${hayDias ? `
        <div style="margin-top:14px;">
          <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;
            letter-spacing:.4px;margin-bottom:6px;">Visitas por día</div>
          <div style="position:relative;height:120px;"><canvas id="mktAnaWebCanvas"></canvas></div>
        </div>` : ''}
      ${fuentes.length ? mktAnaDesglose('De dónde vienen', Object.fromEntries(fuentes)) : `
        <div style="margin-top:12px;font-size:13px;color:var(--text-muted);">
          Sin visitas registradas este mes todavía.
        </div>`}
      ${det ? `
        ${mktAnaDesglose('Páginas', det.paginas)}
        ${mktAnaDesglose('Dispositivos', det.dispositivos,
          k => k === 'movil' ? '📱 móvil' : '🖥 desktop')}
        ${mktAnaDesglose('Países', det.paises, k => `${mktAnaBandera(k)} ${escHtml(mktAnaPais(k))}`)}
        ${mktAnaDesglose('Navegadores', det.navegadores)}
        ${mktAnaDesglose('Idiomas', det.idiomas)}
      ` : ''}
      ${ultimas.length ? `
        <div style="margin-top:16px;">
          <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;
            letter-spacing:.4px;margin-bottom:4px;">Últimas visitas
            <span style="text-transform:none;letter-spacing:0;">· el punto de color identifica
            al mismo visitante dentro del día</span></div>
          ${ultimas.map(mktAnaVisitaFila).join('')}
        </div>` : ''}
    </div>`;
}

// ── Gráfico de visitas web por día ──────────────────────────
function mktAnaDibujarWebChart(porDia) {
  const canvas = document.getElementById('mktAnaWebCanvas');
  if (!canvas || typeof Chart === 'undefined') return;
  if (mktAnaWebChart) { mktAnaWebChart.destroy(); mktAnaWebChart = null; }
  const [y, m] = mktAnaMes.split('-').map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  const labels = [], valores = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const key = `${mktAnaMes}-${String(d).padStart(2, '0')}`;
    labels.push(String(d));
    valores.push(porDia[key] || 0);
  }
  mktAnaWebChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Visitas', data: valores,
        backgroundColor: 'rgba(41,121,255,.55)', borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { font: { size: 10 }, precision: 0 }, beginAtZero: true },
        x: { ticks: { font: { size: 9 }, maxRotation: 0 }, grid: { display: false } },
      },
    },
  });
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
