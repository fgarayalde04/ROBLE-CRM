-- Agrega columna para controlar visibilidad de propuestas entre usuarios
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE investment_proposals
  ADD COLUMN IF NOT EXISTS shared_with_all boolean NOT NULL DEFAULT false;

-- Índice para acelerar el filtro OR en la consulta de listado
CREATE INDEX IF NOT EXISTS idx_investment_proposals_shared
  ON investment_proposals (shared_with_all)
  WHERE shared_with_all = true;
