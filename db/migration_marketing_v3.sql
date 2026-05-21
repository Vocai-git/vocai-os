-- ============================================================
-- VOCAI OS — Migración Marketing v3
-- Fecha de la noticia en el banco de temas (Radar IA).
-- No rompe nada — solo agrega una columna.
-- ============================================================

ALTER TABLE content_topics ADD COLUMN IF NOT EXISTS fecha_noticia TEXT;
