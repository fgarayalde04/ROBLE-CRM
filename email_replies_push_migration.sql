-- ============================================================
-- Migración: respuestas de clientes en trading@ (Gmail push)
-- Aplicar primero a la DB de desarrollo; a producción al mergear a main.
-- Idempotente (if not exists): si email_replies ya existía de la versión
-- anterior (polling, eliminada el 2026-09-01) no se toca lo que hay.
-- ============================================================

create table if not exists email_replies (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  gmail_thread_id text not null,
  solicitud_id uuid references solicitudes(id) on delete set null,
  match_method text not null check (match_method in ('thread_id', 'subject_fallback', 'unmatched')),
  from_email text not null,
  received_at timestamptz not null,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Asunto y extracto del mensaje: se guardan para poder reintentar una
-- notificación que falló sin volver a pedirle el mensaje a Gmail.
alter table email_replies add column if not exists subject text;
alter table email_replies add column if not exists snippet text;

create index if not exists idx_email_replies_thread on email_replies(gmail_thread_id);

-- Estado del "watch" de Gmail sobre la casilla de Mesa (fila única, id = 1).
--  history_id       último historyId de Gmail ya procesado — todo lo posterior es nuevo
--  watch_expiration cuándo vence el watch (Gmail lo hace vencer a los 7 días; se renueva solo)
--  last_*           diagnóstico: última corrida, último aviso recibido de Pub/Sub, último error
create table if not exists mail_watch_state (
  id int primary key default 1 check (id = 1),
  history_id text,
  watch_expiration timestamptz,
  last_checked_at timestamptz,
  last_status text,
  last_error text,
  last_push_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into mail_watch_state (id) values (1) on conflict (id) do nothing;
