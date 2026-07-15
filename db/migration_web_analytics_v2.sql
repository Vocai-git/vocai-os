-- ============================================================
-- VOCAI OS — Migración v2: Analítica web con detalle de visitante
-- Ejecutar en el SQL Editor de Supabase.
-- Agrega a web_hits lo que el tracker empieza a capturar:
-- país/ciudad (GeoIP local, la IP NO se guarda), navegador,
-- sistema operativo e idioma del navegador.
-- ============================================================

ALTER TABLE web_hits ADD COLUMN IF NOT EXISTS pais TEXT;      -- 'ES', 'AR', ...
ALTER TABLE web_hits ADD COLUMN IF NOT EXISTS ciudad TEXT;    -- 'Alicante' (si GeoIP la conoce)
ALTER TABLE web_hits ADD COLUMN IF NOT EXISTS navegador TEXT; -- chrome · safari · instagram · ...
ALTER TABLE web_hits ADD COLUMN IF NOT EXISTS so TEXT;        -- android · ios · windows · macos · linux
ALTER TABLE web_hits ADD COLUMN IF NOT EXISTS idioma TEXT;    -- 'es-ES', 'en-US', ...
