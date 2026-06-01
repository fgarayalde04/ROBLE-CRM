-- Audit log for OneDrive document operations
CREATE TABLE IF NOT EXISTS document_activity (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  action      text        NOT NULL,   -- upload | download | delete | rename | mkdir | move | view
  item_id     text,
  item_name   text,
  item_type   text,                   -- file | folder
  folder_id   text,
  drive_id    text,
  details     jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_activity_user    ON document_activity (user_id);
CREATE INDEX IF NOT EXISTS idx_document_activity_created ON document_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_activity_item    ON document_activity (item_id) WHERE item_id IS NOT NULL;
