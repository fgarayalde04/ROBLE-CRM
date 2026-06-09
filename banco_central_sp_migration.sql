-- ============================================================
-- banco_central_sp_migration.sql
-- Migración: SharePoint sync + nuevos campos de checkbox
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. folder_path ya no es obligatorio (registros de SharePoint no tienen path local)
ALTER TABLE banco_central_records ALTER COLUMN folder_path DROP NOT NULL;
ALTER TABLE banco_central_records ALTER COLUMN folder_path SET DEFAULT '';

-- 2. Nuevos checkboxes que reemplazan lista_verificacion + cumplo en la UI
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS perfil_inversor  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS perfil_de_riesgo BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Metadatos de SharePoint
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS nombre_cliente TEXT;
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS source         TEXT DEFAULT 'local';
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS sync_status    TEXT;

-- Asegurar que last_synced_at exista (puede que ya esté)
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 4. Índices para deduplicación rápida
CREATE INDEX IF NOT EXISTS idx_bcr_item_id       ON banco_central_records(item_id)                    WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bcr_customer_type ON banco_central_records(customer_number, type)      WHERE customer_number IS NOT NULL;

-- 5. Poblar nombre_cliente desde folder_name en registros existentes
UPDATE banco_central_records
SET nombre_cliente = TRIM(REGEXP_REPLACE(folder_name, '^\d+\s*[-–]\s*', ''))
WHERE nombre_cliente IS NULL
  AND folder_name ~ '^\d+\s*[-–]';
