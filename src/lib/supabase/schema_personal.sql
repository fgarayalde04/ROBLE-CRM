CREATE TABLE IF NOT EXISTS personal_files (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     text NOT NULL,        -- SessionUser.id
  user_email  text NOT NULL,
  file_name   text NOT NULL,
  file_url    text NOT NULL,        -- Supabase Storage URL
  file_type   text,                 -- mime type
  file_size   bigint,
  notes       text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personal_files_user ON personal_files(user_id);
