-- ============================================================
-- VOCAI OS — Migración: Mis gestiones + Agenda + Google Calendar
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── MIS TAREAS (privadas por usuario) ────────────────────────
CREATE TABLE IF NOT EXISTS my_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  prioridad TEXT DEFAULT 'normal' CHECK (prioridad IN ('urgente', 'alta', 'normal', 'baja')),
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completada')),
  fecha_limite DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE my_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "my_tasks_own" ON my_tasks FOR ALL USING (auth.uid() = user_id);

-- ── MI AGENDA (privada por usuario) ──────────────────────────
CREATE TABLE IF NOT EXISTS my_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE my_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "my_events_own" ON my_events FOR ALL USING (auth.uid() = user_id);

-- ── AGENDA DE NEGOCIO (compartida) ──────────────────────────
CREATE TABLE IF NOT EXISTS business_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME,
  descripcion TEXT,
  asignado_a TEXT DEFAULT 'ambos' CHECK (asignado_a IN ('agus', 'santi', 'ambos')),
  google_event_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE business_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_events_authenticated" ON business_events FOR ALL USING (auth.role() = 'authenticated');

-- ── GOOGLE TOKENS (por usuario) ─────────────────────────────
CREATE TABLE IF NOT EXISTS google_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "google_tokens_own" ON google_tokens FOR ALL USING (auth.uid() = user_id);

-- ── Trigger updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'my_tasks_updated_at') THEN
    CREATE TRIGGER my_tasks_updated_at BEFORE UPDATE ON my_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'my_events_updated_at') THEN
    CREATE TRIGGER my_events_updated_at BEFORE UPDATE ON my_events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'business_events_updated_at') THEN
    CREATE TRIGGER business_events_updated_at BEFORE UPDATE ON business_events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'google_tokens_updated_at') THEN
    CREATE TRIGGER google_tokens_updated_at BEFORE UPDATE ON google_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
