-- Título y descripción editables de cada planilla de acciones (los que se ven
-- en /admin/planillas y en el encabezado de cada una). Sin fila = default.
CREATE TABLE IF NOT EXISTS planillas_settings (
  book        text PRIMARY KEY CHECK (book IN ('iche', 'albojer')),
  title       text NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
