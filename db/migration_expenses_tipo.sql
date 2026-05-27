-- Agregar columna 'tipo' a expenses: 'inversion' (capital/compra única) | 'recurrente' (gasto mensual)
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'recurrente'
  CHECK (tipo IN ('inversion', 'recurrente'));

-- Backfill: si ya tenía recurrente=true → 'recurrente'; si no → 'inversion'
UPDATE expenses
SET tipo = CASE WHEN recurrente = TRUE THEN 'recurrente' ELSE 'inversion' END
WHERE tipo IS NULL OR tipo = 'recurrente';
