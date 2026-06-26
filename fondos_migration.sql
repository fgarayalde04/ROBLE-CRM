-- ── Fondos Library ────────────────────────────────────────────────────────────

-- Asset managers (gestoras)
CREATE TABLE IF NOT EXISTS asset_managers (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug             text UNIQUE NOT NULL,
  name             text NOT NULL,
  logo_url         text,
  domain_hints     text[],   -- email domains to auto-detect (e.g. 'blackrock.com')
  keyword_hints    text[],   -- keywords in subject/filename to auto-detect
  created_at       timestamptz DEFAULT now()
);

-- Individual funds
CREATE TABLE IF NOT EXISTS fondos (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_manager_id uuid REFERENCES asset_managers(id) ON DELETE CASCADE NOT NULL,
  name             text NOT NULL,
  isin             text,
  ticker           text,
  clase            text,
  moneda           text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(asset_manager_id, isin)
);

-- Factsheet PDFs (with version history)
CREATE TABLE IF NOT EXISTS factsheets (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fondo_id         uuid REFERENCES fondos(id) ON DELETE CASCADE,
  asset_manager_id uuid REFERENCES asset_managers(id) ON DELETE CASCADE NOT NULL,
  file_name        text NOT NULL,
  pdf_url          text,                 -- Supabase Storage public URL
  gmail_message_id text UNIQUE,          -- prevents re-importing same email
  fecha_factsheet  date,
  is_latest        boolean DEFAULT true,
  imported_by      text,                 -- user email who triggered the sync
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS factsheets_asset_manager_idx ON factsheets(asset_manager_id);
CREATE INDEX IF NOT EXISTS factsheets_fondo_idx         ON factsheets(fondo_id);
CREATE INDEX IF NOT EXISTS fondos_isin_idx              ON fondos(isin);

-- Seed gestoras
INSERT INTO asset_managers (slug, name, domain_hints, keyword_hints) VALUES
  ('blackrock',          'BlackRock',                       ARRAY['blackrock.com','ishares.com'],            ARRAY['blackrock','ishares']),
  ('jp-morgan-am',       'JP Morgan Asset Management',      ARRAY['jpmorgan.com','jpmorganfunds.com'],        ARRAY['jpmorgan','jp morgan','jpm asset']),
  ('pimco',              'PIMCO',                           ARRAY['pimco.com'],                              ARRAY['pimco']),
  ('franklin-templeton', 'Franklin Templeton',              ARRAY['franklintempleton.com'],                  ARRAY['franklin templeton','franklin','templeton']),
  ('fidelity',           'Fidelity',                        ARRAY['fidelity.com','fidelityinternational.com'],ARRAY['fidelity']),
  ('schroders',          'Schroders',                       ARRAY['schroders.com'],                          ARRAY['schroders','schroder']),
  ('capital-group',      'Capital Group',                   ARRAY['capitalgroup.com','americanfunds.com'],   ARRAY['capital group','american funds']),
  ('vanguard',           'Vanguard',                        ARRAY['vanguard.com'],                           ARRAY['vanguard']),
  ('mg',                 'M&G',                             ARRAY['mandg.com','mandginvestments.com'],        ARRAY['m&g','mandg','m and g']),
  ('invesco',            'Invesco',                         ARRAY['invesco.com'],                            ARRAY['invesco']),
  ('morgan-stanley',     'Morgan Stanley IM',               ARRAY['morganstanley.com','msim.com'],           ARRAY['morgan stanley','msim']),
  ('wellington',         'Wellington Management',           ARRAY['wellington.com'],                         ARRAY['wellington']),
  ('janus-henderson',    'Janus Henderson',                 ARRAY['janushenderson.com'],                     ARRAY['janus henderson','janus','henderson'])
ON CONFLICT (slug) DO NOTHING;

-- NOTE: Create a Supabase Storage bucket called "factsheets" (public read)
-- in the Supabase dashboard before running the sync.
