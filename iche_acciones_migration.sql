-- ── Iche Acciones ────────────────────────────────────────────────────────────
-- Fuente de verdad para la planilla mensual "Iche Acciones" del cliente Isaac
-- Shcolnik (cuenta apodada "Iche"), repartida entre Pershing y Morgan Stanley
-- y a su vez entre dos analistas apodados "INDIO" y "CHINO". Reemplaza la
-- edición manual del Excel: el server actualiza estas tablas cada mes y
-- redibuja el .xlsx completo de cero a partir de ellas (nunca relee el
-- archivo anterior — exceljs no puede parsear un .xlsx con imágenes escrito
-- por otra librería, ver .claude/plans/effervescent-forging-leaf.md).

CREATE TABLE IF NOT EXISTS iche_open_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst     text NOT NULL CHECK (analyst IN ('INDIO', 'CHINO')),
  ticker      text NOT NULL,
  -- Pershing no da ticker en su reporte de Unrealized Gain/Loss, solo CUSIP
  -- + descripción — guardarlo acá permite matchear con certeza en vez de
  -- por texto de descripción (que puede variar levemente entre reportes).
  -- Null en posiciones cuyo origen es Morgan Stanley o en el seed inicial
  -- donde no se relevó.
  cusip       text,
  description text NOT NULL,
  -- [{ quantity, unit_cost, trade_date }] — uno o más lotes de compra. Un
  -- ticker con más de un lote se representa en el Excel como una fila
  -- "Multiple" (resumen, la que suma en los totales) + una fila de desglose
  -- por lote (informativa, sin Last Price) — ver references/formulas.md del
  -- skill iche-acciones-mensual.
  lots        jsonb NOT NULL,
  last_price  numeric,
  source      text NOT NULL CHECK (source IN ('pershing', 'morgan')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS iche_closed_positions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst       text NOT NULL CHECK (analyst IN ('INDIO', 'CHINO')),
  year          int NOT NULL,
  ticker        text NOT NULL,
  description   text NOT NULL,
  opening_date  text NOT NULL, -- fecha real (YYYY-MM-DD) o literal "Multiple"
  cost_basis    numeric NOT NULL,
  closing_date  text NOT NULL, -- fecha real (YYYY-MM-DD) o literal "Multiple" (venta en varios tramos)
  quantity      numeric NOT NULL,
  sale_proceeds numeric NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iche_open_positions_analyst_idx ON iche_open_positions(analyst);
CREATE INDEX IF NOT EXISTS iche_closed_positions_analyst_year_idx ON iche_closed_positions(analyst, year);

-- Registro de cada generación (para saber cuándo fue la última corrida y
-- poder mostrar "última actualización" en la página sin depender de leer
-- el .xlsx subido a OneDrive).
CREATE TABLE IF NOT EXISTS iche_generation_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name         text NOT NULL,
  onedrive_item_id  text,
  onedrive_web_url  text,
  generated_by      uuid, -- session.userId de quien lo disparó, si aplica
  created_at        timestamptz NOT NULL DEFAULT now()
);
