-- Planilla manual de compras y dividendos cobrados por fondo, dentro de
-- Portafolio — nunca se completa sola, la carga el asesor a mano.
CREATE TABLE IF NOT EXISTS portfolio_dividend_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text NOT NULL,
  fund_name   text NOT NULL,
  entry_type  text NOT NULL CHECK (entry_type IN ('compra', 'dividendo')),
  entry_date  date,
  amount      numeric,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);

CREATE INDEX IF NOT EXISTS portfolio_dividend_ledger_account_idx ON portfolio_dividend_ledger(account_number);
