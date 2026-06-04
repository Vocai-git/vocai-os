# VOCAI OS — Instrucciones para Claude Code

## El proyecto
Dashboard web de gestión interna de VOCAI (Agus + Santi).
- **URL producción:** https://vocai-os-production-35c5.up.railway.app/app
- **Repo:** github.com/Vocai-git/vocai-os
- **Rama principal:** `main` (Railway auto-deploya desde acá)
- **Backend de Tito (bot WhatsApp):** https://vocai-assistant-production.up.railway.app

## Stack (no cambiar)
Node.js + Express — HTML + CSS + JS vanilla — Supabase — Railway

## Flujo de trabajo obligatorio (Agus y Santi trabajan en el mismo repo)

### Al arrancar una sesión
1. Siempre hacer `git pull origin main` antes de tocar cualquier archivo
2. Crear una rama con el formato `agus/<descripcion>` o `santi/<descripcion>`
   - Ejemplo: `git checkout -b agus/mejora-tito` o `git checkout -b santi/modulo-marketing`
3. Trabajar en esa rama

### Al terminar una tarea
1. `git add <archivos>` (nunca `git add .` a ciegas)
2. `git commit -m "descripcion del cambio"`
3. `git push origin <nombre-de-tu-rama>`
4. Mergear a main: `git checkout main && git pull origin main && git merge <tu-rama> && git push origin main`
5. Borrar la rama local: `git branch -d <tu-rama>`

### Regla anti-conflictos
- Agus y Santi NUNCA trabajan en el mismo archivo al mismo tiempo
- Si hay duda, avisar por WhatsApp antes de arrancar
- Si hay conflicto al mergear, resolverlo manualmente y hacer un nuevo commit

## Variables de entorno necesarias en Railway (vocai-os)
- `VOCAI_ASSISTANT_URL` = https://vocai-assistant-production.up.railway.app
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

## Reglas de código
- Mobile First obligatorio
- No usar `export`/`import` en los archivos JS del frontend (son scripts normales, no módulos)
- Los módulos del dashboard van en `public/js/modules/`
- Las rutas del backend van en `routes/`
- Antes de hacer push, verificar que no haya `console.log`, secrets hardcodeados ni archivos `.env`
