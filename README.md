# VOCAI OS

Sistema operativo interno de VOCAI: gestión de clientes, proyectos, tareas, facturas, gastos, agenda, episodios de podcast y generador con IA.

## Stack

- **Backend:** Node.js + Express
- **Frontend:** HTML + CSS + JS vanilla
- **Base de datos + Auth:** Supabase
- **Hosting:** Railway
- **IA:** OpenAI / Claude
- **Integraciones:** Google Calendar

## Cómo correrlo en local

```bash
npm install
cp .env.example .env   # completar con las claves reales
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Variables de entorno

Ver `.env.example`. Las claves reales viven en Railway → Variables. Pedir a Agus o Santi el `.env` por canal privado (nunca por git).

- `OPENAI_API_KEY`: requerida por Marketing → Generador → Director creativo.
- `OPENAI_DIRECTOR_MODEL`: opcional; por defecto usa `gpt-5.6-sol` con razonamiento medio.
- `OPENAI_IMAGE_MODEL`: opcional; por defecto usa `gpt-image-2`.

## Estructura

```
server.js          ← entrypoint Express
routes/            ← endpoints API (/api/*)
public/            ← frontend (index.html, app.html, css, js)
db/                ← migrations SQL para Supabase
config/            ← clientes Supabase, OpenAI, etc.
middleware/        ← auth, validaciones
scripts/           ← utilidades sueltas
```

## Deploy

Auto-deploy desde Railway al hacer `git push` a `main`.

## Equipo

- Agustín Moledo ([@agustinmoledo](https://github.com/agustinmoledo))
- Santiago Piguillem ([@piguillemsantiago-sys](https://github.com/piguillemsantiago-sys))
