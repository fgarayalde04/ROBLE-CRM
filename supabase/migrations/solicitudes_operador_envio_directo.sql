-- ============================================================
-- Envío directo del asesor: el asesor que manda el mail queda como operador
-- (antes quedaba vacío). Completa las órdenes que ya existían. Corre una sola
-- vez por base (schema_migrations).
-- ============================================================

update solicitudes
   set operador    = asesor,
       operador_id = asesor_id,
       tomado_at   = coalesce(tomado_at, mail_enviado_at, created_at)
 where canal = 'directo_asesor'
   and operador is null;
