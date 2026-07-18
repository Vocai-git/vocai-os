# Agency OS — vocai-os

`vocai-os` es el dashboard interno y sistema operativo de VOCAI. Su stack es Node.js, Express, JavaScript vanilla y Supabase. Es un repositorio Git independiente compartido entre Santiago y Agus; GitHub es la fuente compartida del código.

Railway despliega automáticamente desde `main`. Un push a `main` implica deploy a producción.

Este archivo organiza únicamente el comportamiento de Codex. Claude Code continúa funcionando con su configuración actual. Respetar también las instrucciones técnicas existentes del proyecto, incluido `CLAUDE.md`, sin simular Skills, hooks, comandos slash, Plan Mode, Grok ni herramientas ausentes.

## Empezar jornada

1. Ejecutar `git status`.
2. Ejecutar `git fetch --prune`.
3. Comparar la rama local con su upstream remoto.
4. Si `main` está limpio, únicamente behind y sin divergencia, actualizar mediante `git pull --ff-only origin main`.
5. Si hay cambios locales desconocidos, divergencia, conflictos o trabajo ajeno pendiente, detenerse.
6. Crear una rama `santi/<descripcion-corta>`.
7. Trabajar y verificar dentro de esa rama.

Nunca integrar automáticamente mediante merge o rebase. No trabajar simultáneamente con Claude, Codex o Agus sobre los mismos archivos. No descartar, sobrescribir ni resolver silenciosamente trabajo ajeno.

## Commits, respaldo y producción

- Agregar a cada commit únicamente archivos explícitos; no usar `git add -A` por defecto.
- Revisar secretos y archivos sensibles antes de cada commit.
- Los commits y el push de una rama de trabajo no productiva pueden realizarse durante la jornada como respaldo.
- Si Codex deja una rama abierta, registrar claramente su nombre y los archivos afectados.
- El merge a `main` y el push de `main` requieren confirmación explícita porque activan producción.
- Nunca ejecutar `railway up`.

## Datos y seguridad

- No ejecutar migraciones ni modificar RLS, datos o Supabase sin autorización específica.
- No realizar cambios destructivos ni publicar contenido sin autorización específica.
- No modificar `publish_at` ni publicar contenido automáticamente.
- No mostrar ni versionar secretos o valores de `.env`.

## Cerrar jornada

Actualizar el estado documental correspondiente cuando hubo trabajo relevante y dejar claro:

- rama activa;
- commits realizados;
- si la rama fue subida;
- archivos sobre los que no deben trabajar simultáneamente Claude o Agus;
- si quedan pendientes merge y deploy.

Codex puede realizar automáticamente lecturas, diagnósticos, fast-forward seguro, creación de una rama `santi/*`, modificaciones solicitadas, verificaciones, actualización documental, commits con archivos explícitos y push de una rama no productiva. Debe detenerse antes de merge o push a `main`, deploy, migraciones, cambios destructivos o publicación de contenido.
