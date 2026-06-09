-- ================================================================
-- MÓDULO PROPUESTAS DE INVERSIÓN
-- Ejecutar en Supabase SQL Editor
-- ================================================================

-- ── Propuesta principal ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investment_proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name     TEXT,
  client_email    TEXT,
  advisor_id      UUID REFERENCES crm_users(id) ON DELETE SET NULL,
  advisor_name    TEXT,

  -- Inversión
  total_amount    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency        TEXT DEFAULT 'USD',

  -- Metadata
  title           TEXT,
  status          TEXT DEFAULT 'draft'
                  CHECK (status IN ('draft','review','sent','accepted','archived')),
  notes           TEXT,
  disclaimer      TEXT,

  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

-- ── Fondos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_funds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID REFERENCES investment_proposals(id) ON DELETE CASCADE,
  position        INTEGER DEFAULT 0,

  isin            TEXT,
  issuer          TEXT,
  fund_name       TEXT,
  fund_class      TEXT,

  return_1y       NUMERIC(8, 2),
  return_3y       NUMERIC(8, 2),
  return_5y       NUMERIC(8, 2),
  ytm_indicative  NUMERIC(8, 2),
  duration_years  NUMERIC(6, 2),

  pct             NUMERIC(6, 2) DEFAULT 0,
  amount          NUMERIC(18, 2) DEFAULT 0,

  data_source     TEXT DEFAULT 'manual',
  needs_review    BOOLEAN DEFAULT false,
  extraction_notes TEXT,

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Bonos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_bonds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID REFERENCES investment_proposals(id) ON DELETE CASCADE,
  position        INTEGER DEFAULT 0,

  isin            TEXT,
  issuer          TEXT,
  bond_type       TEXT,
  currency        TEXT DEFAULT 'USD',
  maturity_date   DATE,
  coupon          NUMERIC(6, 2),
  yield           NUMERIC(6, 2),
  duration        NUMERIC(6, 2),
  rating          TEXT,

  pct             NUMERIC(6, 2) DEFAULT 0,
  amount          NUMERIC(18, 2) DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Acciones ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_equities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID REFERENCES investment_proposals(id) ON DELETE CASCADE,
  position        INTEGER DEFAULT 0,

  ticker          TEXT,
  company_name    TEXT,
  sector          TEXT,
  country         TEXT,
  currency        TEXT DEFAULT 'USD',

  pct             NUMERIC(6, 2) DEFAULT 0,
  amount          NUMERIC(18, 2) DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_proposals_client   ON investment_proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_advisor  ON investment_proposals(advisor_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status   ON investment_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposal_funds     ON proposal_funds(proposal_id, position);
CREATE INDEX IF NOT EXISTS idx_proposal_bonds     ON proposal_bonds(proposal_id, position);
CREATE INDEX IF NOT EXISTS idx_proposal_equities  ON proposal_equities(proposal_id, position);

-- ── updated_at trigger ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS proposals_updated_at ON investment_proposals;
CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON investment_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
