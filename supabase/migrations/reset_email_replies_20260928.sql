-- ============================================================
-- Borrado único de las respuestas de clientes (2026-09-28): se arranca de
-- cero con el aviso de respuestas en trading@. Corre una sola vez por base
-- (queda registrada en schema_migrations), después de email_replies.sql.
-- mail_watch_state no se toca: el historyId sigue avanzando, así que las
-- respuestas borradas no se vuelven a importar.
-- ============================================================

delete from notifications where notif_type = 'cliente_respondio';
delete from email_replies;
