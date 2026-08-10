import { pool } from './pool'

export async function listPersonalFiles(userId: string) {
  const { rows } = await pool.query(
    `select * from personal_files where user_id = $1 order by created_at desc`,
    [userId]
  )
  return rows
}

export async function getPersonalFile(id: string, userId: string) {
  const { rows } = await pool.query(
    `select * from personal_files where id = $1 and user_id = $2`,
    [id, userId]
  )
  return rows[0] ?? null
}

export async function createPersonalFile(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const { rows } = await pool.query(
    `insert into personal_files (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function renamePersonalFile(id: string, userId: string, fileName: string) {
  const { rows } = await pool.query(
    `update personal_files set file_name = $1 where id = $2 and user_id = $3 returning *`,
    [fileName, id, userId]
  )
  return rows[0] ?? null
}

export async function deletePersonalFile(id: string) {
  await pool.query(`delete from personal_files where id = $1`, [id])
}
