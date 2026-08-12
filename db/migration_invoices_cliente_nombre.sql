-- ============================================================
-- FACTURAS A NOMBRE SUELTO
-- Para ingresos puntuales (ej: alguien que viene a grabarse una
-- sola vez) sin tener que darlo de alta como cliente.
-- Si la factura tiene cliente_id, este campo va NULL.
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cliente_nombre TEXT;
