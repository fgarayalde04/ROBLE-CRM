-- ============================================================
-- Aprobación del cliente directo desde el mail (sin página).
-- aprobacion_token pasa a ser una referencia corta que va en la respuesta
-- armada por los botones Apruebo / No apruebo; email_replies admite el nuevo
-- método de asociación 'referencia'. Estados nuevos de la orden:
-- aprobada_cliente / rechazada_cliente (solicitudes.estado es texto libre).
-- Idempotente.
-- ============================================================

alter table email_replies drop constraint if exists email_replies_match_method_check;
alter table email_replies add constraint email_replies_match_method_check
  check (match_method in ('thread_id', 'referencia', 'subject_fallback', 'unmatched'));
