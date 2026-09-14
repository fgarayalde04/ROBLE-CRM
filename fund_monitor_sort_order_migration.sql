-- Orden explícito igual al de las filas del Excel original — reemplaza el
-- orden alfabético por categoría/subcategoría/nombre, que no respetaba cómo
-- estaba armado el monitor a mano.
ALTER TABLE fund_monitor_funds ADD COLUMN IF NOT EXISTS sort_order integer;
CREATE INDEX IF NOT EXISTS fund_monitor_funds_sort_order_idx ON fund_monitor_funds(sort_order);
