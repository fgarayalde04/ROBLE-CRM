-- ── Análisis Albojer ─────────────────────────────────────────────────────────
-- Planilla mensual de acciones de la cuenta Pershing ROJ900554 (De Bellis,
-- apodada "Albojer"), repartida entre los analistas "INDIO" y "CHINO". Mismo
-- esquema que las tablas iche_* (ver iche_acciones_migration.sql): el server
-- actualiza estas tablas con el Unrealized y el Activity de Pershing y
-- redibuja el .xlsx de cero.

CREATE TABLE IF NOT EXISTS albojer_open_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst     text NOT NULL CHECK (analyst IN ('INDIO', 'CHINO')),
  ticker      text NOT NULL,
  cusip       text,
  description text NOT NULL,
  -- [{ quantity, unitCost, tradeDate }] — tradeDate null si no se conoce
  -- (posiciones "Multiple" de la carga inicial, se completan con los lotes de
  -- Pershing en la primera corrida si la cantidad coincide).
  lots        jsonb NOT NULL,
  last_price  numeric,
  source      text NOT NULL CHECK (source IN ('pershing', 'morgan')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS albojer_closed_positions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst       text NOT NULL CHECK (analyst IN ('INDIO', 'CHINO')),
  year          int NOT NULL,
  ticker        text NOT NULL,
  description   text NOT NULL,
  opening_date  text NOT NULL, -- YYYY-MM-DD, "Multiple" o vacío
  cost_basis    numeric NOT NULL,
  closing_date  text NOT NULL, -- YYYY-MM-DD
  quantity      numeric NOT NULL,
  sale_proceeds numeric NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS albojer_open_positions_analyst_idx ON albojer_open_positions(analyst);
CREATE INDEX IF NOT EXISTS albojer_closed_positions_analyst_year_idx ON albojer_closed_positions(analyst, year);

-- Una fila por corrida. created_at marca desde cuándo mirar el Activity en
-- la corrida siguiente (la carga inicial también deja su fila, sin preview).
CREATE TABLE IF NOT EXISTS albojer_generation_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name         text NOT NULL,
  onedrive_item_id  text,
  onedrive_web_url  text,
  generated_by      uuid,
  preview           jsonb,
  warnings          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
