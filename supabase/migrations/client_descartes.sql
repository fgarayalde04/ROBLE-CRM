-- Registro de clientes/carpetas eliminados a propósito. Los syncs de SharePoint
-- y de Banco Central lo consultan para NO volver a crear el cliente ni la
-- apertura aunque la carpeta o el legajo sigan existiendo.
-- Matchea por número de cliente, por item_id de la carpeta o por nombre.

CREATE TABLE IF NOT EXISTS client_descartes (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_number  text,
  item_id        text,
  nombre         text,
  motivo         text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_descartes_number_idx  ON client_descartes (client_number) WHERE client_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS client_descartes_item_id_idx ON client_descartes (item_id)       WHERE item_id IS NOT NULL;

-- ── Carga inicial: lo eliminado en la limpieza de Pendientes (2026-09-21) ────
-- 1) Aperturas que quedaron huérfanas al borrar el cliente (client_id en NULL)
INSERT INTO client_descartes (item_id, nombre, motivo)
SELECT DISTINCT o.item_id, o.folder_name, 'limpieza pendientes 2026-09-21'
FROM account_openings o
WHERE o.client_id IS NULL
  AND o.status NOT IN ('cuenta_abierta', 'descartado')
  AND NOT EXISTS (SELECT 1 FROM client_descartes d WHERE d.item_id IS NOT DISTINCT FROM o.item_id AND d.nombre = o.folder_name);

-- 2) Legajos de Banco Central cuyo cliente ya no existe
INSERT INTO client_descartes (client_number, nombre, motivo)
SELECT DISTINCT b.customer_number, coalesce(b.nombre_cliente, b.folder_name), 'limpieza pendientes 2026-09-21'
FROM banco_central_records b
WHERE b.linked_client_id IS NULL
  AND b.customer_number IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.client_number = b.customer_number)
  AND NOT EXISTS (SELECT 1 FROM client_descartes d WHERE d.client_number = b.customer_number);

-- 3) Las aperturas huérfanas dejan de figurar como activas
UPDATE account_openings
SET status = 'descartado', updated_at = now()
WHERE client_id IS NULL
  AND status NOT IN ('cuenta_abierta', 'descartado');
