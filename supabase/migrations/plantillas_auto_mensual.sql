-- Plantillas que se arman solas a fin de mes (fondos y bonos más comprados):
-- auto_periodo = 'YYYY-MM' del mes que cubren. Un solo borrador automático por
-- tipo y mes, aunque el aviso se dispare varias veces (reinicios, réplicas).
alter table plantillas_documentos add column if not exists auto_periodo text;
create unique index if not exists uq_plantillas_auto_periodo
  on plantillas_documentos (tipo, auto_periodo) where auto_periodo is not null;
