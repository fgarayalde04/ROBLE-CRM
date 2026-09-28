-- ============================================================
-- Operador = quien ejecutó la orden. Completa las órdenes ya ejecutadas cuyo
-- operador no coincide con quien la ejecutó. Corre una sola vez por base
-- (schema_migrations).
-- ============================================================

update solicitudes s
   set operador    = s.ejecutado_by,
       operador_id = coalesce((select u.id from crm_users u where u.name = s.ejecutado_by limit 1), s.operador_id)
 where s.ejecutado_by is not null
   and s.operador is distinct from s.ejecutado_by;
