-- ============================================================
-- VOCAI OS — Migración: Analítica de marketing
-- Ejecutar en el SQL Editor de Supabase.
-- No rompe nada — agrega 2 tablas y 2 columnas.
-- ============================================================

-- ── IDs de publicación en Meta (los guarda el publisher) ────
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS ig_media_id TEXT;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS fb_post_id  TEXT;

-- ── Métricas por pieza ───────────────────────────────────────
-- Una fila por pieza publicada. El cron las upsertea a diario
-- con los totales acumulados que devuelve la Graph API.
CREATE TABLE IF NOT EXISTS content_metrics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pieza_id UUID NOT NULL UNIQUE REFERENCES content_pieces(id) ON DELETE CASCADE,
  ig_media_id TEXT,
  alcance INT DEFAULT 0,
  reproducciones INT DEFAULT 0,
  me_gusta INT DEFAULT 0,
  comentarios INT DEFAULT 0,
  guardados INT DEFAULT 0,
  compartidos INT DEFAULT 0,
  interacciones INT DEFAULT 0,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Snapshot diario de la cuenta de Instagram ────────────────
CREATE TABLE IF NOT EXISTS account_metrics (
  fecha DATE PRIMARY KEY,
  seguidores INT,
  alcance_dia INT,
  visitas_perfil INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE content_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON content_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON account_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
