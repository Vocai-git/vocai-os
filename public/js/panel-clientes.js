// Clientes del panel nuevo (public/panel-clientes.html). Lee y escribe los mismos clientes que /app (/api/clients).
// La sesión, api() y la cabecera vienen de panel-base.js.
const SERVICIOS = { estudio: 'Estudio y contenido', marketing: 'Marketing digital', ia: 'Inteligencia artificial', full: 'Servicio completo' };
const CAMPOS = ['nombre', 'empresa', 'email', 'telefono', 'tipo_servicio', 'estado', 'mrr', 'responsable', 'ultimo_contacto', 'cumpleanos', 'notas'];

let clientes = [];
let editando = null;

function fila(c) {
  const estado = c.estado || 'prospecto';
  const pie = [c.empresa, c.email].filter(Boolean).map(texto).join(' · ');
  return `
    <div class="fila cli">
      <div><div class="cliente">${texto(c.nombre)}</div>${pie ? `<div class="pie">${pie}</div>` : ''}</div>
      <div class="c-estado"><span class="estado ${texto(estado)}">${texto(mayuscula(estado))}</span></div>
      <div data-r="Servicio">${texto(SERVICIOS[c.tipo_servicio] || '—')}</div>
      <div data-r="Responsable">${c.responsable ? texto(mayuscula(c.responsable)) : '—'}</div>
      <div data-r="Último contacto">${c.ultimo_contacto ? fechaCorta(c.ultimo_contacto) : '—'}</div>
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
  else $('tabla').innerHTML = `<div class="fila cli cabeza"><div>Cliente</div><div>Estado</div><div>Servicio</div><div>Responsable</div><div>Último contacto</div><div class="der">Ingreso mensual</div><div></div></div>` + visibles.map(fila).join('');
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

function iniciar() {
  iniciarCabecera();
  $('btnNuevo').addEventListener('click', () => abrirFicha(null));
  $('btnCancelar').addEventListener('click', cerrarFicha);
  $('btnEliminar').addEventListener('click', eliminar);
  $('ficha').addEventListener('submit', guardar);
  $('velo').addEventListener('click', e => { if (e.target === $('velo')) cerrarFicha(); });
  $('buscar').addEventListener('input', pintar);
  $('filtroEstado').addEventListener('change', pintar);
  $('tabla').addEventListener('click', e => {
    const id = e.target.dataset.editar;
    if (id) abrirFicha(clientes.find(c => c.id === id));
  });
  cargar();
}

document.addEventListener('DOMContentLoaded', iniciar);
