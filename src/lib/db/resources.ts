import { pool } from './pool'

export async function resourcesTableExists() {
  try {
    await pool.query(`select id from resources limit 1`)
    return true
  } catch {
    return false
  }
}

export async function listResources(filters: { category?: string; q?: string; featured?: boolean } = {}) {
  const where: string[] = []
  const params: any[] = []
  if (filters.category) { params.push(filters.category); where.push(`category = $${params.length}`) }
  if (filters.featured) where.push(`is_featured = true`)
  if (filters.q) {
    params.push(`%${filters.q}%`)
    where.push(`(name ilike $${params.length} or description ilike $${params.length} or company ilike $${params.length})`)
  }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select * from resources ${whereClause} order by created_at desc`,
    params
  )
  return rows
}

export async function getResource(id: string) {
  const { rows } = await pool.query(`select * from resources where id = $1`, [id])
  return rows[0] ?? null
}

export async function createResource(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const { rows } = await pool.query(
    `insert into resources (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function updateResource(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update resources set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteResource(id: string) {
  await pool.query(`delete from resources where id = $1`, [id])
}

export async function incrementResourceViews(id: string) {
  const { rows } = await pool.query(
    `update resources set view_count = coalesce(view_count, 0) + 1 where id = $1 returning view_count`,
    [id]
  )
  return rows[0]?.view_count ?? null
}
