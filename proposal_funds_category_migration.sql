-- Categoría de activo del fondo (Acciones / Balanceado / Bonos), distinta de
-- fund_class (que es la clase de participación, ej. "A", "Institucional").
ALTER TABLE proposal_funds ADD COLUMN IF NOT EXISTS fund_category TEXT;
