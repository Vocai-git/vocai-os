'use strict';
// La parte del panel de la caja negra de los asistentes (el resto vive en la máquina de cada cliente:
// repositorio asistente-vocai, caja.js). El panel hace solo cuatro cosas, y nunca ve lo que hay dentro de una caja:
//   1. Manda por correo los códigos que confirman los dos correos de recuperación antes de activar la caja.
//   2. Devuelve a una parte su mitad de la llave cuando olvidó la contraseña, tras un código a SU correo
//      (la mitad viaja cerrada con la llave pública de recuperación del panel; aquí no se guarda).
//   3. Guarda el «sello»: número y huella de la última anotación, para notar si alguien corta el final.
//   4. Avisa por correo a las dos partes: caja abierta, contraseña restablecida, correo cambiado, fallo, alteración.
// Esta lógica no sabe de Express ni de Supabase: recibe `leer`, `guardar` y `enviar`, y así se prueba entera.
const crypto = require('crypto');

const PARTES = ['cliente', 'vocai'];
const VIGENCIA_MIN = 15;      // lo que vale un código
const MAX_INTENTOS = 5;       // por código
const MAX_CORREOS_HORA = 12;  // por asistente: nadie usa el panel para bombardear un correo
const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OAEP = { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const igual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

class Rechazo extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const no = (status, mensaje) => { throw new Rechazo(status, mensaje); };
const quien = parte => (parte === 'vocai' ? 'VOCAI' : 'el cliente');
const parteValida = parte => { if (!PARTES.includes(parte)) no(400, 'Hay que decir de quién: cliente o vocai.'); return parte; };
const correoValido = c => { const v = String(c || '').trim().toLowerCase(); if (!ES_CORREO.test(v) || v.length > 200) no(400, 'Ese correo no es válido.'); return v; };

/**
 * @param leer     async (asistenteId) => fila de assistant_caja o null
 * @param guardar  async (asistenteId, fila) => void          (crea o reemplaza)
 * @param enviar   async ({ para, asunto, texto }) => void    (lanza un error si el correo no sale)
 * @param privada  llave privada de recuperación (PEM). Sin ella no se puede activar ninguna caja.
 * @param ahora    () => milisegundos (para las pruebas)
 */
function crearCajaNegra({ leer, guardar, enviar, privada, ahora = Date.now }) {
  const llave = privada ? crypto.createPrivateKey(privada) : null;
  const publica = llave ? crypto.createPublicKey(llave).export({ type: 'spki', format: 'pem' }) : null;
  const iso = () => new Date(ahora()).toISOString();
  const fila = async id => (await leer(id)) || { estado: 'nueva', codigos: {}, envios: [] };
  const activa = async id => { const f = await fila(id); if (f.estado !== 'activa') no(409, 'Este asistente no tiene la caja negra activada.'); return f; };

  // Un código nuevo para un motivo: se guarda su huella, nunca el código.
  function codigoNuevo(f, id, motivo, extra = {}) {
    const reciente = (f.envios || []).filter(t => ahora() - t < 3600_000);
    if (reciente.length >= MAX_CORREOS_HORA) no(429, 'Demasiados correos en la última hora. Prueba más tarde.');
    const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    f.codigos = { ...(f.codigos || {}), [motivo]: { huella: sha(`${id}|${motivo}|${codigo}`), vence: ahora() + VIGENCIA_MIN * 60_000, intentos: 0, ...extra } };
    f.envios = [...reciente, ahora()];
    return codigo;
  }
  // Comprueba un código. Devuelve lo guardado con él, o null (y cuenta el intento). No lo gasta: eso es `gastar`.
  function comprobar(f, id, motivo, codigo) {
    const c = f.codigos?.[motivo];
    if (!c || ahora() > c.vence || c.intentos >= MAX_INTENTOS) return null;
    c.intentos += 1;
    return igual(c.huella, sha(`${id}|${motivo}|${String(codigo || '').replace(/\D/g, '')}`)) ? c : null;
  }
  const gastar = (f, ...motivos) => { for (const m of motivos) delete f.codigos[m]; };
  const pie = 'Si no has pedido esto, avisa a VOCAI. Este correo es automático: no respondas a esta dirección.';
  const conCodigo = (codigo, para) => `Tu código es: ${codigo}\n\nSirve durante ${VIGENCIA_MIN} minutos y solo ${para}.\nNo se lo des a nadie: quien te lo pida por teléfono, chat o correo no es de VOCAI.\n\n${pie}`;
  // Aviso a las dos partes (y a quien más haga falta). Si un correo no sale, no frena lo que ya se hizo.
  async function avisarA(destinos, asunto, texto) {
    const fallos = [];
    for (const para of [...new Set(destinos.filter(Boolean))]) {
      try { await enviar({ para, asunto, texto: `${texto}\n\n${pie}` }); } catch (e) { fallos.push(`${para}: ${e.message}`); }
    }
    return fallos;
  }

  return {
    publica,

    /** Paso 1 de la activación: un código a cada correo. Una caja ya activa no se vuelve a dar de alta. */
    async alta(id, { correo_cliente, correo_vocai }) {
      if (!llave) no(503, 'El panel no tiene la llave de recuperación de la caja negra. Avisar a VOCAI.');
      const f = await fila(id);
      if (f.estado === 'activa') no(409, 'Este asistente ya tiene la caja negra activada. No se crea otra encima.');
      const correos = { cliente: correoValido(correo_cliente), vocai: correoValido(correo_vocai) };
      if (correos.cliente === correos.vocai) no(400, 'Los dos correos no pueden ser el mismo.');
      const codigos = Object.fromEntries(PARTES.map(p => [p, codigoNuevo(f, id, `alta:${p}`)]));
      Object.assign(f, { estado: 'pendiente', correo_cliente: correos.cliente, correo_vocai: correos.vocai, actualizada: iso() });
      await guardar(id, f);   // primero se guarda: si el correo no sale, no queda un código válido sin registro
      for (const p of PARTES) {
        await enviar({ para: correos[p], asunto: 'Código para activar la caja negra de tu asistente', texto: `Hola.\n\nSe está activando la caja negra de un asistente y este correo se ha puesto como correo de recuperación de ${quien(p)}.\n\n${conCodigo(codigos[p], 'para activar la caja')}` });
      }
      return { ok: true };
    },

    /** Paso 2: con los dos códigos correctos, el panel entrega su llave pública y la caja se puede crear. */
    async confirmar(id, { codigo_cliente, codigo_vocai }) {
      const f = await fila(id);
      if (f.estado === 'activa') no(409, 'Este asistente ya tiene la caja negra activada.');
      if (f.estado !== 'pendiente' && f.estado !== 'verificada') no(409, 'Primero hay que pedir los códigos.');
      const bien = [comprobar(f, id, 'alta:cliente', codigo_cliente), comprobar(f, id, 'alta:vocai', codigo_vocai)];
      if (!bien[0] || !bien[1]) {
        await guardar(id, f);   // quedan contados los intentos
        no(400, `${!bien[0] && !bien[1] ? 'Los dos códigos no son correctos' : `El código de ${quien(bien[0] ? 'vocai' : 'cliente')} no es correcto`}, o ya vencieron.`);
      }
      gastar(f, 'alta:cliente', 'alta:vocai');
      Object.assign(f, { estado: 'verificada', actualizada: iso() });
      await guardar(id, f);
      return { asistente: id, publica };
    },

    /** Paso 3: la caja ya existe en la máquina del cliente. Queda activa y con su primer sello. */
    async registrar(id, { prueba_huella, n, h }) {
      const f = await fila(id);
      if (f.estado !== 'verificada') no(409, f.estado === 'activa' ? 'La caja ya estaba registrada.' : 'Los correos no están confirmados.');
      if (!/^[0-9a-f]{64}$/.test(String(prueba_huella || ''))) no(400, 'Falta la prueba de la caja.');
      Object.assign(f, { estado: 'activa', prueba_huella, sello_n: Number(n) || 0, sello_h: String(h || ''), sello_en: iso(), activada: iso(), actualizada: iso() });
      await guardar(id, f);
      const fallos = await avisarA([f.correo_cliente, f.correo_vocai], 'La caja negra de tu asistente está activada',
        'La caja negra ha quedado activada.\n\nDesde ahora guarda, cifrado, todo lo que hace el asistente. Para abrirla hacen falta dos contraseñas a la vez: la del cliente y la de VOCAI. Ninguna de las dos partes puede abrirla sola.\n\nSi olvidas tu contraseña, se restablece con un código que llega a este correo.');
      return { ok: true, avisos_sin_enviar: fallos.length };
    },

    /** Olvidé mi contraseña, paso 1: código al correo de recuperación de esa parte. */
    async restablecerPedir(id, { parte }) {
      parteValida(parte);
      const f = await activa(id);
      const codigo = codigoNuevo(f, id, `restablecer:${parte}`);
      await guardar(id, f);
      await enviar({ para: f[`correo_${parte}`], asunto: 'Código para restablecer tu contraseña de la caja negra', texto: `Hola.\n\nAlguien ha pedido restablecer la contraseña de ${quien(parte)} de la caja negra de un asistente.\n\n${conCodigo(codigo, 'para poner una contraseña nueva')}` });
      return { ok: true };
    },

    /** Paso 2: con el código, el panel abre la copia de esa mitad y la devuelve. A la otra parte le llega un aviso. */
    async restablecerConfirmar(id, { parte, codigo, copia }) {
      parteValida(parte);
      const f = await activa(id);
      if (!comprobar(f, id, `restablecer:${parte}`, codigo)) { await guardar(id, f); no(400, 'El código no es correcto, o ya venció.'); }
      let dentro;
      try { dentro = JSON.parse(crypto.privateDecrypt({ key: llave, ...OAEP }, Buffer.from(String(copia || ''), 'base64')).toString('utf8')); } catch { no(400, 'La copia de recuperación no se pudo abrir.'); }
      // La copia dice de qué asistente y de qué parte es: una copia ajena, o la de la otra parte, no sale con este código.
      if (dentro.asistente !== id || dentro.parte !== parte) no(403, 'Esa copia de recuperación no corresponde a quien la pide.');
      gastar(f, `restablecer:${parte}`);
      Object.assign(f, { actualizada: iso() });
      await guardar(id, f);
      await avisarA([f.correo_cliente, f.correo_vocai], 'Se ha restablecido una contraseña de la caja negra',
        `La contraseña de ${quien(parte)} de la caja negra se ha restablecido con un código enviado a su correo de recuperación.\n\nLa otra contraseña no ha cambiado, y la caja sigue necesitando las dos para abrirse.`);
      return { mitad: dentro.mitad };
    },

    /** Cambiar un correo de recuperación, paso 1: hace falta la prueba de las dos contraseñas. Código al correo NUEVO. */
    async correoPedir(id, { parte, correo, prueba }) {
      parteValida(parte);
      const f = await activa(id);
      if (!igual(f.prueba_huella, sha(String(prueba || '')))) no(403, 'Para cambiar un correo de recuperación hacen falta las dos contraseñas.');
      const nuevo = correoValido(correo);
      if (nuevo === f[`correo_${parte === 'cliente' ? 'vocai' : 'cliente'}`]) no(400, 'Los dos correos no pueden ser el mismo.');
      const codigo = codigoNuevo(f, id, `correo:${parte}`, { correo: nuevo });
      await guardar(id, f);
      await enviar({ para: nuevo, asunto: 'Código para confirmar tu correo de recuperación', texto: `Hola.\n\nEste correo se va a poner como correo de recuperación de ${quien(parte)} en la caja negra de un asistente.\n\n${conCodigo(codigo, 'para confirmar este correo')}` });
      return { ok: true };
    },

    async correoConfirmar(id, { parte, codigo }) {
      parteValida(parte);
      const f = await activa(id);
      const c = comprobar(f, id, `correo:${parte}`, codigo);
      if (!c) { await guardar(id, f); no(400, 'El código no es correcto, o ya venció.'); }
      const anterior = f[`correo_${parte}`];
      gastar(f, `correo:${parte}`);
      Object.assign(f, { [`correo_${parte}`]: c.correo, actualizada: iso() });
      await guardar(id, f);
      await avisarA([f.correo_cliente, f.correo_vocai, anterior], 'Ha cambiado un correo de recuperación de la caja negra',
        `El correo de recuperación de ${quien(parte)} de la caja negra ha cambiado. El cambio se hizo con las dos contraseñas.`);
      return { ok: true };
    },

    /** El sello nunca retrocede: si llega uno más viejo, se ignora (alguien puede estar probando a cortar el final). */
    async selloGuardar(id, { n, h }) {
      const f = await activa(id);
      const numero = Number(n);
      if (!Number.isInteger(numero) || numero < 1 || !/^[0-9a-f]{64}$/.test(String(h || ''))) no(400, 'Sello no válido.');
      if (numero < (f.sello_n || 0)) return { ok: false, motivo: 'El sello no retrocede.', n: f.sello_n };
      if (numero === f.sello_n && h !== f.sello_h) return { ok: false, motivo: 'Ese número ya está sellado con otra huella.', n: f.sello_n };
      Object.assign(f, { sello_n: numero, sello_h: h, sello_en: iso() });
      await guardar(id, f);
      return { ok: true, n: numero };
    },
    async selloLeer(id) {
      const f = await activa(id);
      return { n: f.sello_n || 0, h: f.sello_h || '', en: f.sello_en || null };
    },

    /** Aviso por correo a las dos partes. */
    async aviso(id, { tipo, detalle }) {
      const f = await activa(id);
      const textos = {
        abierta: ['Se ha abierto la caja negra de tu asistente', 'La caja negra se acaba de abrir con las dos contraseñas.'],
        fallo: ['La caja negra de tu asistente no está pudiendo guardar', 'El asistente sigue funcionando, pero la caja negra no ha podido guardar lo último que hizo. VOCAI tiene que revisarlo.'],
        alterada: ['ATENCIÓN: la caja negra de tu asistente no está entera', 'Al comprobar la caja negra se ha detectado que alguna anotación fue cambiada o falta.'],
      }[tipo];
      if (!textos) no(400, 'Aviso desconocido.');
      const reciente = (f.envios || []).filter(t => ahora() - t < 3600_000);
      if (reciente.length >= MAX_CORREOS_HORA) no(429, 'Demasiados correos en la última hora.');
      f.envios = [...reciente, ahora()];
      await guardar(id, f);
      const d = String(detalle || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      const fallos = await avisarA([f.correo_cliente, f.correo_vocai], textos[0], `${textos[1]}${d ? `\n\nDetalle: ${d}` : ''}\n\nFecha: ${new Date(ahora()).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} (hora de España).`);
      if (fallos.length === 2) no(502, 'No se pudo enviar el aviso por correo.');
      return { ok: true };
    },

    /** Para la ficha del asistente en el panel: estado, correos y último sello. Nada de contenido. */
    async estado(id) {
      const f = await fila(id);
      return { estado: f.estado, correo_cliente: f.correo_cliente || null, correo_vocai: f.correo_vocai || null, activada: f.activada || null, sello_n: f.sello_n || 0, sello_en: f.sello_en || null };
    },
  };
}

module.exports = { crearCajaNegra, Rechazo, PARTES };
