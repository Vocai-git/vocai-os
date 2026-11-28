-- Asistentes: caja negra (28/11/2026). Ver lib/caja-negra.js.
-- Una fila por asistente con caja. Aquí NO hay nada de lo que guarda una caja, ni contraseñas, ni llaves:
-- solo los dos correos de recuperación, las huellas de los códigos en curso, la huella de la «prueba de las
-- dos contraseñas» y el sello (número y huella de la última anotación).
create table if not exists assistant_caja (
  assistant_id uuid primary key references assistants(id) on delete cascade,
  estado text not null default 'nueva',          -- nueva | pendiente | verificada | activa
  datos jsonb not null default '{}'::jsonb,      -- correos, códigos en curso (solo huellas), envíos recientes, sello
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Solo el servidor (clave de servicio) lee y escribe: sin políticas, nadie más entra.
alter table assistant_caja enable row level security;
