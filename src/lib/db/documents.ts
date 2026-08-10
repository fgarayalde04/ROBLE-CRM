import { pool } from './pool'
import type { Document, Client } from '@/types/platform'

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

export interface ListDocumentsFilters {
  clientId?: string
  status?: string
  category?: string
  search?: string
}

export async function getDocuments(filters: ListDocumentsFilters = {}) {
  const where: string[] = []
  const params: any[] = []

  if (filters.clientId) { params.push(filters.clientId); where.push(`t.client_id = $${params.length}`) }
  if (filters.status) { params.push(filters.status); where.push(`t.status = $${params.length}`) }
  if (filters.category) { params.push(filters.category); where.push(`t.category = $${params.length}`) }
  if (filters.search) { params.push(`%${filters.search}%`); where.push(`t.name ilike $${params.length}`) }

  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select t.*, ${CLIENT_SELECT} from documents t ${CLIENT_JOIN} ${whereClause} order by t.updated_at desc`,
    params
  )
  return rows.map(shapeRow) as (Document & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null })[]
}

export async function getDocument(id: string) {
  const { rows } = await pool.query(
    `select t.*, ${CLIENT_SELECT} from documents t ${CLIENT_JOIN} where t.id = $1`,
    [id]
  )
  if (rows.length === 0) throw new Error('Document not found')
  return shapeRow(rows[0]) as Document & { client: Client | null }
}

export async function createDocument(doc: Record<string, any>) {
  const entries = Object.entries(doc).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)

  const { rows } = await pool.query(
    `insert into documents (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  const data = rows[0] as Document
  await logActivity('document', data.id, 'crear', `Documento "${doc.name}" creado`)
  return data
}

export async function updateDocument(id: string, updates: Record<string, any>) {
  const { client, ...safeUpdates } = updates
  const entries = Object.entries(safeUpdates).filter(([, v]) => v !== undefined)
  if (entries.length === 0) {
    const { rows } = await pool.query(`select * from documents where id = $1`, [id])
    if (rows.length === 0) throw new Error('Document not found')
    return rows[0] as Document
  }
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `update documents set ${setClause.join(', ')} where id = $${entries.length + 1} returning *`,
    [...values, id]
  )
  if (rows.length === 0) throw new Error('Document not found')
  return rows[0] as Document
}

export async function deleteDocument(id: string) {
  await pool.query(`delete from documents where id = $1`, [id])
}

async function logActivity(entityType: string, entityId: string, action: string, description: string, userName?: string | null) {
  await pool.query(
    `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
    [entityType, entityId, action, description, userName ?? null]
  )
}
