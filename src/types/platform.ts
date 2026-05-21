export type ClientStatus =
  | 'prospecto'
  | 'activo'
  | 'en_apertura'
  | 'cerrado'
  | 'inactivo'
  | 'descartado'
  | 'pendiente_documentacion'
  | 'en_revision'

export type RiskProfile =
  | 'conservador'
  | 'moderado'
  | 'moderado_agresivo'
  | 'agresivo'

export type DocumentCategory =
  | 'contrato'
  | 'perfil_riesgo'
  | 'reporte'
  | 'propuesta'
  | 'documento_legal'
  | 'fact_sheet'
  | 'comunicacion'
  | 'formulario'
  | 'analisis_inversion'
  | 'otro'

export type DocumentStatus =
  | 'pendiente'
  | 'completo'
  | 'vencido'
  | 'revisar'
  | 'enviado'
  | 'firmado'

export type TaskPriority = 'baja' | 'media' | 'alta' | 'urgente'

export type TaskStatus = 'pendiente' | 'en_proceso' | 'bloqueado' | 'completado'

export type DeadlineCategory =
  | 'documento'
  | 'tarea'
  | 'revision_cliente'
  | 'reporte'
  | 'renovacion'
  | 'seguimiento'

export type ClientType = 'local' | 'internacional'

export type EventType = 'reunion' | 'llamada' | 'seguimiento' | 'vencimiento' | 'interno' | 'otro'

export type OpeningStatus =
  | 'carpeta_creada'
  | 'recolectando_informacion'
  | 'documentacion_incompleta'
  | 'documentacion_completa'
  | 'formularios_enviados'
  | 'enviado_al_banco'
  | 'en_revision_banco'
  | 'cuenta_abierta'
  | 'trabado'
  | 'descartado'

export type FolderStatus = 'pendiente' | 'en_proceso' | 'ignorada' | 'archivada'

export interface Client {
  id: string
  client_number: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  status: ClientStatus
  risk_profile: RiskProfile | null
  advisor: string | null
  notes: string | null
  onedrive_folder_url: string | null
  client_type: ClientType
  created_at: string
  updated_at: string
  // Closure fields (added via migration)
  closed_at: string | null
  closed_by: string | null
  close_reason: string | null
}

export interface Event {
  id: string
  title: string
  description: string | null
  event_date: string
  start_time: string | null
  end_time: string | null
  type: EventType
  client_id: string | null
  client?: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'>
  participants: string[]
  reminder_minutes: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  name: string
  email: string | null
  role: 'administrador' | 'empleado'
  active: boolean
  created_at: string
}

export interface Document {
  id: string
  name: string
  client_id: string | null
  client?: Client
  category: DocumentCategory
  onedrive_url: string | null
  status: DocumentStatus
  document_date: string | null
  expiry_date: string | null
  responsible: string | null
  tags: string[]
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  client_id: string | null
  client?: Client
  responsible: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  notes: string | null
  opening_id: string | null
  completed_at: string | null
  completed_by: string | null
  checklist_items?: TaskChecklistItem[]
  created_at: string
  updated_at: string
}

export interface TaskChecklistItem {
  id: string
  task_id: string
  title: string
  completed: boolean
  completed_at: string | null
  created_at: string
}

export interface Deadline {
  id: string
  title: string
  client_id: string | null
  client?: Client
  category: DeadlineCategory
  responsible: string | null
  due_date: string
  status: 'pendiente' | 'completado' | 'vencido'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  entity_type: 'client' | 'document' | 'task' | 'deadline'
  entity_id: string
  action: string
  description: string
  user_name: string | null
  created_at: string
}

export interface NewFolder {
  id: string
  folder_name: string
  folder_path: string | null
  source: 'manual' | 'local_folder' | 'onedrive'
  onedrive_url: string | null
  detected_at: string
  status: FolderStatus
  notes: string | null
  created_at: string
}

export interface OpeningChecklistItem {
  id: string
  opening_id: string
  title: string
  completed: boolean
  completed_at: string | null
  responsible: string | null
  note: string | null
  sort_order: number
  created_at: string
}

export interface AccountOpening {
  id: string
  client_id: string | null
  client?: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null
  folder_name: string
  onedrive_url: string | null
  advisor: string | null
  start_date: string
  opened_date: string | null
  status: OpeningStatus
  priority: 'baja' | 'normal' | 'alta' | 'urgente'
  notes: string | null
  documentation_completed_at: string | null
  sent_to_bank_at: string | null
  account_opened_at: string | null
  checklist_items?: OpeningChecklistItem[]
  created_at: string
  updated_at: string
}

export interface OpeningNote {
  id: string
  opening_id: string
  text: string
  author: string | null
  status: 'abierta' | 'cerrada'
  closed_at: string | null
  closed_by: string | null
  created_at: string
}

export interface OpeningTask {
  id: string
  opening_id: string
  title: string
  description: string | null
  responsible: string | null
  due_date: string | null
  priority: 'baja' | 'normal' | 'alta' | 'urgente'
  status: 'pendiente' | 'en_proceso' | 'bloqueada' | 'completada'
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface OpeningDocument {
  id: string
  opening_id: string
  name: string
  category: string | null
  link: string | null
  status: 'pendiente' | 'recibido' | 'aprobado' | 'rechazado'
  expiry_date: string | null
  notes: string | null
  created_at: string
}

// =============================================
// CEO / BI
// =============================================

export type FileType = 'aum' | 'production' | 'revenue' | 'clients' | 'pipeline' | 'other'

export interface UploadedFile {
  id: string
  file_name: string
  file_type: FileType
  row_count: number | null
  uploaded_by: string | null
  status: 'procesado' | 'error' | 'pendiente'
  notes: string | null
  uploaded_at: string
}

export interface AumRecord {
  id: string
  period: string
  client_id: string | null
  client_name: string | null
  segment: string | null
  aum_value: number
  currency: string
  source_file: string | null
  created_at: string
}

export interface ProductionRecord {
  id: string
  period: string
  advisor: string | null
  client_name: string | null
  client_id: string | null
  production_value: number
  product_type: string | null
  currency: string
  source_file: string | null
  created_at: string
}

export interface RevenueRecord {
  id: string
  period: string
  revenue_type: string | null
  value: number
  currency: string
  notes: string | null
  source_file: string | null
  created_at: string
}

export interface BusinessMetric {
  id: string
  metric_name: string
  metric_type: string | null
  period: string | null
  value: number
  currency: string | null
  source_file: string | null
  created_at: string
}

export interface CeoData {
  aum_records: AumRecord[]
  production_records: ProductionRecord[]
  revenue_records: RevenueRecord[]
  active_clients: number
  in_apertura_clients: number
  new_clients_this_month: number
  openings_this_month: number
  uploaded_files: UploadedFile[]
}

export interface DashboardStats {
  open_tasks: number
  overdue_tasks: number
  urgent_tasks: number
  upcoming_deadlines: number
  pending_documents: number
  openings_in_process: number
  openings_delayed: number
  pending_folders: number
  today_events: Event[]
  today_tasks: Task[]
  recent_clients: Client[]
  recent_activity: ActivityLog[]
}
