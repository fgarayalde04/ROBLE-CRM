-- ============================================================
-- Tareas compartidas + visibilidad personal del Panel del Día
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS created_by text;

UPDATE tasks
SET created_by = COALESCE(created_by, responsible)
WHERE created_by IS NULL;

CREATE TABLE IF NOT EXISTS task_shares (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_name   text NOT NULL,
  shared_by   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_name)
);

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_name   text NOT NULL,
  title       text NOT NULL,
  message     text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_task_shares_task_id ON task_shares(task_id);
CREATE INDEX IF NOT EXISTS idx_task_shares_user_name ON task_shares(user_name);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_name, read_at, created_at DESC);
