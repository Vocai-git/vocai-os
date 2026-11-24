// Facturas de los gastos: qué falta y carga automática desde la carpeta de Drive.
//
//   node scripts/facturas.js pendientes            → gastos sin factura adjunta
//   node scripts/facturas.js auto [--aplicar]      → recorre la carpeta de facturas recibidas, empareja cada archivo
//                                                    con su gasto y lo adjunta. Sin --aplicar solo muestra qué haría.
//   node scripts/facturas.js cargar <archivo> <id del gasto>   → adjunta un archivo a un gasto concreto
//
// Carpeta: FACTURAS_RECIBIDAS, o por defecto G:\Unidades compartidas\VOCAI\Facturas\Recibidas (cualquier subcarpeta).
// Un archivo se adjunta solo cuando hay UN único gasto posible: mismo proveedor y, además, el importe exacto escrito
// en la factura o una fecha a pocos días del pago. Si hay duda no adjunta nada y lo deja listado.
// Adjunta igual que el panel (routes/finance.js): archivo privado + fila en finance_files. Nunca cambia importes.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const CARPETA = process.env.FACTURAS_RECIBIDAS || 'G:\\Unidades compartidas\\VOCAI\\Facturas\\Recibidas';
const BUCKET = 'finance-private';
const ACTOR = 'Carga automática de facturas';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const plano = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const euro = c => (c / 100).toFixed(2).replace('.', ',');
// Palabras que identifican al proveedor: las del nombre y el concepto, sin las genéricas.
const GENERICAS = new Set(['s.l.', 'sl', 'inc.', 'inc', 'ltd', 'the', 'de', 'del', 'la', 'el', 'y', 'cuenta', 'vocai', 'suscripcion', 'compra', 'mensual', 'pago', 'octubre', 'noviembre', 'diciembre', '2026']);
const claves = d => [...new Set(plano(`${d.party || ''} ${d.title || ''}`).split(/[^a-z0-9]+/).filter(p => p.length > 3 && !GENERICAS.has(p)))];
// Otros nombres con los que el proveedor aparece en su factura.
const ALIAS = { claude: ['anthropic'], anthropic: ['claude'], gohighlevel: ['highlevel'], meta: ['facebook'], alquiler: ['goya', 'arrendamiento'], adrian: ['goya'] };

function tipo(b) {
  if (b.subarray(0, 5).toString() === '%PDF-') return ['application/pdf', 'pdf'];
  if (b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return ['image/jpeg', 'jpg'];
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ['image/png', 'png'];
  return null;
}

// Texto de un PDF, si hay con qué leerlo (Python con pypdf). Sin texto se empareja solo por nombre y carpeta.
function textoPdf(archivo) {
  const r = spawnSync('python', ['-I', '-c', 'import sys\ntry:\n import pypdf as p\nexcept ImportError:\n import PyPDF2 as p\nprint(" ".join((g.extract_text() or "") for g in p.PdfReader(sys.argv[1]).pages))', archivo],
    { encoding: 'utf8', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 60000 });
  return r.status === 0 ? r.stdout : '';
}
// Importes escritos en el texto, en céntimos: 1.234,56 · 1,234.56 · 867,00 · 47.37
function importes(texto) {
  const hallados = new Set();
  for (const m of texto.matchAll(/\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}(?!\d)|\d+[.,]\d{2}(?!\d)/g)) {
    const limpio = m[0].replace(/\s/g, ''), decimales = limpio.slice(-2), entero = limpio.slice(0, -3).replace(/[.,]/g, '');
    hallados.add(Number(entero) * 100 + Number(decimales));
  }
  return hallados;
}
// Fechas del texto y del nombre: 2026-11-15 · 15/11/2026 · 02.11.2026 · Nov 15, 2026
function fechas(texto) {
  const MES = { jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, oct: 10, nov: 11, dec: 12, dic: 12 };
  const f = new Set(), iso = (a, m, d) => { if (m >= 1 && m <= 12 && d >= 1 && d <= 31) f.add(`${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`); };
  for (const m of texto.matchAll(/(20\d\d)-(\d\d)-(\d\d)/g)) iso(m[1], +m[2], +m[3]);
  for (const m of texto.matchAll(/(\d{1,2})[./](\d{1,2})[./](20\d\d)/g)) iso(m[3], +m[2], +m[1]);
  for (const m of plano(texto).matchAll(/([a-z]{3})[a-z]*\.? (\d{1,2}),? (20\d\d)/g)) if (MES[m[1]]) iso(m[3], MES[m[1]], +m[2]);
  for (const m of plano(texto).matchAll(/(\d{1,2}) (?:de )?([a-z]{3})[a-z]*\.?,? (?:de )?(20\d\d)/g)) if (MES[m[2]]) iso(m[3], MES[m[2]], +m[1]);
  return [...f];
}
const dias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

async function estado() {
  const { data: r, error } = await db.from('finance_records').select('*').eq('voided', false).eq('included_in_opening', false).range(0, 999);
  if (error) throw new Error(error.message);
  const { data: f, error: e2 } = await db.from('finance_files').select('record_id,name,bytes').range(0, 9999);
  if (e2) throw new Error(e2.message);
  // Lo que ya está en la bandeja de Documentos del panel tampoco se vuelve a tratar.
  const { data: docs } = await db.from('finance_documents').select('name,bytes').range(0, 9999);
  for (const d of docs || []) f.push({ record_id: null, name: d.name, bytes: d.bytes });
  const con = new Set(f.map(x => x.record_id));
  const gastos = r.filter(x => x.data.kind === 'expense' && x.data.stage !== 'forecast' && (x.data.payments || []).length);
  return { faltan: gastos.filter(x => !con.has(x.id)).sort((a, b) => a.data.date.localeCompare(b.data.date)), total: gastos.length, subidos: new Set(f.map(x => `${x.name}|${x.bytes}`)) };
}

async function adjuntar(archivo, registro) {
  const b = fs.readFileSync(archivo), t = tipo(b);
  if (!t) throw new Error('Solo se admiten PDF, JPG o PNG reales');
  if (b.length > 10 * 1024 * 1024) throw new Error('El archivo supera los 10 MB');
  const id = randomUUID(), ruta = `${registro.id}/${id}.${t[1]}`;
  const { error: e1 } = await db.storage.from(BUCKET).upload(ruta, b, { contentType: t[0], upsert: false });
  if (e1) throw new Error('No se pudo guardar el archivo: ' + e1.message);
  const { error: e2 } = await db.from('finance_files').insert({ id, record_id: registro.id, path: ruta, name: path.basename(archivo).slice(0, 180), mime: t[0], bytes: b.length, actor: ACTOR });
  if (e2) { await db.storage.from(BUCKET).remove([ruta]); throw new Error('No se pudo vincular: ' + e2.message); }
}

function archivosDe(carpeta) {
  const lista = [];
  for (const e of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const p = path.join(carpeta, e.name);
    if (e.isDirectory()) lista.push(...archivosDe(p));
    else if (/\.(pdf|jpe?g|png)$/i.test(e.name)) lista.push(p);
  }
  return lista;
}

// El gasto al que corresponde un archivo, o el motivo por el que no se puede decidir.
function emparejar(archivo, faltan) {
  const nombre = plano(path.relative(CARPETA, archivo)), texto = /\.pdf$/i.test(archivo) ? textoPdf(archivo) : '';
  const todo = `${nombre} ${plano(texto)}`, montos = importes(texto), dia = fechas(`${texto} ${path.basename(archivo)}`);
  const delProveedor = faltan.filter(g => claves(g.data).some(c => todo.includes(c) || (ALIAS[c] || []).some(a => todo.includes(a))));
  if (!delProveedor.length) return { motivo: 'no reconozco de qué proveedor es' };
  const pago = g => g.data.payments[0].date;
  const porImporte = delProveedor.filter(g => montos.has(g.data.amount));
  // El importe exacto manda; si la factura trae fecha, además tiene que caer cerca del pago.
  let candidatos = porImporte.length > 1 && dia.length ? porImporte.filter(g => dia.some(d => dias(d, pago(g)) <= 35)) : porImporte;
  let criterio = 'importe exacto';
  if (!candidatos.length) { candidatos = delProveedor.filter(g => dia.some(d => dias(d, pago(g)) <= 6)); criterio = 'proveedor y fecha (importe en otra moneda o no legible)'; }
  if (candidatos.length === 1) return { gasto: candidatos[0], criterio };
  return { motivo: candidatos.length ? `hay ${candidatos.length} gastos posibles de ese proveedor` : 'es de un proveedor conocido, pero ni el importe ni la fecha coinciden con un gasto sin factura' };
}

(async () => {
  const [orden, a, b] = process.argv.slice(2).filter(x => !x.startsWith('--')), aplicar = process.argv.includes('--aplicar');
  const { faltan, total, subidos } = await estado();
  if (orden === 'pendientes') {
    console.log(`Gastos pagados desde el cierre: ${total}. Sin factura: ${faltan.length}.`);
    for (const g of faltan) console.log(g.data.payments[0].date, euro(g.data.amount).padStart(9), '|', (g.data.party || g.data.title).slice(0, 34).padEnd(34), '|', g.id);
  } else if (orden === 'cargar') {
    const { data: g, error } = await db.from('finance_records').select('*').eq('id', b).single();
    if (error || !g || g.voided) throw new Error('Gasto no encontrado');
    await adjuntar(a, g);
    console.log(`Adjuntado a «${g.data.party || g.data.title}» (${euro(g.data.amount)} €).`);
  } else if (orden === 'auto') {
    if (!fs.existsSync(CARPETA)) throw new Error('No encuentro la carpeta de facturas: ' + CARPETA);
    let hechos = 0, dudas = 0;
    const libres = [...faltan];
    for (const archivo of archivosDe(CARPETA)) {
      if (subidos.has(`${path.basename(archivo).slice(0, 180)}|${fs.statSync(archivo).size}`)) continue;   // ya está en el panel
      const r = emparejar(archivo, libres), corto = path.relative(CARPETA, archivo);
      if (!r.gasto) { dudas++; console.log(`SIN CARGAR  ${corto} → ${r.motivo}`); continue; }
      if (aplicar) await adjuntar(archivo, r.gasto);
      libres.splice(libres.indexOf(r.gasto), 1); hechos++;
      console.log(`${aplicar ? 'CARGADA   ' : 'CARGARÍA  '} ${corto} → ${r.gasto.data.party || r.gasto.data.title} · ${euro(r.gasto.data.amount)} € · pago ${r.gasto.data.payments[0].date} (${r.criterio})`);
    }
    console.log(`${hechos} ${aplicar ? 'cargadas' : 'por cargar'}, ${dudas} sin emparejar. Siguen sin factura ${libres.length} de ${total} gastos.`);
  } else console.log('Uso: node scripts/facturas.js pendientes | auto [--aplicar] | cargar <archivo> <id del gasto>');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
