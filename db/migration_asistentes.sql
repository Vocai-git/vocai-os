-- Asistentes personales de clientes (20/11/2026).
-- Una fila por asistente instalado: de quién es, qué tiene conectado y cuánto cuesta.
-- El gasto de IA se carga a mano desde la consola del proveedor (en USD); la cuota fija es la de VOCAI (en EUR).
create table if not exists assistants (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  nombre text not null,
  estado text not null default 'activo' check (estado in ('activo', 'pausado', 'baja')),
  equipo text,
  conectores text[] not null default '{}',
  clave_api text,
  gasto_mes_usd numeric(10,2) not null default 0,
  gasto_actualizado date,
  cuota_fija_eur numeric(10,2) not null default 0,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table assistants enable row level security;
