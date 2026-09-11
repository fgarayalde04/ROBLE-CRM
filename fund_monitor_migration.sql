-- ── Monitor de Fondos ────────────────────────────────────────────────────────
-- Reemplaza la carga manual del Excel alimentado por Bloomberg: el ISIN es la
-- clave maestra (única), y los rendimientos se sincronizan automáticamente
-- (fuente: Davinci Fund Intelligence) en vez de tipearse a mano.

CREATE TABLE IF NOT EXISTS fund_monitor_funds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isin             text UNIQUE NOT NULL,
  nombre           text NOT NULL,
  nombre_bloomberg text,
  gestora          text,
  share_class      text,
  moneda           text,
  categoria        text,
  subcategoria     text,
  inception_date   date,
  davinci_id       text,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Un solo snapshot "vigente" por fondo (se pisa en cada sync) — no hace falta
-- historial día a día porque la fuente (Davinci) ya entrega los rendimientos
-- ya calculados, no un NAV para reconstruir series.
CREATE TABLE IF NOT EXISTS fund_monitor_returns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id       uuid REFERENCES fund_monitor_funds(id) ON DELETE CASCADE NOT NULL UNIQUE,
  as_of_date    date,
  nav           numeric,
  r_1m          numeric,
  r_3m          numeric,
  r_1y          numeric,
  r_3y          numeric,
  r_5y          numeric,
  r_ytd         numeric,
  y_2025        numeric,
  y_2024        numeric,
  y_2023        numeric,
  y_2022        numeric,
  y_2021        numeric,
  source        text NOT NULL DEFAULT 'davinci',
  status        text NOT NULL DEFAULT 'ok',   -- 'ok' | 'stale' | 'no_source' | 'error'
  error_message text,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fund_monitor_funds_categoria_idx ON fund_monitor_funds(categoria, subcategoria);
