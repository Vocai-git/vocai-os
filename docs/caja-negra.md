# Caja negra de los asistentes — la parte del panel

La caja negra guarda, cifrado, todo lo que hace el asistente de un cliente. Vive en la máquina del cliente
(repositorio `asistente-vocai`, archivo `caja.js`, donde están las reglas completas). El panel solo ayuda en
cuatro cosas y **nunca recibe lo que hay dentro de una caja ni las contraseñas**:

1. Manda por correo los códigos que confirman los dos correos de recuperación antes de activar la caja.
2. Devuelve a una parte su mitad de la llave cuando olvidó la contraseña, tras un código a su correo.
3. Guarda el sello (número y huella de la última anotación), para notar si alguien corta el final.
4. Avisa por correo a las dos partes: caja activada, abierta, contraseña restablecida, correo cambiado, fallo.

Código: `lib/caja-negra.js` (la lógica, probada en `tests/caja-negra.test.js`), `routes/caja-negra.js`,
`lib/correo.js`, `db/migration_asistentes_caja.sql`.

## Ponerla en marcha (una sola vez)

1. **Base de datos.** Correr `db/migration_asistentes_caja.sql` en el SQL Editor de Supabase.
2. **Llave de recuperación.** `node scripts/caja-llave.js` → pegar el valor en Railway como
   `CAJA_RECUPERACION_PRIVADA` y guardar una copia en un sitio seguro. No se regenera nunca: cambiarla o
   perderla deja sin restablecimiento a todas las cajas activadas.
3. **Correo.** Tener la dirección de avisos (cuenta propia o alias de «Enviar como» de una cuenta).
   `node scripts/conectar-correo.js "<client_secret.json>"`, entrar con esa cuenta, y copiar a Railway
   `CORREO_CLIENT_ID`, `CORREO_CLIENT_SECRET`, `CORREO_REFRESH_TOKEN` y `CORREO_REMITENTE`.
4. Mergear la rama a `main` (Railway despliega solo).
5. Comprobar: `GET /api/assistants/caja/estado/<id>` (con sesión del panel) tiene que decir
   `correo_listo: true` y `llave_lista: true`.

## Qué puede hacer VOCAI y qué no

La caja se abre con dos contraseñas a la vez: la del cliente y la de VOCAI. Para poder restablecer una
contraseña olvidada, el panel tiene la llave que abre la copia de recuperación de cada mitad. Eso significa
que quien controle el panel **y** tenga acceso a la máquina del cliente podría, técnicamente, reunir las dos
mitades. Que VOCAI no lo haga es un compromiso que va en el contrato, no una imposibilidad técnica.

## Límites

- Un código vale 15 minutos y 5 intentos. Se guarda su huella, no el código.
- Como mucho 12 correos por hora por asistente.
- Una caja activa no se puede dar de alta otra vez. Un correo de recuperación solo se cambia con la prueba
  de las dos contraseñas, y el código va al correo nuevo.
- El sello no retrocede.
