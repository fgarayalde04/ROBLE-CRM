import { supabase } from './client'
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
// =============================================

/**
 * Clientes detectados automáticamente desde carpetas locales.
 * Identifica por: onedrive_folder_url empieza con '/' (ruta local) y status = prospecto.
 */
export async function getNewLocalClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'prospecto')
    .like('onedrive_folder_url', '/%')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Client[]
}

export async function getClients(search?: string) {
  let query = supabase
    .from('clients')
    .select('*')
    .order('updated_at', { ascending: false })

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,client_number.ilike.%${search}%,email.ilike.%${search}%`
    )
  }

  const { data, error } = await query
  if (error) throw error
  return data as Client[]
}

export async function getClient(id: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Client
}

export async function createClient(client: Omit<Client, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('clients')
    .insert(client)
    .select()
    .single()
  if (error) throw error
  await logActivity('client', data.id, 'crear', `Cliente ${client.first_name} ${client.last_name} creado`)
  return data as Client
}

export async function updateClient(id: string, updates: Partial<Client>) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  await logActivity('client', id, 'actualizar', `Cliente actualizado`)
  return data as Client
}

export async function deleteClient(id: string) {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
}

// =============================================
// DOCUMENTS
// =============================================

export async function getDocuments(filters?: {
  clientId?: string
  status?: string
  category?: string
  search?: string
}) {
  let query = supabase
    .from('documents')
    .select('*, client:clients(id, first_name, last_name, client_number)')
    .order('updated_at', { ascending: false })

  if (filters?.clientId) query = query.eq('client_id', filters.clientId)
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.category) query = query.eq('category', filters.category)
  if (filters?.search) query = query.ilike('name', `%${filters.search}%`)

  const { data, error } = await query
  if (error) throw error
  return data as (Document & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null })[]
}

export async function getDocument(id: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*, client:clients(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Document & { client: Client | null }
}

export async function createDocument(doc: Omit<Document, 'id' | 'created_at' | 'updated_at' | 'client'>) {
  const { data, error } = await supabase
    .from('documents')
    .insert(doc)
    .select()
    .single()
  if (error) throw error
  await logActivity('document', data.id, 'crear', `Documento "${doc.name}" creado`)
  return data as Document
}

export async function updateDocument(id: string, updates: Partial<Document>) {
  const { client: _c, ...safeUpdates } = updates as any
  const { data, error } = await supabase
    .from('documents')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Document
}

export async function deleteDocument(id: string) {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
}

// =============================================
// TASKS
// =============================================

export async function getTasks(filters?: {
  clientId?: string
  status?: string
  responsible?: string
  search?: string
}) {
  let query = supabase
    .from('tasks')
    .select('*, client:clients(id, first_name, last_name, client_number)')
    .order('due_date', { ascending: true, nullsFirst: false })

  if (filters?.clientId) query = query.eq('client_id', filters.clientId)
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.responsible) query = query.eq('responsible', filters.responsible)
  if (filters?.search) query = query.ilike('title', `%${filters.search}%`)

  const { data, error } = await query
  if (error) throw error
  return data as (Task & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null })[]
}

export async function getTask(id: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, client:clients(*), checklist_items:task_checklist_items(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Task & { client: Client | null; checklist_items: TaskChecklistItem[] }
}

export async function createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'client'>) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single()
  if (error) throw error
  await logActivity('task', data.id, 'crear', `Tarea "${task.title}" creada`)
  return data as Task
}

export async function updateTask(id: string, updates: Partial<Task>) {
  const { client: _c, checklist_items: _ch, ...safeUpdates } = updates as any
  const { data, error } = await supabase
    .from('tasks')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Task
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// =============================================
// TASK CHECKLIST ITEMS
// =============================================

export async function toggleTaskChecklistItem(id: string, completed: boolean) {
  const { error } = await supabase
    .from('task_checklist_items')
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

export async function createTaskChecklistItem(taskId: string, title: string) {
  const { data, error } = await supabase
    .from('task_checklist_items')
    .insert({ task_id: taskId, title })
    .select()
    .single()
  if (error) throw error
  return data as TaskChecklistItem
}

// =============================================
// DEADLINES
// =============================================

export async function getDeadlines(filters?: {
  clientId?: string
  status?: string
  category?: string
  responsible?: string
  from?: string
  to?: string
}) {
  let query = supabase
    .from('deadlines')
    .select('*, client:clients(id, first_name, last_name, client_number)')
    .order('due_date', { ascending: true })

  if (filters?.clientId) query = query.eq('client_id', filters.clientId)
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.category) query = query.eq('category', filters.category)
  if (filters?.responsible) query = query.eq('responsible', filters.responsible)
  if (filters?.from) query = query.gte('due_date', filters.from)
  if (filters?.to) query = query.lte('due_date', filters.to)

  const { data, error } = await query
  if (error) throw error
  return data as (Deadline & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null })[]
}

export async function createDeadline(deadline: Omit<Deadline, 'id' | 'created_at' | 'updated_at' | 'client'>) {
  const { data, error } = await supabase
    .from('deadlines')
    .insert(deadline)
    .select()
    .single()
  if (error) throw error
  await logActivity('deadline', data.id, 'crear', `Vencimiento "${deadline.title}" creado`)
  return data as Deadline
}

export async function updateDeadline(id: string, updates: Partial<Deadline>) {
  const { client: _c, ...safeUpdates } = updates as any
  const { data, error } = await supabase
    .from('deadlines')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Deadline
}

export async function deleteDeadline(id: string) {
  const { error } = await supabase.from('deadlines').delete().eq('id', id)
  if (error) throw error
}

// =============================================
// EVENTS
// =============================================

export async function getEvents(filters?: {
  from?: string
  to?: string
  type?: string
  clientId?: string
}) {
  let query = supabase
    .from('events')
    .select('*, client:clients(id, first_name, last_name, client_number)')
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })

  if (filters?.from) query = query.gte('event_date', filters.from)
  if (filters?.to) query = query.lte('event_date', filters.to)
  if (filters?.type) query = query.eq('type', filters.type)
  if (filters?.clientId) query = query.eq('client_id', filters.clientId)

  const { data, error } = await query
  if (error) throw error
  return data as Event[]
}

export async function createEvent(event: Omit<Event, 'id' | 'created_at' | 'updated_at' | 'client'>) {
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single()
  if (error) throw error
  await logActivity('client', data.id, 'crear', `Evento "${event.title}" creado`)
  return data as Event
}

export async function updateEvent(id: string, updates: Partial<Event>) {
  const { client: _c, ...safeUpdates } = updates as any
  const { data, error } = await supabase
    .from('events')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Event
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

// =============================================
// ACCOUNT OPENINGS
// =============================================

export async function getOpenings(filters?: { status?: string; advisor?: string }) {
  let query = supabase
    .from('account_openings')
    .select('*, client:clients(id, first_name, last_name, client_number)')
    .order('created_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.advisor) query = query.eq('advisor', filters.advisor)

  const { data, error } = await query
  if (error) throw error
  return data as AccountOpening[]
}

export async function getOpening(id: string) {
  const { data, error } = await supabase
    .from('account_openings')
    .select('*, client:clients(id, first_name, last_name, client_number), checklist_items:opening_checklist_items(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  const opening = data as AccountOpening & { checklist_items: OpeningChecklistItem[] }
  if (opening.checklist_items) {
    opening.checklist_items.sort((a, b) => a.sort_order - b.sort_order)
  }
  return opening
}

export async function createOpening(
  opening: Omit<AccountOpening, 'id' | 'created_at' | 'updated_at' | 'client' | 'checklist_items'>
) {
  const { data, error } = await supabase
    .from('account_openings')
    .insert(opening)
    .select()
    .single()
  if (error) throw error

  const checklistRows = DEFAULT_CHECKLIST.map((item) => ({
    opening_id: data.id,
    title: item.title,
    sort_order: item.sort_order,
  }))
  await supabase.from('opening_checklist_items').insert(checklistRows)

  return data as AccountOpening
}

export async function updateOpening(id: string, updates: Partial<AccountOpening>) {
  const { client: _c, checklist_items: _ch, ...safeUpdates } = updates as any
  const { data, error } = await supabase
    .from('account_openings')
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as AccountOpening
}

export async function toggleOpeningChecklistItem(id: string, completed: boolean) {
  const { error } = await supabase
    .from('opening_checklist_items')
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

export async function updateOpeningChecklistItem(
  id: string,
  updates: Partial<Pick<OpeningChecklistItem, 'completed' | 'responsible' | 'note' | 'completed_at'>>
) {
  const { error } = await supabase
    .from('opening_checklist_items')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

// =============================================
// NEW FOLDERS
// =============================================

export async function getNewFolders(status?: string) {
  let query = supabase
    .from('new_folders')
    .select('*')
    .order('detected_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return data as NewFolder[]
}

export async function createNewFolder(folder: Omit<NewFolder, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('new_folders')
    .insert(folder)
    .select()
    .single()
  if (error) throw error
  return data as NewFolder
}

export async function updateNewFolder(id: string, updates: Partial<NewFolder>) {
  const { data, error } = await supabase
    .from('new_folders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as NewFolder
}

// =============================================
// TEAM MEMBERS
// =============================================

export async function getTeamMembers() {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('active', true)
    .order('name')
  if (error) throw error
  return data as TeamMember[]
}

// =============================================
// DASHBOARD STATS
// =============================================

export async function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0]
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { count: openTasks },
    { count: overdueTasks },
    { count: urgentTasks },
    { count: upcomingDeadlines },
    { count: pendingDocs },
    { count: openingsInProcess },
    { count: openingsDelayed },
    { count: pendingFolders },
    { data: todayEvents },
    { data: todayTasks },
    { data: recentClients },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pendiente', 'en_proceso', 'bloqueado']),
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pendiente', 'en_proceso'])
      .lt('due_date', today),
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('priority', 'urgente')
      .in('status', ['pendiente', 'en_proceso', 'bloqueado']),
    supabase
      .from('deadlines')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendiente')
      .lte('due_date', nextWeek)
      .gte('due_date', today),
    supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pendiente', 'revisar']),
    supabase
      .from('account_openings')
      .select('*', { count: 'exact', head: true })
      .in('status', [
        'nueva_carpeta', 'en_contacto', 'documentacion_solicitada',
        'documentacion_recibida', 'formularios_enviados', 'formularios_firmados', 'en_revision',
      ]),
    supabase
      .from('account_openings')
      .select('*', { count: 'exact', head: true })
      .in('status', [
        'nueva_carpeta', 'en_contacto', 'documentacion_solicitada',
        'documentacion_recibida', 'formularios_enviados', 'formularios_firmados', 'en_revision',
      ])
      .lt('start_date', thirtyDaysAgo),
    supabase
      .from('new_folders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendiente'),
    supabase
      .from('events')
      .select('*, client:clients(id, first_name, last_name)')
      .eq('event_date', today)
      .order('start_time', { ascending: true, nullsFirst: false }),
    supabase
      .from('tasks')
      .select('*, client:clients(id, first_name, last_name, client_number)')
      .in('status', ['pendiente', 'en_proceso', 'bloqueado'])
      .lte('due_date', today)
      .order('due_date', { ascending: true })
      .limit(10),
    supabase
      .from('clients')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return {
    open_tasks: openTasks ?? 0,
    overdue_tasks: overdueTasks ?? 0,
    urgent_tasks: urgentTasks ?? 0,
    upcoming_deadlines: upcomingDeadlines ?? 0,
    pending_documents: pendingDocs ?? 0,
    openings_in_process: openingsInProcess ?? 0,
    openings_delayed: openingsDelayed ?? 0,
    pending_folders: pendingFolders ?? 0,
    today_events: (todayEvents ?? []) as Event[],
    today_tasks: (todayTasks ?? []) as Task[],
    recent_clients: (recentClients ?? []) as Client[],
    recent_activity: (recentActivity ?? []) as ActivityLog[],
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
    { data: aumRecords },
    { data: productionRecords },
    { data: revenueRecords },
    { count: activeClients },
    { count: inAperturaClients },
    { count: newClientsThisMonth },
    { count: openingsThisMonth },
    { data: uploadedFiles },
  ] = await Promise.all([
    supabase.from('aum_records').select('*').order('period', { ascending: true }),
    supabase.from('production_records').select('*').order('period', { ascending: true }),
    supabase.from('revenue_records').select('*').order('period', { ascending: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'activo'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'en_apertura'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', firstOfMonth),
    supabase.from('account_openings').select('*', { count: 'exact', head: true })
      .eq('status', 'cuenta_abierta').gte('opened_date', firstOfMonth),
    supabase.from('uploaded_files').select('*').order('uploaded_at', { ascending: false }).limit(20),
  ])

  return {
    aum_records: (aumRecords ?? []) as AumRecord[],
    production_records: (productionRecords ?? []) as ProductionRecord[],
    revenue_records: (revenueRecords ?? []) as RevenueRecord[],
    active_clients: activeClients ?? 0,
    in_apertura_clients: inAperturaClients ?? 0,
    new_clients_this_month: newClientsThisMonth ?? 0,
    openings_this_month: openingsThisMonth ?? 0,
    uploaded_files: (uploadedFiles ?? []) as UploadedFile[],
  }
}

export async function insertAumRecords(rows: Omit<AumRecord, 'id' | 'created_at'>[], fileId: string) {
  const { error } = await supabase.from('aum_records').insert(rows.map((r) => ({ ...r, source_file: fileId })))
  if (error) throw error
}

export async function insertProductionRecords(rows: Omit<ProductionRecord, 'id' | 'created_at'>[], fileId: string) {
  const { error } = await supabase.from('production_records').insert(rows.map((r) => ({ ...r, source_file: fileId })))
  if (error) throw error
}

export async function insertRevenueRecords(rows: Omit<RevenueRecord, 'id' | 'created_at'>[], fileId: string) {
  const { error } = await supabase.from('revenue_records').insert(rows.map((r) => ({ ...r, source_file: fileId })))
  if (error) throw error
}

export async function registerUploadedFile(file: Omit<UploadedFile, 'id' | 'uploaded_at'>) {
  const { data, error } = await supabase.from('uploaded_files').insert(file).select().single()
  if (error) throw error
  return data as UploadedFile
}

// =============================================
// GLOBAL SEARCH
// =============================================

export async function globalSearch(query: string) {
  if (!query.trim()) return { clients: [], documents: [], tasks: [], deadlines: [] }

  const [
    { data: clients },
    { data: documents },
    { data: tasks },
    { data: deadlines },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('*')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,client_number.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(5),
    supabase
      .from('documents')
      .select('*, client:clients(id, first_name, last_name, client_number)')
      .ilike('name', `%${query}%`)
      .limit(5),
    supabase
      .from('tasks')
      .select('*, client:clients(id, first_name, last_name, client_number)')
      .ilike('title', `%${query}%`)
      .limit(5),
    supabase
      .from('deadlines')
      .select('*, client:clients(id, first_name, last_name, client_number)')
      .ilike('title', `%${query}%`)
      .limit(5),
  ])

  return {
    clients: (clients ?? []) as Client[],
    documents: (documents ?? []) as Document[],
    tasks: (tasks ?? []) as Task[],
    deadlines: (deadlines ?? []) as Deadline[],
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
  await supabase.from('activity_log').insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    description,
    user_name: userName ?? null,
  })
}
