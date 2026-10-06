-- ============================================================
-- Cuándo se buscó la categoría de un fondo en Davinci (para no volver a
-- buscar en cada corrida los que Davinci no tiene).
-- ============================================================

alter table instrument_master
  add column if not exists riesgo_davinci_at timestamptz;
