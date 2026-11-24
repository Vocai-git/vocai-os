// Asistentes del panel nuevo (public/panel.html): conectores, gasto de IA del mes y cuota fija.
// El gasto se carga a mano. La sesión, api() y la cabecera vienen de panel-base.js.
const usd = n => `<small>USD</small>${numero(n)}`;

const SERVICIOS = { anthropic: 'IA', elevenlabs: 'Voz' };

// Debajo del importe: de dónde sale el dato. Con reporte automático, el desglose por servicio.
function origen(a) {
  if (!a.reporta) return a.gasto_actualizado ? 'a mano · ' + fechaCorta(a.gasto_actualizado) : 'sin actualizar';
  if (!a.desglose.length) return 'automático · sin datos este mes';
  // Un asistente que informa pero no manda gasto de IA es porque su Claude va por la suscripción, que no se cobra por uso.
  const suscripcion = a.desglose.some(u => u.servicio === 'anthropic') ? '' : 'IA por suscripción de Claude, sin costo por uso · ';
  return suscripcion + a.desglose.map(u => `${SERVICIOS[u.servicio] || texto(u.servicio)} ${numero(u.usd)}`).join(' · ') + '<br>automático · ' + fechaCorta(a.gasto_actualizado);
}

let asistentes = [];
let editando = null;

function fila(a) {
  const conectores = a.conectores || [];
  return `
    <div class="fila">
      <div><div class="cliente">${texto(a.cliente)}</div><div class="pie">${texto(a.nombre)}${a.equipo ? ' · ' + texto(a.equipo) : ''}</div></div>
      <div class="c-estado"><span class="estado ${texto(a.estado)}">${texto(mayuscula(a.estado))}</span></div>
      <div class="chips c-chips">${conectores.length ? conectores.map(c => `<span class="chip">${texto(c)}</span>`).join('') : '<span class="nada">Sin conectores cargados</span>'}</div>
      <div class="der" data-r="Gasto del mes"><div class="importe">${usd(a.gasto_mes_usd)}</div><div class="pie">${origen(a)}</div></div>
      <div class="der" data-r="Cuota fija"><div class="importe">${numero(a.cuota_fija_eur)} €</div><div class="pie">al mes</div></div>
      <div class="c-accion"><button class="enlace" data-editar="${texto(a.id)}">Editar</button></div>
    </div>`;
}

function pintar() {
  const activos = asistentes.filter(a => a.estado === 'activo');
  $('totalActivos').textContent = activos.length;
  $('totalGasto').innerHTML = usd(activos.reduce((s, a) => s + Number(a.gasto_mes_usd || 0), 0));
  $('totalCuotas').textContent = numero(activos.reduce((s, a) => s + Number(a.cuota_fija_eur || 0), 0)) + ' €';
  $('tabla').innerHTML = asistentes.length
    ? `<div class="fila cabeza"><div>Cliente</div><div>Estado</div><div>Conectores</div><div class="der">Gasto del mes</div><div class="der">Cuota fija</div><div></div></div>` + asistentes.map(fila).join('')
    : '<div class="vacio"><strong>Todavía no hay asistentes cargados</strong>Agrega el de cada cliente con sus conectores y su cuota.</div>';
}

async function cargar() {
  try {
    asistentes = await api('GET', '/assistants');
    pintar();
  } catch (e) {
    $('tabla').innerHTML = `<div class="aviso">No se pudieron cargar los asistentes: ${texto(e.message)}</div>`;
  }
}

function abrirFicha(a) {
  editando = a ? a.id : null;
  const f = $('ficha');
  f.reset();
  $('fichaTitulo').textContent = a ? 'Editar asistente' : 'Nuevo asistente';
  $('btnEliminar').hidden = !a;
  $('fichaAviso').hidden = true;
  $('reporte').hidden = !a;
  $('reporteClave').hidden = true;
  if (a) {
    $('reporteEstado').textContent = a.reporta ? 'Este asistente ya informa su gasto solo. El gasto escrito a mano no se usa.' : 'Todavía no informa su gasto solo: se usa el que escribes arriba.';
    $('btnClave').textContent = a.reporta ? 'Generar otra clave' : 'Generar clave';
    $('ficha').elements.gasto_mes_usd.disabled = $('ficha').elements.gasto_actualizado.disabled = !!a.reporta;
  } else {
    $('ficha').elements.gasto_mes_usd.disabled = $('ficha').elements.gasto_actualizado.disabled = false;
  }
  if (a) {
    for (const campo of ['cliente', 'nombre', 'estado', 'equipo', 'gasto_mes_usd', 'gasto_actualizado', 'cuota_fija_eur', 'clave_api', 'notas']) f.elements[campo].value = a[campo] ?? '';
    f.elements.conectores.value = (a.conectores || []).join(', ');
  } else {
    f.elements.gasto_actualizado.value = new Date().toISOString().slice(0, 10);
  }
  $('velo').hidden = false;
  f.elements.cliente.focus();
}

function cerrarFicha() { $('velo').hidden = true; }

function avisar(mensaje) {
  $('fichaAviso').textContent = mensaje;
  $('fichaAviso').hidden = false;
}

async function guardar(evento) {
  evento.preventDefault();
  const v = campo => $('ficha').elements[campo].value.trim();
  const cuerpo = {
    cliente: v('cliente'),
    nombre: v('nombre'),
    estado: v('estado'),
    equipo: v('equipo'),
    conectores: v('conectores').split(',').map(s => s.trim()).filter(Boolean),
    gasto_mes_usd: Number(v('gasto_mes_usd')) || 0,
    gasto_actualizado: v('gasto_actualizado') || null,
    cuota_fija_eur: Number(v('cuota_fija_eur')) || 0,
    clave_api: v('clave_api'),
    notas: v('notas')
  };
  const a = asistentes.find(x => x.id === editando);
  if (a && a.reporta) { delete cuerpo.gasto_mes_usd; delete cuerpo.gasto_actualizado; }
  if (!cuerpo.cliente || !cuerpo.nombre) return avisar('Cliente y nombre del asistente son obligatorios.');
  try {
    if (editando) await api('PUT', `/assistants/${editando}`, cuerpo);
    else await api('POST', '/assistants', cuerpo);
    cerrarFicha();
    cargar();
  } catch (e) { avisar(e.message); }
}

async function eliminar() {
  if (!editando || !confirm('¿Eliminar este asistente del panel?')) return;
  try {
    await api('DELETE', `/assistants/${editando}`);
    cerrarFicha();
    cargar();
  } catch (e) { avisar(e.message); }
}

// La clave se ve una sola vez: el panel guarda solo su huella.
async function generarClave() {
  const a = asistentes.find(x => x.id === editando);
  if (!a) return;
  if (a.reporta && !confirm('La clave anterior dejará de funcionar y ese asistente dejará de informar hasta que le pongas la nueva. ¿Generar otra?')) return;
  try {
    const { clave } = await api('POST', `/assistants/${a.id}/clave`);
    $('reporteClave').value = `PANEL_URL=${location.origin}\nPANEL_CLAVE=${clave}`;
    $('reporteClave').hidden = false;
    $('reporteEstado').textContent = 'Copia estas dos líneas en el archivo .env del asistente. No se vuelven a mostrar.';
    a.reporta = true;
    $('btnClave').textContent = 'Generar otra clave';
    cargar();
  } catch (e) { avisar(e.message); }
}

function iniciar() {
  iniciarCabecera();
  const mes = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  $('periodo').textContent = mayuscula(mes);

  $('btnNuevo').addEventListener('click', () => abrirFicha(null));
  $('btnCancelar').addEventListener('click', cerrarFicha);
  $('btnEliminar').addEventListener('click', eliminar);
  $('btnClave').addEventListener('click', generarClave);
  $('ficha').addEventListener('submit', guardar);
  $('velo').addEventListener('click', e => { if (e.target === $('velo')) cerrarFicha(); });
  $('tabla').addEventListener('click', e => {
    const id = e.target.dataset.editar;
    if (id) abrirFicha(asistentes.find(a => a.id === id));
  });
  cargar();
}

document.addEventListener('DOMContentLoaded', iniciar);
