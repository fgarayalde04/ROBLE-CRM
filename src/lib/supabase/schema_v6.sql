-- ============================================================
-- SCHEMA V6 — folder_path en account_openings + source
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE account_openings ADD COLUMN IF NOT EXISTS folder_path text;
ALTER TABLE account_openings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'local_folder', 'onedrive'));

-- Índice único para evitar duplicados en sync local
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_openings_folder_path
  ON account_openings(folder_path)
  WHERE folder_path IS NOT NULL;
