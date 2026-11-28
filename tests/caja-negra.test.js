'use strict';
// La parte del panel de la caja negra, entera y sin red: base de datos en memoria y correos capturados.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { crearCajaNegra } = require('../lib/caja-negra');

const OAEP = { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVADA = privateKey.export({ type: 'pkcs8', format: 'pem' });
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');

function montar({ sinLlave = false, correoRoto = false } = {}) {
  const filas = new Map();
  const correos = [];
  const reloj = { t: Date.UTC(2026, 10, 28, 10) };
  const caja = crearCajaNegra({
    privada: sinLlave ? null : PRIVADA,
    ahora: () => reloj.t,
    leer: async id => (filas.has(id) ? structuredClone(filas.get(id)) : null),
    guardar: async (id, f) => { filas.set(id, structuredClone(f)); },
    enviar: async c => { if (correoRoto) throw new Error('El correo no salió (500).'); correos.push(c); },
  });
  const codigo = para => correos.filter(c => c.para === para).at(-1).texto.match(/código es: (\d{6})/)[1];
  return { caja, filas, correos, reloj, codigo };
}
const rechaza = (promesa, status) => assert.rejects(promesa, e => e.status === status);
// Deja una caja activa y devuelve lo necesario para seguir probando.
async function activar(m, id = 'a1') {
  await m.caja.alta(id, { correo_cliente: 'cliente@ejemplo.es', correo_vocai: 'equipo@ejemplo.es' });
  const { publica } = await m.caja.confirmar(id, { codigo_cliente: m.codigo('cliente@ejemplo.es'), codigo_vocai: m.codigo('equipo@ejemplo.es') });
  const prueba = 'prueba-de-las-dos-contraseñas';
  await m.caja.registrar(id, { prueba_huella: sha(prueba), n: 1, h: 'a'.repeat(64) });
  const copia = (parte, de = id) => crypto.publicEncrypt({ key: publica, ...OAEP }, Buffer.from(JSON.stringify({ asistente: de, parte, mitad: `mitad-de-${parte}` }))).toString('base64');
  return { prueba, copia };
}

test('activar: un código a cada correo, y sin los dos no hay caja', async () => {
  const m = montar();
  await m.caja.alta('a1', { correo_cliente: 'Cliente@Ejemplo.es', correo_vocai: 'equipo@ejemplo.es' });
  assert.equal(m.correos.length, 2);
  assert.deepEqual(m.correos.map(c => c.para), ['cliente@ejemplo.es', 'equipo@ejemplo.es']);
  assert.notEqual(m.codigo('cliente@ejemplo.es'), undefined);
  // En la base no queda el código, solo su huella.
  assert.ok(!JSON.stringify(m.filas.get('a1')).includes(m.codigo('cliente@ejemplo.es')));
  await rechaza(m.caja.confirmar('a1', { codigo_cliente: m.codigo('cliente@ejemplo.es'), codigo_vocai: '000000' }), 400);
  await rechaza(m.caja.registrar('a1', { prueba_huella: sha('x'), n: 1, h: 'a'.repeat(64) }), 409);
  const r = await m.caja.confirmar('a1', { codigo_cliente: m.codigo('cliente@ejemplo.es'), codigo_vocai: m.codigo('equipo@ejemplo.es') });
  assert.equal(r.asistente, 'a1');
  assert.match(r.publica, /BEGIN PUBLIC KEY/);
  await m.caja.registrar('a1', { prueba_huella: sha('p'), n: 1, h: 'a'.repeat(64) });
  assert.equal((await m.caja.estado('a1')).estado, 'activa');
  assert.equal(m.correos.length, 4); // dos códigos y el aviso de activación a cada uno
});

test('activar: correos iguales o mal escritos, sin llave, y una caja activa no se pisa', async () => {
  const m = montar();
  await rechaza(m.caja.alta('a1', { correo_cliente: 'a@b.es', correo_vocai: 'a@b.es' }), 400);
  await rechaza(m.caja.alta('a1', { correo_cliente: 'no-es-correo', correo_vocai: 'a@b.es' }), 400);
  await rechaza(montar({ sinLlave: true }).caja.alta('a1', { correo_cliente: 'a@b.es', correo_vocai: 'c@d.es' }), 503);
  await activar(m);
  await rechaza(m.caja.alta('a1', { correo_cliente: 'otro@ejemplo.es', correo_vocai: 'mas@ejemplo.es' }), 409);
  assert.equal((await m.caja.estado('a1')).correo_cliente, 'cliente@ejemplo.es');
});

test('los códigos vencen a los 15 minutos y se bloquean al quinto intento', async () => {
  const m = montar();
  await m.caja.alta('a1', { correo_cliente: 'cliente@ejemplo.es', correo_vocai: 'equipo@ejemplo.es' });
  const bien = { codigo_cliente: m.codigo('cliente@ejemplo.es'), codigo_vocai: m.codigo('equipo@ejemplo.es') };
  m.reloj.t += 16 * 60_000;
  await rechaza(m.caja.confirmar('a1', bien), 400);

  const n = montar();
  await n.caja.alta('a1', { correo_cliente: 'cliente@ejemplo.es', correo_vocai: 'equipo@ejemplo.es' });
  const buenos = { codigo_cliente: n.codigo('cliente@ejemplo.es'), codigo_vocai: n.codigo('equipo@ejemplo.es') };
  for (let i = 0; i < 5; i++) await rechaza(n.caja.confirmar('a1', { codigo_cliente: '111111', codigo_vocai: '222222' }), 400);
  await rechaza(n.caja.confirmar('a1', buenos), 400); // ya ni los buenos valen: hay que pedir otros
});

test('restablecer: el código va al correo de esa parte, sale su mitad y la otra parte recibe un aviso', async () => {
  const m = montar();
  const { copia } = await activar(m);
  m.correos.length = 0;
  await m.caja.restablecerPedir('a1', { parte: 'cliente' });
  assert.deepEqual(m.correos.map(c => c.para), ['cliente@ejemplo.es']);
  await rechaza(m.caja.restablecerConfirmar('a1', { parte: 'cliente', codigo: '000000', copia: copia('cliente') }), 400);
  const codigo = m.codigo('cliente@ejemplo.es');
  const r = await m.caja.restablecerConfirmar('a1', { parte: 'cliente', codigo, copia: copia('cliente') });
  assert.equal(r.mitad, 'mitad-de-cliente');
  assert.deepEqual(m.correos.slice(-2).map(c => c.para).sort(), ['cliente@ejemplo.es', 'equipo@ejemplo.es']);
  // El código se gasta: no sirve dos veces.
  await rechaza(m.caja.restablecerConfirmar('a1', { parte: 'cliente', codigo, copia: copia('cliente') }), 400);
});

test('restablecer: con el código de una parte no sale la mitad de la otra, ni la de otro asistente', async () => {
  const m = montar();
  const { copia } = await activar(m);
  await m.caja.restablecerPedir('a1', { parte: 'cliente' });
  await rechaza(m.caja.restablecerConfirmar('a1', { parte: 'cliente', codigo: m.codigo('cliente@ejemplo.es'), copia: copia('vocai') }), 403);
  await m.caja.restablecerPedir('a1', { parte: 'cliente' });
  await rechaza(m.caja.restablecerConfirmar('a1', { parte: 'cliente', codigo: m.codigo('cliente@ejemplo.es'), copia: copia('cliente', 'otro-asistente') }), 403);
  await m.caja.restablecerPedir('a1', { parte: 'cliente' });
  await rechaza(m.caja.restablecerConfirmar('a1', { parte: 'cliente', codigo: m.codigo('cliente@ejemplo.es'), copia: 'basura' }), 400);
  await rechaza(m.caja.restablecerPedir('sin-caja', { parte: 'cliente' }), 409);
  await rechaza(m.caja.restablecerPedir('a1', { parte: 'nadie' }), 400);
});

test('cambiar un correo: sin la prueba de las dos contraseñas no se puede; el código va al correo nuevo', async () => {
  const m = montar();
  const { prueba } = await activar(m);
  await rechaza(m.caja.correoPedir('a1', { parte: 'cliente', correo: 'nuevo@ejemplo.es', prueba: 'inventada' }), 403);
  await rechaza(m.caja.correoPedir('a1', { parte: 'cliente', correo: 'equipo@ejemplo.es', prueba }), 400);
  m.correos.length = 0;
  await m.caja.correoPedir('a1', { parte: 'cliente', correo: 'nuevo@ejemplo.es', prueba });
  assert.deepEqual(m.correos.map(c => c.para), ['nuevo@ejemplo.es']);
  assert.equal((await m.caja.estado('a1')).correo_cliente, 'cliente@ejemplo.es'); // todavía no cambió
  await m.caja.correoConfirmar('a1', { parte: 'cliente', codigo: m.codigo('nuevo@ejemplo.es') });
  assert.equal((await m.caja.estado('a1')).correo_cliente, 'nuevo@ejemplo.es');
  // Aviso al nuevo, a la otra parte y al correo anterior.
  assert.deepEqual(m.correos.slice(-3).map(c => c.para).sort(), ['cliente@ejemplo.es', 'equipo@ejemplo.es', 'nuevo@ejemplo.es']);
});

test('sello: avanza, no retrocede y no se pisa con otra huella', async () => {
  const m = montar();
  await activar(m);
  assert.equal((await m.caja.selloGuardar('a1', { n: 5, h: 'b'.repeat(64) })).ok, true);
  assert.equal((await m.caja.selloGuardar('a1', { n: 3, h: 'c'.repeat(64) })).ok, false);
  assert.equal((await m.caja.selloGuardar('a1', { n: 5, h: 'c'.repeat(64) })).ok, false);
  assert.deepEqual({ n: 5, h: 'b'.repeat(64) }, (({ n, h }) => ({ n, h }))(await m.caja.selloLeer('a1')));
  await rechaza(m.caja.selloGuardar('a1', { n: 6, h: 'corta' }), 400);
});

test('avisos: llegan a los dos, con tope por hora', async () => {
  const m = montar();
  await activar(m);
  m.correos.length = 0;
  await m.caja.aviso('a1', { tipo: 'abierta', detalle: '12 anotaciones' });
  assert.deepEqual(m.correos.map(c => c.para).sort(), ['cliente@ejemplo.es', 'equipo@ejemplo.es']);
  assert.match(m.correos[0].texto, /12 anotaciones/);
  await rechaza(m.caja.aviso('a1', { tipo: 'inventado' }), 400);
  for (let i = 0; i < 12; i++) await m.caja.aviso('a1', { tipo: 'fallo' }).catch(() => {});
  await rechaza(m.caja.aviso('a1', { tipo: 'fallo' }), 429);
  m.reloj.t += 61 * 60_000;
  await m.caja.aviso('a1', { tipo: 'fallo' }); // pasada la hora, vuelve a dejar
});

test('si el correo no sale, activar falla y no queda nada a medias que se pueda usar', async () => {
  const m = montar({ correoRoto: true });
  await assert.rejects(m.caja.alta('a1', { correo_cliente: 'cliente@ejemplo.es', correo_vocai: 'equipo@ejemplo.es' }), /correo no salió/);
  await rechaza(m.caja.confirmar('a1', { codigo_cliente: '123456', codigo_vocai: '123456' }), 400);
  assert.notEqual((await m.caja.estado('a1')).estado, 'activa');
});
