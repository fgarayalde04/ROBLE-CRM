-- ── Davinci: menos consultas ────────────────────────────────────────────────
-- Davinci reportó ~50 mil descargas por día desde nuestro usuario. El Monitor
-- de Fondos pasa a actualizarse cada 15 días (no a diario) y las búsquedas en
-- vivo de Propuestas quedan guardadas en la base. Las dos cosas vivían en
-- memoria y se perdían en cada deploy, lo que volvía a disparar las consultas.

-- Última corrida del sync del Monitor (una fila por proceso, key = 'fund_monitor').
CREATE TABLE IF NOT EXISTS davinci_sync_state (
  key             text PRIMARY KEY,
  last_attempt_at timestamptz,
  last_success_at timestamptz
);

-- Resultado de las búsquedas en vivo (fondos que no están en el Monitor).
-- data null = Davinci no tiene el fondo (también se guarda, para no volver a buscarlo).
CREATE TABLE IF NOT EXISTS davinci_lookup_cache (
  isin       text PRIMARY KEY,
  data       jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
