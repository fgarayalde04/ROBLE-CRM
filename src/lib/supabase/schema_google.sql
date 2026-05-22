-- Google OAuth tokens persisted per CRM user
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS google_connections (
  user_email   TEXT PRIMARY KEY,          -- CRM user email (from MS session)
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    BIGINT NOT NULL,           -- Unix seconds
  google_email  TEXT,
  google_name   TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);
