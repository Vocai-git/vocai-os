-- ============================================================
-- VOCAI OS — Migración: Departamento de Marketing
-- Ejecutar en el SQL Editor de Supabase.
-- No toca ninguna tabla existente — solo agrega tablas nuevas.
-- ============================================================

-- ── Piezas de contenido (Calendario editorial) ──────────────
CREATE TABLE IF NOT EXISTS content_pieces (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fecha DATE NOT NULL,
  titulo TEXT NOT NULL,
  formato TEXT DEFAULT 'reel' CHECK (formato IN ('reel','carrusel','story','post','otro')),
  pilar TEXT DEFAULT 'ia' CHECK (pilar IN ('ia','estudio','casos','personas')),
  estado TEXT DEFAULT 'idea' CHECK (estado IN ('idea','produccion','lista','publicada')),
  cta TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Planificación mensual (Objetivos del mes) ───────────────
CREATE TABLE IF NOT EXISTS content_months (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  mes TEXT NOT NULL UNIQUE,
  mes_anterior TEXT,
  objetivos TEXT,
  foco TEXT,
  puntual TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Banco de temas (Inteligencia) ───────────────────────────
CREATE TABLE IF NOT EXISTS content_topics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  titulo TEXT NOT NULL,
  pilar TEXT CHECK (pilar IN ('ia','estudio','casos','personas')),
  angulo TEXT,
  fuente TEXT,
  estado TEXT DEFAULT 'nuevo' CHECK (estado IN ('nuevo','usado','descartado')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE content_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON content_pieces FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON content_months FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON content_topics FOR ALL TO authenticated USING (true) WITH CHECK (true);
