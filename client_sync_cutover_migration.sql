-- ================================================================
-- CORRECCION DEFINITIVA SYNC CLIENTES / APERTURA
-- Ejecutar en Supabase SQL Editor
-- ================================================================

-- Metadata OneDrive/SharePoint en clientes
ALTER TABLE clients
  ALTER COLUMN client_number DROP NOT NULL;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS drive_id text,
  ADD COLUMN IF NOT EXISTS item_id text,
  ADD COLUMN IF NOT EXISTS web_url text,
  ADD COLUMN IF NOT EXISTS parent_path text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Metadata OneDrive/SharePoint en aperturas
ALTER TABLE account_openings
  ADD COLUMN IF NOT EXISTS drive_id text,
  ADD COLUMN IF NOT EXISTS item_id text,
  ADD COLUMN IF NOT EXISTS web_url text;

-- Evitar duplicados por carpeta sincronizada.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_item_id_unique
  ON clients(item_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_openings_item_id_unique
  ON account_openings(item_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_openings_web_url_unique
  ON account_openings(web_url)
  WHERE web_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_openings_onedrive_url_unique
  ON account_openings(onedrive_url)
  WHERE onedrive_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_last_synced_at
  ON clients(last_synced_at)
  WHERE last_synced_at IS NOT NULL;
