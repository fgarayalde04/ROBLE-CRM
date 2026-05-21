-- ============================================================
-- schema_compliance_v2.sql
-- Migra client_compliance de booleanos a estados de texto:
-- falta | pedido | recibido | revisado | vencido
-- ============================================================

-- 1. Cambiar tipo de columnas de boolean a text
ALTER TABLE client_compliance
  ALTER COLUMN ficha_cliente TYPE TEXT USING (CASE WHEN ficha_cliente THEN 'recibido' ELSE 'falta' END),
  ALTER COLUMN perfil_inversor TYPE TEXT USING (CASE WHEN perfil_inversor THEN 'recibido' ELSE 'falta' END),
  ALTER COLUMN cedula TYPE TEXT USING (CASE WHEN cedula THEN 'recibido' ELSE 'falta' END),
  ALTER COLUMN documentos_legales TYPE TEXT USING (CASE WHEN documentos_legales THEN 'recibido' ELSE 'falta' END),
  ALTER COLUMN cuestionario_asesor TYPE TEXT USING (CASE WHEN cuestionario_asesor THEN 'recibido' ELSE 'falta' END);

-- 2. Valores por defecto
ALTER TABLE client_compliance
  ALTER COLUMN ficha_cliente SET DEFAULT 'falta',
  ALTER COLUMN perfil_inversor SET DEFAULT 'falta',
  ALTER COLUMN cedula SET DEFAULT 'falta',
  ALTER COLUMN documentos_legales SET DEFAULT 'falta',
  ALTER COLUMN cuestionario_asesor SET DEFAULT 'falta';

-- 3. Agregar restricciones de dominio
ALTER TABLE client_compliance
  ADD CONSTRAINT check_ficha_cliente CHECK (ficha_cliente IN ('falta','pedido','recibido','revisado','vencido')),
  ADD CONSTRAINT check_perfil_inversor CHECK (perfil_inversor IN ('falta','pedido','recibido','revisado','vencido')),
  ADD CONSTRAINT check_cedula CHECK (cedula IN ('falta','pedido','recibido','revisado','vencido')),
  ADD CONSTRAINT check_documentos_legales CHECK (documentos_legales IN ('falta','pedido','recibido','revisado','vencido')),
  ADD CONSTRAINT check_cuestionario_asesor CHECK (cuestionario_asesor IN ('falta','pedido','recibido','revisado','vencido'));

-- 4. Migrar historial (old_value/new_value eran boolean, los dejamos como text tambien)
ALTER TABLE client_compliance_history
  ALTER COLUMN old_value TYPE TEXT USING old_value::TEXT,
  ALTER COLUMN new_value TYPE TEXT USING new_value::TEXT;

-- 5. Agregar columna advisor a clients si no existe
ALTER TABLE clients ADD COLUMN IF NOT EXISTS advisor TEXT;
