-- Filas de plata del reporte de Portfolio Performance (Beginning Value,
-- Net Contribution, Change In Value) — una cifra por período, guardadas
-- como JSON {selected, ytd, oneYear, threeYear, fiveYear, sinceInception}.
-- "change_in_value" es el crecimiento de la cuenta en dinero (equivalente
-- en plata del TWRR). Nullable: los reportes ya importados quedan sin estos
-- datos hasta que se vuelva a subir el PDF.
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE portfolio_performance_imports
  ADD COLUMN IF NOT EXISTS beginning_value  jsonb,
  ADD COLUMN IF NOT EXISTS net_contribution jsonb,
  ADD COLUMN IF NOT EXISTS change_in_value  jsonb;
