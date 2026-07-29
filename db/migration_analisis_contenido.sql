-- ============================================================
-- VOCAI OS — Migración: Análisis de contenido
-- Ejecutar en el SQL Editor de Supabase. No rompe nada.
--
-- Inventario REAL de toda la cuenta de Instagram (no del calendario):
-- captura TODO lo publicado, incluidos los reels subidos a mano.
-- Cada media trae sus métricas de la Graph API + una clasificación
-- de IA (ángulo, gancho, tema, tono) que alimenta el análisis.
-- ============================================================

CREATE TABLE IF NOT EXISTS ig_media_inventory (
  ig_media_id        TEXT PRIMARY KEY,       -- id del media en la Graph API
  media_type         TEXT,                   -- IMAGE / VIDEO / CAROUSEL_ALBUM
  media_product_type TEXT,                   -- FEED / REELS / STORY / AD
  caption            TEXT,
  permalink          TEXT,
  thumbnail_url      TEXT,
  published_at       TIMESTAMPTZ,            -- timestamp del media en IG

  -- ── Métricas (Graph API insights) ──────────────────────────
  alcance            INT    DEFAULT 0,       -- reach
  reproducciones     INT    DEFAULT 0,       -- plays / views
  me_gusta           INT    DEFAULT 0,
  comentarios        INT    DEFAULT 0,
  guardados          INT    DEFAULT 0,
  compartidos        INT    DEFAULT 0,
  interacciones      INT    DEFAULT 0,       -- total_interactions (o suma)
  -- Retención de reels: la API NO da la curva segundo a segundo,
  -- pero sí el tiempo MEDIO visto y el tiempo TOTAL visto (en ms).
  avg_watch_time_ms  INT    DEFAULT 0,       -- ig_reels_avg_watch_time
  total_watch_time_ms BIGINT DEFAULT 0,      -- ig_reels_video_view_total_time
  -- Duración del reel en segundos. La API no la expone fiable, así
  -- que es OPCIONAL y editable a mano: si está, se calcula el % de
  -- retención medio (avg_watch_time / duración).
  duracion_seg       INT,

  -- ── Clasificación de IA (Gemini) ───────────────────────────
  pilar              TEXT,   -- ia / estudio / casos / personas
  angulo             TEXT,   -- educativo / problema-solucion / detras-de-escena / ...
  gancho             TEXT,   -- pregunta / dato-impactante / afirmacion-fuerte / ...
  tema               TEXT,   -- texto corto, ej "automatización whatsapp"
  tono               TEXT,   -- informativo / cercano / provocador / ...
  resumen_ia         TEXT,   -- 1 frase: de qué va la pieza (según la IA)
  clasificado_at     TIMESTAMPTZ,

  -- ── Housekeeping ───────────────────────────────────────────
  fetched_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para los agregados del análisis.
CREATE INDEX IF NOT EXISTS idx_ig_media_product_type ON ig_media_inventory (media_product_type);
CREATE INDEX IF NOT EXISTS idx_ig_media_published    ON ig_media_inventory (published_at);
CREATE INDEX IF NOT EXISTS idx_ig_media_angulo       ON ig_media_inventory (angulo);

-- Conclusiones generadas por IA (histórico: una fila por generación).
CREATE TABLE IF NOT EXISTS content_insights (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  generado_at  TIMESTAMPTZ DEFAULT NOW(),
  ventana_dias INT,                 -- sobre cuántos días de contenido se corrió
  n_piezas     INT,                 -- cuántas piezas se analizaron
  conclusiones JSONB,               -- { hallazgos:[], recomendaciones:[], que_evitar:[] }
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE ig_media_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_insights   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON ig_media_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON content_insights   FOR ALL TO authenticated USING (true) WITH CHECK (true);
