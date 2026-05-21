CREATE TABLE IF NOT EXISTS client_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ficha_cliente boolean NOT NULL DEFAULT false,
  perfil_inversor boolean NOT NULL DEFAULT false,
  cedula boolean NOT NULL DEFAULT false,
  documentos_legales boolean NOT NULL DEFAULT false,
  cuestionario_asesor boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'incompleto' CHECK (status IN ('completo','incompleto','revisar')),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  UNIQUE(client_id)
);

CREATE TABLE IF NOT EXISTS client_compliance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value boolean,
  new_value boolean,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
