-- Compartir una propuesta con usuarios específicos (además de "todos" o
-- "solo el dueño", que ya cubre shared_with_all).
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE investment_proposals
  ADD COLUMN IF NOT EXISTS shared_with_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_investment_proposals_shared_users
  ON investment_proposals USING gin (shared_with_user_ids);
