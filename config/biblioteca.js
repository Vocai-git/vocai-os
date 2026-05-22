/* ============================================================
   VOCAI OS — Biblioteca de ejemplos de copy
   Mejora continua del Generador: NO se reentrena, acumula
   ejemplos curados por el humano. Lo aprobado marca el estándar
   a igualar; lo rechazado, el error a evitar. Vive en Supabase
   Storage (durable) bajo el prefijo "biblioteca/".
   ============================================================ */

const storage = require('./storage');

const RUTAS = {
  aprobados:  'biblioteca/aprobados.json',
  rechazados: 'biblioteca/rechazados.json',
};
const TOPE = 60;                              // máximo de registros por libro
const EN_PROMPT = { aprobados: 8, rechazados: 6 };   // cuántos se inyectan

// Lee un libro ('aprobados' | 'rechazados'). Devuelve siempre un array.
async function leer(libro) {
  const data = await storage.leerJson(RUTAS[libro]);
  return Array.isArray(data) ? data : [];
}

// Agrega un registro al frente del libro y recorta al tope.
async function agregar(libro, registro) {
  const lista = await leer(libro);
  lista.unshift({ ...registro, fecha: new Date().toISOString() });
  await storage.subirJson(lista.slice(0, TOPE), RUTAS[libro]);
  return lista.length;
}

// Cuántos ejemplos hay en cada libro.
async function resumen() {
  const [a, r] = await Promise.all([leer('aprobados'), leer('rechazados')]);
  return { aprobados: a.length, rechazados: r.length };
}

// Una línea compacta de un ejemplo para el prompt.
function lineaEjemplo(e) {
  const partes = [];
  if (e.titulo)    partes.push(`Título: ${e.titulo}`);
  if (e.subtitulo) partes.push(`Subtítulo: ${e.subtitulo}`);
  if (e.copy)      partes.push(`Copy: ${e.copy.replace(/\s+/g, ' ').trim()}`);
  if (e.motivo)    partes.push(`Lo que falló: ${e.motivo}`);
  return `· Idea: ${e.idea || '—'} → ${partes.join(' | ')}`;
}

// Bloque de ejemplos para inyectar en el system prompt de los
// especialistas de texto. Devuelve '' si todavía no hay nada.
async function bloqueEjemplos() {
  const [aprob, rech] = await Promise.all([leer('aprobados'), leer('rechazados')]);
  if (!aprob.length && !rech.length) return '';
  let txt = '\n\nBIBLIOTECA DE EJEMPLOS CURADOS POR EL HUMANO\n' +
    '(El generador no se reentrena: aprende de estos ejemplos. Si un ejemplo ' +
    'contradice las reglas de arriba, mandan las reglas.)\n';
  if (aprob.length) {
    txt += '\nAPROBADOS — son el estándar a igualar. Imita su nivel y su tono, ' +
      'no los copies literal:\n' +
      aprob.slice(0, EN_PROMPT.aprobados).map(lineaEjemplo).join('\n') + '\n';
  }
  if (rech.length) {
    txt += '\nRECHAZADOS — esto no funcionó. No repitas el error indicado:\n' +
      rech.slice(0, EN_PROMPT.rechazados).map(lineaEjemplo).join('\n') + '\n';
  }
  return txt;
}

module.exports = { leer, agregar, resumen, bloqueEjemplos };
