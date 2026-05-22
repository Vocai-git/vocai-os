/* ============================================================
   VOCAI OS — Almacenamiento durable en Supabase Storage
   El disco de Railway es efímero: se borra en cada deploy.
   Las placas y carruseles del Generador viven acá para no
   perderse. Bucket público "generador".
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase');

const BUCKET = 'generador';

function contentType(p) {
  const e = path.extname(p).toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  if (e === '.json') return 'application/json';
  return 'application/octet-stream';
}

// Crea el bucket público si todavía no existe. Se llama al arrancar.
async function asegurarBucket() {
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    if (!(data || []).some(b => b.name === BUCKET)) {
      const r = await supabase.storage.createBucket(BUCKET, { public: true });
      if (r.error) throw r.error;
      console.log(`[Storage] Bucket "${BUCKET}" creado.`);
    } else {
      console.log(`[Storage] Bucket "${BUCKET}" OK.`);
    }
  } catch (e) {
    console.error('[Storage] No se pudo asegurar el bucket:', e.message);
  }
}

// Sube un archivo local a storagePath (sobreescribe si ya existe).
async function subir(localPath, storagePath) {
  const buf = fs.readFileSync(localPath);
  const { error } = await supabase.storage.from(BUCKET)
    .upload(storagePath, buf, { contentType: contentType(storagePath), upsert: true });
  if (error) throw new Error(`Storage subir ${storagePath}: ${error.message}`);
}

// Sube un objeto como JSON.
async function subirJson(obj, storagePath) {
  const { error } = await supabase.storage.from(BUCKET)
    .upload(storagePath, Buffer.from(JSON.stringify(obj, null, 2)),
      { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`Storage subir ${storagePath}: ${error.message}`);
}

// Descarga storagePath a un archivo local. Devuelve true si lo logró.
async function bajar(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) return false;
  fs.writeFileSync(localPath, Buffer.from(await data.arrayBuffer()));
  return true;
}

// Lee un JSON de Storage. Devuelve null si no existe o no se pudo parsear.
async function leerJson(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;
  try {
    return JSON.parse(Buffer.from(await data.arrayBuffer()).toString('utf8'));
  } catch (e) {
    return null;
  }
}

// Lista las entradas directas bajo un prefijo. Las carpetas vienen con id null.
async function listar(prefix) {
  const { data, error } = await supabase.storage.from(BUCKET)
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`Storage listar ${prefix}: ${error.message}`);
  return data || [];
}

// Borra una lista de rutas.
async function borrar(storagePaths) {
  if (!storagePaths.length) return;
  await supabase.storage.from(BUCKET).remove(storagePaths);
}

// Borra todo lo que cuelga de un prefijo (un nivel de profundidad).
async function borrarPrefijo(prefix) {
  const p = prefix.replace(/\/+$/, '');
  const entradas = await listar(p);
  const rutas = entradas.filter(e => e.id).map(e => `${p}/${e.name}`);
  await borrar(rutas);
}

// URL pública (CDN) de un objeto del bucket.
function urlPublica(storagePath) {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

module.exports = {
  BUCKET, asegurarBucket, subir, subirJson, bajar, leerJson,
  listar, borrar, borrarPrefijo, urlPublica,
};
