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
  event_count: number
}

// Notifications sharing the same (entity_type, entity_id) collapse into a single
// list entry — e.g. 5 events on the same order show as one row, not five.
// Rows without an entity_id (older/ungrouped notifications) each keep their own
// group, keyed by their own id, so they display exactly as before.
const GROUP_KEY = `coalesce(entity_type || ':' || entity_id, 'row:' || id::text)`

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
// Each group's representative row is the most recent one in that group; the
// group counts as unread if ANY row in it is unread.
export async function listNotificationsForUser(userId: string, userName: string, limit = 30) {
  const { rows } = await pool.query(
    `with scoped as (
       select *, ${GROUP_KEY} as group_key
       from notifications where user_id = $1 or user_name = $2
     )
     select
       (array_agg(id order by created_at desc))[1] as id,
       (array_agg(user_id order by created_at desc))[1] as user_id,
       (array_agg(user_name order by created_at desc))[1] as user_name,
       (array_agg(title order by created_at desc))[1] as title,
       (array_agg(message order by created_at desc))[1] as message,
       (array_agg(entity_type order by created_at desc))[1] as entity_type,
       (array_agg(entity_id order by created_at desc))[1] as entity_id,
       (array_agg(notif_type order by created_at desc))[1] as notif_type,
       (array_agg(client_name order by created_at desc))[1] as client_name,
       (array_agg(url order by created_at desc))[1] as url,
       case when bool_or(read_at is null) then null else max(read_at) end as read_at,
       max(created_at) as created_at,
       count(*) as event_count
     from scoped
     group by group_key
     order by max(created_at) desc
     limit $3`,
    [userId, userName, limit]
  )
  return rows.map((r) => ({ ...r, event_count: Number(r.event_count) })) as NotificationRow[]
}

export async function getUnreadCount(userId: string, userName: string) {
  const { rows } = await pool.query(
    `with scoped as (
       select *, ${GROUP_KEY} as group_key
       from notifications where (user_id = $1 or user_name = $2)
     )
     select count(*) from (
       select group_key from scoped group by group_key having bool_or(read_at is null)
     ) unread_groups`,
    [userId, userName]
  )
  return parseInt(rows[0].count, 10)
}

// Marking a grouped entry as read marks every underlying row in that group
// (same entity_type + entity_id, for this user) as read — not just the one
// row whose id was clicked.
export async function markNotificationRead(id: string, userId: string, userName: string) {
  const { rows: targetRows } = await pool.query(
    `select entity_type, entity_id from notifications where id = $1 and (user_id = $2 or user_name = $3)`,
    [id, userId, userName]
  )
  if (targetRows.length === 0) return null
  const { entity_type, entity_id } = targetRows[0]

  if (entity_id) {
    const { rows } = await pool.query(
      `update notifications set read_at = now()
       where entity_type = $1 and entity_id = $2 and (user_id = $3 or user_name = $4) and read_at is null
       returning *`,
      [entity_type, entity_id, userId, userName]
    )
    return (rows[0] as NotificationRow) ?? null
  }

  const { rows } = await pool.query(
    `update notifications set read_at = now()
     where id = $1 and (user_id = $2 or user_name = $3) and read_at is null
     returning *`,
    [id, userId, userName]
  )
  return (rows[0] as NotificationRow) ?? null
}
