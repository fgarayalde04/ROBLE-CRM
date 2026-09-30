-- ============================================================
-- Puntaje de riesgo por instrumento (fondos, bonos y acciones del maestro).
-- Criterio genérico de 7 grupos (ver src/lib/riskGroups.ts). El CRM lo
-- calcula solo; riesgo_fuente = 'manual' marca un ajuste a mano que el
-- recálculo automático no pisa.
-- ============================================================

alter table instrument_master
  add column if not exists riesgo_grupo      text,
  add column if not exists riesgo_puntaje    int,
  add column if not exists riesgo_fuente     text,     -- monitor | categoria | nombre | rating | pais | manual | sin_clasificar
  add column if not exists riesgo_revisar    boolean not null default false,
  add column if not exists riesgo_motivo     text,
  add column if not exists riesgo_updated_at timestamptz,
  add column if not exists riesgo_updated_by text;

create index if not exists idx_im_riesgo_revisar on instrument_master(riesgo_revisar) where riesgo_revisar;
