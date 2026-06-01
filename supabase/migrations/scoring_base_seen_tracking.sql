-- ============================================================
-- scoring_base — seen-tracking + manual_override columns
-- Ejecutar en Supabase SQL editor (una sola vez).
-- ============================================================

-- ── Nuevas columnas ───────────────────────────────────────────
ALTER TABLE scoring_base
  ADD COLUMN IF NOT EXISTS times_seen            INTEGER    DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at          TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_client_seen      TEXT,
  ADD COLUMN IF NOT EXISTS last_portfolio_upload UUID,
  ADD COLUMN IF NOT EXISTS manual_override       BOOLEAN    DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_override_by    TEXT,
  ADD COLUMN IF NOT EXISTS manual_override_at    TIMESTAMPTZ;

-- ── Función 1: upsert completo con protección manual_override ─
-- Llamada al guardar un activo nuevo (OpenFIGI o reglas).
-- • INSERT: crea el registro con times_seen = 1
-- • UPDATE (conflicto): incrementa times_seen, respeta manual_override
CREATE OR REPLACE FUNCTION upsert_scoring_base_asset(
  p_security_identifier TEXT,
  p_identifier_type     TEXT,
  p_figi                TEXT,
  p_normalized_name     TEXT,
  p_symbol              TEXT,
  p_security_description TEXT,
  p_security_type       TEXT,
  p_market_sector       TEXT,
  p_asset_class         TEXT,
  p_risk_score          NUMERIC,
  p_category            TEXT,
  p_score_explanation   TEXT,
  p_source              TEXT,
  p_classification_status TEXT,
  p_client_name         TEXT,
  p_review_id           UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO scoring_base (
    security_identifier, identifier_type, figi,
    normalized_name, symbol, security_description,
    security_type, market_sector,
    asset_class, risk_score, category,
    score_explanation, source, classification_status,
    times_seen, first_seen_at, last_seen_at,
    last_client_seen, last_portfolio_upload,
    last_verified_at, created_at, updated_at
  ) VALUES (
    p_security_identifier, p_identifier_type, p_figi,
    p_normalized_name, p_symbol, p_security_description,
    p_security_type, p_market_sector,
    p_asset_class, p_risk_score, p_category,
    p_score_explanation, p_source, p_classification_status,
    1, NOW(), NOW(),
    p_client_name, p_review_id,
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (security_identifier) DO UPDATE SET
    -- Metadata: completar si está vacía
    figi                 = COALESCE(scoring_base.figi,                EXCLUDED.figi),
    normalized_name      = COALESCE(scoring_base.normalized_name,     EXCLUDED.normalized_name),
    symbol               = COALESCE(scoring_base.symbol,              EXCLUDED.symbol),
    security_description = COALESCE(scoring_base.security_description,EXCLUDED.security_description),
    security_type        = COALESCE(scoring_base.security_type,       EXCLUDED.security_type),
    market_sector        = COALESCE(scoring_base.market_sector,       EXCLUDED.market_sector),
    -- Score: no sobreescribir si fue editado manualmente
    asset_class      = CASE WHEN scoring_base.manual_override THEN scoring_base.asset_class       ELSE EXCLUDED.asset_class       END,
    risk_score       = CASE WHEN scoring_base.manual_override THEN scoring_base.risk_score        ELSE EXCLUDED.risk_score        END,
    category         = CASE WHEN scoring_base.manual_override THEN scoring_base.category          ELSE EXCLUDED.category          END,
    score_explanation= CASE WHEN scoring_base.manual_override THEN scoring_base.score_explanation ELSE EXCLUDED.score_explanation END,
    source           = CASE WHEN scoring_base.manual_override THEN scoring_base.source            ELSE EXCLUDED.source            END,
    classification_status = CASE WHEN scoring_base.manual_override THEN scoring_base.classification_status ELSE EXCLUDED.classification_status END,
    -- Seen metrics: siempre actualizar
    times_seen            = COALESCE(scoring_base.times_seen, 0) + 1,
    last_seen_at          = NOW(),
    last_client_seen      = COALESCE(EXCLUDED.last_client_seen,      scoring_base.last_client_seen),
    last_portfolio_upload = COALESCE(EXCLUDED.last_portfolio_upload, scoring_base.last_portfolio_upload),
    last_verified_at      = NOW(),
    updated_at            = NOW();
END;
$$;

-- ── Función 2: actualizar seen-metrics para activos ya en caché ─
-- Llamada para activos que YA estaban clasificados en scoring_base
-- y fueron encontrados en una nueva cartera.
CREATE OR REPLACE FUNCTION update_scoring_base_seen(
  p_identifiers TEXT[],
  p_client_name TEXT,
  p_review_id   UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE scoring_base
  SET
    times_seen            = COALESCE(times_seen, 0) + 1,
    last_seen_at          = NOW(),
    last_client_seen      = COALESCE(p_client_name,  last_client_seen),
    last_portfolio_upload = COALESCE(p_review_id,    last_portfolio_upload),
    updated_at            = NOW()
  WHERE security_identifier = ANY(p_identifiers);
END;
$$;
