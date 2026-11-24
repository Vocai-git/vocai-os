// Clientes del panel nuevo (public/panel-clientes.html). Lee y escribe los mismos clientes que /app (/api/clients).
// La sesión, api() y la cabecera vienen de panel-base.js.
const SERVICIOS = { estudio: 'Estudio y contenido', marketing: 'Marketing digital', ia: 'Inteligencia artificial', full: 'Servicio completo' };
const CAMPOS = ['nombre', 'empresa', 'email', 'telefono', 'tipo_servicio', 'estado', 'mrr', 'responsable', 'ultimo_contacto', 'vence_periodo', 'cumpleanos', 'notas'];

let clientes = [];
let editando = null;

// Días que faltan para que venza el periodo (negativo = ya venció).
function diasPara(fecha) {
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  return Math.round((new Date(fecha + 'T12:00:00') - hoy) / 86400000);
}

function vence(c) {
  if (!c.vence_periodo) return '—';
  const d = diasPara(c.vence_periodo);
  const dia = new Date(c.vence_periodo + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  if (c.estado !== 'activo') return dia;
  if (d < 0) return `<span class="vence mal">${dia}</span><div class="pie mal">Vencido</div>`;
  if (d <= 7) return `<span class="vence pronto">${dia}</span><div class="pie pronto">${d === 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : 'En ' + d + ' días'}</div>`;
  return dia;
}

function fila(c) {
  const estado = c.estado || 'prospecto';
  const pie = [c.empresa, c.email].filter(Boolean).map(texto).join(' · ');
  return `
    <div class="fila cli">
      <div><div class="cliente">${texto(c.nombre)}</div>${pie ? `<div class="pie">${pie}</div>` : ''}</div>
      <div class="c-estado"><label class="llave" title="${estado === 'activo' ? 'Pasar a inactivo' : 'Pasar a activo'}"><input type="checkbox" data-activo="${texto(c.id)}" ${estado === 'activo' ? 'checked' : ''} aria-label="Cliente activo"><i></i></label><span class="estado ${texto(estado)}">${texto(mayuscula(estado))}</span></div>
      <div data-r="Servicio">${texto(SERVICIOS[c.tipo_servicio] || '—')}</div>
      <div data-r="Responsable">${c.responsable ? texto(mayuscula(c.responsable)) : '—'}</div>
      <div data-r="Último contacto">${c.ultimo_contacto ? fechaCorta(c.ultimo_contacto) : '—'}</div>
      <div data-r="Vence el periodo">${vence(c)}</div>
      <div class="der" data-r="Ingreso mensual"><div class="importe${Number(c.mrr) ? '' : ' sin'}">${Number(c.mrr) ? numero(c.mrr) + ' €' : '—'}</div></div>
      <div class="c-accion"><button class="enlace" data-editar="${texto(c.id)}">Editar</button></div>
    </div>`;
}

function pintar() {
  const activos = clientes.filter(c => c.estado === 'activo');
  $('totalActivos').textContent = activos.length;
  $('totalMrr').textContent = numero(activos.reduce((s, c) => s + Number(c.mrr || 0), 0)) + ' €';
  $('totalProspectos').textContent = clientes.filter(c => (c.estado || 'prospecto') === 'prospecto').length;
  $('resumen').textContent = clientes.length === 1 ? '1 cliente en total' : `${clientes.length} clientes en total`;

  const busca = $('buscar').value.trim().toLowerCase();
  const estado = $('filtroEstado').value;
  const visibles = clientes.filter(c =>
    (!estado || (c.estado || 'prospecto') === estado) &&
    (!busca || [c.nombre, c.empresa, c.email].some(v => (v || '').toLowerCase().includes(busca))));

  if (!clientes.length) $('tabla').innerHTML = '<div class="vacio"><strong>Todavía no hay clientes cargados</strong>Agrega el primero con el botón de arriba.</div>';
  else if (!visibles.length) $('tabla').innerHTML = '<div class="vacio"><strong>Ningún cliente coincide</strong>Prueba con otra búsqueda o cambia el estado.</div>';
  else $('tabla').innerHTML = `<div class="fila cli cabeza"><div>Cliente</div><div>Estado</div><div>Servicio</div><div>Responsable</div><div>Último contacto</div><div>Vence</div><div class="der">Ingreso mensual</div><div></div></div>` + visibles.map(fila).join('');
}

async function cargar() {
  try {
    clientes = await api('GET', '/clients');
    pintar();
  } catch (e) {
    $('tabla').innerHTML = `<div class="aviso">No se pudieron cargar los clientes: ${texto(e.message)}</div>`;
  }
}

function abrirFicha(c) {
  editando = c ? c.id : null;
  const f = $('ficha');
  f.reset();
  $('fichaTitulo').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  $('btnEliminar').hidden = !c;
  $('fichaAviso').hidden = true;
  if (c) for (const campo of CAMPOS) f.elements[campo].value = c[campo] ?? '';
  $('velo').hidden = false;
  f.elements.nombre.focus();
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
    nombre: v('nombre'),
    empresa: v('empresa'),
    email: v('email'),
    telefono: v('telefono'),
    tipo_servicio: v('tipo_servicio'),
    estado: v('estado'),
    mrr: Number(v('mrr')) || 0,
    responsable: v('responsable') || null,
    ultimo_contacto: v('ultimo_contacto') || null,
    vence_periodo: v('vence_periodo') || null,
    cumpleanos: v('cumpleanos') || null,
    notas: v('notas')
  };
  if (!cuerpo.nombre) return avisar('El nombre es obligatorio.');
  try {
    if (editando) await api('PUT', `/clients/${editando}`, cuerpo);
    else await api('POST', '/clients', cuerpo);
    cerrarFicha();
    cargar();
  } catch (e) { avisar(e.message); }
}

async function eliminar() {
  const c = clientes.find(x => x.id === editando);
  if (!c || !confirm(`¿Eliminar el cliente «${c.nombre}»? No se puede deshacer.`)) return;
  try {
    await api('DELETE', `/clients/${editando}`);
    cerrarFicha();
    cargar();
  } catch (e) { avisar(e.message); }
}

// Interruptor de la fila: activo <-> inactivo, sin abrir la ficha.
async function cambiarActivo(id, activo) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  const antes = c.estado;
  c.estado = activo ? 'activo' : 'inactivo';
  pintar();
  try {
    await api('PUT', `/clients/${id}`, { estado: c.estado });
  } catch (e) {
    c.estado = antes;
    pintar();
    alert('No se pudo cambiar el estado: ' + e.message);
  }
}

function iniciar() {
  iniciarCabecera();
  $('btnNuevo').addEventListener('click', () => abrirFicha(null));
  $('btnCancelar').addEventListener('click', cerrarFicha);
  $('btnEliminar').addEventListener('click', eliminar);
  $('ficha').addEventListener('submit', guardar);
  $('velo').addEventListener('click', e => { if (e.target === $('velo')) cerrarFicha(); });
  $('buscar').addEventListener('input', pintar);
  $('filtroEstado').addEventListener('change', pintar);
  $('tabla').addEventListener('change', e => {
    const id = e.target.dataset.activo;
    if (id) cambiarActivo(id, e.target.checked);
  });
  $('tabla').addEventListener('click', e => {
    const id = e.target.dataset.editar;
    if (id) abrirFicha(clientes.find(c => c.id === id));
  });
  cargar();
}

document.addEventListener('DOMContentLoaded', iniciar);
