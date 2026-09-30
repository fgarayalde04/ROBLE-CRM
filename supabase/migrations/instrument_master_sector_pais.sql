-- ============================================================
-- Acciones: sector, industria y país de la empresa (se buscan una vez en
-- Yahoo Finance y quedan guardados) para el puntaje de riesgo.
-- ============================================================

alter table instrument_master
  add column if not exists sector          text,
  add column if not exists industria       text,
  add column if not exists pais            text,
  add column if not exists riesgo_yahoo_at timestamptz;
