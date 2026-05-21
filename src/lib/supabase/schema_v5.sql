-- ============================================================
-- SCHEMA V5 — Sincronización de carpetas locales
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Agregar columnas a new_folders para soportar sync local (y futura sincronización OneDrive)
ALTER TABLE new_folders ADD COLUMN IF NOT EXISTS folder_path text;
ALTER TABLE new_folders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'local_folder', 'onedrive'));

-- Índice único para evitar duplicados por ruta
CREATE UNIQUE INDEX IF NOT EXISTS idx_new_folders_folder_path
  ON new_folders(folder_path)
  WHERE folder_path IS NOT NULL;
