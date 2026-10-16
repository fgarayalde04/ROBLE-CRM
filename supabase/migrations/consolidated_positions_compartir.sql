-- Portafolios armados: compartir con otros asesores.
-- Lo ven quien lo armó, dirección y los usuarios de shared_with_ids.
alter table consolidated_positions add column if not exists shared_with_ids uuid[] not null default '{}';
create index if not exists consolidated_positions_shared_idx on consolidated_positions using gin (shared_with_ids);
