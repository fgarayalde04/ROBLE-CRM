import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const metadata: Metadata = { title: 'Panel del día | Roble Capital' }
export const dynamic = 'force-dynamic'

const OPENING_STATUS_LABEL: Record<string, string> = {
  carpeta_creada: 'Pendiente de apertura',
  recolectando_informacion: 'Recolectando info',
  documentacion_incompleta: 'Doc. incompleta',
  documentacion_completa: 'Doc. completa',
  formularios_enviados: 'Formularios enviados',
  enviado_al_banco: 'Enviado al banco',
  en_revision_banco: 'En revisión banco',
  cuenta_abierta: 'Cuenta abierta',
  trabado: 'Trabado',
  descartado: 'Descartado',
}

const OPENING_STATUS_COLOR: Record<string, string> = {
  carpeta_creada: 'bg-gray-100 text-gray-500',
  recolectando_informacion: 'bg-blue-50 text-blue-600',
  documentacion_incompleta: 'bg-amber-50 text-amber-600',
  documentacion_completa: 'bg-yellow-50 text-yellow-700',
  formularios_enviados: 'bg-purple-50 text-purple-600',
  enviado_al_banco: 'bg-indigo-50 text-indigo-600',
  en_revision_banco: 'bg-orange-50 text-orange-600',
  cuenta_abierta: 'bg-emerald-50 text-emerald-700',
  trabado: 'bg-red-50 text-red-600',
  descartado: 'bg-gray-50 text-gray-400',
}

const PRIORITY_COLOR: Record<string, string> = {
  urgente: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  media: 'bg-blue-50 text-blue-600',
  baja: 'bg-gray-100 text-gray-500',
}

// Roles that see company-wide data (all tasks, all openings)
const WIDE_ROLES = ['admin', 'ceo', 'direccion']

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function timeAgo(dateStr: string): string {
  const d = daysAgo(dateStr)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  if (d < 30) return `hace ${Math.floor(d / 7)} sem.`
  return `hace ${Math.floor(d / 30)} mes.`
}

function firstName(fullName: string): string {
  return fullName.split(' ')[0]
}

function uniqueById(rows: any[]): any[] {
  const map = new Map<string, any>()
  for (const row of rows) {
    if (row?.id) map.set(row.id, row)
  }
  return Array.from(map.values())
}

function sortByDueDate(a: any, b: any): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
  if (a.due_date) return -1
  if (b.due_date) return 1
  return (a.title ?? '').localeCompare(b.title ?? '')
}

interface PageProps { searchParams: { taskView?: string } }

export default async function PanelDelDiaPage({ searchParams }: PageProps) {
  noStore()

  const session = await getSession()
  const isWideRole = session ? WIDE_ROLES.includes(session.role) : false
  const userName = session?.name ?? ''

  const taskViewParam = (searchParams.taskView ?? 'mine') as string
  const effectiveTaskView = taskViewParam === 'team' && !isWideRole ? 'mine' : taskViewParam

  const today = new Date().toISOString().split('T')[0]
  const sevenDaysLater = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const formattedDate = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  const taskSelect = 'id, title, priority, due_date, responsible, created_by, status, client:clients(id, first_name, last_name), task_shares(user_name)'
  const openTaskStatuses = ['pendiente', 'en_proceso', 'bloqueado']
  const { data: sharedRefs } = userName
    ? await supabaseAdmin.from('task_shares').select('task_id').eq('user_name', userName)
    : { data: [] as any[] }
  const sharedTaskIds = Array.from(new Set((sharedRefs ?? []).map((r: any) => r.task_id).filter(Boolean)))

  // ─── Personal tasks: responsible + created by me + shared with me ───────────
  const tasksResponsibleQuery = userName
    ? supabaseAdmin
        .from('tasks')
        .select(taskSelect)
        .in('status', openTaskStatuses)
        .eq('responsible', userName)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20)
    : Promise.resolve({ data: [], error: null })

  const tasksCreatedQuery = userName
    ? supabaseAdmin
        .from('tasks')
        .select(taskSelect)
        .in('status', openTaskStatuses)
        .eq('created_by', userName)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20)
    : Promise.resolve({ data: [], error: null })

  const tasksSharedQuery = sharedTaskIds.length > 0
    ? supabaseAdmin
        .from('tasks')
        .select(taskSelect)
        .in('status', openTaskStatuses)
        .in('id', sharedTaskIds)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20)
    : Promise.resolve({ data: [], error: null })

  // Personal openings (filtered by advisor for non-wide roles)
  const myOpeningsQuery = isWideRole
    ? supabaseAdmin
        .from('account_openings')
        .select('id, folder_name, status, priority, start_date, updated_at, advisor, client:clients(id, first_name, last_name), checklist_items:opening_checklist_items(id, completed)')
        .not('status', 'in', '("cuenta_abierta","descartado")')
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(8)
    : supabaseAdmin
        .from('account_openings')
        .select('id, folder_name, status, priority, start_date, updated_at, advisor, client:clients(id, first_name, last_name), checklist_items:opening_checklist_items(id, completed)')
        .not('status', 'in', '("cuenta_abierta","descartado")')
        .eq('advisor', userName)
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(8)

  // Company-wide alerts — only for wide roles
  const companyOverdueQuery = isWideRole
    ? supabaseAdmin
        .from('tasks')
        .select('id, title, due_date, responsible, client:clients(id, first_name, last_name)')
        .in('status', ['pendiente', 'en_proceso', 'bloqueado'])
        .lt('due_date', today)
        .order('due_date', { ascending: true })
        .limit(10)
    : supabaseAdmin
        .from('tasks')
        .select('id, title, due_date, responsible, client:clients(id, first_name, last_name)')
        .in('status', ['pendiente', 'en_proceso', 'bloqueado'])
        .eq('responsible', userName)
        .lt('due_date', today)
        .limit(0) // returns empty for non-wide (already tracked in myOverdue)

  const [
    tasksResponsibleR,
    tasksCreatedR,
    tasksSharedR,
    myOpeningsR,
    companyOverdueR,
    noResponsibleTasksR,
    stuckOpeningsR,
    staleOpeningsR,
    todayEventsR,
    upcomingDeadlinesR,
    recentActivityR,
    unreadNotificationsR,
    pendingBcuR,
  ] = await Promise.all([
    tasksResponsibleQuery,
    tasksCreatedQuery,
    tasksSharedQuery,
    myOpeningsQuery,

    // Company overdue (wide roles only)
    companyOverdueQuery,

    // Tareas sin responsable (wide roles only)
    isWideRole
      ? supabaseAdmin
          .from('tasks')
          .select('id, title, priority, due_date, created_at')
          .in('status', ['pendiente', 'en_proceso'])
          .is('responsible', null)
          .order('created_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),

    // Aperturas trabadas
    isWideRole
      ? supabaseAdmin
          .from('account_openings')
          .select('id, folder_name, updated_at, advisor, client:clients(id, first_name, last_name)')
          .eq('status', 'trabado')
      : supabaseAdmin
          .from('account_openings')
          .select('id, folder_name, updated_at, advisor, client:clients(id, first_name, last_name)')
          .eq('status', 'trabado')
          .eq('advisor', userName),

    // Aperturas sin movimiento > 14 días
    isWideRole
      ? supabaseAdmin
          .from('account_openings')
          .select('id, folder_name, updated_at, status, advisor, client:clients(id, first_name, last_name)')
          .not('status', 'in', '("cuenta_abierta","descartado","trabado")')
          .lt('updated_at', fourteenDaysAgo)
          .order('updated_at', { ascending: true })
          .limit(6)
      : supabaseAdmin
          .from('account_openings')
          .select('id, folder_name, updated_at, status, advisor, client:clients(id, first_name, last_name)')
          .not('status', 'in', '("cuenta_abierta","descartado","trabado")')
          .eq('advisor', userName)
          .lt('updated_at', fourteenDaysAgo)
          .limit(6),

    // Eventos de hoy
    supabaseAdmin
      .from('events')
      .select('id, title, type, start_time, created_by, participants, client:clients(id, first_name, last_name)')
      .eq('event_date', today)
      .order('start_time', { ascending: true }),

    // Vencimientos próximos
    (isWideRole
      ? supabaseAdmin
          .from('deadlines')
          .select('id, title, due_date, category, responsible, client:clients(id, first_name, last_name)')
          .eq('status', 'pendiente')
          .gte('due_date', today)
          .lte('due_date', sevenDaysLater)
          .order('due_date', { ascending: true })
          .limit(6)
      : supabaseAdmin
          .from('deadlines')
          .select('id, title, due_date, category, responsible, client:clients(id, first_name, last_name)')
          .eq('status', 'pendiente')
          .eq('responsible', userName)
          .gte('due_date', today)
          .lte('due_date', sevenDaysLater)
          .order('due_date', { ascending: true })
          .limit(6)),

    // Actividad reciente
    (isWideRole
      ? supabaseAdmin
          .from('activity_log')
          .select('id, description, user_name, entity_type, entity_id, created_at')
          .order('created_at', { ascending: false })
          .limit(25)
      : supabaseAdmin
          .from('activity_log')
          .select('id, description, user_name, entity_type, entity_id, created_at')
          .eq('user_name', userName)
          .order('created_at', { ascending: false })
          .limit(25)),

    userName
      ? supabaseAdmin
          .from('notifications')
          .select('id, title, message, entity_type, entity_id, created_at')
          .eq('user_name', userName)
          .is('read_at', null)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),

    // BCU compliance pendiente
    supabaseAdmin
      .from('banco_central_compliance')
      .select('id', { count: 'exact', head: true })
      .eq('ficha', false)
      .eq('lista_verificacion', false),
  ])

  const allMyTasksCombined = uniqueById([
    ...((tasksResponsibleR.data ?? []) as any[]),
    ...((tasksCreatedR.data ?? []) as any[]),
    ...((tasksSharedR.data ?? []) as any[]),
  ]).sort(sortByDueDate)

  let myTasks: any[]
  switch (effectiveTaskView) {
    case 'shared':
      myTasks = uniqueById((tasksSharedR.data ?? []) as any[]).sort(sortByDueDate).slice(0, 20)
      break
    case 'created':
      myTasks = uniqueById((tasksCreatedR.data ?? []) as any[]).sort(sortByDueDate).slice(0, 20)
      break
    case 'overdue':
      myTasks = allMyTasksCombined.filter((t: any) => t.due_date && t.due_date < today).slice(0, 20)
      break
    default:
      myTasks = allMyTasksCombined.slice(0, 20)
  }
  const myOverdue = myTasks.filter((t: any) => t.due_date && t.due_date < today).slice(0, 10)
  const myUrgent = myTasks.filter((t: any) => t.priority === 'urgente').slice(0, 6)
  const myOpenings = (myOpeningsR.data ?? []) as any[]
  const companyOverdue = isWideRole ? ((companyOverdueR.data ?? []) as any[]) : myOverdue
  const noResponsibleTasks = (noResponsibleTasksR.data ?? []) as any[]
  const stuckOpenings = (stuckOpeningsR.data ?? []) as any[]
  const staleOpenings = (staleOpeningsR.data ?? []) as any[]
  const todayEvents = ((todayEventsR.data ?? []) as any[]).filter((event: any) => {
    if (isWideRole) return true
    const participants = Array.isArray(event.participants) ? event.participants : []
    return event.created_by === userName || participants.includes(userName)
  })
  const upcomingDeadlines = (upcomingDeadlinesR.data ?? []) as any[]

  // Filter recent activity: exclude entries for completed tasks
  const recentActivityRaw = (recentActivityR.data ?? []) as any[]
  const taskIdsInActivity = Array.from(new Set(
    recentActivityRaw
      .filter((a: any) => a.entity_type === 'task' && a.entity_id)
      .map((a: any) => a.entity_id as string)
  ))
  const completedTaskSet = new Set<string>()
  if (taskIdsInActivity.length > 0) {
    const { data: completedTasks } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .in('id', taskIdsInActivity)
      .eq('status', 'completado')
    for (const t of completedTasks ?? []) completedTaskSet.add(t.id)
  }
  const recentActivity = recentActivityRaw
    .filter((a: any) => !(a.entity_type === 'task' && a.entity_id && completedTaskSet.has(a.entity_id)))
    .slice(0, 10)
  const unreadNotifications = (unreadNotificationsR.data ?? []) as any[]
  const pendingBcuCount = pendingBcuR.count ?? 0

  // Tasks due today (from my tasks)
  const myTasksToday = myTasks.filter((t: any) => t.due_date === today)
  const myTasksFuture = myTasks.filter((t: any) => !t.due_date || t.due_date > today)

  // Alertas de atención requerida
  const alerts: { label: string; count: number; href: string; color: 'red' | 'amber' | 'orange' }[] = []
  if (myOverdue.length > 0)
    alerts.push({ label: `${myOverdue.length} ${myOverdue.length === 1 ? 'tarea vencida' : 'tareas vencidas'}${isWideRole ? ' (empresa)' : ''}`, count: myOverdue.length, href: '/tasks', color: 'red' })
  if (stuckOpenings.length > 0)
    alerts.push({ label: `${stuckOpenings.length} ${stuckOpenings.length === 1 ? 'apertura trabada' : 'aperturas trabadas'}`, count: stuckOpenings.length, href: '/openings', color: 'red' })
  if (staleOpenings.length > 0)
    alerts.push({ label: `${staleOpenings.length} ${staleOpenings.length === 1 ? 'apertura sin movimiento (+14d)' : 'aperturas sin movimiento (+14d)'}`, count: staleOpenings.length, href: '/openings', color: 'amber' })
  if (myUrgent.length > 0)
    alerts.push({ label: `${myUrgent.length} ${myUrgent.length === 1 ? 'tarea urgente' : 'tareas urgentes'}`, count: myUrgent.length, href: '/tasks', color: 'orange' })
  if (isWideRole && noResponsibleTasks.length > 0)
    alerts.push({ label: `${noResponsibleTasks.length} ${noResponsibleTasks.length === 1 ? 'tarea sin responsable' : 'tareas sin responsable'}`, count: noResponsibleTasks.length, href: '/tasks', color: 'amber' })

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#2D3F52]">
            {session ? `Buen día, ${firstName(userName)}` : 'Panel del día'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-400 capitalize">{formattedDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/clients/new" className="px-3 py-1.5 bg-[#2D3F52] text-white text-xs rounded hover:bg-[#354A5E] transition-colors">
            + Cliente
          </Link>
          <Link href="/openings/new" className="px-3 py-1.5 bg-[#2D3F52] text-white text-xs rounded hover:bg-[#354A5E] transition-colors">
            + Apertura
          </Link>
          <Link href="/tasks/new" className="px-3 py-1.5 border border-gray-200 bg-white text-gray-600 text-xs rounded hover:bg-gray-50 transition-colors">
            + Tarea
          </Link>
        </div>
      </div>

      {/* ─── Stat bar ─── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Mis tareas hoy', value: myTasksToday.length, href: '/tasks', alert: myTasksToday.length > 0, color: 'blue' },
          { label: 'Mis vencidas', value: myOverdue.length, href: '/tasks', alert: myOverdue.length > 0, color: 'red' },
          { label: isWideRole ? 'Aperturas empresa' : 'Mis aperturas', value: myOpenings.length, href: '/openings', alert: false, color: 'indigo' },
          { label: 'Vencimientos 7d', value: upcomingDeadlines.length, href: '/calendar', alert: upcomingDeadlines.length > 0, color: 'amber' },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white border border-gray-200 rounded-lg px-4 py-3 hover:shadow-sm transition-shadow flex items-center justify-between"
          >
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${s.alert ? (s.color === 'red' ? 'text-red-600' : s.color === 'amber' ? 'text-amber-600' : 'text-[#2D3F52]') : 'text-[#2D3F52]'}`}>
                {s.value}
              </p>
            </div>
            {s.alert && s.value > 0 && (
              <div className={`w-2 h-2 rounded-full shrink-0 ${s.color === 'red' ? 'bg-red-500' : s.color === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} />
            )}
          </Link>
        ))}
      </div>

      {/* ─── Main grid 3 columns ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ══════════════ COL 1+2: Left+Center ══════════════ */}
        <div className="xl:col-span-2 space-y-5">

          {/* ── A. MI TRABAJO ── */}
          <Section
            label="A"
            title="Mi trabajo"
            subtitle={`${effectiveTaskView === 'shared' ? 'Compartidas conmigo' : effectiveTaskView === 'created' ? 'Creadas por mí' : effectiveTaskView === 'overdue' ? 'Tareas vencidas' : 'Mis tareas + compartidas'} · ${isWideRole ? 'Todas las aperturas' : 'Mis aperturas'}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">

              {/* Tareas personales */}
              <div>
                <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
                  <div className="flex gap-0.5 flex-wrap">
                    {[
                      { label: 'Mías', value: 'mine' },
                      { label: 'Compartidas', value: 'shared' },
                      { label: 'Creadas', value: 'created' },
                      { label: 'Vencidas', value: 'overdue' },
                    ].map((tab) => (
                      <Link
                        key={tab.value}
                        href={`/?taskView=${tab.value}`}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                          effectiveTaskView === tab.value
                            ? 'bg-[#2D3F52] text-white'
                            : 'text-gray-500 hover:text-[#2D3F52] hover:bg-gray-100'
                        }`}
                      >
                        {tab.label}
                      </Link>
                    ))}
                    {isWideRole && (
                      <Link
                        href="/tasks?view=team"
                        className="px-2 py-0.5 text-[10px] font-medium rounded text-gray-500 hover:text-[#2D3F52] hover:bg-gray-100 transition-colors"
                      >
                        Equipo →
                      </Link>
                    )}
                  </div>
                  <Link href="/tasks" className="text-[11px] text-blue-500 hover:underline shrink-0">Ver todas</Link>
                </div>
                {myTasks.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">Sin tareas pendientes.</p>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {/* Today's tasks first */}
                    {myTasksToday.length > 0 && (
                      <li className="px-4 py-1.5 bg-blue-50/40">
                        <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider">Hoy</span>
                      </li>
                    )}
                    {myTasksToday.map((t: any) => (
                      <li key={t.id} className="px-4 py-2.5 flex items-start justify-between gap-2 bg-blue-50/20">
                        <div className="flex-1 min-w-0">
                          <Link href={`/tasks/${t.id}`} className="text-sm text-gray-800 hover:text-[#2D3F52] font-medium leading-snug block truncate">
                            {t.title}
                          </Link>
                          <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                            {t.client && (
                              <span className="text-[10px] text-gray-500 truncate">
                                {t.client.first_name} {t.client.last_name}
                              </span>
                            )}
                            {t.responsible && (
                              <span className="text-[10px] text-gray-400">
                                · {t.responsible}
                              </span>
                            )}
                            {t.task_shares?.length > 0 && (
                              <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                                + {t.task_shares.map((s: any) => s.user_name).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        {t.priority && t.priority !== 'media' && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_COLOR[t.priority]}`}>
                            {t.priority}
                          </span>
                        )}
                      </li>
                    ))}
                    {/* Future tasks */}
                    {myTasksFuture.length > 0 && myTasksToday.length > 0 && (
                      <li className="px-4 py-1.5 bg-gray-50/60">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Próximas</span>
                      </li>
                    )}
                    {myTasksFuture.slice(0, 5).map((t: any) => (
                      <li key={t.id} className="px-4 py-2.5 flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <Link href={`/tasks/${t.id}`} className="text-sm text-gray-800 hover:text-[#2D3F52] font-medium leading-snug block truncate">
                            {t.title}
                          </Link>
                          <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                            {t.client && (
                              <span className="text-[10px] text-gray-500 truncate">{t.client.first_name} {t.client.last_name}</span>
                            )}
                            {t.due_date && (
                              <span className="text-[10px] text-gray-400 shrink-0">
                                {format(new Date(t.due_date + 'T00:00:00'), 'd MMM', { locale: es })}
                              </span>
                            )}
                            {t.responsible && (
                              <span className="text-[10px] text-gray-400 shrink-0">· {t.responsible}</span>
                            )}
                            {t.task_shares?.length > 0 && (
                              <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
                                + {t.task_shares.map((s: any) => s.user_name).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        {t.priority && t.priority !== 'media' && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_COLOR[t.priority]}`}>
                            {t.priority}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Aperturas */}
              <div>
                <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {isWideRole ? 'Aperturas activas' : 'Mis aperturas'}
                  </span>
                  <Link href="/openings" className="text-[11px] text-blue-500 hover:underline">Ver todas</Link>
                </div>
                {myOpenings.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">Sin aperturas en proceso.</p>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {myOpenings.map((o: any) => {
                      const checklist = o.checklist_items ?? []
                      const done = checklist.filter((i: any) => i.completed).length
                      const total = checklist.length
                      const days = daysAgo(o.start_date ?? o.updated_at)
                      return (
                        <li key={o.id} className="px-4 py-2.5 flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <Link href={`/openings/${o.id}`} className="text-sm text-gray-800 hover:text-[#2D3F52] font-medium leading-snug truncate block">
                              {o.folder_name}
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                              {o.client && (
                                <span className="text-[11px] text-gray-400 truncate">{o.client.first_name} {o.client.last_name}</span>
                              )}
                              {total > 0 && (
                                <span className="text-[10px] text-gray-400 shrink-0">{done}/{total}</span>
                              )}
                              {isWideRole && o.advisor && (
                                <span className="text-[10px] text-gray-400 shrink-0">· {o.advisor}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${OPENING_STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-500'}`}>
                              {OPENING_STATUS_LABEL[o.status] ?? o.status}
                            </span>
                            <span className="text-[10px] text-gray-400">{days}d</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          {/* ── C. INBOX EMPRESA ── */}
          <Section
            label="C"
            title="Inbox empresa"
            subtitle="Sin responsable · Agenda · BCU · Vencimientos"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">

              {/* Sin responsable (wide roles) + agenda */}
              <div>
                {isWideRole && (
                  <>
                    <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Sin responsable</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${noResponsibleTasks.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                        {noResponsibleTasks.length}
                      </span>
                    </div>
                    {noResponsibleTasks.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-400">Todas las tareas tienen responsable.</p>
                    ) : (
                      <ul className="divide-y divide-gray-50">
                        {noResponsibleTasks.map((t: any) => (
                          <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                            <p className="text-sm text-gray-700 truncate flex-1">{t.title}</p>
                            <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(t.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {/* Agenda hoy */}
                {todayEvents.length > 0 ? (
                  <>
                    {isWideRole && (
                      <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Agenda hoy</span>
                      </div>
                    )}
                    {!isWideRole && (
                      <div className="px-4 pt-3 pb-2">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Agenda hoy</span>
                      </div>
                    )}
                    <ul className="divide-y divide-gray-50">
                      {todayEvents.map((e: any) => (
                        <li key={e.id} className="px-4 py-2.5 flex items-center gap-3">
                          {e.start_time && (
                            <span className="text-[11px] font-mono text-[#16A34A] shrink-0">{e.start_time.slice(0, 5)}</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">{e.title}</p>
                            {e.client && (
                              <p className="text-[11px] text-gray-400">{e.client.first_name} {e.client.last_name}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  !isWideRole && (
                    <div className="px-4 py-4">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Agenda hoy</p>
                      <p className="text-xs text-gray-400">Sin eventos para hoy.</p>
                    </div>
                  )
                )}
              </div>

              {/* Vencimientos + BCU */}
              <div>
                <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Vencimientos 7 días</span>
                  <Link href="/calendar" className="text-[11px] text-blue-500 hover:underline">Ver todos</Link>
                </div>
                {upcomingDeadlines.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">Sin vencimientos próximos.</p>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {upcomingDeadlines.map((d: any) => (
                      <li key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{d.title}</p>
                          {d.client && (
                            <p className="text-[11px] text-gray-400 truncate">{d.client.first_name} {d.client.last_name}</p>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-500 font-medium shrink-0">
                          {format(new Date(d.due_date + 'T00:00:00'), 'd MMM', { locale: es })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* BCU */}
                {pendingBcuCount > 0 && (
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold text-amber-700">{pendingBcuCount}</span> registros BCU sin ficha ni verificación
                      </p>
                    </div>
                    <Link href="/banco-central" className="text-[11px] text-blue-500 hover:underline shrink-0">Ver BCU</Link>
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>

        {/* ══════════════ COL 3: Right ══════════════ */}
        <div className="space-y-5">

          {/* ── B. ATENCIÓN REQUERIDA ── */}
          <Section
            label="B"
            title="Atención requerida"
            subtitle="Alertas detectadas"
            accent="red"
          >
            {alerts.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xs text-gray-400">Todo en orden.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {alerts.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.color === 'red' ? 'bg-red-500' : a.color === 'orange' ? 'bg-orange-400' : 'bg-amber-400'}`} />
                      <p className={`text-xs font-medium ${a.color === 'red' ? 'text-red-700' : a.color === 'orange' ? 'text-orange-700' : 'text-amber-700'}`}>
                        {a.label}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Tareas vencidas detalle */}
            {myOverdue.length > 0 && (
              <div className="border-t border-gray-100">
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">Vencidas</span>
                </div>
                <ul className="divide-y divide-red-50/50">
                  {myOverdue.slice(0, 5).map((t: any) => (
                    <li key={t.id} className="px-4 py-2 bg-red-50/20 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 font-medium truncate">{t.title}</p>
                        {t.client && (
                          <p className="text-[10px] text-gray-400 truncate">{t.client.first_name} {t.client.last_name}</p>
                        )}
                        {isWideRole && t.responsible && (
                          <p className="text-[10px] text-gray-400 truncate">→ {t.responsible}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-red-500 font-medium shrink-0">
                        {format(new Date(t.due_date + 'T00:00:00'), 'd MMM', { locale: es })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Aperturas trabadas / sin movimiento */}
            {(stuckOpenings.length > 0 || staleOpenings.length > 0) && (
              <div className="border-t border-gray-100">
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
                    {stuckOpenings.length > 0 ? 'Trabadas' : 'Sin movimiento'}
                  </span>
                </div>
                <ul className="divide-y divide-amber-50/50">
                  {[...stuckOpenings, ...staleOpenings].slice(0, 4).map((o: any) => (
                    <li key={o.id} className="px-4 py-2 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Link href={`/openings/${o.id}`} className="text-xs text-gray-700 font-medium hover:underline truncate block">
                          {o.folder_name}
                        </Link>
                        {o.client && (
                          <p className="text-[10px] text-gray-400 truncate">{o.client.first_name} {o.client.last_name}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(o.updated_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {unreadNotifications.length > 0 && (
            <Section
              label="N"
              title="Notificaciones"
              subtitle="Tareas compartidas contigo"
            >
              <ul className="divide-y divide-gray-50">
                {unreadNotifications.map((n: any) => (
                  <li key={n.id}>
                    <Link
                      href={n.entity_type === 'task' ? `/tasks?view=shared&highlight=${n.entity_id}` : '/'}
                      className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-xs font-semibold text-[#2D3F52]">{n.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* ── D. ACTIVIDAD RECIENTE ── */}
          <Section
            label="D"
            title="Actividad reciente"
            subtitle={isWideRole ? 'Últimas acciones del equipo' : 'Tus últimas acciones'}
          >
            {recentActivity.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-400">Sin actividad registrada.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentActivity.map((a: any) => (
                  <li key={a.id} className="px-4 py-2.5 flex items-start gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      a.entity_type === 'client' ? 'bg-blue-400'
                      : a.entity_type === 'task' ? 'bg-emerald-400'
                      : a.entity_type === 'document' ? 'bg-purple-400'
                      : 'bg-gray-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 leading-snug">{a.description}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {timeAgo(a.created_at)}
                        {a.user_name ? ` · ${a.user_name}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  label, title, subtitle, accent, children,
}: {
  label: string
  title: string
  subtitle: string
  accent?: 'red'
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className={`px-4 py-3 border-b flex items-center gap-3 ${accent === 'red' ? 'border-red-100 bg-red-50/30' : 'border-gray-100'}`}>
        <span className={`text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center shrink-0 ${accent === 'red' ? 'bg-red-100 text-red-600' : 'bg-[#2D3F52]/8 text-[#2D3F52]'}`}>
          {label}
        </span>
        <div>
          <h2 className={`text-sm font-semibold ${accent === 'red' ? 'text-red-700' : 'text-[#2D3F52]'}`}>{title}</h2>
          <p className="text-[10px] text-gray-400 mt-0">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
