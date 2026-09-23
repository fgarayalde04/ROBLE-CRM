-- ================================================================
-- Maestro de instrumentos: condiciones fijas de bonos
-- Cuando se carga a mano un bono en una propuesta, se guarda en
-- instrument_master junto con sus condiciones, para que la próxima vez
-- se autocomplete al elegirlo en el buscador.
-- Ejecutar en Supabase/Postgres: primero desarrollo, producción recién
-- al mergear a main.
-- ================================================================

ALTER TABLE instrument_master
  ADD COLUMN IF NOT EXISTS maturity_date        DATE,
  ADD COLUMN IF NOT EXISTS coupon               NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS rating               TEXT,
  ADD COLUMN IF NOT EXISTS frequency            TEXT,
  ADD COLUMN IF NOT EXISTS day_count_convention TEXT;
