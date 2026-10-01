-- Plantillas → Research & Novedades: cada documento se publica (y se mantiene
-- actualizado) como una publicación de Research con el PDF adjunto.
alter table plantillas_documentos add column if not exists research_type text;
alter table plantillas_documentos add column if not exists research_post_id uuid;
alter table plantillas_documentos add column if not exists research_publicado_at timestamptz;
