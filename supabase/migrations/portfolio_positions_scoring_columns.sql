-- ============================================================
-- Agrega columnas de scoring al flujo analyze-from-onedrive
-- Ejecutar en Supabase SQL editor (una sola vez).
-- ============================================================

-- Columna source: de dónde vino la clasificación
ALTER TABLE portfolio_positions
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pending';

-- Columna score_explanation: descripción legible del score asignado
ALTER TABLE portfolio_positions
  ADD COLUMN IF NOT EXISTS score_explanation TEXT;

-- Columna security_type: tipo de seguridad del archivo (p.ej. "Corporate Bond", "Common Stock")
ALTER TABLE portfolio_positions
  ADD COLUMN IF NOT EXISTS security_type TEXT;

-- Comentario de columnas
COMMENT ON COLUMN portfolio_positions.source IS 'scoring_base | openfigi | rules | pending | manual';
COMMENT ON COLUMN portfolio_positions.score_explanation IS 'Descripción legible del score de riesgo asignado';
COMMENT ON COLUMN portfolio_positions.security_type IS 'Tipo de seguridad según OpenFIGI o columna Security Type del archivo';
