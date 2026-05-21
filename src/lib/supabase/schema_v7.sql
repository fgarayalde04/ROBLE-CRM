-- schema_v7.sql — Apertura de cuentas: nuevos estados, prioridad, fechas, notas, tareas, documentos

-- Add new columns to account_openings
ALTER TABLE account_openings
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('baja', 'normal', 'alta', 'urgente')),
  ADD COLUMN IF NOT EXISTS documentation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_bank_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_opened_at timestamptz;

-- Remove old status constraint and add new one
ALTER TABLE account_openings DROP CONSTRAINT IF EXISTS account_openings_status_check;
ALTER TABLE account_openings ADD CONSTRAINT account_openings_status_check
  CHECK (status IN (
    'carpeta_creada',
    'recolectando_informacion',
    'documentacion_incompleta',
    'documentacion_completa',
    'formularios_enviados',
    'enviado_al_banco',
    'en_revision_banco',
    'cuenta_abierta',
    'trabado',
    'descartado'
  ));

-- Opening actionable notes
CREATE TABLE IF NOT EXISTS opening_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id uuid NOT NULL REFERENCES account_openings(id) ON DELETE CASCADE,
  text text NOT NULL,
  author text,
  status text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'cerrada')),
  closed_at timestamptz,
  closed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Opening tasks
CREATE TABLE IF NOT EXISTS opening_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id uuid NOT NULL REFERENCES account_openings(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  responsible text,
  due_date date,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('baja', 'normal', 'alta', 'urgente')),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_proceso', 'bloqueada', 'completada')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Opening documents
CREATE TABLE IF NOT EXISTS opening_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id uuid NOT NULL REFERENCES account_openings(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  link text,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'recibido', 'aprobado', 'rechazado')),
  expiry_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
