import { pool } from './pool'

export async function logActivity(input: {
  entity_type: string
  entity_id: string | null
  action: string
  description: string
  user_name: string | null
}) {
  await pool.query(
    `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
    [input.entity_type, input.entity_id, input.action, input.description, input.user_name]
  )
}

export async function listActivityLogByAction(action: string, limit: number) {
  const { rows } = await pool.query(
    `select id, description, created_at, user_name as created_by
     from activity_log where action = $1 order by created_at desc limit $2`,
    [action, limit]
  )
  return rows
}

export async function logDocumentActivity(input: {
  user_id: string | null
  action: string
  item_id: string | null
  item_name: string | null
  item_type: string | null
  folder_id: string | null
  drive_id: string | null
  details?: unknown
}) {
  await pool.query(
    `insert into document_activity (user_id, action, item_id, item_name, item_type, folder_id, drive_id, details)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.user_id, input.action, input.item_id, input.item_name, input.item_type,
      input.folder_id, input.drive_id, input.details !== undefined ? JSON.stringify(input.details) : null,
    ]
  )
}
