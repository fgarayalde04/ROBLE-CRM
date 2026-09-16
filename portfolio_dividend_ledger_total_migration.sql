-- Permite cargar un único monto acumulado de dividendos por fondo, en vez
-- de tener que sumar fila por fila cada cobro.
ALTER TABLE portfolio_dividend_ledger DROP CONSTRAINT IF EXISTS portfolio_dividend_ledger_entry_type_check;
ALTER TABLE portfolio_dividend_ledger ADD CONSTRAINT portfolio_dividend_ledger_entry_type_check
  CHECK (entry_type IN ('compra', 'dividendo', 'dividendo_total'));
