-- ══════════════════════════════════════════════════════════
-- Suitability v2 — Períodos de scoring + Scoring base
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════

-- 1. Períodos de scoring (agrupa reviews por trimestre)
CREATE TABLE IF NOT EXISTS scoring_periods (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year          INT  NOT NULL,
  period_quarter       INT  NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  status               TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'final'
  created_by           UUID REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  notes                TEXT,
  total_reviews        INT  DEFAULT 0,
  clients_aligned      INT  DEFAULT 0,
  clients_misaligned   INT  DEFAULT 0,
  pending_assets       INT  DEFAULT 0,
  UNIQUE (period_year, period_quarter)
);

CREATE INDEX IF NOT EXISTS idx_scoring_periods_year_q
  ON scoring_periods(period_year DESC, period_quarter DESC);

-- 2. Agregar period_id + advisor a portfolio_reviews (si no existen)
ALTER TABLE portfolio_reviews
  ADD COLUMN IF NOT EXISTS period_id UUID REFERENCES scoring_periods(id) ON DELETE SET NULL;

ALTER TABLE portfolio_reviews
  ADD COLUMN IF NOT EXISTS advisor TEXT;

CREATE INDEX IF NOT EXISTS idx_portfolio_reviews_period_id
  ON portfolio_reviews(period_id);

-- 3. Campos extra en asset_master (scoring base editable)
ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS explanation   TEXT;

ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS source        TEXT;

ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS needs_review  BOOLEAN DEFAULT FALSE;

-- Notify PostgREST to reload
NOTIFY pgrst, 'reload schema';
