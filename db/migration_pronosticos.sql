-- ============================================================
-- VOCAI OS — Migración: Pronósticos de reels
-- Ejecutar en el SQL Editor de Supabase.
-- No rompe nada — agrega 4 tablas nuevas con prefijo pronos_.
-- ============================================================

-- ── Tanda del día: los 3 clips que se publican ese día ──────
CREATE TABLE IF NOT EXISTS pronos_tandas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  creado_por TEXT,
  -- Botón "Ya publicamos". La votación cierra 15 min después de la
  -- primera publicación (este botón o la fecha real de IG/TikTok).
  publicado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Clips de cada tanda (A, B, C) + su foto a las 48 h ───────
CREATE TABLE IF NOT EXISTS pronos_clips (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tanda_id UUID NOT NULL REFERENCES pronos_tandas(id) ON DELETE CASCADE,
  letra TEXT NOT NULL CHECK (letra IN ('A', 'B', 'C')),
  titulo TEXT NOT NULL,
  ig_media_id TEXT,
  ig_link TEXT,
  ig_publicado_at TIMESTAMPTZ,
  ig_metricas JSONB,
  ig_medido_at TIMESTAMPTZ,
  tt_video_id TEXT,
  tt_link TEXT,
  tt_publicado_at TIMESTAMPTZ,
  tt_metricas JSONB,
  tt_medido_at TIMESTAMPTZ,
  UNIQUE (tanda_id, letra)
);

-- ── Un voto por persona y tanda: orden del 1º al 3º ─────────
CREATE TABLE IF NOT EXISTS pronos_votos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tanda_id UUID NOT NULL REFERENCES pronos_tandas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  orden TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tanda_id, user_id)
);

-- ── Conexión con TikTok (una sola fila) ─────────────────────
CREATE TABLE IF NOT EXISTS pronos_tiktok (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  open_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ──────────────────────────────────────
-- Sin políticas a propósito: solo el server (service key) lee y
-- escribe. Así los votos quedan ocultos hasta el cierre y los
-- tokens de TikTok no se pueden leer desde el navegador.
ALTER TABLE pronos_tandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pronos_clips  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pronos_votos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pronos_tiktok ENABLE ROW LEVEL SECURITY;
