# Documentos y Telegram

La bandeja de Finanzas V2 recibe PDF, JPG y PNG de hasta 10 MB. Conserva el original en el bucket privado `finance-private`, independientemente de que exista un movimiento. Subir o enviar un archivo no registra ingresos, gastos ni pagos.

## Uso

1. Abrir **Finanzas V2 → Documentos** y subir el comprobante, o enviarlo al bot desde una cuenta de Telegram vinculada.
2. Abrir el archivo y revisar sus datos. Esta versión no incluye OCR ni extracción mediante IA.
3. Elegir **Vincular a movimiento** si el gasto ya existe, o **Crear gasto** para completar importe, fecha, IVA, IRPF y período. El pago requiere indicarlo expresamente, con fecha y cuenta.
4. Los archivos idénticos se reconocen por su contenido. Una nueva fotografía del mismo papel puede tener otro contenido binario: revisar el movimiento existente antes de crear otro gasto.

La bandeja es compartida por los usuarios autenticados de la plataforma, igual que el resto de Finanzas. Los originales no son públicos. Las descargas usan enlaces temporales. Archivar un documento lo conserva; no anula ni elimina movimientos.

## Activación

Aplicar `db/migration_finance_documents.sql` en el proyecto Supabase correspondiente después de revisar la migración. Es aditiva y no cambia registros financieros ni el saldo inicial. La conexión de servicio continúa siendo exclusiva del servidor; no crear políticas de lectura pública.

Crear un bot exclusivo con el [BotFather oficial](https://t.me/BotFather), usando `/newbot`. Guardar su token directamente en las variables privadas del servicio `vocai-os` de Railway. No escribirlo en el chat, el código, una URL compartida ni una captura. El bot de Radar IA usa otras variables y permanece separado.

Variables del servicio:

| Variable | Contenido |
| --- | --- |
| `TELEGRAM_DOCUMENTS_BOT_TOKEN` | Token privado de BotFather |
| `TELEGRAM_DOCUMENTS_BOT_USERNAME` | Nombre de usuario del bot, sin `@` |
| `TELEGRAM_DOCUMENTS_WEBHOOK_SECRET` | Secreto aleatorio de 32 a 256 caracteres `A-Z a-z 0-9 _ -` |
| `TELEGRAM_DOCUMENTS_WEBHOOK_URL` | URL HTTPS de este servicio seguida de `/api/telegram/documents/webhook` |

`FINANCE_V2=true`, `FINANCE_V2_LIVE=true` y la configuración privada de Supabase deben estar activas. El bot no funciona si faltan sus variables, pero los documentos se pueden subir desde la plataforma.

En un entorno que ya tenga esas variables privadas:

```sh
node scripts/configure-telegram-documents.js --check
node scripts/configure-telegram-documents.js --apply
```

`--check` sólo consulta. `--apply` valida la identidad del bot, configura el webhook con secreto y verifica la respuesta. No descarta mensajes pendientes. Rechaza cambiar un webhook de otro servicio; `--replace` requiere que el operador haya decidido reemplazar esa integración. Nunca pasar tokens como argumentos del comando.

Después, cada persona abre **Documentos → Conectar Telegram** desde su sesión de VOCAI y sigue el enlace temporal al bot. La vinculación sólo acepta chats privados. Desconectarla desde la plataforma revoca los futuros envíos de esa cuenta. Una persona ajena que encuentre el bot no puede cargar documentos ni consultar las finanzas.

## Verificación

- Probar primero con documentos ficticios y almacenamiento aislado.
- Verificar límites, MIME real, descarga con tiempo y tamaño máximos, autenticación y código de vinculación caducado.
- Reenviar la misma entrega y el mismo archivo: no deben duplicar documentos ni movimientos.
- Vincular un documento dos veces al mismo movimiento: una única asociación. Si otra persona ya lo vinculó a otro movimiento, mostrar conflicto y conservar la primera asociación.
- Comprobar que los totales del libro y el saldo inicial no cambian al recibir, archivar o vincular documentos.
- En producción, confirmar configuración del webhook y enviar un comprobante real sólo desde la cuenta que su dueño haya vinculado. No afirmar conexión completa hasta comprobar esa recepción.

La API de Telegram es el transporte. Esta integración no incorpora llamadas de pago a un lector de facturas. Cualquier extracción automática futura deberá mostrar propuestas para revisar y respetar los mismos controles de pago y duplicados.

Referencia técnica: [Telegram Bot API](https://core.telegram.org/bots/api) y [enlaces de inicio](https://core.telegram.org/bots/features#deep-linking).
