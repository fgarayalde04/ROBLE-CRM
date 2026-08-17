-- Research & Novedades — feed de lectura interno + Morning Brief
-- Ejecutado directamente contra Postgres de Railway (documentación, igual que
-- push_notifications_migration.sql).

create table if not exists research_posts (
  id uuid primary key default gen_random_uuid(),
  type text not null, -- 'morning_brief' | 'noticia_mercado' | 'bono' | 'fondo' | 'nueva_emision' | 'research' | 'macro' | 'regulacion' | 'novedad_interna'
  title text not null,
  category text,
  summary text,
  body text,

  -- Morning Brief (type = 'morning_brief')
  brief_date date,
  sections jsonb,      -- { mercados, estados_unidos, europa, latam, renta_fija, fondos, commodities, que_mirar_hoy }
                        -- cada sección: { text: string, sources: [{ title, source, url }] } | null si no aplica ese día
  headlines text[],     -- 3-5 titulares para el Panel del Día

  -- adjuntos / enlaces
  file_url text,
  file_name text,
  link_url text,
  author text,

  -- campos opcionales de bono/fondo
  issuer text,
  isin text,
  currency text,
  coupon text,
  maturity date,
  yield_value text,
  fund_class text,
  factsheet_url text,
  termsheet_url text,
  internal_notes text,

  pinned boolean not null default false,
  featured boolean not null default false,
  archived boolean not null default false,

  created_by uuid references crm_users(id),
  created_by_name text,

  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_posts_type on research_posts(type);
create index if not exists idx_research_posts_published on research_posts(published_at desc);
create index if not exists idx_research_posts_archived on research_posts(archived);
create unique index if not exists idx_research_posts_brief_date on research_posts(brief_date) where type = 'morning_brief';

create table if not exists research_reads (
  post_id uuid not null references research_posts(id) on delete cascade,
  user_id uuid not null references crm_users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
