-- ============================================================
-- MIGRATION v2 — Generador de Contenido
-- Agrega:
--   · ampliación de clientes_adn_visual (ADN global estructurado)
--   · nueva tabla clientes_tipos_diseno (N tipos por cliente)
--   · FK tipo_diseno_id en generaciones
-- ============================================================

-- ============================================================
-- 1. Ampliar clientes_adn_visual
-- ============================================================
ALTER TABLE clientes_adn_visual
  ADD COLUMN IF NOT EXISTS paleta_hex_estructurada JSONB
    DEFAULT '{"fondo":"","primario":"","secundario":"","acento":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS tipografias_primaria TEXT,
  ADD COLUMN IF NOT EXISTS tipografias_secundaria TEXT,
  ADD COLUMN IF NOT EXISTS formato_export TEXT DEFAULT '1080x1350px 4:5 Instagram',
  ADD COLUMN IF NOT EXISTS reglas_globales TEXT,
  ADD COLUMN IF NOT EXISTS errores_frecuentes TEXT;

-- ============================================================
-- 2. Tabla clientes_tipos_diseno (N tipos por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes_tipos_diseno (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion_corta TEXT,
  referencias_esteticas TEXT,
  sensacion TEXT,
  adn_visual TEXT,          -- textarea largo con reglas visuales completas
  prompt_positivo TEXT,     -- instrucciones obligatorias para Gemini
  prompt_negativo TEXT,     -- lo que NO debe hacer Gemini
  posicion_logo TEXT NOT NULL DEFAULT 'nunca'
    CHECK (posicion_logo IN ('solo-primero-ultimo', 'todos', 'nunca', 'watermark')),
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tipos_diseno_cliente
  ON clientes_tipos_diseno(cliente_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_tipos_diseno_updated ON clientes_tipos_diseno;
CREATE TRIGGER trg_tipos_diseno_updated
  BEFORE UPDATE ON clientes_tipos_diseno
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 3. Agregar tipo_diseno_id a generaciones
-- ============================================================
ALTER TABLE generaciones
  ADD COLUMN IF NOT EXISTS tipo_diseno_id UUID
    REFERENCES clientes_tipos_diseno(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generaciones_tipo_diseno
  ON generaciones(tipo_diseno_id);
