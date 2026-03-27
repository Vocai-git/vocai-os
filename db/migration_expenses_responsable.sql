-- Agregar columna responsable a expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS responsable TEXT DEFAULT 'Agus';
