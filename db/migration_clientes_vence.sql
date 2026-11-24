-- Clientes: fecha en que vence el periodo contratado (24/11/2026). Opcional; se edita desde /panel/clientes.
alter table clients add column if not exists vence_periodo date;
