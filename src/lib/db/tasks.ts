import { pool } from './pool'
import type { Task, TaskChecklistItem, Client } from '@/types/platform'

const CLIENT_JOIN = `left join clients c on c.id = t.client_id`
const CLIENT_SELECT = `c.id as "client__id", c.first_name as "client__first_name", c.last_name as "client__last_name", c.client_number as "client__client_number"`

function shapeTaskRow(row: any) {
  const { client__id, client__first_name, client__last_name, client__client_number, ...task } = row
  return {
    ...task,
    client: client__id
      ? { id: client__id, first_name: client__first_name, last_name: client__last_name, client_number: client__client_number }
      : null,
  }
}

export interface ListTasksFilters {
  clientId?: string
  status?: string
  responsible?: string
  search?: string
  openingId?: string
}

export async function getPendingTaskClientIds() {
  const { rows } = await pool.query(
    `select client_id from tasks where status = 'pendiente' and client_id is not null`
  )
  return rows.map((r) => r.client_id as string)
}

export async function getTasks(filters: ListTasksFilters = {}) {
  const where: string[] = []
  const params: any[] = []

  if (filters.clientId) { params.push(filters.clientId); where.push(`t.client_id = $${params.length}`) }
  if (filters.status) { params.push(filters.status); where.push(`t.status = $${params.length}`) }
  if (filters.responsible) { params.push(filters.responsible); where.push(`t.responsible = $${params.length}`) }
  if (filters.openingId) { params.push(filters.openingId); where.push(`t.opening_id = $${params.length}`) }
  if (filters.search) { params.push(`%${filters.search}%`); where.push(`t.title ilike $${params.length}`) }

  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select t.*, ${CLIENT_SELECT} from tasks t ${CLIENT_JOIN} ${whereClause} order by t.due_date asc nulls last`,
    params
  )
  return rows.map(shapeTaskRow) as (Task & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null })[]
}

export async function getTask(id: string) {
  const { rows } = await pool.query(
    `select t.*, ${CLIENT_SELECT} from tasks t ${CLIENT_JOIN} where t.id = $1`,
    [id]
  )
  if (rows.length === 0) throw new Error('Task not found')
  const { rows: checklistRows } = await pool.query(
    `select * from task_checklist_items where task_id = $1`,
    [id]
  )
  return { ...shapeTaskRow(rows[0]), checklist_items: checklistRows as TaskChecklistItem[] }
}

export async function createTask(task: Record<string, any>) {
  const entries = Object.entries(task).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)

  const { rows } = await pool.query(
    `insert into tasks (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  const data = rows[0] as Task
  await logActivity('task', data.id, 'crear', `Tarea "${task.title}" creada`)
  return data
}

export async function updateTask(id: string, updates: Record<string, any>) {
  const { client, checklist_items, ...safeUpdates } = updates
  const entries = Object.entries(safeUpdates).filter(([, v]) => v !== undefined)
  if (entries.length === 0) {
    const { rows } = await pool.query(`select * from tasks where id = $1`, [id])
    if (rows.length === 0) throw new Error('Task not found')
    return rows[0] as Task
  }

  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)

  const { rows } = await pool.query(
    `update tasks set ${setClause.join(', ')} where id = $${entries.length + 1} returning *`,
    [...values, id]
  )
  if (rows.length === 0) throw new Error('Task not found')
  return rows[0] as Task
}

export async function deleteTask(id: string) {
  await pool.query(`delete from tasks where id = $1`, [id])
}

export async function toggleTaskChecklistItem(id: string, completed: boolean) {
  await pool.query(
    `update task_checklist_items set completed = $1, completed_at = $2 where id = $3`,
    [completed, completed ? new Date().toISOString() : null, id]
  )
}

export async function createTaskChecklistItem(taskId: string, title: string) {
  const { rows } = await pool.query(
    `insert into task_checklist_items (task_id, title) values ($1, $2) returning *`,
    [taskId, title]
  )
  return rows[0] as TaskChecklistItem
}

export async function replaceTaskShares(taskId: string, sharedWith: string[], sharedBy: string | null) {
  await pool.query(`delete from task_shares where task_id = $1`, [taskId])
  if (sharedWith.length === 0) return
  const values: any[] = []
  const rows = sharedWith.map((userName, i) => {
    values.push(taskId, userName, sharedBy)
    return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
  })
  await pool.query(
    `insert into task_shares (task_id, user_name, shared_by) values ${rows.join(', ')}`,
    values
  )
}

export async function upsertTaskShares(taskId: string, sharedWith: string[], sharedBy: string | null) {
  if (sharedWith.length === 0) return
  const values: any[] = []
  const rows = sharedWith.map((userName, i) => {
    values.push(taskId, userName, sharedBy)
    return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
  })
  await pool.query(
    `insert into task_shares (task_id, user_name, shared_by) values ${rows.join(', ')}
     on conflict (task_id, user_name) do nothing`,
    values
  )
}

export async function notifyTaskShared(sharedWith: string[], currentUser: string | null, taskId: string, taskTitle: string) {
  if (sharedWith.length === 0) return
  const values: any[] = []
  const rows = sharedWith.map((userName, i) => {
    values.push(userName, 'Tarea compartida', `${currentUser ?? 'Un usuario'} compartió contigo la tarea: ${taskTitle}`, 'task', taskId)
    return `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
  })
  await pool.query(
    `insert into notifications (user_name, title, message, entity_type, entity_id) values ${rows.join(', ')}`,
    values
  )
}

async function logActivity(entityType: string, entityId: string, action: string, description: string, userName?: string | null) {
  await pool.query(
    `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
    [entityType, entityId, action, description, userName ?? null]
  )
}
