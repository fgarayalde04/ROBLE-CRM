-- Research → Plantillas: documentos con formato fijo (ficha de bono, análisis de
-- bonos). Solo se guardan los datos que completa el usuario; el diseño vive en
-- el código (src/components/plantillas).
create table if not exists plantillas_documentos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null,
  titulo         text not null,
  datos          jsonb not null default '{}'::jsonb,
  created_by     text,
  created_by_id  uuid,
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_plantillas_documentos_updated on plantillas_documentos (updated_at desc);
