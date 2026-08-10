import { pool } from '@/lib/db/pool'
import type {
  Client, Document, Task, Deadline, ActivityLog, Event, TeamMember,
  AccountOpening, OpeningChecklistItem, NewFolder, TaskChecklistItem,
  AumRecord, ProductionRecord, RevenueRecord, UploadedFile, CeoData,
} from '@/types/platform'

const DEFAULT_CHECKLIST: { title: string; sort_order: number }[] = [
  { title: 'Confirmar datos del cliente', sort_order: 0 },
  { title: 'Solicitar documento de identidad / pasaporte', sort_order: 1 },
  { title: 'Solicitar comprobante de domicilio', sort_order: 2 },
  { title: 'Solicitar perfil de riesgo', sort_order: 3 },
  { title: 'Enviar formularios de apertura', sort_order: 4 },
  { title: 'Recibir formularios firmados', sort_order: 5 },
  { title: 'Revisar documentación', sort_order: 6 },
  { title: 'Enviar documentación a aprobación', sort_order: 7 },
  { title: 'Confirmar apertura de cuenta', sort_order: 8 },
  { title: 'Registrar número de cliente', sort_order: 9 },
  { title: 'Agregar link de carpeta', sort_order: 10 },
  { title: 'Marcar cuenta como activa', sort_order: 11 },
]

// =============================================
// CLIENTS
// Migrado a Postgres nativo (Railway) — ver src/lib/db/clients.ts
// =============================================

export {
  getNewLocalClients,
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
} from '@/lib/db/clients'

// =============================================
// DOCUMENTS
// =============================================

export {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
} from '@/lib/db/documents'

// =============================================
// TASKS + TASK CHECKLIST ITEMS
// Migrado a Postgres nativo (Railway) — ver src/lib/db/tasks.ts
// =============================================

export {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskChecklistItem,
  createTaskChecklistItem,
} from '@/lib/db/tasks'

// =============================================
// DEADLINES
// =============================================

export {
  getDeadlines,
  createDeadline,
  updateDeadline,
  deleteDeadline,
} from '@/lib/db/deadlines'

// =============================================
// EVENTS
// =============================================

export {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from '@/lib/db/events'

// =============================================
// ACCOUNT OPENINGS
// =============================================

export {
  getOpenings,
  getOpening,
  createOpening,
  updateOpening,
  toggleOpeningChecklistItem,
  updateOpeningChecklistItem,
} from '@/lib/db/openings'

// =============================================
// NEW FOLDERS
// =============================================

export async function getNewFolders(status?: string) {
  const where: string[] = []
  const params: any[] = []
  if (status) { params.push(status); where.push(`status = $${params.length}`) }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select * from new_folders ${whereClause} order by detected_at desc`,
    params
  )
  return rows as NewFolder[]
}

export async function createNewFolder(folder: Omit<NewFolder, 'id' | 'created_at'>) {
  const cols = Object.keys(folder)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => (folder as any)[c])
  const { rows } = await pool.query(
    `insert into new_folders (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0] as NewFolder
}

export async function updateNewFolder(id: string, updates: Partial<NewFolder>) {
  const entries = Object.entries(updates)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update new_folders set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] as NewFolder
}

// =============================================
// TEAM MEMBERS
// =============================================

export async function getTeamMembers() {
  const { rows } = await pool.query(
    `select * from team_members where active = true order by name`
  )
  return rows as TeamMember[]
}

// =============================================
// DASHBOARD STATS
// =============================================

const OPENING_IN_PROCESS_STATUSES = [
  'nueva_carpeta', 'en_contacto', 'documentacion_solicitada',
  'documentacion_recibida', 'formularios_enviados', 'formularios_firmados', 'en_revision',
]

export async function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0]
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    openTasks, overdueTasks, urgentTasks, upcomingDeadlines, pendingDocs,
    openingsInProcess, openingsDelayed, pendingFolders,
    todayEvents, todayTasks, recentClients, recentActivity,
  ] = await Promise.all([
    pool.query(`select count(*) from tasks where status in ('pendiente','en_proceso','bloqueado')`),
    pool.query(`select count(*) from tasks where status in ('pendiente','en_proceso') and due_date < $1`, [today]),
    pool.query(`select count(*) from tasks where priority = 'urgente' and status in ('pendiente','en_proceso','bloqueado')`),
    pool.query(`select count(*) from deadlines where status = 'pendiente' and due_date <= $1 and due_date >= $2`, [nextWeek, today]),
    pool.query(`select count(*) from documents where status in ('pendiente','revisar')`),
    pool.query(`select count(*) from account_openings where status = ANY($1)`, [OPENING_IN_PROCESS_STATUSES]),
    pool.query(`select count(*) from account_openings where status = ANY($1) and start_date < $2`, [OPENING_IN_PROCESS_STATUSES, thirtyDaysAgo]),
    pool.query(`select count(*) from new_folders where status = 'pendiente'`).catch(() => ({ rows: [{ count: 0 }] })),
    pool.query(
      `select e.*, c.id as client__id, c.first_name as client__first_name, c.last_name as client__last_name
       from events e left join clients c on c.id = e.client_id
       where e.event_date = $1 order by e.start_time asc nulls last`,
      [today]
    ),
    pool.query(
      `select t.*, c.id as client__id, c.first_name as client__first_name, c.last_name as client__last_name, c.client_number as client__client_number
       from tasks t left join clients c on c.id = t.client_id
       where t.status in ('pendiente','en_proceso','bloqueado') and t.due_date <= $1
       order by t.due_date asc limit 10`,
      [today]
    ),
    pool.query(`select * from clients order by updated_at desc limit 5`),
    pool.query(`select * from activity_log order by created_at desc limit 10`),
  ])

  const shapeClient = (row: any) => {
    const { client__id, client__first_name, client__last_name, client__client_number, ...rest } = row
    return {
      ...rest,
      client: client__id
        ? { id: client__id, first_name: client__first_name, last_name: client__last_name, client_number: client__client_number }
        : null,
    }
  }

  return {
    open_tasks: Number(openTasks.rows[0].count),
    overdue_tasks: Number(overdueTasks.rows[0].count),
    urgent_tasks: Number(urgentTasks.rows[0].count),
    upcoming_deadlines: Number(upcomingDeadlines.rows[0].count),
    pending_documents: Number(pendingDocs.rows[0].count),
    openings_in_process: Number(openingsInProcess.rows[0].count),
    openings_delayed: Number(openingsDelayed.rows[0].count),
    pending_folders: Number(pendingFolders.rows[0].count),
    today_events: todayEvents.rows.map(shapeClient) as Event[],
    today_tasks: todayTasks.rows.map(shapeClient) as Task[],
    recent_clients: recentClients.rows as Client[],
    recent_activity: recentActivity.rows as ActivityLog[],
  }
}

// =============================================
// CEO / BI
// =============================================

export async function getCeoData(): Promise<CeoData> {
  const now = new Date()
  const currentMonth = now.toISOString().slice(0, 7)
  const firstOfMonth = `${currentMonth}-01`

  const [
    aumRecords, productionRecords, revenueRecords,
    activeClients, inAperturaClients, newClientsThisMonth, openingsThisMonth,
    uploadedFiles,
  ] = await Promise.all([
    pool.query(`select * from aum_records order by period asc`),
    pool.query(`select * from production_records order by period asc`),
    pool.query(`select * from revenue_records order by period asc`),
    pool.query(`select count(*) from clients where status = 'activo'`),
    pool.query(`select count(*) from clients where status = 'en_apertura'`),
    pool.query(`select count(*) from clients where created_at >= $1`, [firstOfMonth]),
    pool.query(`select count(*) from account_openings where status = 'cuenta_abierta' and opened_date >= $1`, [firstOfMonth]),
    pool.query(`select * from uploaded_files order by uploaded_at desc limit 20`),
  ])

  return {
    aum_records: aumRecords.rows as AumRecord[],
    production_records: productionRecords.rows as ProductionRecord[],
    revenue_records: revenueRecords.rows as RevenueRecord[],
    active_clients: Number(activeClients.rows[0].count),
    in_apertura_clients: Number(inAperturaClients.rows[0].count),
    new_clients_this_month: Number(newClientsThisMonth.rows[0].count),
    openings_this_month: Number(openingsThisMonth.rows[0].count),
    uploaded_files: uploadedFiles.rows as UploadedFile[],
  }
}

export async function insertAumRecords(rows: Omit<AumRecord, 'id' | 'created_at'>[], fileId: string) {
  if (rows.length === 0) return
  const withSource = rows.map((r) => ({ ...r, source_file: fileId }))
  const cols = Object.keys(withSource[0])
  const values: any[] = []
  const rowsSql = withSource.map((rec, i) => {
    const placeholders = cols.map((c, j) => { values.push((rec as any)[c]); return `$${i * cols.length + j + 1}` })
    return `(${placeholders.join(', ')})`
  })
  await pool.query(`insert into aum_records (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}`, values)
}

export async function insertProductionRecords(rows: Omit<ProductionRecord, 'id' | 'created_at'>[], fileId: string) {
  if (rows.length === 0) return
  const withSource = rows.map((r) => ({ ...r, source_file: fileId }))
  const cols = Object.keys(withSource[0])
  const values: any[] = []
  const rowsSql = withSource.map((rec, i) => {
    const placeholders = cols.map((c, j) => { values.push((rec as any)[c]); return `$${i * cols.length + j + 1}` })
    return `(${placeholders.join(', ')})`
  })
  await pool.query(`insert into production_records (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}`, values)
}

export async function insertRevenueRecords(rows: Omit<RevenueRecord, 'id' | 'created_at'>[], fileId: string) {
  if (rows.length === 0) return
  const withSource = rows.map((r) => ({ ...r, source_file: fileId }))
  const cols = Object.keys(withSource[0])
  const values: any[] = []
  const rowsSql = withSource.map((rec, i) => {
    const placeholders = cols.map((c, j) => { values.push((rec as any)[c]); return `$${i * cols.length + j + 1}` })
    return `(${placeholders.join(', ')})`
  })
  await pool.query(`insert into revenue_records (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}`, values)
}

export async function registerUploadedFile(file: Omit<UploadedFile, 'id' | 'uploaded_at'>) {
  const cols = Object.keys(file)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => (file as any)[c])
  const { rows } = await pool.query(
    `insert into uploaded_files (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0] as UploadedFile
}

// =============================================
// GLOBAL SEARCH
// =============================================

export async function globalSearch(query: string) {
  if (!query.trim()) return { clients: [], documents: [], tasks: [], deadlines: [] }

  const like = `%${query}%`
  const clientJoin = `left join clients c on c.id = t.client_id`
  const clientSelect = `c.id as "client__id", c.first_name as "client__first_name", c.last_name as "client__last_name", c.client_number as "client__client_number"`
  const shapeRow = (row: any) => {
    const { client__id, client__first_name, client__last_name, client__client_number, ...rest } = row
    return {
      ...rest,
      client: client__id
        ? { id: client__id, first_name: client__first_name, last_name: client__last_name, client_number: client__client_number }
        : null,
    }
  }

  const [clients, documents, tasks, deadlines] = await Promise.all([
    pool.query(
      `select * from clients
       where first_name ilike $1 or last_name ilike $1 or client_number ilike $1 or email ilike $1
       limit 5`,
      [like]
    ),
    pool.query(`select t.*, ${clientSelect} from documents t ${clientJoin} where t.name ilike $1 limit 5`, [like]),
    pool.query(`select t.*, ${clientSelect} from tasks t ${clientJoin} where t.title ilike $1 limit 5`, [like]),
    pool.query(`select t.*, ${clientSelect} from deadlines t ${clientJoin} where t.title ilike $1 limit 5`, [like]),
  ])

  return {
    clients: clients.rows as Client[],
    documents: documents.rows.map(shapeRow) as Document[],
    tasks: tasks.rows.map(shapeRow) as Task[],
    deadlines: deadlines.rows.map(shapeRow) as Deadline[],
  }
}

// =============================================
// ACTIVITY LOG
// =============================================

async function logActivity(
  entityType: ActivityLog['entity_type'],
  entityId: string,
  action: string,
  description: string,
  userName?: string
) {
  await pool.query(
    `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
    [entityType, entityId, action, description, userName ?? null]
  )
}
