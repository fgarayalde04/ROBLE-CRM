-- ============================================================
-- Segundo borrado único de las respuestas de clientes (2026-09-28, tarde):
-- se limpian las respuestas de prueba de Apruebo / No apruebo; desde acá la
-- bandeja se usa de verdad. Corre una sola vez por base (schema_migrations).
-- mail_watch_state no se toca: el historyId sigue avanzando, así que las
-- respuestas borradas no se vuelven a importar. El estado de las órdenes
-- tampoco se toca.
-- ============================================================

delete from notifications where notif_type = 'cliente_respondio';
delete from email_replies;
