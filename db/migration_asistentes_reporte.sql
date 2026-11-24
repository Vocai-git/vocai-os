-- Asistentes: reporte automático del gasto (24/11/2026).
-- Cada asistente informa el total del mes por servicio con una clave propia; aquí se guarda solo la huella de la clave.
alter table assistants add column if not exists reporte_huella text;
create unique index if not exists assistants_reporte_huella on assistants (reporte_huella) where reporte_huella is not null;

create table if not exists assistant_usage (
  assistant_id uuid not null references assistants(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  servicio text not null,
  usd numeric(12,4) not null default 0,
  unidades bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (assistant_id, mes, servicio)
);

alter table assistant_usage enable row level security;
