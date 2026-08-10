import { pool } from './pool'

export async function upsertGoogleConnection(record: {
  user_email: string
  access_token: string
  refresh_token: string | null
  expires_at: number
  google_email: string | null
  google_name: string | null
}) {
  await pool.query(
    `insert into google_connections (user_email, access_token, refresh_token, expires_at, google_email, google_name, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (user_email) do update set
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       google_email = excluded.google_email,
       google_name = excluded.google_name,
       updated_at = now()`,
    [record.user_email, record.access_token, record.refresh_token, record.expires_at, record.google_email, record.google_name]
  )
}

export async function getGoogleConnection(userEmail: string) {
  const { rows } = await pool.query(
    `select access_token, refresh_token, expires_at, google_email, google_name
     from google_connections where user_email = $1`,
    [userEmail]
  )
  return rows[0] ?? null
}

export async function hasGoogleConnectionRecord(userEmail: string) {
  const { rows } = await pool.query(
    `select user_email from google_connections where user_email = $1`,
    [userEmail]
  )
  return rows.length > 0
}
