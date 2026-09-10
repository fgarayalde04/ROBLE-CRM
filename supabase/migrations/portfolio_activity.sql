-- Movimientos de cuenta (reporte de "Activity" del custodio). Igual que las
-- otras fuentes de enriquecimiento: se reemplaza al reimportar la misma
-- cuenta/fecha/custodio, no se versiona.
-- Ejecutar en: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS portfolio_activity_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text NOT NULL,
  as_of_date     date,
  file_name      text,
  imported_by    text,
  imported_by_id uuid,
  custodian      text NOT NULL DEFAULT 'Pershing',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_activity (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id      uuid NOT NULL REFERENCES portfolio_activity_imports(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  trade_date     date,
  settle_date    date,
  activity_type  text,
  description    text,
  symbol         text,
  cusip          text,
  quantity       numeric,
  price          numeric,
  amount         numeric,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_activity_account ON portfolio_activity (account_number, trade_date DESC);
