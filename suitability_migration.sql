-- Suitability / Portfolio Risk Monitor
-- Run in Supabase SQL editor

-- Asset master cache table (avoids re-querying OpenFIGI for known instruments)
CREATE TABLE IF NOT EXISTS asset_master (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier      TEXT NOT NULL UNIQUE,
  identifier_type TEXT,
  name            TEXT,
  ticker          TEXT,
  figi            TEXT,
  asset_class     TEXT,
  risk_score      NUMERIC(4,2),
  category        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolio reviews (one per upload)
CREATE TABLE IF NOT EXISTS portfolio_reviews (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name        TEXT,
  client_profile     TEXT NOT NULL DEFAULT 'moderado',
  uploaded_by        UUID REFERENCES crm_users(id) ON DELETE SET NULL,
  file_name          TEXT,
  portfolio_score    NUMERIC(4,2),
  portfolio_profile  TEXT,
  classified_weight  NUMERIC(5,2),
  pending_weight     NUMERIC(5,2),
  explanation        TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolio positions (one per line in the uploaded file)
CREATE TABLE IF NOT EXISTS portfolio_positions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id               UUID NOT NULL REFERENCES portfolio_reviews(id) ON DELETE CASCADE,
  raw_name                TEXT,
  raw_identifier          TEXT,
  identifier_type         TEXT,
  cusip                   TEXT,
  isin                    TEXT,
  ticker                  TEXT,
  figi                    TEXT,
  quantity                NUMERIC,
  market_value            NUMERIC,
  weight                  NUMERIC,
  asset_class             TEXT,
  risk_score              NUMERIC(4,2),
  category                TEXT,
  classification_status   TEXT DEFAULT 'pending',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_reviews_client_id ON portfolio_reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_reviews_created_at ON portfolio_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_positions_review_id ON portfolio_positions(review_id);
CREATE INDEX IF NOT EXISTS idx_asset_master_identifier ON asset_master(identifier);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Scoring files (synced from OneDrive Scoring folder)
CREATE TABLE IF NOT EXISTS scoring_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  client_folder   TEXT,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  drive_id        TEXT,
  item_id         TEXT UNIQUE,
  web_url         TEXT,
  file_size       BIGINT,
  mime_type       TEXT,
  last_modified   TIMESTAMPTZ,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_files_client_id ON scoring_files(client_id);
CREATE INDEX IF NOT EXISTS idx_scoring_files_item_id   ON scoring_files(item_id);

NOTIFY pgrst, 'reload schema';
