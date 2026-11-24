/**
 * Guarda en Drive las facturas que llegan por correo. Es un Google Apps Script: se instala UNA vez en la
 * cuenta de correo donde llegan las facturas de VOCAI (script.google.com → Proyecto nuevo → pegar esto →
 * ejecutar «instalar» y aceptar los permisos). Después corre solo, cada día a las 7.
 *
 * Qué hace: busca correos con factura adjunta de los últimos 60 días, guarda cada PDF en
 *   Facturas › Recibidas › AAAA-MM › Proveedor
 * y marca el correo con la etiqueta «Factura guardada» para no repetirlo. No borra ni responde nada.
 * De ahí las recoge scripts/facturas.js y las adjunta a su gasto en el panel.
 */
const CARPETA_FACTURAS = '14axXI4cgSlqGK_AdGU189t3dV2mgDLG8';   // Unidad compartida VOCAI › Facturas
const ETIQUETA = 'Factura guardada';
const BUSQUEDA = 'has:attachment filename:pdf newer_than:60d -label:"Factura guardada" ' +
  '{subject:invoice subject:receipt subject:factura subject:recibo subject:"payment received" from:invoice from:billing from:receipts from:facturacion}';

function guardarFacturas() {
  const etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  const recibidas = subcarpeta_(DriveApp.getFolderById(CARPETA_FACTURAS), 'Recibidas');
  GmailApp.search(BUSQUEDA, 0, 50).forEach(function (hilo) {
    hilo.getMessages().forEach(function (correo) {
      const mes = Utilities.formatDate(correo.getDate(), 'Europe/Madrid', 'yyyy-MM');
      const destino = subcarpeta_(subcarpeta_(recibidas, mes), proveedor_(correo.getFrom()));
      correo.getAttachments().forEach(function (adjunto) {
        if (adjunto.getContentType() !== 'application/pdf' && !/\.pdf$/i.test(adjunto.getName())) return;
        if (/^receipt/i.test(adjunto.getName()) && correo.getAttachments().length > 1) return;   // con factura y recibo, basta la factura
        if (!destino.getFilesByName(adjunto.getName()).hasNext()) destino.createFile(adjunto.copyBlob());
      });
    });
    hilo.addLabel(etiqueta);
  });
}

// «Supabase Pte. Ltd. <invoice@supabase.com>» → «Supabase Pte. Ltd.»; sin nombre, el dominio.
function proveedor_(remitente) {
  const nombre = remitente.replace(/<.*>/, '').replace(/["']/g, '').trim();
  const dominio = (remitente.match(/@([^>\s]+)/) || [])[1] || 'Otros';
  return (nombre || dominio).replace(/[\\/:*?<>|]/g, ' ').slice(0, 60);
}

function subcarpeta_(padre, nombre) {
  const hay = padre.getFoldersByName(nombre);
  return hay.hasNext() ? hay.next() : padre.createFolder(nombre);
}

// Se ejecuta una sola vez: deja programada la revisión diaria y hace la primera pasada.
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('guardarFacturas').timeBased().everyDays(1).atHour(7).inTimezone('Europe/Madrid').create();
  guardarFacturas();
}
