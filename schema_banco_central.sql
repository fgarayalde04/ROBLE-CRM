-- ============================================================
-- Migración banco_central_records
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Renombrar columnas existentes
ALTER TABLE banco_central_records RENAME COLUMN ficha_cliente       TO ficha;
ALTER TABLE banco_central_records RENAME COLUMN cuestionario_asesor TO cuestionario;
ALTER TABLE banco_central_records RENAME COLUMN cedula              TO ci;

-- 2. Eliminar columna que ya no se usa
ALTER TABLE banco_central_records DROP COLUMN IF EXISTS perfil_inversor;
ALTER TABLE banco_central_records DROP COLUMN IF EXISTS perfil_de_riesgo;

-- 3. Agregar columnas nuevas
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS lista_verificacion BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS cumplo              BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE banco_central_records ADD COLUMN IF NOT EXISTS comentario          TEXT;
