import { pool } from './pool'

export interface NotificationInput {
  userId: string | null
  userName: string
  notifType: string
  title: string
  message: string
  clientName?: string | null
  entityType: string
  entityId?: string | null
  url?: string | null
}

export interface NotificationRow {
  id: string
  user_id: string | null
  user_name: string
  title: string
  message: string
  entity_type: string
  entity_id: string | null
  notif_type: string | null
  client_name: string | null
  url: string | null
  read_at: string | null
  created_at: string
}

// Insert, deduplicated by (entity_id, notif_type, user_name) — a repeated call for
// the same order + event + recipient is a silent no-op (returns null).
export async function createNotification(input: NotificationInput): Promise<NotificationRow | null> {
  const { rows } = await pool.query(
    `insert into notifications (user_id, user_name, title, message, entity_type, entity_id, notif_type, client_name, url)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (entity_id, notif_type, user_name) where entity_id is not null and notif_type is not null
     do nothing
     returning *`,
    [
      input.userId, input.userName, input.title, input.message, input.entityType,
      input.entityId ?? null, input.notifType, input.clientName ?? null, input.url ?? null,
    ]
  )
  return rows[0] ?? null
}

// Matches by user_id OR user_name so pre-existing notifications (written before
// user_id existed, e.g. task shares) keep showing up alongside new ones.
export async function listNotificationsForUser(userId: string, userName: string, limit = 30) {
  const { rows } = await pool.query(
    `select * from notifications where user_id = $1 or user_name = $2 order by created_at desc limit $3`,
    [userId, userName, limit]
  )
  return rows as NotificationRow[]
}

export async function getUnreadCount(userId: string, userName: string) {
  const { rows } = await pool.query(
    `select count(*) from notifications where (user_id = $1 or user_name = $2) and read_at is null`,
    [userId, userName]
  )
  return parseInt(rows[0].count, 10)
}

export async function markNotificationRead(id: string, userId: string, userName: string) {
  const { rows } = await pool.query(
    `update notifications set read_at = now()
     where id = $1 and (user_id = $2 or user_name = $3) and read_at is null
     returning *`,
    [id, userId, userName]
  )
  return (rows[0] as NotificationRow) ?? null
}
