/* ============================================================
   VOCAI OS — TikTok (Login Kit + Display API)
   Conecta UNA cuenta de TikTok por OAuth y lee sus videos con
   métricas (views, likes, comentarios, compartidos). Los tokens
   viven en la tabla pronos_tiktok; el access token dura 24 h y
   se renueva solo con el refresh token (dura 1 año).
   Credenciales de la app en .env — nunca en el código.
   ============================================================ */

const { supabase } = require('./supabase');

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';
const CAMPOS_VIDEO = 'id,title,create_time,share_url,view_count,like_count,comment_count,share_count';

function cfg() {
  return {
    clientKey:    process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirectUri:  process.env.TIKTOK_REDIRECT_URI || '',
  };
}

// ¿Está cargada la app de TikTok for Developers?
function tiktokConfigurado() {
  const c = cfg();
  return !!(c.clientKey && c.clientSecret && c.redirectUri);
}

function urlAutorizacion(state) {
  const c = cfg();
  const qs = new URLSearchParams({
    client_key: c.clientKey,
    scope: 'user.info.basic,video.list',
    response_type: 'code',
    redirect_uri: c.redirectUri,
    state,
  });
  return `${AUTH_URL}?${qs}`;
}

// ── Tokens ──────────────────────────────────────────────────
async function pedirToken(params) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error || !d.access_token) {
    throw new Error(`TikTok OAuth: ${d.error_description || d.error || 'HTTP ' + res.status}`);
  }
  return d;
}

async function guardarTokens(d) {
  const ahora = Date.now();
  const { error } = await supabase.from('pronos_tiktok').upsert({
    id: 1,
    open_id: d.open_id,
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: new Date(ahora + d.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(ahora + d.refresh_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Guardando tokens de TikTok: ' + error.message);
}

async function canjearCodigo(code) {
  const c = cfg();
  const d = await pedirToken({
    client_key: c.clientKey,
    client_secret: c.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: c.redirectUri,
  });
  await guardarTokens(d);
}

async function filaTokens() {
  const { data } = await supabase.from('pronos_tiktok').select('*').eq('id', 1).maybeSingle();
  return data;
}

// Access token válido, renovándolo si vence en menos de 5 min.
// null = TikTok nunca se conectó.
async function tokenVigente() {
  const fila = await filaTokens();
  if (!fila || !fila.refresh_token) return null;
  if (new Date(fila.expires_at).getTime() - 5 * 60 * 1000 > Date.now()) return fila.access_token;

  const c = cfg();
  const d = await pedirToken({
    client_key: c.clientKey,
    client_secret: c.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: fila.refresh_token,
  });
  await guardarTokens(d);
  return d.access_token;
}

async function tiktokConectado() {
  if (!tiktokConfigurado()) return false;
  const fila = await filaTokens();
  return !!(fila && fila.refresh_token && new Date(fila.refresh_expires_at).getTime() > Date.now());
}

// ── Display API ─────────────────────────────────────────────
async function ttPost(path, body) {
  const token = await tokenVigente();
  if (!token) throw new Error('TikTok no está conectado');
  const res = await fetch(`${API}${path}?fields=${CAMPOS_VIDEO}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || (d.error && d.error.code && d.error.code !== 'ok')) {
    throw new Error(`TikTok API: ${(d.error && d.error.message) || 'HTTP ' + res.status}`);
  }
  return d.data || {};
}

// Últimos 20 videos de la cuenta conectada.
async function listarVideos() {
  const d = await ttPost('/video/list/', { max_count: 20 });
  return d.videos || [];
}

// Videos puntuales por id (de a 20 como máximo).
async function consultarVideos(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 20) {
    const d = await ttPost('/video/query/', { filters: { video_ids: ids.slice(i, i + 20) } });
    out.push(...(d.videos || []));
  }
  return out;
}

module.exports = {
  tiktokConfigurado, urlAutorizacion, canjearCodigo,
  tiktokConectado, listarVideos, consultarVideos,
};
