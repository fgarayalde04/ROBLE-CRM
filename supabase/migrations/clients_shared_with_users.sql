-- Compartir el portafolio de un cliente puntual con usuarios específicos,
-- por fuera del esquema de carpetas por asesor (allowed_folders).
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS shared_with_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_clients_shared_users
  ON clients USING gin (shared_with_user_ids);
