-- VOCAI OS - Esquema completo de Supabase
-- Ejecutar en el SQL Editor de Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  empresa TEXT,
  tipo_servicio TEXT CHECK (tipo_servicio IN ('estudio', 'marketing', 'ia', 'full')),
  pack TEXT,
  estado TEXT DEFAULT 'prospecto' CHECK (estado IN ('prospecto', 'activo', 'pausado', 'inactivo')),
  mrr DECIMAL(10,2) DEFAULT 0,
  responsable TEXT CHECK (responsable IN ('agus', 'santi')),
  ultimo_contacto DATE,
  cumpleanos DATE,
  notas TEXT,
  onboarding JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  cliente_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  estado TEXT DEFAULT 'briefing' CHECK (estado IN ('briefing', 'diseño', 'desarrollo', 'produccion', 'completado')),
  progreso INTEGER DEFAULT 0 CHECK (progreso >= 0 AND progreso <= 100),
  responsable TEXT CHECK (responsable IN ('agus', 'santi')),
  descripcion TEXT,
  fecha_entrega DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROJECT COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS project_comments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  usuario TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  titulo TEXT NOT NULL,
  proyecto_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  responsable TEXT CHECK (responsable IN ('agus', 'santi')),
  prioridad TEXT DEFAULT 'normal' CHECK (prioridad IN ('baja', 'normal', 'alta', 'urgente')),
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completada')),
  fecha_limite DATE,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero TEXT UNIQUE,
  cliente_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  concepto TEXT NOT NULL,
  importe DECIMAL(10,2) NOT NULL,
  iva DECIMAL(10,2) DEFAULT 0,
  irpf DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),
  estado TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'cobrada', 'vencida')),
  fecha DATE DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT CHECK (categoria IN ('software', 'marketing', 'oficina', 'personal', 'servicios', 'otros')),
  importe DECIMAL(10,2) NOT NULL,
  fecha DATE DEFAULT CURRENT_DATE,
  recurrente BOOLEAN DEFAULT FALSE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STUDIO BOOKINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_bookings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  pack TEXT CHECK (pack IN ('basico', 'plus', 'graba', 'crea', 'domina')),
  sala TEXT DEFAULT 'principal',
  fecha DATE NOT NULL,
  hora TIME,
  duracion_horas DECIMAL(4,1),
  precio DECIMAL(10,2),
  estado TEXT DEFAULT 'confirmada' CHECK (estado IN ('pendiente', 'confirmada', 'completada', 'cancelada')),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  empresa TEXT,
  tipo TEXT DEFAULT 'cliente' CHECK (tipo IN ('cliente', 'proveedor', 'colaborador', 'otro')),
  cumpleanos DATE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  titulo TEXT,
  contenido TEXT,
  autor TEXT,
  color TEXT DEFAULT '#242d3f',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GOALS
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  mes TEXT NOT NULL UNIQUE,
  objetivo DECIMAL(10,2) NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROPOSALS
-- ============================================================
CREATE TABLE IF NOT EXISTS proposals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('estudio', 'marketing', 'ia', 'full')),
  contenido JSONB DEFAULT '{}',
  estado TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'aceptada', 'rechazada')),
  importe DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EPISODES
-- ============================================================
CREATE TABLE IF NOT EXISTS episodes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  titulo TEXT NOT NULL,
  numero INTEGER,
  cliente_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'grabado', 'editando', 'revision', 'publicado')),
  fecha_grabacion DATE,
  fecha_publicacion DATE,
  duracion TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  usuario TEXT NOT NULL,
  accion TEXT NOT NULL,
  modulo TEXT NOT NULL,
  detalle TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AGENTS (n8n automations)
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'pausado', 'error')),
  trigger TEXT,
  acciones TEXT[],
  webhook_url TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS POLICIES (Row Level Security)
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access to all tables
CREATE POLICY "authenticated_all" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON project_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON studio_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON proposals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON episodes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON agents FOR ALL TO authenticated USING (true) WITH CHECK (true);
