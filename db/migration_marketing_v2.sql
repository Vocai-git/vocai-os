-- ============================================================
-- VOCAI OS — Migración Marketing v2
-- Campos extra en content_topics para el detalle del Radar IA.
-- No rompe nada — solo agrega columnas.
-- ============================================================

ALTER TABLE content_topics ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE content_topics ADD COLUMN IF NOT EXISTS fuente_url  TEXT;
ALTER TABLE content_topics ADD COLUMN IF NOT EXISTS tipo        TEXT;
