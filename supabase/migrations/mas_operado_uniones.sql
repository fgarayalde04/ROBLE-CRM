-- ── Lo más operado: unir fondos a mano ("Unir con…") ─────────────────────────
-- Fondos iguales que el nombre no alcanza a unir (otro ISIN, otra clase). Cada
-- instrumento (clave 'id:<ISIN>' o 'nm:<nombre>') apunta a un grupo; el grupo
-- 'mon:<id>' es un fondo del Monitor, del que se toman nombre y rendimientos.
CREATE TABLE IF NOT EXISTS mas_operado_uniones (
  clave      text PRIMARY KEY,
  grupo      text NOT NULL,
  creado_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mas_operado_uniones_grupo_idx ON mas_operado_uniones(grupo);
