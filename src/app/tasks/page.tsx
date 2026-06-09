import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import type { Task, Client } from '@/types/platform'
import StatusBadge from '@/components/StatusBadge'
import TaskCompleteButton from '@/components/TaskCompleteButton'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const metadata: Metadata = { title: 'Pendientes' }

type TaskWithClient = Task & {
  client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null
  task_shares?: { user_name: string }[]
}

type View = 'mine' | 'shared' | 'created' | 'team' | 'pending' | 'overdue' | 'completed'

interface Props {
  searchParams: { view?: string; responsible?: string; status?: string; q?: string }
}

export default async function TasksPage({ searchParams }: Props) {
  noStore()

  const session = await getSession()
  const isSupervisor = !!session && ['admin', 'ceo', 'direccion'].includes(session.role)
  const cookieStore = cookies()
  const currentUser = session?.name ?? cookieStore.get('rc_user_name')?.value ?? null

  const rawView = searchParams.view as View | undefined
  const requestedView: View = rawView ?? 'mine'
  const view: View = requestedView === 'team' && !isSupervisor ? 'mine' : requestedView

  const today = new Date().toISOString().split('T')[0]
  const openStatuses = ['pendiente', 'en_proceso', 'bloqueado']
  const taskSelect = '*, client:clients(id, first_name, last_name, client_number), task_shares(user_name)'

  const { data: sharedRefs } = currentUser
    ? await supabaseAdmin.from('task_shares').select('task_id').eq('user_name', currentUser)
    : { data: [] as any[] }
  const sharedTaskIds = Array.from(new Set((sharedRefs ?? []).map((r: any) => r.task_id).filter(Boolean)))

  async function runTaskQuery(builder: any) {
    const { data, error } = await builder
    if (error) throw error
    return (data ?? []) as TaskWithClient[]
  }

  function uniqueTasks(rows: TaskWithClient[]) {
    const map = new Map<string, TaskWithClient>()
    for (const row of rows) map.set(row.id, row)
    return Array.from(map.values())
  }

  let tasks: TaskWithClient[] = []
  try {
    const applySearch = (builder: any) =>
      searchParams.q ? builder.ilike('title', `%${searchParams.q}%`) : builder

    if (view === 'mine' && currentUser) {
      const [responsibleRows, createdRows, sharedRows] = await Promise.all([
        runTaskQuery(applySearch(
          supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).eq('responsible', currentUser)
        )),
        runTaskQuery(applySearch(
          supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).eq('created_by', currentUser)
        )),
        sharedTaskIds.length
          ? runTaskQuery(applySearch(
              supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).in('id', sharedTaskIds)
            ))
          : Promise.resolve([]),
      ])
      tasks = uniqueTasks([...responsibleRows, ...createdRows, ...sharedRows])
    } else if (view === 'shared' && currentUser) {
      tasks = sharedTaskIds.length
        ? await runTaskQuery(applySearch(
            supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).in('id', sharedTaskIds)
          ))
        : []
    } else if (view === 'created' && currentUser) {
      tasks = await runTaskQuery(applySearch(
        supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).eq('created_by', currentUser)
      ))
    } else if (view === 'overdue') {
      const baseRows = currentUser && !isSupervisor
        ? uniqueTasks([
            ...(await runTaskQuery(applySearch(supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).eq('responsible', currentUser)))),
            ...(await runTaskQuery(applySearch(supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).eq('created_by', currentUser)))),
            ...(sharedTaskIds.length ? await runTaskQuery(applySearch(supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).in('id', sharedTaskIds))) : []),
          ])
        : await runTaskQuery(applySearch(supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses)))
      tasks = baseRows.filter((t) => t.due_date && t.due_date < today)
    } else if (view === 'completed') {
      tasks = await runTaskQuery(applySearch(
        supabaseAdmin.from('tasks').select(taskSelect).eq('status', 'completado').order('completed_at', { ascending: false }).limit(50)
      ))
      if (currentUser && !isSupervisor) {
        tasks = tasks.filter((t) =>
          t.responsible === currentUser ||
          t.created_by === currentUser ||
          sharedTaskIds.includes(t.id)
        )
      }
    } else if (view === 'pending' && currentUser && !isSupervisor) {
      const [responsibleRows, createdRows, sharedRows] = await Promise.all([
        runTaskQuery(applySearch(
          supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).eq('responsible', currentUser)
        )),
        runTaskQuery(applySearch(
          supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).eq('created_by', currentUser)
        )),
        sharedTaskIds.length
          ? runTaskQuery(applySearch(
              supabaseAdmin.from('tasks').select(taskSelect).in('status', openStatuses).in('id', sharedTaskIds)
            ))
          : Promise.resolve([]),
      ])
      tasks = uniqueTasks([...responsibleRows, ...createdRows, ...sharedRows])
    } else {
      let query = supabaseAdmin.from('tasks').select(taskSelect)
      if (searchParams.status) query = query.eq('status', searchParams.status)
      else query = query.in('status', openStatuses)
      tasks = await runTaskQuery(applySearch(query))
    }

    tasks = tasks.sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return a.title.localeCompare(b.title)
    })
  } catch {
    tasks = []
  }

  // KPI counts (always from full non-completed set for context)
  let kpiOpen = 0
  let kpiOverdue = 0
  let kpiUrgent = 0
  try {
    const { data: allOpenRaw } = await supabaseAdmin
      .from('tasks')
      .select('id, priority, due_date, status, responsible, created_by')
      .in('status', ['pendiente', 'en_proceso', 'bloqueado'])

    const allOpen = currentUser && !isSupervisor
      ? (allOpenRaw ?? []).filter((t: any) =>
          t.responsible === currentUser ||
          t.created_by === currentUser ||
          sharedTaskIds.includes(t.id)
        )
      : (allOpenRaw ?? [])

    if (allOpen) {
      kpiOpen = allOpen.length
      kpiOverdue = allOpen.filter((t) => t.due_date && t.due_date < today).length
      kpiUrgent = allOpen.filter((t) => t.priority === 'urgente').length
    }
  } catch {
    // ignore
  }

  const tabs: { label: string; value: View; href: string }[] = [
    { label: 'Mis tareas', value: 'mine', href: '/tasks?view=mine' },
    { label: 'Compartidas conmigo', value: 'shared', href: '/tasks?view=shared' },
    { label: 'Creadas por mí', value: 'created', href: '/tasks?view=created' },
    ...(isSupervisor ? [{ label: 'Equipo', value: 'team' as View, href: '/tasks?view=team' }] : []),
    { label: 'Pendientes', value: 'pending', href: '/tasks?view=pending' },
    { label: 'Vencidas', value: 'overdue', href: '/tasks?view=overdue' },
    { label: 'Completadas', value: 'completed', href: '/tasks?view=completed' },
  ]

  const showResponsible = view === 'team' || view === 'overdue' || view === 'shared' || view === 'created'

  return (
    <div className="p-4 md:p-8">
      {/* Header — hidden on mobile */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D3F52]">Pendientes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {currentUser ? `Vista de: ${currentUser}` : 'Todas las tareas'}
          </p>
        </div>
        <Link
          href="/tasks/new"
          className="px-4 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors"
        >
          Nueva tarea
        </Link>
      </div>
      {/* Mobile: quick action */}
      <div className="md:hidden flex items-center justify-end mb-3">
        <Link
          href="/tasks/new"
          className="px-3 py-1.5 bg-[#2D3F52] text-white text-xs rounded-lg font-medium"
        >
          + Nueva tarea
        </Link>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map((tab) => {
          const isActive = view === tab.value
          return (
            <Link
              key={tab.value}
              href={tab.href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-[#2D3F52] text-[#2D3F52]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* User context banner */}
      <div className="mb-4 text-xs text-gray-500">
        {currentUser ? (
          <span>
            Filtrando por:{' '}
            <span className="font-medium text-[#2D3F52]">{currentUser}</span>
            {isSupervisor && (
              <>
                {' · '}
                <Link href="/tasks?view=team" className="text-[#16A34A] hover:underline">
                  ver equipo completo
                </Link>
              </>
            )}
          </span>
        ) : (
          <span>
            Para ver tus tareas personales, configura tu nombre en el selector arriba.
          </span>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Abiertas</p>
          <p className="text-2xl font-bold text-[#2D3F52]">{kpiOpen}</p>
        </div>
        <div className={`bg-white rounded border p-4 ${kpiOverdue > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <p className="text-xs text-gray-400 mb-1">Vencidas</p>
          <p className={`text-2xl font-bold ${kpiOverdue > 0 ? 'text-red-600' : 'text-[#2D3F52]'}`}>
            {kpiOverdue}
          </p>
        </div>
        <div className={`bg-white rounded border p-4 ${kpiUrgent > 0 ? 'border-amber-200' : 'border-gray-200'}`}>
          <p className="text-xs text-gray-400 mb-1">Urgentes</p>
          <p className={`text-2xl font-bold ${kpiUrgent > 0 ? 'text-amber-600' : 'text-[#2D3F52]'}`}>
            {kpiUrgent}
          </p>
        </div>
      </div>

      {/* Filters (team view only) */}
      {view === 'team' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-center">
          <form className="flex gap-2 items-center flex-1 min-w-48">
            <input type="hidden" name="view" value="team" />
            <input
              name="q"
              defaultValue={searchParams.q ?? ''}
              placeholder="Buscar por título..."
              className="flex-1 text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-gray-100 text-sm text-gray-700 rounded hover:bg-gray-200"
            >
              Buscar
            </button>
          </form>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Abiertas', value: '' },
              { label: 'Pendiente', value: 'pendiente' },
              { label: 'En proceso', value: 'en_proceso' },
              { label: 'Bloqueado', value: 'bloqueado' },
            ].map((f) => (
              <Link
                key={f.value}
                href={`/tasks?view=team${f.value ? `&status=${f.value}` : ''}`}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  (searchParams.status ?? '') === f.value
                    ? 'bg-[#2D3F52] text-white border-[#2D3F52]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {tasks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No se encontraron tareas.</p>
            <Link href="/tasks/new" className="mt-2 inline-block text-sm text-[#16A34A] hover:underline">
              Crear nueva tarea
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 w-8" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Titulo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Compartida con
                </th>
                {showResponsible && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Responsable
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Prioridad
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Vence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tasks.map((t) => {
                const isOverdue =
                  t.status !== 'completado' && t.due_date && t.due_date < today
                const isCompleted = t.status === 'completado'
                return (
                  <tr
                    key={t.id}
                    className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/40' : ''} ${isCompleted ? 'opacity-60' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <TaskCompleteButton
                        taskId={t.id}
                        completed={isCompleted}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${t.id}`} className="block hover:text-[#2D3F52]">
                        <p className={`font-medium text-gray-900 ${isCompleted ? 'line-through' : ''}`}>
                          {t.title}
                        </p>
                        {t.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-48">
                            {t.description}
                          </p>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {t.client ? (
                        <Link
                          href={`/clients/${t.client.id}`}
                          className="text-[#16A34A] hover:underline"
                        >
                          {t.client.first_name} {t.client.last_name}
                        </Link>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {t.task_shares && t.task_shares.length > 0 ? (
                        <span className="text-xs">
                          {t.task_shares.map((s) => s.user_name).join(', ')}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {showResponsible && (
                      <td className="px-4 py-3 text-gray-500">
                        {t.responsible ?? <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <StatusBadge type="priority" value={t.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge type="task_status" value={t.status} />
                    </td>
                    <td className="px-4 py-3">
                      {t.due_date ? (
                        <span
                          className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}
                        >
                          {format(new Date(t.due_date + 'T00:00:00'), 'd MMM yyyy', {
                            locale: es,
                          })}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
