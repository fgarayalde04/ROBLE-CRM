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

-- ============================================================
-- Migración: eventos de Órdenes (2da etapa)
-- Ya ejecutada directamente contra la base de Railway.
-- Extiende la tabla `notifications` existente — no crea un
-- segundo sistema de notificaciones.
-- ============================================================

alter table notifications add column if not exists user_id uuid references crm_users(id);
alter table notifications add column if not exists notif_type text;
alter table notifications add column if not exists client_name text;
alter table notifications add column if not exists url text;

-- Dedup: misma orden + mismo tipo de evento + mismo destinatario nunca se duplica.
-- Índice parcial: no afecta notificaciones de otros módulos (ej. tareas) que no
-- setean notif_type.
create unique index if not exists idx_notifications_dedup
  on notifications(entity_id, notif_type, user_name)
  where entity_id is not null and notif_type is not null;

create index if not exists idx_notifications_user_id on notifications(user_id);
