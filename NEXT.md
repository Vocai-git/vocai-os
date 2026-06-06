## Fecha
2026-06-06

## Que hicimos hoy
- Unificamos el repo: Santi había pusheado su trabajo a main con rebase, quedó todo integrado
- Eliminamos el proyecto Railway viejo "profound-vision" que tenía código congelado
- Deployamos vocai-assistant con `railway up` (no tiene auto-deploy de GitHub)
- Corrimos migración manual en Supabase: ALTER TABLE conversaciones ADD COLUMN cliente_nombre TEXT
- Fix crítico: chats.js tenía `export` que rompía todo el JS del dashboard (spinner infinito)
- Agregamos CLAUDE.md al repo con el flujo de ramas para Agus y Santi

## Que quedo terminado
- Un solo Railway activo: vocai-os-production-35c5.up.railway.app/app
- Módulos Tito (Chats en vivo, Aprendizaje, Atención humana) funcionando en producción
- Chats en vivo: buscador + badges no leídos + typing indicator + botón Nuevo chat
- Botón Atención humana navega directo a Chats en vivo (fix: 5b75487)
- CLAUDE.md con workflow de ramas para los dos

## Que quedo a medias
- vocai-assistant sigue sin auto-deploy de GitHub — cada feature nueva hay que hacer `railway up`
  desde ~/Proyectos/estudio/vocai-assistant
- La migración de cliente_nombre no tiene archivo .sql en scripts/migrations/ (fue manual)

## Proximo paso concreto al retomar
- Crear scripts/migrations/007_conversaciones_cliente_nombre.sql con el ALTER TABLE aplicado hoy,
  para que quede documentado y Santi lo sepa

## Notas/decisiones importantes
- vocai-assistant se deploya con `railway up`, NO con push a GitHub
- Nunca usar export/import en public/js/modules/ — son scripts normales, no ES modules
- Link único para los dos: https://vocai-os-production-35c5.up.railway.app/app
