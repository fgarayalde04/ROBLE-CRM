-- Portafolio: el total de cada snapshot (portfolio_imports.total_market_value)
-- pasa a incluir el cupón corrido (accrued interest) de las posiciones.
-- Los imports nuevos ya lo guardan así; esto ajusta los snapshots viejos para
-- que el historial, la lista de cuentas y la variación no salten.
-- Solo datos, sin cambio de esquema. Idempotente: toca únicamente snapshots
-- cuyo total todavía es igual a la suma del market value de sus posiciones.
update portfolio_imports pi
set total_market_value = s.mv + s.accrued
from (
  select import_id,
         sum(market_value) as mv,
         sum(coalesce(accrued_interest, 0)) as accrued
  from portfolio_positions_snapshot
  group by import_id
) s
where s.import_id = pi.id
  and s.accrued <> 0
  and abs(pi.total_market_value - s.mv) < 0.01;
