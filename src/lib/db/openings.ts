import { pool } from './pool'
import type { AccountOpening, OpeningChecklistItem, Client } from '@/types/platform'

const DEFAULT_CHECKLIST: { title: string; sort_order: number }[] = [
  { title: 'Ficha de cliente hecha', sort_order: 0 },
  { title: 'Cedulas conseguidas', sort_order: 1 },
  { title: 'Comprobante de domicilio recibido', sort_order: 2 },
  { title: 'Informacion de madre/padre completa', sort_order: 3 },
  { title: 'Perfil de riesgo completado', sort_order: 4 },
  { title: 'Formularios enviados al cliente', sort_order: 5 },
  { title: 'Formularios firmados recibidos', sort_order: 6 },
  { title: 'Documentacion revisada internamente', sort_order: 7 },
  { title: 'Documentacion enviada al banco', sort_order: 8 },
  { title: 'Confirmacion del banco recibida', sort_order: 9 },
  { title: 'Numero de cliente asignado', sort_order: 10 },
  { title: 'Cuenta marcada como activa', sort_order: 11 },
]

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

function dynInsert(table: string, obj: Record<string, any>) {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)
  return { sql: `insert into ${table} (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`, values }
}

function dynUpdate(table: string, id: string, updates: Record<string, any>, extraWhere?: { col: string; val: any }) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  let sql = `update ${table} set ${setClause.join(', ')} where id = $${values.length}`
  if (extraWhere) {
    values.push(extraWhere.val)
    sql += ` and "${extraWhere.col}" = $${values.length}`
  }
  sql += ' returning *'
  return { sql, values }
}

// ─── Account Openings ───────────────────────────────────────────────────────

export async function getAllOpeningOnedriveUrls() {
  const { rows } = await pool.query(`select onedrive_url from account_openings where onedrive_url is not null`)
  return rows.map((r) => r.onedrive_url as string)
}

export async function getOpenings(filters: { status?: string; advisor?: string } = {}) {
  const where: string[] = []
  const params: any[] = []
  if (filters.status) { params.push(filters.status); where.push(`t.status = $${params.length}`) }
  if (filters.advisor) { params.push(filters.advisor); where.push(`t.advisor = $${params.length}`) }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select t.*, ${CLIENT_SELECT} from account_openings t ${CLIENT_JOIN} ${whereClause} order by t.created_at desc`,
    params
  )
  return rows.map(shapeRow) as AccountOpening[]
}

export async function getOpening(id: string) {
  const { rows } = await pool.query(
    `select t.*, ${CLIENT_SELECT} from account_openings t ${CLIENT_JOIN} where t.id = $1`,
    [id]
  )
  if (rows.length === 0) throw new Error('Opening not found')
  const { rows: checklistRows } = await pool.query(
    `select * from opening_checklist_items where opening_id = $1 order by sort_order asc`,
    [id]
  )
  return { ...shapeRow(rows[0]), checklist_items: checklistRows as OpeningChecklistItem[] }
}

export async function createOpening(opening: Record<string, any>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { sql, values } = dynInsert('account_openings', { status: 'carpeta_creada', priority: 'normal', ...opening })
    const { rows } = await client.query(sql, values)
    const data = rows[0] as AccountOpening

    const checklistRows = DEFAULT_CHECKLIST.map((item) => [data.id, item.title, item.sort_order])
    const placeholders = checklistRows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')
    await client.query(
      `insert into opening_checklist_items (opening_id, title, sort_order) values ${placeholders}`,
      checklistRows.flat()
    )

    await client.query(
      `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
      ['opening', data.id, 'crear', `Apertura iniciada: ${data.folder_name ?? ''}`, null]
    )

    await client.query('COMMIT')
    return data
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateOpening(id: string, updates: Record<string, any>) {
  const { client, checklist_items, ...safe } = updates
  const { sql, values } = dynUpdate('account_openings', id, safe)
  const { rows } = await pool.query(sql, values)
  if (rows.length === 0) throw new Error('Opening not found')
  return rows[0] as AccountOpening
}

export async function listOpeningsWithStats(folderFilter?: string[] | null) {
  const where: string[] = []
  const params: any[] = []
  if (folderFilter && folderFilter.length > 0) {
    params.push(folderFilter)
    where.push(`t.advisor = ANY($${params.length})`)
  }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''

  const [{ rows: openingRows }, { rows: checklistRows }, { rows: notesRows }, { rows: tasksRows }] = await Promise.all([
    pool.query(`select t.*, ${CLIENT_SELECT} from account_openings t ${CLIENT_JOIN} ${whereClause} order by t.created_at desc`, params),
    pool.query(`select id, opening_id, completed from opening_checklist_items`),
    pool.query(`select opening_id from opening_notes where status = 'abierta'`),
    pool.query(`select opening_id from opening_tasks where status != 'completada'`),
  ])

  const checklistByOpening: Record<string, { id: string; completed: boolean }[]> = {}
  for (const c of checklistRows) {
    ;(checklistByOpening[c.opening_id] ??= []).push({ id: c.id, completed: c.completed })
  }
  const openNotesByOpening: Record<string, number> = {}
  for (const n of notesRows) openNotesByOpening[n.opening_id] = (openNotesByOpening[n.opening_id] ?? 0) + 1
  const pendingTasksByOpening: Record<string, number> = {}
  for (const t of tasksRows) pendingTasksByOpening[t.opening_id] = (pendingTasksByOpening[t.opening_id] ?? 0) + 1

  const openings = openingRows.map(shapeRow).map((o: any) => ({
    ...o,
    checklist_items: checklistByOpening[o.id] ?? [],
  }))

  return { openings, openNotesByOpening, pendingTasksByOpening }
}

export async function getOpeningRaw(id: string) {
  const { rows } = await pool.query(
    `select client_id, folder_name, advisor, item_id, drive_id, web_url, onedrive_url from account_openings where id = $1`,
    [id]
  )
  if (rows.length === 0) throw new Error('Opening not found')
  return rows[0]
}

export async function deleteOpening(id: string) {
  await pool.query(`delete from opening_checklist_items where opening_id = $1`, [id])
  await pool.query(`delete from opening_tasks where opening_id = $1`, [id])
  await pool.query(`delete from opening_notes where opening_id = $1`, [id])
  await pool.query(`delete from opening_documents where opening_id = $1`, [id])
  await pool.query(`delete from account_openings where id = $1`, [id])
}

// ─── Checklist items ────────────────────────────────────────────────────────

export async function toggleOpeningChecklistItem(id: string, completed: boolean) {
  await pool.query(
    `update opening_checklist_items set completed = $1, completed_at = $2 where id = $3`,
    [completed, completed ? new Date().toISOString() : null, id]
  )
}

export async function updateOpeningChecklistItem(
  id: string,
  updates: { completed?: boolean; responsible?: string | null; note?: string | null; completed_at?: string | null }
) {
  const payload = { ...updates }
  if (payload.completed !== undefined) {
    payload.completed_at = payload.completed ? new Date().toISOString() : null
  }
  const { sql, values } = dynUpdate('opening_checklist_items', id, payload)
  const { rows } = await pool.query(sql, values)
  if (rows.length === 0) throw new Error('Checklist item not found')
  return rows[0] as OpeningChecklistItem
}

// ─── Opening tasks ──────────────────────────────────────────────────────────

export async function getOpeningTasks(openingId: string) {
  const { rows } = await pool.query(
    `select * from opening_tasks where opening_id = $1 order by created_at desc`,
    [openingId]
  )
  return rows
}

export async function createOpeningTask(openingId: string, body: Record<string, any>) {
  const { sql, values } = dynInsert('opening_tasks', {
    opening_id: openingId,
    title: body.title,
    description: body.description ?? null,
    responsible: body.responsible ?? null,
    due_date: body.due_date ?? null,
    priority: body.priority ?? 'normal',
    status: body.status ?? 'pendiente',
  })
  const { rows } = await pool.query(sql, values)
  return rows[0]
}

export async function updateOpeningTask(openingId: string, id: string, updates: Record<string, any>) {
  if (updates.status === 'completada' && !updates.completed_at) updates.completed_at = new Date().toISOString()
  updates.updated_at = new Date().toISOString()
  const { sql, values } = dynUpdate('opening_tasks', id, updates, { col: 'opening_id', val: openingId })
  const { rows } = await pool.query(sql, values)
  if (rows.length === 0) throw new Error('Opening task not found')
  return rows[0]
}

// ─── Opening notes ──────────────────────────────────────────────────────────

export async function getOpeningNotes(openingId: string) {
  const { rows } = await pool.query(
    `select * from opening_notes where opening_id = $1 order by created_at desc`,
    [openingId]
  )
  return rows
}

export async function createOpeningNote(openingId: string, text: string, author: string | null) {
  const { sql, values } = dynInsert('opening_notes', { opening_id: openingId, text, author, status: 'abierta' })
  const { rows } = await pool.query(sql, values)
  return rows[0]
}

export async function updateOpeningNote(openingId: string, id: string, updates: Record<string, any>) {
  const { sql, values } = dynUpdate('opening_notes', id, updates, { col: 'opening_id', val: openingId })
  const { rows } = await pool.query(sql, values)
  if (rows.length === 0) throw new Error('Opening note not found')
  return rows[0]
}

// ─── Opening documents ──────────────────────────────────────────────────────

export async function getOpeningDocuments(openingId: string) {
  const { rows } = await pool.query(
    `select * from opening_documents where opening_id = $1 order by created_at desc`,
    [openingId]
  )
  return rows
}

export async function createOpeningDocument(openingId: string, body: Record<string, any>) {
  const { sql, values } = dynInsert('opening_documents', {
    opening_id: openingId,
    name: body.name,
    category: body.category ?? null,
    link: body.link ?? null,
    status: body.status ?? 'pendiente',
    expiry_date: body.expiry_date ?? null,
    notes: body.notes ?? null,
  })
  const { rows } = await pool.query(sql, values)
  return rows[0]
}

export async function updateOpeningDocument(openingId: string, id: string, updates: Record<string, any>) {
  const { sql, values } = dynUpdate('opening_documents', id, updates, { col: 'opening_id', val: openingId })
  const { rows } = await pool.query(sql, values)
  if (rows.length === 0) throw new Error('Opening document not found')
  return rows[0]
}

async function logActivity(entityType: string, entityId: string, action: string, description: string, userName?: string | null) {
  await pool.query(
    `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
    [entityType, entityId, action, description, userName ?? null]
  )
}
