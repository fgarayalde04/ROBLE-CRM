-- Plantillas → web de clientes: cada documento se publica (y actualiza) como
-- un Reporte en la web de clientes.
alter table plantillas_documentos add column if not exists web_publicar boolean not null default false;
alter table plantillas_documentos add column if not exists web_report_id text;
alter table plantillas_documentos add column if not exists web_file_path text;
alter table plantillas_documentos add column if not exists web_publicado_at timestamptz;
