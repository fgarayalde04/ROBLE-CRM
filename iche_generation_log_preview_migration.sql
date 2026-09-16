-- Persiste el preview (tablas + resumen) de cada generación para poder
-- volver a verlo después sin tener que resubir los Excel — antes solo vivía
-- en el estado de React del wizard y se perdía al salir de la página.
ALTER TABLE iche_generation_log ADD COLUMN IF NOT EXISTS preview jsonb;
ALTER TABLE iche_generation_log ADD COLUMN IF NOT EXISTS warnings jsonb;
