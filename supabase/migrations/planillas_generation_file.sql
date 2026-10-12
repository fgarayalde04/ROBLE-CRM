-- Historial de planillas de acciones con el Excel descargable: se guarda el
-- .xlsx generado en cada corrida (≈50 KB). Las corridas anteriores a esta
-- columna se descargan desde OneDrive con onedrive_item_id.
ALTER TABLE iche_generation_log ADD COLUMN IF NOT EXISTS file_data bytea;
ALTER TABLE albojer_generation_log ADD COLUMN IF NOT EXISTS file_data bytea;
