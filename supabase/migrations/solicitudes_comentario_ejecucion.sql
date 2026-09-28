-- Comentario al marcar una orden como ejecutada (ej. corrección de cantidad),
-- así no hace falta editar ni borrar la orden.
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS comentario_ejecucion text;
