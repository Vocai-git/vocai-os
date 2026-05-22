# Publicación automática en Instagram + Facebook

VOCAI OS publica las piezas del calendario en las cuentas reales usando la
**Graph API oficial de Meta**. Este documento explica qué hace falta para
encenderlo.

## Cómo funciona

- Cada pieza del calendario que viene del Generador tiene una imagen asociada
  (placa de historia o slides de carrusel).
- Todos los días a una hora fija, el scheduler busca las piezas con
  **fecha de hoy o anterior** y **estado "Lista"**, y las publica:
  - `story` → Historia de Instagram.
  - `carrusel` → Carrusel en el feed de Instagram + álbum en Facebook.
  - `post` → Imagen en el feed de Instagram + foto en Facebook.
- Si publica bien, la pieza pasa a estado **"Publicada"**. Si falla, queda en
  **"Error"** y el motivo se ve en los logs del server.
- También hay un botón **"Publicar ahora"** en cada pieza, para forzar o probar.

## Requisitos (esto NO es código — hay que configurarlo una vez)

1. **Cuenta de Instagram Business o Creator**, vinculada a una **Página de
   Facebook**. (Instagram → Configuración → Cuenta → Cambiar a cuenta
   profesional, y vincular la página.)

2. **App en Meta for Developers** (https://developers.facebook.com):
   - Crear una app de tipo "Business".
   - Agregar los productos *Instagram Graph API* y *Facebook Login*.
   - Permisos necesarios: `instagram_basic`, `instagram_content_publish`,
     `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
     `business_management`.
   - Para publicar fuera del modo desarrollo hace falta pasar la
     **App Review** de Meta. Es un trámite, puede tardar días.

3. **Token de acceso de larga duración** (long-lived) con esos permisos.
   Se obtiene desde el Graph API Explorer y se intercambia por uno de 60 días,
   o se usa un *System User token* (no expira) desde Meta Business Suite.

4. **El deploy tiene que ser público.** La Graph API descarga la imagen desde
   una URL — `localhost` no sirve. Las placas deben estar accesibles en la URL
   pública de Railway.

## Variables a cargar en `.env` (y en Railway)

| Variable            | Qué es                                                        |
|---------------------|---------------------------------------------------------------|
| `META_ACCESS_TOKEN` | Token de larga duración con permisos de publicación.          |
| `IG_USER_ID`        | ID de la cuenta de Instagram Business.                        |
| `FB_PAGE_ID`        | ID de la Página de Facebook.                                  |
| `PUBLIC_BASE_URL`   | URL pública del deploy (ej. `https://vocai-os-production.up.railway.app`). |
| `PUBLISH_HOUR`      | Hora del día (0-23) a la que se publica. Por defecto `10`.    |

Mientras `META_ACCESS_TOKEN`, `IG_USER_ID` o `PUBLIC_BASE_URL` estén vacías,
la publicación automática queda **desactivada** y el resto del sistema funciona
normal.

### Cómo conseguir IG_USER_ID y FB_PAGE_ID

Con un token válido, en el Graph API Explorer:
- `GET /me/accounts` → lista las páginas; ahí está el **ID de la página**.
- `GET /{page-id}?fields=instagram_business_account` → devuelve el
  **IG_USER_ID**.

## Importante

El código del publicador (`config/meta.js` + `automations/publisher.js`) está
escrito pero **no se pudo probar** sin las credenciales reales ni el deploy
público. La primera publicación hay que hacerla con el botón "Publicar ahora"
y revisar los logs antes de confiar en el envío automático.
