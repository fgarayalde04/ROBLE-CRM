import { pool } from './pool'

const CLIENT_JOIN = `left join clients c on c.id = t.client_id`
const CLIENT_SELECT = `c.id as "client__id", c.first_name as "client__first_name", c.last_name as "client__last_name"`

function shapeClient(row: any) {
  const { client__id, client__first_name, client__last_name, ...rest } = row
  return { ...rest, client: client__id ? { id: client__id, first_name: client__first_name, last_name: client__last_name } : null }
}

const OPEN_TASK_STATUSES = ['pendiente', 'en_proceso', 'bloqueado']

async function attachTaskShares(tasks: any[]) {
  if (tasks.length === 0) return tasks
  const ids = tasks.map((t) => t.id)
  const { rows: shares } = await pool.query(
    `select task_id, user_name from task_shares where task_id = ANY($1)`,
    [ids]
  )
  const byTask = new Map<string, { user_name: string }[]>()
  for (const s of shares) {
    if (!byTask.has(s.task_id)) byTask.set(s.task_id, [])
    byTask.get(s.task_id)!.push({ user_name: s.user_name })
  }
  return tasks.map((t) => ({ ...t, task_shares: byTask.get(t.id) ?? [] }))
}

export async function getTaskIdsSharedWith(userName: string) {
  const { rows } = await pool.query(`select task_id from task_shares where user_name = $1`, [userName])
  return Array.from(new Set(rows.map((r) => r.task_id as string).filter(Boolean)))
}

export async function getOpenTasksByResponsible(userName: string, limit: number) {
  const { rows } = await pool.query(
    `select t.id, t.title, t.priority, t.due_date, t.responsible, t.created_by, t.status, ${CLIENT_SELECT}
     from tasks t ${CLIENT_JOIN}
     where t.status = ANY($1) and t.responsible = $2
     order by t.due_date asc nulls last limit $3`,
    [OPEN_TASK_STATUSES, userName, limit]
  )
  return attachTaskShares(rows.map(shapeClient))
}

export async function getOpenTasksByCreator(userName: string, limit: number) {
  const { rows } = await pool.query(
    `select t.id, t.title, t.priority, t.due_date, t.responsible, t.created_by, t.status, ${CLIENT_SELECT}
     from tasks t ${CLIENT_JOIN}
     where t.status = ANY($1) and t.created_by = $2
     order by t.due_date asc nulls last limit $3`,
    [OPEN_TASK_STATUSES, userName, limit]
  )
  return attachTaskShares(rows.map(shapeClient))
}

export async function getOpenTasksByIds(ids: string[], limit: number) {
  if (ids.length === 0) return []
  const { rows } = await pool.query(
    `select t.id, t.title, t.priority, t.due_date, t.responsible, t.created_by, t.status, ${CLIENT_SELECT}
     from tasks t ${CLIENT_JOIN}
     where t.status = ANY($1) and t.id = ANY($2)
     order by t.due_date asc nulls last limit $3`,
    [OPEN_TASK_STATUSES, ids, limit]
  )
  return attachTaskShares(rows.map(shapeClient))
}

export async function getMyOpenings(isWideRole: boolean, userName: string, limit: number) {
  const where = [`o.status not in ('cuenta_abierta','descartado')`]
  const params: any[] = []
  if (!isWideRole) { params.push(userName); where.push(`o.advisor = $${params.length}`) }
  params.push(limit)

  const { rows } = await pool.query(
    `select o.id, o.folder_name, o.status, o.priority, o.start_date, o.updated_at, o.advisor,
            c.id as "client__id", c.first_name as "client__first_name", c.last_name as "client__last_name"
     from account_openings o
     left join clients c on c.id = o.client_id
     where ${where.join(' and ')}
     order by o.priority desc, o.updated_at desc
     limit $${params.length}`,
    params
  )

  const openings = rows.map(shapeClient)
  if (openings.length === 0) return openings

  const ids = openings.map((o) => o.id)
  const { rows: checklistRows } = await pool.query(
    `select opening_id, id, completed from opening_checklist_items where opening_id = ANY($1)`,
    [ids]
  )
  const byOpening = new Map<string, { id: string; completed: boolean }[]>()
  for (const c of checklistRows) {
    if (!byOpening.has(c.opening_id)) byOpening.set(c.opening_id, [])
    byOpening.get(c.opening_id)!.push({ id: c.id, completed: c.completed })
  }
  return openings.map((o) => ({ ...o, checklist_items: byOpening.get(o.id) ?? [] }))
}

export async function getCompanyOverdueTasks(today: string, limit: number) {
  const { rows } = await pool.query(
    `select t.id, t.title, t.due_date, t.responsible, ${CLIENT_SELECT}
     from tasks t ${CLIENT_JOIN}
     where t.status = ANY($1) and t.due_date < $2
     order by t.due_date asc limit $3`,
    [OPEN_TASK_STATUSES, today, limit]
  )
  return rows.map(shapeClient)
}

export async function getTasksWithoutResponsible(limit: number) {
  const { rows } = await pool.query(
    `select id, title, priority, due_date, created_at from tasks
     where status in ('pendiente','en_proceso') and responsible is null
     order by created_at desc limit $1`,
    [limit]
  )
  return rows
}

export async function getStuckOpenings(isWideRole: boolean, userName: string) {
  const where = [`o.status = 'trabado'`]
  const params: any[] = []
  if (!isWideRole) { params.push(userName); where.push(`o.advisor = $${params.length}`) }
  const { rows } = await pool.query(
    `select o.id, o.folder_name, o.updated_at, o.advisor, ${CLIENT_SELECT}
     from account_openings o ${CLIENT_JOIN.replace('t.client_id', 'o.client_id')}
     where ${where.join(' and ')}`,
    params
  )
  return rows.map(shapeClient)
}

export async function getStaleOpenings(isWideRole: boolean, userName: string, cutoffIso: string, limit: number) {
  const where = [`o.status not in ('cuenta_abierta','descartado','trabado')`, `o.updated_at < $1`]
  const params: any[] = [cutoffIso]
  if (!isWideRole) { params.push(userName); where.push(`o.advisor = $${params.length}`) }
  params.push(limit)
  const { rows } = await pool.query(
    `select o.id, o.folder_name, o.updated_at, o.status, o.advisor, ${CLIENT_SELECT}
     from account_openings o ${CLIENT_JOIN.replace('t.client_id', 'o.client_id')}
     where ${where.join(' and ')}
     order by o.updated_at asc limit $${params.length}`,
    params
  )
  return rows.map(shapeClient)
}

export async function getTodayEventsForDashboard(today: string) {
  const { rows } = await pool.query(
    `select e.id, e.title, e.type, e.start_time, e.created_by, e.participants,
            c.id as "client__id", c.first_name as "client__first_name", c.last_name as "client__last_name"
     from events e left join clients c on c.id = e.client_id
     where e.event_date = $1
     order by e.start_time asc nulls last`,
    [today]
  )
  return rows.map(shapeClient)
}

export async function getUpcomingDeadlinesForDashboard(isWideRole: boolean, userName: string, today: string, sevenDaysLater: string, limit: number) {
  const where = [`d.status = 'pendiente'`, `d.due_date >= $1`, `d.due_date <= $2`]
  const params: any[] = [today, sevenDaysLater]
  if (!isWideRole) { params.push(userName); where.push(`d.responsible = $${params.length}`) }
  params.push(limit)
  const { rows } = await pool.query(
    `select d.id, d.title, d.due_date, d.category, d.responsible, ${CLIENT_SELECT}
     from deadlines d left join clients c on c.id = d.client_id
     where ${where.join(' and ')}
     order by d.due_date asc limit $${params.length}`,
    params
  )
  return rows.map(shapeClient)
}

export async function getRecentActivityForDashboard(isWideRole: boolean, userName: string, limit: number) {
  const where: string[] = []
  const params: any[] = []
  if (!isWideRole) { params.push(userName); where.push(`user_name = $${params.length}`) }
  params.push(limit)
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select id, description, user_name, entity_type, entity_id, created_at
     from activity_log ${whereClause} order by created_at desc limit $${params.length}`,
    params
  )
  return rows
}

export async function getCompletedTaskIds(ids: string[]) {
  if (ids.length === 0) return []
  const { rows } = await pool.query(
    `select id from tasks where id = ANY($1) and status = 'completado'`,
    [ids]
  )
  return rows.map((r) => r.id as string)
}

export async function getUnreadNotifications(userId: string, userName: string, limit: number) {
  const { rows } = await pool.query(
    `select id, title, message, entity_type, entity_id, notif_type, url, created_at
     from notifications where (user_id = $1 or user_name = $2) and read_at is null
     order by created_at desc limit $3`,
    [userId, userName, limit]
  )
  return rows
}

export async function getPendingBcuComplianceCount() {
  const { rows } = await pool.query(
    `select count(*) from banco_central_records where ficha = false and lista_verificacion = false`
  )
  return Number(rows[0].count)
}
