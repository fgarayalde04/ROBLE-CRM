-- =============================================
-- ROBLE CAPITAL CRM — SCHEMA v2
-- =============================================
-- Ejecutar en el SQL Editor de Supabase
-- DESPUÉS de haber ejecutado schema.sql (v1)
-- =============================================

-- ── Agregar tipo de cliente ─────────────────
alter table clients
  add column if not exists client_type text not null default 'local'
    check (client_type in ('local', 'internacional'));

-- ── Miembros del equipo ─────────────────────
create table if not exists team_members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique,
  role text not null default 'empleado'
    check (role in ('administrador', 'empleado')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Eventos / Calendario empresarial ────────
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  end_time time,
  type text not null default 'interno'
    check (type in ('reunion', 'llamada', 'seguimiento', 'vencimiento', 'interno', 'otro')),
  client_id uuid references clients(id) on delete set null,
  participants text[] default '{}',
  reminder_minutes int,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────
create index if not exists idx_events_date on events(event_date);
create index if not exists idx_events_type on events(type);
create index if not exists idx_events_client_id on events(client_id);
create index if not exists idx_clients_client_type on clients(client_type);
create index if not exists idx_team_members_active on team_members(active);

-- ── Trigger updated_at para events ──────────
create trigger events_updated_at before update on events
  for each row execute function update_updated_at();

-- ── Datos de ejemplo: equipo ─────────────────
-- (opcional — borrar si ya tienen equipo real)
insert into team_members (name, email, role) values
  ('Administrador', 'admin@roblecapital.net', 'administrador')
on conflict (email) do nothing;
