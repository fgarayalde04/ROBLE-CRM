import { pool } from './pool'

export async function searchInstruments(q: string | null, tipo: string | null, limit: number, all: boolean) {
  const where: string[] = [`activo = true`]
  const params: any[] = []
  if (tipo) { params.push(tipo); where.push(`tipo_activo = $${params.length}`) }
  if (q) {
    params.push(`%${q}%`)
    where.push(`(nombre ilike $${params.length} or isin ilike $${params.length} or cusip ilike $${params.length} or ticker ilike $${params.length} or emisor ilike $${params.length})`)
  }
  params.push(all ? 500 : limit)
  const { rows } = await pool.query(
    `select * from instrument_master where ${where.join(' and ')} order by nombre asc limit $${params.length}`,
    params
  )
  return rows
}

export async function createInstrument(record: Record<string, any>) {
  const entries = Object.entries(record).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `insert into instrument_master (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function updateInstrument(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update instrument_master set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function findInstrumentByIsin(isin: string) {
  const { rows } = await pool.query(`select id from instrument_master where isin = $1`, [isin])
  return rows[0] ?? null
}

export async function findInstrumentByCusip(cusip: string) {
  const { rows } = await pool.query(`select id from instrument_master where cusip = $1`, [cusip])
  return rows[0] ?? null
}
