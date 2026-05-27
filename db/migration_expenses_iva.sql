-- Agregar desglose IVA/IRPF/total a expenses (mismo modelo que invoices)
-- importe = base imponible (bruto)
-- iva     = monto del IVA si aplica (0 si no)
-- irpf    = monto del IRPF si aplica (0 si no)
-- total   = importe + iva - irpf (lo que efectivamente se paga)

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS iva DECIMAL(10,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS irpf DECIMAL(10,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS total DECIMAL(10,2);

-- Backfill: datos viejos no tenían desglose, total = importe
UPDATE expenses SET total = importe WHERE total IS NULL;
UPDATE expenses SET iva = 0 WHERE iva IS NULL;
UPDATE expenses SET irpf = 0 WHERE irpf IS NULL;
