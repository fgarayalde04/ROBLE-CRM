-- =============================================
-- PLATAFORMA INTERNA - SCHEMA SUPABASE
-- =============================================
-- Ejecutar este SQL en el SQL Editor de Supabase
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- CLIENTS
-- =============================================
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  client_number text unique not null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  status text not null default 'prospecto'
    check (status in ('prospecto','activo','inactivo','pendiente_documentacion','en_revision')),
  risk_profile text
    check (risk_profile in ('conservador','moderado','moderado_agresivo','agresivo')),
  advisor text,
  notes text,
  onedrive_folder_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- DOCUMENTS
-- =============================================
create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  client_id uuid references clients(id) on delete set null,
  category text not null default 'otro'
    check (category in (
      'contrato','perfil_riesgo','reporte','propuesta','documento_legal',
      'fact_sheet','comunicacion','formulario','analisis_inversion','otro'
    )),
  onedrive_url text,
  status text not null default 'pendiente'
    check (status in ('pendiente','completo','vencido','revisar','enviado','firmado')),
  document_date date,
  expiry_date date,
  responsible text,
  tags text[] default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- TASKS (PENDIENTES)
-- =============================================
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  client_id uuid references clients(id) on delete set null,
  responsible text,
  priority text not null default 'media'
    check (priority in ('baja','media','alta','urgente')),
  status text not null default 'pendiente'
    check (status in ('pendiente','en_proceso','bloqueado','completado')),
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- DEADLINES (VENCIMIENTOS)
-- =============================================
create table if not exists deadlines (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  client_id uuid references clients(id) on delete set null,
  category text not null default 'documento'
    check (category in (
      'documento','tarea','revision_cliente','reporte','renovacion','seguimiento'
    )),
  responsible text,
  due_date date not null,
  status text not null default 'pendiente'
    check (status in ('pendiente','completado','vencido')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- ACTIVITY LOG
-- =============================================
create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null
    check (entity_type in ('client','document','task','deadline')),
  entity_id uuid not null,
  action text not null,
  description text not null,
  user_name text,
  created_at timestamptz not null default now()
);

-- =============================================
-- INDEXES
-- =============================================
create index if not exists idx_clients_client_number on clients(client_number);
create index if not exists idx_clients_status on clients(status);
create index if not exists idx_clients_advisor on clients(advisor);
create index if not exists idx_documents_client_id on documents(client_id);
create index if not exists idx_documents_status on documents(status);
create index if not exists idx_documents_expiry_date on documents(expiry_date);
create index if not exists idx_tasks_client_id on tasks(client_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_due_date on tasks(due_date);
create index if not exists idx_tasks_responsible on tasks(responsible);
create index if not exists idx_deadlines_client_id on deadlines(client_id);
create index if not exists idx_deadlines_due_date on deadlines(due_date);
create index if not exists idx_deadlines_status on deadlines(status);
create index if not exists idx_activity_log_entity on activity_log(entity_type, entity_id);

-- =============================================
-- UPDATED_AT TRIGGER
-- =============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_updated_at before update on clients
  for each row execute function update_updated_at();

create trigger documents_updated_at before update on documents
  for each row execute function update_updated_at();

create trigger tasks_updated_at before update on tasks
  for each row execute function update_updated_at();

create trigger deadlines_updated_at before update on deadlines
  for each row execute function update_updated_at();

-- =============================================
-- ROW LEVEL SECURITY (opcional - habilitar si usan auth)
-- =============================================
-- alter table clients enable row level security;
-- alter table documents enable row level security;
-- alter table tasks enable row level security;
-- alter table deadlines enable row level security;
-- alter table activity_log enable row level security;
