-- ============================================================
-- SCHEMA V4 — Dashboard CEO / Business Intelligence
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Archivos importados (registro de uploads)
CREATE TABLE IF NOT EXISTS uploaded_files (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name    text NOT NULL,
  file_type    text NOT NULL CHECK (file_type IN ('aum', 'production', 'revenue', 'clients', 'pipeline', 'other')),
  row_count    int,
  uploaded_by  text,
  status       text NOT NULL DEFAULT 'procesado' CHECK (status IN ('procesado', 'error', 'pendiente')),
  notes        text,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

-- Registros de AUM
CREATE TABLE IF NOT EXISTS aum_records (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  period       text NOT NULL,        -- formato YYYY-MM
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  client_name  text,
  segment      text,                 -- 'local' | 'internacional' | otro
  aum_value    numeric NOT NULL,
  currency     text NOT NULL DEFAULT 'USD',
  source_file  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Registros de producción
CREATE TABLE IF NOT EXISTS production_records (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  period           text NOT NULL,    -- formato YYYY-MM
  advisor          text,
  client_name      text,
  client_id        uuid REFERENCES clients(id) ON DELETE SET NULL,
  production_value numeric NOT NULL,
  product_type     text,
  currency         text NOT NULL DEFAULT 'USD',
  source_file      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Registros de ingresos / comisiones
CREATE TABLE IF NOT EXISTS revenue_records (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  period        text NOT NULL,       -- formato YYYY-MM
  revenue_type  text,                -- 'comision' | 'honorario' | 'otro'
  value         numeric NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  notes         text,
  source_file   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Métricas de negocio genéricas (para datos que no encajan en las tablas anteriores)
CREATE TABLE IF NOT EXISTS business_metrics (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_name  text NOT NULL,
  metric_type  text,
  period       text,
  value        numeric NOT NULL,
  currency     text,
  source_file  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Índices para búsquedas por período (columnas usadas frecuentemente en GROUP BY)
CREATE INDEX IF NOT EXISTS idx_aum_records_period        ON aum_records(period);
CREATE INDEX IF NOT EXISTS idx_production_records_period ON production_records(period);
CREATE INDEX IF NOT EXISTS idx_revenue_records_period    ON revenue_records(period);
