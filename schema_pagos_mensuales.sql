CREATE TABLE IF NOT EXISTS monthly_payment_tables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL CHECK (company IN ('roble', 'geliene')),
  year INTEGER NOT NULL,
  exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 39.65,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company, year)
);

CREATE TABLE IF NOT EXISTS monthly_payment_rows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID NOT NULL REFERENCES monthly_payment_tables(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  expense_type TEXT NOT NULL DEFAULT 'fijo' CHECK (expense_type IN ('fijo', 'variable')),
  category TEXT NOT NULL DEFAULT 'otros',
  comment TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_payment_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  row_id UUID NOT NULL REFERENCES monthly_payment_rows(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  value NUMERIC(12,2),
  raw_value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE(row_id, month)
);
