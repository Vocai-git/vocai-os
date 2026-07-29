/* ============================================================
   VOCAI OS — Reels a fondo
   Análisis granular de cada reel: curva de retención dibujada, dónde
   se cae la gente segundo a segundo, y semáforo contra los parámetros
   de una cuenta chica. Fuente: /api/reels-a-fondo (data/analisis-reels.json).
   No usa import/export — scripts globales, mobile-first.
   ============================================================ */

const RF_ORDER = ['hook', 'hold', 'completion', 'shares', 'no_seguidores', 'replay'];
const RF_KPI_LABEL = {
  hook: 'Arranque', hold: 'Retención', completion: 'Final',
  shares: 'Comparte', no_seguidores: 'Gente nueva', replay: 'Se re-mira',
};

function rfColor(estado) {
  return estado === 'verde' ? '#00C48C' : estado === 'amarillo' ? '#FFB020' : '#FF6B6B';
}
function rfDot(estado) {
  return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${rfColor(estado)};margin-right:5px;vertical-align:middle;"></span>`;
}
function rfN(n) {
  n = Number(n) || 0;
  return n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n);
}

// Curva de retención dibujada en SVG (con marca de la caída grande).
function rfCurva(reel) {
  const curva = reel.curva || [];
  if (!curva.length) return '';
  const W = 360, H = 150, padL = 24, padR = 12, padT = 12, padB = 22;
  const dur = reel.duracion_seg || curva[curva.length - 1].t || 1;
  const X = t => padL + (t / dur) * (W - padL - padR);
  const Y = p => padT + (1 - p / 100) * (H - padT - padB);
  const line = curva.map((c, i) => `${i ? 'L' : 'M'}${X(c.t).toFixed(1)} ${Y(c.pct).toFixed(1)}`).join(' ');
  const area = `M${X(curva[0].t).toFixed(1)} ${Y(0).toFixed(1)} `
    + curva.map(c => `L${X(c.t).toFixed(1)} ${Y(c.pct).toFixed(1)}`).join(' ')
    + ` L${X(curva[curva.length - 1].t).toFixed(1)} ${Y(0).toFixed(1)} Z`;
  const rojo = (reel.tramos || []).find(t => t.flag === 'rojo');
  let marca = '';
  if (rojo) {
    const mx = X(rojo.t_fin).toFixed(1);
    marca = `<line x1="${mx}" y1="${padT}" x2="${mx}" y2="${H - padB}" stroke="#FF6B6B" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>`
      + `<text x="${mx}" y="${padT + 8}" fill="#FF6B6B" font-size="8" text-anchor="middle">${rojo.caida}</text>`;
  }
  return `<div style="background:var(--surface-hover);border-radius:10px;padding:10px 8px 6px;"><svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
    <line x1="${padL}" y1="${Y(100).toFixed(1)}" x2="${W - padR}" y2="${Y(100).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${padL}" y1="${Y(50).toFixed(1)}" x2="${W - padR}" y2="${Y(50).toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3" opacity="0.5"/>
    <line x1="${padL}" y1="${Y(0).toFixed(1)}" x2="${W - padR}" y2="${Y(0).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
    <text x="2" y="${(Y(100) + 3).toFixed(1)}" fill="var(--text-muted)" font-size="8">100</text>
    <text x="6" y="${(Y(50) + 3).toFixed(1)}" fill="var(--text-muted)" font-size="8">50</text>
    <text x="10" y="${(Y(0) + 3).toFixed(1)}" fill="var(--text-muted)" font-size="8">0</text>
    ${marca}
    <path d="${area}" fill="#2979FF" opacity="0.12"/>
    <path d="${line}" fill="none" stroke="#2979FF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${padL}" y="${H - 4}" fill="var(--text-muted)" font-size="8">0s</text>
    <text x="${W - padR}" y="${H - 4}" fill="var(--text-muted)" font-size="8" text-anchor="end">${dur}s</text>
  </svg></div>`;
}

function rfKpiChip(k, label) {
  return `<div style="background:var(--surface-hover);border:1px solid var(--border);border-radius:8px;padding:6px 8px;min-width:0;">
    <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
    <div style="font-size:14px;font-weight:700;white-space:nowrap;">${rfDot(k.estado)}${escHtml(k.valor)}</div>
  </div>`;
}

function rfTramos(reel) {
  return (reel.tramos || []).map(t => {
    const rojo = t.flag === 'rojo';
    return `<div style="display:flex;gap:8px;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:11px;color:var(--text-muted);flex:0 0 48px;">${t.t_ini}–${t.t_fin}s</span>
      <span style="font-size:12px;flex:1;min-width:0;">${escHtml(t.label)}</span>
      <span style="font-size:12px;font-weight:700;flex:0 0 auto;color:${rojo ? '#FF6B6B' : 'var(--text-muted)'};">${t.caida} pts</span>
    </div>`;
  }).join('');
}

function rfLect(titulo, txt, color) {
  if (!txt) return '';
  return `<div style="font-size:12.5px;line-height:1.5;"><span style="color:${color};font-weight:700;">${titulo}:</span> ${escHtml(txt)}</div>`;
}

// Microscopio del arranque: qué se ve y qué se dice segundo a segundo en los
// primeros 5s + cuánta gente se va en los primeros 2s y 5s.
function rfMicroscopio(reel) {
  const mi = reel.microscopio;
  if (!mi) return '';
  const frames = (mi.frames || []).map(f => `
    <div style="flex:0 0 92px;">
      <div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border);">
        <img src="/img/reels/${escHtml(f.img)}" alt="${f.t}s" loading="lazy" style="width:100%;display:block;aspect-ratio:9/16;object-fit:cover;">
        <span style="position:absolute;top:4px;left:4px;background:#141d35cc;color:#fff;font-size:10px;font-weight:700;border-radius:4px;padding:1px 5px;">${f.t}s</span>
      </div>
      <div style="font-size:10px;color:var(--text-muted);line-height:1.3;margin-top:4px;">${escHtml(f.txt)}</div>
    </div>`).join('');
  const cifra = (val, sufijo) => val == null
    ? `<div style="font-size:13px;font-weight:700;color:var(--text-muted);line-height:1;">s/d</div><div style="font-size:10px;color:var(--text-muted);">${sufijo}</div>`
    : `<div style="font-size:22px;font-weight:800;color:#FF6B6B;line-height:1;">${val}</div><div style="font-size:10px;color:var(--text-muted);">${sufijo}</div>`;
  return `<div style="background:var(--surface-hover);border-radius:10px;padding:12px;margin-top:14px;">
    <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">🔬 Microscopio del arranque</div>
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
      <div style="text-align:center;flex:0 0 auto;">${cifra(mi.caida_2s, 'pts en 2s')}</div>
      <div style="text-align:center;flex:0 0 auto;">${cifra(mi.caida_5s, 'pts en 5s')}</div>
      <div style="font-size:11.5px;color:var(--text-muted);line-height:1.4;flex:1;min-width:120px;">Cuánta gente se va en los primeros 2 y 5 segundos.</div>
    </div>
    <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch;">${frames}</div>
    <div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-top:8px;"><span style="color:var(--text);font-weight:600;">Guion:</span> ${escHtml(mi.guion || '')}</div>
    <div style="font-size:12.5px;line-height:1.5;margin-top:6px;"><span style="color:#FF6B6B;font-weight:700;">Diagnóstico:</span> ${escHtml(mi.diagnostico || '')}</div>
  </div>`;
}

function rfFicha(reel) {
  const colab = reel.colab
    ? `<span style="font-size:10px;background:#2979FF22;color:#2979FF;border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:middle;">colab</span>` : '';
  const kpis = RF_ORDER.map(k => reel.kpis && reel.kpis[k] ? rfKpiChip(reel.kpis[k], RF_KPI_LABEL[k]) : '').join('');
  const m = reel.metricas || {};
  const pub = reel.publico || {};
  return `<div class="card" style="margin-bottom:14px;">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:2px;">
      <div style="font-weight:700;font-size:15px;">${escHtml(reel.titulo)}${colab}</div>
      <div style="font-size:12px;color:var(--text-muted);">${reel.duracion_seg}s · ${rfN(m.views)} views · ${rfN(m.reach)} alcance</div>
    </div>
    <div style="font-size:12px;color:var(--text-muted);font-style:italic;margin-bottom:10px;">"${escHtml(reel.gancho || '')}"</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:6px;margin-bottom:14px;">${kpis}</div>
    <div style="display:grid;grid-template-columns:1fr;gap:14px;">
      <div>${rfCurva(reel)}</div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Dónde se cae la gente</div>
        ${rfTramos(reel)}
      </div>
    </div>
    ${rfMicroscopio(reel)}
    <div style="margin-top:12px;display:grid;gap:6px;">
      ${rfLect('✅ Quedate con', reel.lectura && reel.lectura.replicar, '#00C48C')}
      ${rfLect('⚠️ Corregí', reel.lectura && reel.lectura.corregir, '#FF6B6B')}
      <div style="font-size:12px;color:var(--text-muted);">${escHtml(pub.pais_top || '')} · ${escHtml(pub.sexo || '')} · orígenes: ${escHtml(reel.origenes || '')}</div>
    </div>
  </div>`;
}

function rfTabla(data) {
  const cols = [['hook', 'Arranque'], ['hold', 'Retención'], ['completion', 'Final'],
    ['shares', 'Comparte'], ['no_seguidores', 'Gente nueva'], ['replay', 'Re-mira']];
  const head = `<th style="text-align:left;padding:6px 8px;font-size:11px;color:var(--text-muted);">Reel</th>`
    + cols.map(c => `<th style="padding:6px 8px;font-size:11px;color:var(--text-muted);white-space:nowrap;">${c[1]}</th>`).join('');
  const rows = data.reels.map(r => {
    const tds = cols.map(c => {
      const k = r.kpis[c[0]];
      return `<td style="text-align:center;padding:6px 8px;font-size:12px;white-space:nowrap;">${rfDot(k.estado)}${escHtml(k.valor)}</td>`;
    }).join('');
    const colab = r.colab ? ' <span style="color:#2979FF;font-size:10px;">(colab)</span>' : '';
    return `<tr style="border-top:1px solid var(--border);"><td style="padding:6px 8px;font-size:12px;font-weight:600;white-space:nowrap;">${escHtml(r.titulo)}${colab}</td>${tds}</tr>`;
  }).join('');
  return `<div class="card" style="margin-bottom:16px;overflow-x:auto;">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px;">Comparativa — los ${data.reels.length} reels</div>
    <table style="width:100%;border-collapse:collapse;min-width:520px;"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

function rfPatron(p) {
  if (!p) return '';
  const lista = arr => (arr || []).map(x => `<li style="margin-bottom:5px;">${escHtml(x)}</li>`).join('');
  const prov = p.provisional ? ` <span style="font-size:11px;color:#FFB020;font-weight:600;">· provisional (${p.n_reels} reels)</span>` : '';
  const hallazgo = p.hallazgo_arranque
    ? `<div style="background:#FF6B6B14;border-left:3px solid #FF6B6B;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:12.5px;line-height:1.55;">${escHtml(p.hallazgo_arranque)}</div>`
    : '';
  return `<div class="card" style="margin-bottom:16px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px;">🔑 El patrón${prov}</div>
    ${hallazgo}
    <div style="font-size:12px;font-weight:700;color:#00C48C;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Replicá</div>
    <ul style="margin:0 0 12px;padding-left:18px;font-size:13px;line-height:1.5;">${lista(p.replicar)}</ul>
    <div style="font-size:12px;font-weight:700;color:#FF6B6B;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Corregí</div>
    <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.5;">${lista(p.corregir)}</ul>
    ${p.nota ? `<div style="font-size:11px;color:var(--text-muted);margin-top:10px;">${escHtml(p.nota)}</div>` : ''}
  </div>`;
}

function rfParametros(params) {
  if (!params) return '';
  const rows = Object.keys(params).map(key => {
    const p = params[key];
    return `<tr style="border-top:1px solid var(--border);">
      <td style="padding:6px 8px;font-size:12px;font-weight:600;min-width:120px;">${escHtml(p.label)}<div style="font-weight:400;color:var(--text-muted);font-size:10.5px;">${escHtml(p.ayuda || '')}</div></td>
      <td style="padding:6px 8px;font-size:12px;text-align:center;color:#00C48C;white-space:nowrap;">${escHtml(p.bueno || '')}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:center;color:#FFB020;white-space:nowrap;">${escHtml(p.normal || '—')}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:center;color:#FF6B6B;white-space:nowrap;">${escHtml(p.malo || '')}</td>
      <td style="padding:6px 8px;font-size:10.5px;text-align:center;color:var(--text-muted);white-space:nowrap;">${escHtml(p.fuente || '')}<br>conf: ${escHtml(p.confianza || '')}</td>
    </tr>`;
  }).join('');
  return `<div class="card" style="margin-bottom:16px;overflow-x:auto;">
    <div style="font-weight:700;font-size:14px;margin-bottom:2px;">📏 Parámetros para tu tamaño de cuenta</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Cuenta chica (&lt;10K). Cada número se juzga contra esto, no contra cuentas grandes.</div>
    <table style="width:100%;border-collapse:collapse;min-width:560px;">
      <thead><tr>
        <th style="text-align:left;padding:6px 8px;font-size:11px;color:var(--text-muted);">Métrica</th>
        <th style="padding:6px 8px;font-size:11px;color:#00C48C;">Bueno</th>
        <th style="padding:6px 8px;font-size:11px;color:#FFB020;">Normal</th>
        <th style="padding:6px 8px;font-size:11px;color:#FF6B6B;">Flojo</th>
        <th style="padding:6px 8px;font-size:11px;color:var(--text-muted);">Fuente</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

async function renderReelsAFondo(el) {
  el.innerHTML = `<div class="card"><div style="color:var(--text-muted);">Cargando análisis de reels…</div></div>`;
  let data;
  try {
    data = await API.get('/reels-a-fondo');
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">No se pudo cargar el análisis: ${escHtml(err.message)}</div>`;
    return;
  }
  const c = data.cuenta || {};
  el.innerHTML = `
    <div class="section-header" style="flex-wrap:wrap;gap:10px;">
      <h2 class="section-title">Reels a fondo</h2>
      <span style="font-size:12px;color:var(--text-muted);">Actualizado ${escHtml(data.actualizado || '')}</span>
    </div>
    <div class="card" style="margin-bottom:16px;font-size:12.5px;color:var(--text-muted);line-height:1.5;">
      <strong style="color:var(--text);">${escHtml(c.handle || '')}</strong> · ${escHtml(c.tamano || '')} — ${escHtml(c.nota_aguante || '')}
    </div>
    ${rfTabla(data)}
    ${rfPatron(data.patron)}
    <div style="font-weight:700;font-size:15px;margin:20px 0 10px;">Ficha por reel</div>
    ${data.reels.map(rfFicha).join('')}
    ${rfParametros(data.parametros)}
    <div style="font-size:11px;color:var(--text-muted);text-align:center;margin:8px 0 24px;line-height:1.5;">
      El "arranque" es dato duro (estudio de 140K reels); retención y "final" son orientativos.
      La curva por segundo es lectura de las capturas de Instagram; los frames y el guion salen del video real (transcripción con tiempos). Cada número lleva fuente y confianza.
    </div>`;
}
