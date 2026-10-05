-- Plantillas → Calendario de Cupones: cada calendario generado a partir de un
-- "Incoming Cash" de Pershing. Se guarda el calendario completo (bonos ya
-- corregidos a mano) para verlo en la ficha del cliente y volver a descargarlo.
create table if not exists coupon_calendars (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid,
  account_number  text not null,
  client_name     text not null,
  advisor         text,
  doc_date        date not null,
  as_of_date      date,
  bonds_count     int not null default 0,
  nominal_total   numeric not null default 0,
  annual_income   numeric not null default 0,
  datos           jsonb not null,
  created_by      text,
  created_by_id   uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_coupon_calendars_client on coupon_calendars (client_id, created_at desc);
create index if not exists idx_coupon_calendars_account on coupon_calendars (upper(account_number), created_at desc);
