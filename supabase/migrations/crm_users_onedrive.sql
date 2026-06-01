-- Add OneDrive folder assignment fields to crm_users
ALTER TABLE crm_users
  ADD COLUMN IF NOT EXISTS onedrive_drive_id   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onedrive_folder_id  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onedrive_folder_path text DEFAULT NULL;
