import { pool } from './pool'

export async function listSecrets() {
  const { rows } = await pool.query(`select * from secrets_vault order by service_name asc`)
  return rows
}

export async function createSecret(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const { rows } = await pool.query(
    `insert into secrets_vault (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function updateSecret(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update secrets_vault set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteSecret(id: string) {
  await pool.query(`delete from secrets_vault where id = $1`, [id])
}
