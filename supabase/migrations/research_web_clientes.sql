-- Research & Novedades → web de clientes: cada publicación con PDF se puede
-- mandar (a mano, con un botón) a una sección de research de la web de clientes.
alter table research_posts add column if not exists web_document_id text;
alter table research_posts add column if not exists web_section text;
alter table research_posts add column if not exists web_subsection text;
alter table research_posts add column if not exists web_publicado_at timestamptz;
