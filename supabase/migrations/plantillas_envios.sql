-- Plantillas → envíos por mail a clientes (copia oculta, PDF adjunto).
create table if not exists plantillas_envios (
  id             uuid primary key default gen_random_uuid(),
  documento_id   uuid references plantillas_documentos(id) on delete set null,
  titulo         text,
  asunto         text not null,
  destinatarios  jsonb not null default '[]'::jsonb,  -- [{ client_id, nombre, email }]
  cantidad       int not null default 0,
  enviado_por    text,
  enviado_por_id uuid,
  created_at     timestamptz not null default now()
);

create index if not exists idx_plantillas_envios_doc on plantillas_envios (documento_id, created_at desc);
