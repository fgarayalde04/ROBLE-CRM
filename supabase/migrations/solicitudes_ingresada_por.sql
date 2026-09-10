-- Quién ingresó la orden al sistema: 'asesor' o 'mesa'. Antes solo se podía
-- inferir (y de forma ambigua) del canal. Se setea en el POST de
-- /api/solicitudes según el rol de la sesión que la crea.
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS ingresada_por text;

-- Backfill de filas viejas: el único indicio claro es canal = 'directo_mesa'
-- (mesa ingresó y envió directo). El resto se asume ingresado por el asesor.
UPDATE solicitudes
SET ingresada_por = CASE WHEN canal = 'directo_mesa' THEN 'mesa' ELSE 'asesor' END
WHERE ingresada_por IS NULL;
