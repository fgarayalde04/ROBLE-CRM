import { pool } from './pool'

export async function getCuadernoEntry(userName: string, date: string) {
  const { rows } = await pool.query(
    `select * from cuaderno where user_name = $1 and entry_date = $2`,
    [userName, date]
  )
  return rows[0] ?? null
}

export async function upsertCuadernoEntry(userName: string, entryDate: string, notes: string, items: any[]) {
  const { rows } = await pool.query(
    `insert into cuaderno (user_name, entry_date, notes, items, updated_at)
     values ($1, $2, $3, $4::jsonb, now())
     on conflict (user_name, entry_date) do update set
       notes = excluded.notes, items = excluded.items, updated_at = excluded.updated_at
     returning *`,
    [userName, entryDate, notes, JSON.stringify(items)]
  )
  return rows[0]
}

export async function getCuadernoItems(userName: string, date: string) {
  const { rows: own } = await pool.query(
    `select * from cuaderno_items where owner_name = $1 and entry_date = $2 order by position`,
    [userName, date]
  )
  const { rows: shared } = await pool.query(
    `select * from cuaderno_items where entry_date = $1 and shared_with @> $2::text[] order by created_at`,
    [date, [userName]]
  )
  const map = new Map<string, any>()
  for (const it of [...own, ...shared]) map.set(it.id, it)
  return Array.from(map.values())
}

export async function listOtherUsers(excludeName: string) {
  const { rows } = await pool.query(
    `select name from crm_users where name != $1 order by name`,
    [excludeName]
  )
  return rows.map((r) => r.name).filter(Boolean)
}

export async function createCuadernoItem(input: {
  ownerName: string; entryDate: string; title: string; comments: string; sharedWith: string[]; position: number
}) {
  const { rows } = await pool.query(
    `insert into cuaderno_items (owner_name, entry_date, title, comments, shared_with, position)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [input.ownerName, input.entryDate, input.title, input.comments, input.sharedWith, input.position]
  )
  return rows[0]
}

export async function updateCuadernoItem(id: string, ownerName: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id, ownerName)
  const { rows } = await pool.query(
    `update cuaderno_items set ${setClause.join(', ')} where id = $${values.length - 1} and owner_name = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteCuadernoItem(id: string, ownerName: string) {
  await pool.query(`delete from cuaderno_items where id = $1 and owner_name = $2`, [id, ownerName])
}
