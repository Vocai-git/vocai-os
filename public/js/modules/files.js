async function renderFiles(el) {
  const clients = await API.get('/clients');

  // Simulated file library (no actual file storage in this version — placeholder UI)
  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Archivos</h2>
      <button class="btn btn-primary" onclick="toast('Función de subida de archivos disponible en v2', 'info')">📎 Subir archivo</button>
    </div>

    <div class="grid-auto" style="margin-bottom:24px;">
      <div class="card" style="text-align:center;padding:24px;">
        <div style="font-size:36px;margin-bottom:8px;">📄</div>
        <div style="font-weight:600;">Contratos</div>
        <div style="font-size:12px;color:var(--text-muted);">0 archivos</div>
      </div>
      <div class="card" style="text-align:center;padding:24px;">
        <div style="font-size:36px;margin-bottom:8px;">📋</div>
        <div style="font-weight:600;">Propuestas</div>
        <div style="font-size:12px;color:var(--text-muted);">0 archivos</div>
      </div>
      <div class="card" style="text-align:center;padding:24px;">
        <div style="font-size:36px;margin-bottom:8px;">🖼️</div>
        <div style="font-weight:600;">Imágenes</div>
        <div style="font-size:12px;color:var(--text-muted);">0 archivos</div>
      </div>
      <div class="card" style="text-align:center;padding:24px;">
        <div style="font-size:36px;margin-bottom:8px;">🎵</div>
        <div style="font-weight:600;">Audio / Video</div>
        <div style="font-size:12px;color:var(--text-muted);">0 archivos</div>
      </div>
    </div>

    <div class="card">
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <div class="empty-title">Biblioteca de archivos</div>
        <div class="empty-sub">La gestión de archivos estará disponible próximamente.<br>Por ahora, utiliza contratos y propuestas desde sus módulos.</div>
        <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
          <button class="btn btn-secondary" onclick="navigate('contracts')">Ver contratos</button>
          <button class="btn btn-secondary" onclick="navigate('proposals')">Ver propuestas</button>
        </div>
      </div>
    </div>`;
}
