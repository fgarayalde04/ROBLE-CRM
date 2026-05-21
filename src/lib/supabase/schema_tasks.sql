ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS opening_id uuid REFERENCES account_openings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by text;
