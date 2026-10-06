-- ============================================================
-- Posiciones vigentes por cliente, para el riesgo de su cartera.
--   1. Una carga inicial (export de posiciones de las cuentas) llena la base.
--   2. Después cada orden ejecutada la ajusta (compra suma, venta resta).
-- Una nueva carga reemplaza las posiciones de las cuentas que trae.
-- ============================================================

create table if not exists client_position_loads (
  id          uuid primary key default gen_random_uuid(),
  file_name   text,
  fecha_datos date,
  filas       int not null default 0,
  cuentas     int not null default 0,
  sin_cliente int not null default 0,
  loaded_by   text,
  loaded_at   timestamptz not null default now()
);

create table if not exists client_positions (
  id             uuid primary key default gen_random_uuid(),
  client_number  text,                 -- clients.client_number (null si la cuenta no está vinculada)
  account_number text,                 -- null en posiciones nacidas de una orden (las órdenes no traen cuenta)
  instrument_id  uuid references instrument_master(id) on delete set null,
  instrument_key text not null,        -- instrument_id o, sin instrumento, el identificador/nombre
  nombre         text not null,
  tipo_activo    text,
  identificador  text,
  cantidad       numeric,
  monto          numeric,              -- valor en USD (de la carga, ajustado por órdenes)
  origen         text not null default 'carga',   -- carga | orden
  load_id        uuid references client_position_loads(id) on delete set null,
  updated_at     timestamptz not null default now()
);

create unique index if not exists client_positions_key
  on client_positions (coalesce(client_number, ''), coalesce(account_number, ''), instrument_key);
create index if not exists client_positions_client on client_positions (client_number);

create table if not exists client_position_movements (
  id             uuid primary key default gen_random_uuid(),
  client_number  text,
  solicitud_id   uuid,
  item_index     int not null default 0,
  instrument_id  uuid,
  instrument_key text,
  nombre         text,
  operacion      text,                 -- compra | venta
  cantidad       numeric,
  monto          numeric,
  total_posicion boolean not null default false,   -- "vender toda la posición"
  aplicado       boolean not null default true,
  nota           text,
  created_at     timestamptz not null default now()
);

-- Una orden (y cada activo dentro de ella) se aplica una sola vez.
create unique index if not exists client_position_movements_solicitud
  on client_position_movements (solicitud_id, item_index) where solicitud_id is not null;
create index if not exists client_position_movements_client on client_position_movements (client_number);
