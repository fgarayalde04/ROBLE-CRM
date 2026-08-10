import { pool } from './pool'
import type { Client } from '@/types/platform'

export async function getNewLocalClients() {
  const { rows } = await pool.query(
    `select * from clients
     where status = 'prospecto' and onedrive_folder_url like '/%'
     order by created_at desc`
  )
  return rows as Client[]
}

export async function getClientsByOnedriveUrls(paths: string[]) {
  if (paths.length === 0) return []
  const { rows } = await pool.query(
    `select onedrive_folder_url from clients where onedrive_folder_url = ANY($1)`,
    [paths]
  )
  return rows
}

export async function createClientFromRecord(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const { rows } = await pool.query(
    `insert into clients (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function getClientsWithOnedriveFolder() {
  const { rows } = await pool.query(
    `select id, first_name, last_name, client_number, onedrive_folder_url, status
     from clients where onedrive_folder_url is not null`
  )
  return rows
}

export async function getClients(search?: string) {
  if (search) {
    const like = `%${search}%`
    const { rows } = await pool.query(
      `select * from clients
       where first_name ilike $1 or last_name ilike $1 or client_number ilike $1 or email ilike $1
       order by updated_at desc`,
      [like]
    )
    return rows as Client[]
  }
  const { rows } = await pool.query(`select * from clients order by updated_at desc`)
  return rows as Client[]
}

export async function searchActiveClients(q: string, limit = 20) {
  if (q) {
    const like = `%${q}%`
    const { rows } = await pool.query(
      `select id, first_name, last_name, client_number, status from clients
       where status = 'activo' and (first_name ilike $1 or last_name ilike $1 or client_number ilike $1)
       order by last_name limit $2`,
      [like, limit]
    )
    return rows
  }
  const { rows } = await pool.query(
    `select id, first_name, last_name, client_number, status from clients
     where status = 'activo' order by last_name limit $1`,
    [limit]
  )
  return rows
}

export async function getClient(id: string) {
  const { rows } = await pool.query(`select * from clients where id = $1`, [id])
  if (rows.length === 0) throw new Error('Client not found')
  return rows[0] as Client
}

export async function createClient(client: Omit<Client, 'id' | 'created_at' | 'updated_at'>) {
  const entries = Object.entries(client).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)

  const { rows } = await pool.query(
    `insert into clients (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  const data = rows[0] as Client
  await logActivity('client', data.id, 'crear', `Cliente ${client.first_name} ${client.last_name} creado`)
  return data
}

export async function updateClient(id: string, updates: Partial<Client>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return getClient(id)

  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)

  const { rows } = await pool.query(
    `update clients set ${setClause.join(', ')} where id = $${entries.length + 1} returning *`,
    [...values, id]
  )
  if (rows.length === 0) throw new Error('Client not found')
  const data = rows[0] as Client
  await logActivity('client', id, 'actualizar', `Cliente actualizado`)
  return data
}

export async function deleteClient(id: string) {
  await pool.query(`delete from clients where id = $1`, [id])
}

const LIST_COLUMNS =
  'id, first_name, last_name, status, advisor, phone, onedrive_folder_url, drive_id, item_id, web_url, updated_at, created_at, closed_at, closed_by, close_reason'

export interface ListClientsOptions {
  tab: 'activos' | 'cerrados' | 'pendientes' | 'todos'
  sort: 'nombre' | 'created_at' | 'updated_at'
  dir: 'asc' | 'desc'
  folderFilter?: string[] | null
  search?: string
  advisor?: string
}

export async function listClients(opts: ListClientsOptions) {
  const where: string[] = []
  const params: any[] = []

  if (opts.tab === 'activos') { params.push('activo'); where.push(`status = $${params.length}`) }
  else if (opts.tab === 'cerrados') { params.push('cerrado'); where.push(`status = $${params.length}`) }
  else if (opts.tab === 'pendientes') { params.push('pendiente'); where.push(`status = $${params.length}`) }

  if (opts.folderFilter && opts.folderFilter.length > 0) {
    params.push(opts.folderFilter)
    where.push(`advisor = ANY($${params.length})`)
  }

  if (opts.search) {
    params.push(`%${opts.search}%`)
    where.push(`(first_name ilike $${params.length} or last_name ilike $${params.length})`)
  }

  if (!opts.folderFilter && opts.advisor) {
    params.push(opts.advisor)
    where.push(`advisor = $${params.length}`)
  }

  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const dir = opts.dir === 'asc' ? 'asc' : 'desc'
  const orderClause =
    opts.sort === 'nombre' ? `order by last_name ${dir}, first_name ${dir}` :
    opts.sort === 'created_at' ? `order by created_at ${dir}` :
    `order by updated_at ${dir}`

  const { rows } = await pool.query(
    `select ${LIST_COLUMNS} from clients ${whereClause} ${orderClause}`,
    params
  )
  return rows as Client[]
}

export async function countClientsByStatus(status: string, folderFilter?: string[] | null) {
  const params: any[] = [status]
  let where = `status = $1`
  if (folderFilter && folderFilter.length > 0) {
    params.push(folderFilter)
    where += ` and advisor = ANY($${params.length})`
  }
  const { rows } = await pool.query(`select count(*) from clients where ${where}`, params)
  return parseInt(rows[0].count, 10)
}

async function logActivity(entityType: string, entityId: string, action: string, description: string, userName?: string) {
  await pool.query(
    `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
    [entityType, entityId, action, description, userName ?? null]
  )
}
