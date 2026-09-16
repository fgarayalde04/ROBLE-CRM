-- Permite cargar a mano el valor inicial de la cuenta cuando el cálculo
-- automático (beginning value + net contribution desde el inicio) no
-- coincide con el depósito real — ver computeInitialAccountValue.
ALTER TABLE portfolio_performance_imports ADD COLUMN IF NOT EXISTS manual_initial_value numeric;
