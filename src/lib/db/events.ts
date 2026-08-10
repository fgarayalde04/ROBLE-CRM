import { pool } from './pool'
import type { Event, Client } from '@/types/platform'

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

export interface ListEventsFilters {
  clientId?: string
  from?: string
  to?: string
  type?: string
}

export async function getEvents(filters: ListEventsFilters = {}) {
  const where: string[] = []
  const params: any[] = []

  if (filters.clientId) { params.push(filters.clientId); where.push(`t.client_id = $${params.length}`) }
  if (filters.type) { params.push(filters.type); where.push(`t.type = $${params.length}`) }
  if (filters.from) { params.push(filters.from); where.push(`t.event_date >= $${params.length}`) }
  if (filters.to) { params.push(filters.to); where.push(`t.event_date <= $${params.length}`) }

  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select t.*, ${CLIENT_SELECT} from events t ${CLIENT_JOIN} ${whereClause} order by t.event_date asc, t.start_time asc`,
    params
  )
  return rows.map(shapeRow) as (Event & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null })[]
}

export async function createEvent(event: Record<string, any>) {
  const entries = Object.entries(event).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)

  const { rows } = await pool.query(
    `insert into events (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0] as Event
}

export async function updateEvent(id: string, updates: Record<string, any>) {
  const { client, ...safeUpdates } = updates
  const entries = Object.entries(safeUpdates).filter(([, v]) => v !== undefined)
  if (entries.length === 0) {
    const { rows } = await pool.query(`select * from events where id = $1`, [id])
    if (rows.length === 0) throw new Error('Event not found')
    return rows[0] as Event
  }
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `update events set ${setClause.join(', ')} where id = $${entries.length + 1} returning *`,
    [...values, id]
  )
  if (rows.length === 0) throw new Error('Event not found')
  return rows[0] as Event
}

export async function deleteEvent(id: string) {
  await pool.query(`delete from events where id = $1`, [id])
}
