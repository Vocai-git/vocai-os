-- ── Blog (web vocai.es) ─────────────────────────────────────
-- Posts del blog. Los crea/edita el dashboard (módulo Web); la web
-- pública (vocai-web) lee solo los publicados vía RLS.

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  titulo TEXT NOT NULL,
  meta_description TEXT,
  keyword TEXT,
  excerpt TEXT,
  body_md TEXT,
  cover_image TEXT,
  autor TEXT DEFAULT 'VOCAI',
  pilar TEXT,
  estado TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador','en_revision','publicado')),
  publicado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Listado público: ordenar por fecha de publicación.
CREATE INDEX IF NOT EXISTS idx_blog_posts_publicado
  ON blog_posts (estado, publicado_at DESC);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- El dashboard (rol authenticated / service key) hace todo.
CREATE POLICY "authenticated_all" ON blog_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- La web pública (rol anon) SOLO lee posts publicados.
-- Esto es lo que evita que se filtren borradores. No relajar.
CREATE POLICY "anon_select_publicado" ON blog_posts
  FOR SELECT TO anon USING (estado = 'publicado');
