import { pool } from './pool'
import type { Deadline, Client } from '@/types/platform'

const CLIENT_JOIN = `left join clients c on c.id = t.client_id`
const CLIENT_SELECT = `c.id as "client__id", c.first_name as "client__first_name", c.last_name as "client__last_name", c.client_number as "client__client_number"`

function shapeRow(row: any) {
  const { client__id, client__first_name, client__last_name, client__client_number, ...rest } = row
  return {
    ...rest,
    client: client__id
      ? { id: client__id, first_name: client__first_name, last_name: client__last_name, client_number: client__client_number }
      : null,
  }
}

export interface ListDeadlinesFilters {
  clientId?: string
  status?: string
  category?: string
  responsible?: string
  from?: string
  to?: string
  search?: string
}

export async function getDeadlines(filters: ListDeadlinesFilters = {}) {
  const where: string[] = []
  const params: any[] = []

  if (filters.clientId) { params.push(filters.clientId); where.push(`t.client_id = $${params.length}`) }
  if (filters.status) { params.push(filters.status); where.push(`t.status = $${params.length}`) }
  if (filters.category) { params.push(filters.category); where.push(`t.category = $${params.length}`) }
  if (filters.responsible) { params.push(filters.responsible); where.push(`t.responsible = $${params.length}`) }
  if (filters.from) { params.push(filters.from); where.push(`t.due_date >= $${params.length}`) }
  if (filters.to) { params.push(filters.to); where.push(`t.due_date <= $${params.length}`) }
  if (filters.search) { params.push(`%${filters.search}%`); where.push(`t.title ilike $${params.length}`) }

  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select t.*, ${CLIENT_SELECT} from deadlines t ${CLIENT_JOIN} ${whereClause} order by t.due_date asc`,
    params
  )
  return rows.map(shapeRow) as (Deadline & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null })[]
}

export async function createDeadline(deadline: Record<string, any>) {
  const entries = Object.entries(deadline).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)

  const { rows } = await pool.query(
    `insert into deadlines (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  const data = rows[0] as Deadline
  await logActivity('deadline', data.id, 'crear', `Vencimiento "${deadline.title}" creado`)
  return data
}

export async function updateDeadline(id: string, updates: Record<string, any>) {
  const { client, ...safeUpdates } = updates
  const entries = Object.entries(safeUpdates).filter(([, v]) => v !== undefined)
  if (entries.length === 0) {
    const { rows } = await pool.query(`select * from deadlines where id = $1`, [id])
    if (rows.length === 0) throw new Error('Deadline not found')
    return rows[0] as Deadline
  }
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `update deadlines set ${setClause.join(', ')} where id = $${entries.length + 1} returning *`,
    [...values, id]
  )
  if (rows.length === 0) throw new Error('Deadline not found')
  return rows[0] as Deadline
}

export async function deleteDeadline(id: string) {
  await pool.query(`delete from deadlines where id = $1`, [id])
}

async function logActivity(entityType: string, entityId: string, action: string, description: string, userName?: string | null) {
  await pool.query(
    `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
    [entityType, entityId, action, description, userName ?? null]
  )
}
