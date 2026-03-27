async function renderSettings(el) {
  const user = JSON.parse(localStorage.getItem('vocai_user') || '{}');

  // Check Google Calendar status
  let gcStatus = { connected: false, email: null };
  try { gcStatus = await API.get('/google/status'); } catch (e) {}

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Configuración</h2>
    </div>

    <div class="grid-2">
      <!-- Perfil -->
      <div class="card">
        <div class="card-title" style="margin-bottom:20px;">👤 Mi perfil</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
          <div style="width:60px;height:60px;border-radius:50%;background:#FF6B6B;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:24px;font-weight:700;color:white;">
            ${(user.nombre||user.email||'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;font-size:16px;">${escHtml(user.nombre||'—')}</div>
            <div style="font-size:13px;color:var(--text-muted);">${escHtml(user.email||'—')}</div>
            <span class="badge" style="margin-top:4px;background:var(--coral-dim);color:var(--coral);">Fundador</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input" id="s_nombre" value="${escHtml(user.nombre||'')}">
        </div>
        <button class="btn btn-primary" onclick="saveProfile()">Guardar perfil</button>
      </div>

      <!-- Cambiar contraseña -->
      <div class="card">
        <div class="card-title" style="margin-bottom:20px;">🔒 Cambiar contraseña</div>
        <div class="form-group">
          <label class="form-label">Nueva contraseña</label>
          <input class="form-input" id="s_pass1" type="password" placeholder="••••••••">
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar contraseña</label>
          <input class="form-input" id="s_pass2" type="password" placeholder="••••••••">
        </div>
        <button class="btn btn-primary" onclick="changePassword()">Cambiar contraseña</button>
      </div>

      <!-- Empresa -->
      <div class="card">
        <div class="card-title" style="margin-bottom:20px;">🏢 Datos de la empresa</div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:14px;">
          <div><strong>Empresa:</strong> VOCAI</div>
          <div><strong>Web:</strong> www.vocai.es</div>
          <div><strong>Dirección:</strong> Camino del Faro 37, Cabo las Huertas, Alicante</div>
          <div><strong>Horario:</strong> L-V 9:00-19:00 | Sáb 10:00-14:00</div>
          <div><strong>Instagram:</strong> @vocai.st</div>
        </div>
        <div style="margin-top:16px;padding:12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--text-muted);">
          Para editar los datos de empresa, contacta con el equipo técnico.
        </div>
      </div>

      <!-- Integraciones -->
      <div class="card">
        <div class="card-title" style="margin-bottom:20px;">🔌 Integraciones</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <!-- Google Calendar -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg);border-radius:8px;">
            <div>
              <div style="font-weight:500;">Google Calendar</div>
              <div style="font-size:12px;color:var(--text-muted);">${gcStatus.connected ? 'Conectado como ' + escHtml(gcStatus.email) : 'Sincroniza eventos con tu calendario'}</div>
            </div>
            ${gcStatus.connected
              ? `<div style="display:flex;gap:8px;align-items:center;">
                  <span class="badge" style="background:#00C48C22;color:#00C48C;border:1px solid #00C48C44;">Conectado</span>
                  <button class="btn btn-ghost btn-sm" onclick="disconnectGoogle()" style="color:#FF6B6B;font-size:12px;">Desconectar</button>
                </div>`
              : '<button class="btn btn-primary btn-sm" onclick="connectGoogle()">Conectar Google Calendar</button>'}
          </div>
          <!-- Supabase -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg);border-radius:8px;">
            <div>
              <div style="font-weight:500;">Supabase</div>
              <div style="font-size:12px;color:var(--text-muted);">Base de datos y autenticación</div>
            </div>
            <span class="badge" style="background:#00C48C22;color:#00C48C;border:1px solid #00C48C44;">Conectado</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg);border-radius:8px;">
            <div>
              <div style="font-weight:500;">Railway</div>
              <div style="font-size:12px;color:var(--text-muted);">Hosting del servidor</div>
            </div>
            <span class="badge" style="background:#00C48C22;color:#00C48C;border:1px solid #00C48C44;">Activo</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg);border-radius:8px;">
            <div>
              <div style="font-weight:500;">n8n</div>
              <div style="font-size:12px;color:var(--text-muted);">Automatizaciones</div>
            </div>
            <span class="badge" style="background:rgba(255,255,255,0.06);color:#888;border:1px solid rgba(255,255,255,0.12);">Pendiente</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Danger zone -->
    <div class="card" style="border-color:var(--rose);margin-top:20px;">
      <div class="card-title" style="color:var(--rose);margin-bottom:16px;">⚠️ Zona de peligro</div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-weight:500;">Cerrar sesión</div>
          <div style="font-size:13px;color:var(--text-muted);">Salir del sistema operativo de VOCAI</div>
        </div>
        <button class="btn btn-danger" onclick="document.getElementById('btnLogout').click()">Cerrar sesión</button>
      </div>
    </div>`;

  // Check if redirected from Google OAuth
  if (window.location.hash.includes('google=ok')) {
    toast('Google Calendar conectado correctamente', 'success');
    window.location.hash = 'settings';
  } else if (window.location.hash.includes('google=error')) {
    toast('Error al conectar Google Calendar', 'error');
    window.location.hash = 'settings';
  }
}

function saveProfile() {
  const nombre = document.getElementById('s_nombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
  const user = JSON.parse(localStorage.getItem('vocai_user') || '{}');
  user.nombre = nombre;
  localStorage.setItem('vocai_user', JSON.stringify(user));
  document.getElementById('userName').textContent = nombre;
  document.getElementById('userAvatar').textContent = nombre.charAt(0).toUpperCase();
  toast('Perfil actualizado', 'success');
}

async function changePassword() {
  const p1 = document.getElementById('s_pass1').value;
  const p2 = document.getElementById('s_pass2').value;
  if (!p1) { toast('Ingresa la nueva contraseña', 'error'); return; }
  if (p1 !== p2) { toast('Las contraseñas no coinciden', 'error'); return; }
  if (p1.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
  try {
    await API.put('/auth/password', { password: p1 });
    toast('Contraseña actualizada correctamente', 'success');
    document.getElementById('s_pass1').value = '';
    document.getElementById('s_pass2').value = '';
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function connectGoogle() {
  try {
    const { url } = await API.get('/google/connect');
    window.location.href = url;
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function disconnectGoogle() {
  if (!window.confirm('¿Desconectar Google Calendar?')) return;
  try {
    await API.del('/google/disconnect');
    toast('Google Calendar desconectado', 'success');
    navigate('settings');
  } catch (err) { toast(err.message, 'error'); }
}
