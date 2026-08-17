import { pool } from './pool'

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  enabled: boolean
  created_at: string
  updated_at: string
  last_used_at: string | null
}

// Upsert by endpoint — a device re-subscribing (e.g. after clearing permission) gets the same row.
export async function upsertPushSubscription(input: {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
}) {
  const { rows } = await pool.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, enabled, updated_at)
     values ($1, $2, $3, $4, $5, true, now())
     on conflict (endpoint) do update set
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       enabled = true,
       updated_at = now()
     returning *`,
    [input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent]
  )
  return rows[0] as PushSubscriptionRow
}

// Disable (not delete) a subscription for a given user + endpoint — used by "Desactivar".
export async function disablePushSubscription(userId: string, endpoint: string) {
  await pool.query(
    `update push_subscriptions set enabled = false, updated_at = now() where user_id = $1 and endpoint = $2`,
    [userId, endpoint]
  )
}

export async function listEnabledSubscriptionsForUser(userId: string) {
  const { rows } = await pool.query(
    `select * from push_subscriptions where user_id = $1 and enabled = true order by created_at asc`,
    [userId]
  )
  return rows as PushSubscriptionRow[]
}

export async function getSubscriptionStateForUser(userId: string) {
  const { rows } = await pool.query(
    `select count(*) filter (where enabled) as active from push_subscriptions where user_id = $1`,
    [userId]
  )
  return parseInt(rows[0]?.active ?? '0', 10) > 0
}

export async function markSubscriptionUsed(id: string) {
  await pool.query(`update push_subscriptions set last_used_at = now() where id = $1`, [id])
}

// Called when the push provider says the endpoint no longer exists (404/410) — stop retrying it.
export async function deactivateSubscriptionById(id: string) {
  await pool.query(`update push_subscriptions set enabled = false, updated_at = now() where id = $1`, [id])
}
