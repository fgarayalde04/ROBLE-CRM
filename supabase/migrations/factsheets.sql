-- ── Factsheets table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factsheets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name   TEXT        NOT NULL,
  report_date   DATE,
  quarter       TEXT,
  advisor       TEXT,
  benchmark     TEXT,
  total_value   NUMERIC,
  risk_score    NUMERIC,
  risk_profile  TEXT,
  data          JSONB       NOT NULL,     -- full FactsheetData snapshot
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS factsheets_client_idx  ON factsheets (client_name);
CREATE INDEX IF NOT EXISTS factsheets_date_idx    ON factsheets (report_date DESC);
CREATE INDEX IF NOT EXISTS factsheets_quarter_idx ON factsheets (quarter);

ALTER TABLE factsheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "factsheets_read"  ON factsheets;
DROP POLICY IF EXISTS "factsheets_write" ON factsheets;

CREATE POLICY "factsheets_read"
  ON factsheets FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "factsheets_write"
  ON factsheets FOR ALL
  USING (auth.role() = 'authenticated');
