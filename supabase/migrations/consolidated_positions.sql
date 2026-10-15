-- Portafolio → Posición Consolidada: cada consolidado (Pershing + Morgan Stanley)
-- de una cuenta. Se guardan los reportes ya leídos (no los Excel) más lo cargado
-- a mano, para reabrirlo y volver a descargar el PDF o el Excel.
create table if not exists consolidated_positions (
  id               uuid primary key default gen_random_uuid(),
  client_name      text not null,
  cuentas          text,
  valuation_date   date not null,
  total_value      numeric not null default 0,
  accrued_interest numeric not null default 0,
  datos            jsonb not null,
  created_by       text,
  created_by_id    uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_consolidated_positions_created on consolidated_positions (created_at desc);
create index if not exists idx_consolidated_positions_client on consolidated_positions (lower(client_name), valuation_date desc);
