-- ============================================================
-- Aprobación del cliente desde el mail de la orden (ver src/lib/aprobacion.ts
-- y solicitudes_aprobacion_cliente_mail.sql). Se aplica sola al arrancar
-- (src/lib/db/migrate.ts).
-- Idempotente.
-- ============================================================

alter table solicitudes add column if not exists aprobacion_token text;
alter table solicitudes add column if not exists aprobacion_cliente text;
alter table solicitudes add column if not exists aprobacion_comentario text;
alter table solicitudes add column if not exists aprobacion_at timestamptz;

create unique index if not exists idx_solicitudes_aprobacion_token
  on solicitudes(aprobacion_token) where aprobacion_token is not null;

do $$ begin
  alter table solicitudes add constraint solicitudes_aprobacion_cliente_check
    check (aprobacion_cliente in ('aprobada', 'rechazada'));
exception when duplicate_object then null; end $$;
