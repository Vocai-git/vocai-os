/* ============================================================
   VOCAI OS — Publicación en redes (Meta Graph API)
   Instagram (historias, carrusel, feed) + Facebook Page.
   Credenciales en .env — nunca en el código.
   ============================================================ */

const V = process.env.META_API_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;

function cfg() {
  return {
    token:  process.env.META_ACCESS_TOKEN || '',
    igUser: process.env.IG_USER_ID || '',
    fbPage: process.env.FB_PAGE_ID || '',
    base:  (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  };
}

// ¿Están las credenciales mínimas para publicar?
// Las imágenes salen de Supabase Storage (URLs públicas absolutas),
// así que ya no hace falta PUBLIC_BASE_URL.
function metaConfigurado() {
  const c = cfg();
  return !!(c.token && c.igUser);
}

// ── Llamadas a la Graph API ─────────────────────────────────
async function graphPost(path, params) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Graph API: ${data.error ? data.error.message : 'HTTP ' + res.status}`);
  }
  return data;
}

async function graphGet(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Graph API: ${data.error ? data.error.message : 'HTTP ' + res.status}`);
  }
  return data;
}

// Espera a que un contenedor de IG quede FINISHED (listo para publicar).
async function esperarContenedor(creationId, token) {
  for (let i = 0; i < 12; i++) {
    const d = await graphGet(creationId, { fields: 'status_code', access_token: token });
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR') throw new Error('Instagram no pudo procesar el contenido');
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error('Instagram tardó demasiado en procesar el contenido');
}

// ── Instagram ───────────────────────────────────────────────

// Historia (imagen) en Instagram.
async function publicarHistoriaInstagram(imageUrl, token, igUser) {
  const c = await graphPost(`${igUser}/media`, {
    image_url: imageUrl, media_type: 'STORIES', access_token: token,
  });
  await esperarContenedor(c.id, token);
  return graphPost(`${igUser}/media_publish`, { creation_id: c.id, access_token: token });
}

// Imagen suelta en el feed de Instagram.
async function publicarImagenInstagram(imageUrl, caption, token, igUser) {
  const c = await graphPost(`${igUser}/media`, {
    image_url: imageUrl, caption: caption || '', access_token: token,
  });
  await esperarContenedor(c.id, token);
  return graphPost(`${igUser}/media_publish`, { creation_id: c.id, access_token: token });
}

// Carrusel (varias imágenes) en el feed de Instagram.
async function publicarCarruselInstagram(imageUrls, caption, token, igUser) {
  const hijos = [];
  for (const url of imageUrls) {
    const h = await graphPost(`${igUser}/media`, {
      image_url: url, is_carousel_item: 'true', access_token: token,
    });
    hijos.push(h.id);
  }
  for (const id of hijos) await esperarContenedor(id, token);
  const c = await graphPost(`${igUser}/media`, {
    media_type: 'CAROUSEL', children: hijos.join(','),
    caption: caption || '', access_token: token,
  });
  await esperarContenedor(c.id, token);
  return graphPost(`${igUser}/media_publish`, { creation_id: c.id, access_token: token });
}

// ── Facebook Page ───────────────────────────────────────────

// Una o varias fotos en la página de Facebook.
async function publicarFacebook(imageUrls, message, token, pageId) {
  if (!pageId || !imageUrls.length) return null;
  if (imageUrls.length === 1) {
    return graphPost(`${pageId}/photos`, {
      url: imageUrls[0], caption: message || '', access_token: token,
    });
  }
  // varias fotos → subir sin publicar y armar un posteo con todas
  const fbids = [];
  for (const url of imageUrls) {
    const ph = await graphPost(`${pageId}/photos`, {
      url, published: 'false', access_token: token,
    });
    fbids.push(ph.id);
  }
  const attached = JSON.stringify(fbids.map(id => ({ media_fbid: id })));
  return graphPost(`${pageId}/feed`, {
    message: message || '', attached_media: attached, access_token: token,
  });
}

module.exports = {
  metaConfigurado, cfg, graphGet,
  publicarHistoriaInstagram, publicarImagenInstagram,
  publicarCarruselInstagram, publicarFacebook,
};
