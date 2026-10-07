# Facturas emitidas

La sección `facturasV2`, también disponible como pestaña en Finanzas V2, permite preparar borradores, revisar el PDF, emitir una factura y abrir su ingreso para registrar el cobro. Las pantallas anteriores permanecen disponibles.

## Comportamiento

- Los borradores no tienen número definitivo ni modifican Finanzas.
- La emisión explícita asigna `YYYY-NNN` y crea un único ingreso o vincula uno existente. No crea cobros.
- Los importes se recalculan en el servidor: base por concepto, IVA opcional, retención IRPF opcional y neto a cobrar. Cantidades en milésimas; dinero en céntimos.
- La emisión, numeración, vínculo y auditoría se guardan en una misma transacción. Reintentar la misma emisión no consume otro número.
- Un ingreso vinculado debe estar confirmado y coincidir en importes, impuestos, fecha, período y vencimiento. Se conservan sus cobros, histórico e inclusión en el saldo inicial.
- Las referencias antiguas `VOCAI-YYYY-NNN` solo se sustituyen cuando el histórico demuestra que proceden de la tabla original de ingresos. No se vuelven a emitir documentos con numeración oficial ya existente.
- Una factura emitida conserva documento y datos del emisor. El ingreso vinculado permite añadir cobros y notas, pero no alterar los importes, fechas ni anularlo desde el formulario general.
- El PDF utiliza recursos locales, tiene diseño oscuro y claro, y pagina conceptos largos. Las vistas previas llevan «BORRADOR - SIN EMITIR». No se envía ningún correo automáticamente.

## Activación

La migración es aditiva y no importa ni cambia los registros financieros existentes. Debe ejecutarse con la autorización correspondiente antes de activar esta versión en producción.

1. Ejecutar `db/migration_finance_invoices.sql` en el proyecto correcto.
2. Publicar el código mediante el flujo normal de revisión y despliegue del repositorio.
3. Completar los datos fiscales y de pago del emisor en «Datos de VOCAI». No versionar datos fiscales reales, cuentas bancarias, documentos originales ni credenciales.
4. Comprobar cuáles son las últimas facturas realmente emitidas. No inicializar la serie a partir de un PDF de ejemplo. La ruta autenticada `POST /api/finance/invoices/settings/series` recibe `{year,last_number,last_date}` y no permite reiniciar una serie existente.
5. Comprobar que el listado y los borradores funcionan antes de emitir la primera factura real. No emitir documentos de prueba en producción.

`FINANCE_V2=true`, `FINANCE_V2_LIVE=true` y el acceso privado del servidor a Supabase son los controles existentes. Todas las tablas nuevas tienen RLS activado y no conceden acceso directo a clientes de navegador.

Los PDF históricos pueden conservarse como archivos privados con estado `imported`, tras revisar el documento y el ingreso al que corresponden. Esta versión no incluye una ruta pública de importación ni presupone que dos archivos encontrados sean los últimos de la serie. La emisión de rectificativas tampoco está incluida; una factura emitida no se puede sobrescribir para corregirla.

## Verificación

`npm run test:finance` ejecuta las regresiones financieras y los tests de facturación. Para la integración SQL completa, instalar `@electric-sql/pglite` en un directorio de herramientas separado y establecer `FINANCE_INVOICES_PGLITE` con la ruta absoluta del módulo. Los tests usan PostgreSQL WASM en memoria, sin credenciales ni conexiones a producción. Cubren SQL real, rollback, reintentos, datos fiscales, permisos y protección de documentos; las llamadas concurrentes se ejecutan sobre la conexión serializada de PGlite.

Para comprobar extracción y límites de página del PDF, establecer `PDF_TEST_PYTHON` con un Python que tenga `pdfplumber`, o disponer de `pdftotext`. Los tests avisan de las comprobaciones omitidas cuando faltan estas herramientas. La revisión visual debe incluir los dos temas y tamaños de escritorio y móvil.
