-- ============================================================
-- MIGRATION: Módulo Generador de Contenido
-- ============================================================
-- Crea 5 tablas nuevas relacionadas con `clients` por FK UUID:
--   · clientes_adn_visual    → 1-1 con clients (logo, paleta, tono, rubro, público)
--   · clientes_referencias   → N imágenes de referencia por cliente
--   · clientes_pilares       → N pilares de contenido por cliente
--   · generaciones           → registro de cada generación completa
--   · generacion_slides      → cada imagen individual dentro de una generación
-- ============================================================

-- ============================================================
-- 1. ADN visual del cliente (1 fila por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes_adn_visual (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  logo_url TEXT,
  paleta JSONB DEFAULT '[]'::jsonb, -- array de hex: ["#0EA5E9","#F59E0B",...]
  tono TEXT,
  rubro TEXT,
  publico_objetivo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adn_visual_cliente ON clientes_adn_visual(cliente_id);

-- ============================================================
-- 2. Imágenes de referencia del cliente (N por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes_referencias (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  imagen_url TEXT NOT NULL,
  es_principal BOOLEAN DEFAULT FALSE,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referencias_cliente ON clientes_referencias(cliente_id);

-- ============================================================
-- 3. Pilares de contenido del cliente (N por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes_pilares (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pilares_cliente ON clientes_pilares(cliente_id);

-- ============================================================
-- 4. Generaciones (1 fila por ejecución completa del Generador)
-- ============================================================
CREATE TABLE IF NOT EXISTS generaciones (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pilar_id UUID REFERENCES clientes_pilares(id) ON DELETE SET NULL,
  titulo TEXT, -- generado por OpenAI, se muestra en historial
  tipo TEXT NOT NULL CHECK (tipo IN ('carrusel', 'historia')),
  cantidad INTEGER NOT NULL CHECK (cantidad >= 1 AND cantidad <= 20),
  brief TEXT NOT NULL,
  modo_brief TEXT NOT NULL CHECK (modo_brief IN ('topico_corto', 'guion_completo')),
  referencias_modo TEXT NOT NULL DEFAULT 'guardadas'
    CHECK (referencias_modo IN ('guardadas', 'nuevas', 'ambas')),
  narrativa JSONB, -- guion textual que devolvió OpenAI (útil para mostrar en resultado)
  created_by TEXT, -- email del usuario que generó (agus/santi)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generaciones_cliente ON generaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_generaciones_pilar ON generaciones(pilar_id);
CREATE INDEX IF NOT EXISTS idx_generaciones_fecha ON generaciones(created_at DESC);

-- ============================================================
-- 5. Slides individuales de cada generación
-- ============================================================
CREATE TABLE IF NOT EXISTS generacion_slides (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  generacion_id UUID NOT NULL REFERENCES generaciones(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL, -- 1, 2, 3...
  imagen_url TEXT NOT NULL,
  prompt_usado TEXT, -- prompt que se le pasó a Gemini
  copy_slide TEXT, -- texto del slide (hook, desarrollo, CTA)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slides_generacion ON generacion_slides(generacion_id);

-- ============================================================
-- Trigger para actualizar updated_at en clientes_adn_visual
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_adn_updated ON clientes_adn_visual;
CREATE TRIGGER trg_adn_updated
  BEFORE UPDATE ON clientes_adn_visual
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
