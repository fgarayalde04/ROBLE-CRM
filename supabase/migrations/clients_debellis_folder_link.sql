-- Corrección de datos (idempotente): si ya se aplicó, no hace nada.
BEGIN;
-- La carpeta Clientes/Sandra/De Bellis es de Patricia De Bellis (7877214);
-- estaba vinculada por error a Laura Delgado (7683226).
CREATE TEMP TABLE debellis_link ON COMMIT DROP AS
  SELECT item_id, drive_id, web_url, onedrive_folder_url, parent_path FROM clients
  WHERE client_number = '7683226' AND onedrive_folder_url ILIKE '%/Sandra/De%20Bellis' AND item_id IS NOT NULL;
UPDATE clients SET item_id = NULL, drive_id = NULL, web_url = NULL, onedrive_folder_url = NULL
WHERE client_number = '7683226' AND EXISTS (SELECT 1 FROM debellis_link);
UPDATE clients p SET item_id = d.item_id, drive_id = d.drive_id, web_url = d.web_url,
       onedrive_folder_url = d.onedrive_folder_url, parent_path = coalesce(p.parent_path, d.parent_path)
FROM debellis_link d WHERE p.client_number = '7877214';
COMMIT;
