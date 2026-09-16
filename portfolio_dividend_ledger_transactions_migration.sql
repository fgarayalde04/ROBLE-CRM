-- Extiende la planilla manual de dividendos a un modelo de transacciones
-- completo (compra/venta/dividendo), para poder reconstruir el capital
-- invertido en la fecha de cada dividendo y calcular el rendimiento real,
-- alimentado tanto por import de Activity como por carga manual.
ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS isin text;
ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS quantity numeric;
ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS price numeric;
ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS custodian text;
ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS external_ref text;

ALTER TABLE portfolio_dividend_ledger DROP CONSTRAINT IF EXISTS portfolio_dividend_ledger_entry_type_check;
ALTER TABLE portfolio_dividend_ledger ADD CONSTRAINT portfolio_dividend_ledger_entry_type_check
  CHECK (entry_type IN ('compra', 'venta', 'dividendo', 'dividendo_total'));

CREATE INDEX IF NOT EXISTS portfolio_dividend_ledger_external_ref_idx
  ON portfolio_dividend_ledger(account_number, external_ref);
