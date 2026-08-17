-- ============================================================
-- Migración: push_subscriptions (Web Push / PWA)
-- Ya ejecutada directamente contra la base de Railway.
-- Este archivo queda como referencia/documentación.
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references crm_users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique(endpoint)
);

create index if not exists idx_push_subscriptions_user_id on push_subscriptions(user_id);
create index if not exists idx_push_subscriptions_enabled on push_subscriptions(enabled);

-- Preferencias por usuario/categoría — creada para la 2da etapa (conectar eventos
-- reales). Todavía no la lee ni la escribe ningún endpoint; todo defaultea a true.
create table if not exists push_preferences (
  user_id uuid primary key references crm_users(id) on delete cascade,
  ordenes boolean not null default true,
  tareas boolean not null default true,
  revisiones_bcu boolean not null default true,
  ideas_inversion boolean not null default true,
  menciones boolean not null default true,
  alertas_importantes boolean not null default true,
  updated_at timestamptz not null default now()
);
