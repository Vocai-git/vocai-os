-- Clientes: orden manual de la lista en /panel/clientes (24/11/2026). Sin valor = al final, por nombre.
alter table clients add column if not exists orden integer;
