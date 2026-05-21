-- ============================================================
-- SCHEMA V3 — Apertura de cuentas + mejoras
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Actualizar constraint de status en clients (agrega en_apertura, cerrado, descartado)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN (
    'activo', 'en_apertura', 'cerrado', 'prospecto',
    'inactivo', 'descartado', 'pendiente_documentacion', 'en_revision'
  ));

-- 2. Nuevas carpetas (pre-sincronización OneDrive)
CREATE TABLE IF NOT EXISTS new_folders (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  folder_name    text NOT NULL,
  onedrive_url   text,
  detected_at    date NOT NULL DEFAULT CURRENT_DATE,
  status         text NOT NULL DEFAULT 'pendiente'
                   CHECK (status IN ('pendiente', 'en_proceso', 'ignorada', 'archivada')),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3. Procesos de apertura de cuenta
CREATE TABLE IF NOT EXISTS account_openings (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  folder_name  text NOT NULL,
  onedrive_url text,
  advisor      text,
  start_date   date NOT NULL DEFAULT CURRENT_DATE,
  opened_date  date,
  status       text NOT NULL DEFAULT 'nueva_carpeta'
                 CHECK (status IN (
                   'nueva_carpeta', 'en_contacto', 'documentacion_solicitada',
                   'documentacion_recibida', 'formularios_enviados', 'formularios_firmados',
                   'en_revision', 'cuenta_abierta', 'descartada'
                 )),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 4. Checklist de apertura
CREATE TABLE IF NOT EXISTS opening_checklist_items (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  opening_id  uuid NOT NULL REFERENCES account_openings(id) ON DELETE CASCADE,
  title       text NOT NULL,
  completed   boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  responsible text,
  note        text,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 5. Checklist de pendientes/tareas
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title        text NOT NULL,
  completed    boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 6. Trigger updated_at para account_openings
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS account_openings_updated_at ON account_openings;
CREATE TRIGGER account_openings_updated_at
  BEFORE UPDATE ON account_openings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
