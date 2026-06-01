-- ============================================================
-- scoring_base — tabla central del módulo de scoring de riesgo
-- Reemplaza / extiende asset_master con campos más completos.
-- Ejecutar en Supabase SQL editor (una sola vez).
-- ============================================================

CREATE TABLE IF NOT EXISTS scoring_base (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ── Identificadores ───────────────────────────────────────
  security_identifier   TEXT NOT NULL,          -- clave principal (CUSIP / ISIN / ticker)
  identifier_type       TEXT,                   -- 'cusip' | 'isin' | 'ticker' | 'unknown'
  isin                  TEXT,
  cusip                 TEXT,
  symbol                TEXT,
  figi                  TEXT,

  -- ── Descripción del activo ────────────────────────────────
  normalized_name       TEXT,                   -- nombre normalizado desde OpenFIGI
  security_description  TEXT,                   -- descripción larga del activo
  security_type         TEXT,                   -- 'Corporate Bond', 'Common Stock', etc.
  market_sector         TEXT,                   -- 'Equity', 'Fixed Income', 'Money Mkt'
  exchange              TEXT,

  -- ── Clasificación de riesgo ───────────────────────────────
  asset_class           TEXT,
  category              TEXT,
  risk_score            NUMERIC(4,2),            -- 1.00 – 10.00
  score_explanation     TEXT,

  -- ── Metadata de fuente y estado ──────────────────────────
  -- source: 'openfigi' | 'rules' | 'scoring_base' | 'manual' | 'pending'
  source                TEXT DEFAULT 'pending',
  -- classification_status: 'classified' | 'manual' | 'pending' | 'error'
  classification_status TEXT DEFAULT 'pending',
  needs_review          BOOLEAN DEFAULT FALSE,

  -- ── Timestamps ───────────────────────────────────────────
  last_verified_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (security_identifier)
);

-- Índices para lookups alternativos
CREATE INDEX IF NOT EXISTS scoring_base_isin_idx   ON scoring_base (isin)   WHERE isin   IS NOT NULL;
CREATE INDEX IF NOT EXISTS scoring_base_cusip_idx  ON scoring_base (cusip)  WHERE cusip  IS NOT NULL;
CREATE INDEX IF NOT EXISTS scoring_base_symbol_idx ON scoring_base (symbol) WHERE symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS scoring_base_status_idx ON scoring_base (classification_status);

-- RLS: sólo usuarios autenticados de la org pueden leer; sólo admin puede editar
ALTER TABLE scoring_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scoring_base_read"
  ON scoring_base FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "scoring_base_write"
  ON scoring_base FOR ALL
  USING (auth.role() = 'authenticated');

-- ── Migrar datos existentes de asset_master (opcional) ────────────────────────
-- Descomentá si querés traer los registros existentes:
--
-- INSERT INTO scoring_base (
--   security_identifier, identifier_type, normalized_name, symbol,
--   asset_class, category, risk_score, score_explanation,
--   source, classification_status, figi,
--   created_at, updated_at
-- )
-- SELECT
--   identifier, identifier_type, name, ticker,
--   asset_class, category, risk_score, explanation,
--   COALESCE(source, 'manual'), 'classified', figi,
--   created_at, updated_at
-- FROM asset_master
-- ON CONFLICT (security_identifier) DO NOTHING;
