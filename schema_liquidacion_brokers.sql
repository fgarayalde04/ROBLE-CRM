CREATE TABLE IF NOT EXISTS broker_settlement_tables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advisor_name TEXT NOT NULL,
  company TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(advisor_name, company, year)
);

CREATE TABLE IF NOT EXISTS broker_settlement_rows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID NOT NULL REFERENCES broker_settlement_tables(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_formula BOOLEAN NOT NULL DEFAULT FALSE,
  formula_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broker_settlement_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  row_id UUID NOT NULL REFERENCES broker_settlement_rows(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  value NUMERIC(12,2),
  raw_value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE(row_id, month)
);
