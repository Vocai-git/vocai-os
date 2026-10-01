# Pronósticos de reels

Juego del equipo para ver quién detecta mejor qué reel va a rendir más.
Cada día se publican 3 reels en una cuenta de prueba (Instagram + TikTok) y
cada uno los ordena del 1º al 3º antes de publicar.

## Cómo se juega (todos los días)

1. **Antes de publicar**, alguien carga la tanda de hoy en *Marketing →
   Pronósticos*: el nombre de los 3 clips (A, B, C).
2. Cada uno toca los clips en orden (primero el que cree que va a tener más
   engagement) y guarda. Nadie ve el orden de los demás hasta que cierra.
3. Al publicar el primer reel, alguien toca **Ya publicamos**: quedan 15 min
   para votar. Si nadie lo toca, el cierre se calcula igual con la hora real
   de publicación al vincular.
4. Después de publicar, **Vincular reels**: elegir qué publicación de IG y de
   TikTok es cada clip.
5. A las 48 h de publicado cada reel, el scheduler (cada hora, minuto 10) le
   saca una foto a sus métricas. Cuando están los 3, se puntúa solo.

## Puntaje

- Tasa de engagement. **IG**: (likes + comentarios + guardados + compartidos)
  / alcance. **TikTok**: (likes + comentarios + compartidos) / views, porque
  su API no da alcance ni guardados.
- **Por pares**: con 3 clips hay 3 comparaciones (A vs B, A vs C, B vs C).
  Cada una acertada vale 1 punto → de 0 a 3 por red y por día. Empate real
  = medio punto. Ordenando al azar el promedio es **1,5**.
- La tabla promedia los puntos de cada persona. Con menos de ~20 días la
  diferencia todavía puede ser suerte.
- Un voto guardado después del cierre no cuenta.

## Configuración (una sola vez)

### 1. Tablas

Correr `db/migration_pronosticos.sql` en el SQL Editor de Supabase.

### 2. Instagram (cuenta de prueba)

La cuenta tiene que ser **profesional** (Business o Creator) y estar
vinculada a una **Página de Facebook**. Con la misma app de Meta que usa
VOCAI (ver `META-PUBLICACION.md`):

- Si el usuario dueño del token de VOCAI también administra esa página, el
  mismo `META_ACCESS_TOKEN` sirve: solo hace falta el ID de la cuenta.
- Si no, generar un token de larga duración para esa cuenta con permisos
  `instagram_basic`, `instagram_manage_insights`, `pages_show_list` y
  `pages_read_engagement`.
- ID de la cuenta: en el Graph API Explorer, `GET /me/accounts` → ID de la
  página → `GET /{page-id}?fields=instagram_business_account`.

| Variable            | Qué es                                                      |
|---------------------|-------------------------------------------------------------|
| `PRONOS_IG_USER_ID` | ID de la cuenta de Instagram de prueba.                     |
| `PRONOS_IG_TOKEN`   | Opcional. Token propio si el de VOCAI no alcanza la cuenta. |

### 3. TikTok (modo sandbox, sin revisión de TikTok)

1. Entrar a https://developers.tiktok.com con cualquier cuenta y crear una
   app (*Manage apps → Connect an app*).
2. Pasar a **Sandbox** (botón arriba a la derecha) y crear el sandbox.
3. Agregar el producto **Login Kit** → plataforma **Web** → Redirect URI:
   `https://vocai-os-production-35c5.up.railway.app/api/pronosticos/tiktok/callback`
4. En **Scopes**, dejar `user.info.basic` y agregar `video.list`.
5. En **Sandbox settings → Target users**, agregar la cuenta de TikTok donde
   se suben los reels (pide iniciar sesión con esa cuenta). Puede tardar
   hasta una hora en activarse.
6. Copiar *Client key* y *Client secret* a Railway:

| Variable               | Qué es                                          |
|------------------------|-------------------------------------------------|
| `TIKTOK_CLIENT_KEY`    | Client key de la app (sandbox).                 |
| `TIKTOK_CLIENT_SECRET` | Client secret de la app (sandbox).              |
| `TIKTOK_REDIRECT_URI`  | La misma Redirect URI del paso 3, idéntica.     |

7. En VOCAI OS → Pronósticos → **Conectar TikTok**, iniciar sesión con la
   cuenta de prueba y aceptar. El token se renueva solo (dura 1 año; después
   hay que volver a conectar).

### 4. Cuentas del equipo

Cada jugador necesita usuario en VOCAI OS:

```
node scripts/crear-usuario.js <email> <contraseña> <nombre>
```
