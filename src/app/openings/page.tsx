import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import type { AccountOpening, Client, OpeningStatus } from '@/types/platform'
import { differenceInDays, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import AutoRefresh from '@/components/AutoRefresh'
import AutoSyncOpenings from '@/components/AutoSyncOpenings'
import DeleteOpeningButton from '@/components/DeleteOpeningButton'
import StartOpeningButton from '@/components/StartOpeningButton'

const ALL_OPENINGS_ROLES = ['admin', 'asistente', 'ceo']

export const metadata: Metadata = { title: 'Apertura de cuentas' }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<OpeningStatus, string> = {
  carpeta_creada: 'Carpeta creada',
  recolectando_informacion: 'Recolectando info',
  documentacion_incompleta: 'Doc. incompleta',
  documentacion_completa: 'Doc. completa',
  formularios_enviados: 'Form. enviados',
  enviado_al_banco: 'Enviado al banco',
  en_revision_banco: 'En revision banco',
  cuenta_abierta: 'Cuenta abierta',
  trabado: 'Trabado',
  descartado: 'Descartado',
}

const STATUS_COLOR: Record<OpeningStatus, string> = {
  carpeta_creada: 'bg-gray-100 text-gray-600 border-gray-200',
  recolectando_informacion: 'bg-blue-50 text-blue-700 border-blue-200',
  documentacion_incompleta: 'bg-amber-50 text-amber-700 border-amber-200',
  documentacion_completa: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  formularios_enviados: 'bg-purple-50 text-purple-700 border-purple-200',
  enviado_al_banco: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  en_revision_banco: 'bg-orange-50 text-orange-700 border-orange-200',
  cuenta_abierta: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  trabado: 'bg-red-50 text-red-600 border-red-200',
  descartado: 'bg-gray-100 text-gray-400 border-gray-200',
}

const PRIORITY_COLOR: Record<string, string> = {
  alta: 'bg-amber-50 text-amber-700 border-amber-200',
  urgente: 'bg-red-50 text-red-600 border-red-200',
}

const TERMINAL_STATUSES: OpeningStatus[] = ['cuenta_abierta', 'descartado']
const ACTIVE_STATUSES: OpeningStatus[] = [
  'carpeta_creada', 'recolectando_informacion', 'documentacion_incompleta',
  'documentacion_completa', 'formularios_enviados', 'enviado_al_banco', 'en_revision_banco',
]
const BANK_STATUSES: OpeningStatus[] = ['enviado_al_banco', 'en_revision_banco']

type FilterKey = 'todas' | 'activas' | 'trabadas' | 'banco' | 'cerradas'

interface Props {
  searchParams: { filter?: string }
}

export default async function OpeningsPage({ searchParams }: Props) {
  noStore()

  const session = await getSession()
  const folderFilter = session?.allowed_folders ?? null

  const filter = (searchParams.filter ?? 'activas') as FilterKey
  let openingsQuery = supabaseAdmin
    .from('account_openings')
    .select(`
      *,
      client:clients(id, first_name, last_name, client_number),
      checklist_items:opening_checklist_items(id, completed)
    `)
    .order('created_at', { ascending: false })

  if (folderFilter) {
    openingsQuery = openingsQuery.in('advisor', folderFilter)
  }

  const { data: allOpenings } = await openingsQuery

  const openings = (allOpenings ?? []) as (AccountOpening & {
    client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null
    checklist_items: { id: string; completed: boolean }[]
  })[]

  // Fetch open notes count per opening
  const { data: notesData } = await supabaseAdmin
    .from('opening_notes')
    .select('opening_id')
    .eq('status', 'abierta')

  const openNotesByOpening: Record<string, number> = {}
  for (const n of notesData ?? []) {
    openNotesByOpening[n.opening_id] = (openNotesByOpening[n.opening_id] ?? 0) + 1
  }

  // Fetch pending tasks count per opening
  const { data: tasksData } = await supabaseAdmin
    .from('opening_tasks')
    .select('opening_id')
    .neq('status', 'completada')

  const pendingTasksByOpening: Record<string, number> = {}
  for (const t of tasksData ?? []) {
    pendingTasksByOpening[t.opening_id] = (pendingTasksByOpening[t.opening_id] ?? 0) + 1
  }

  // KPIs
  const today = new Date()
  const monthStart = startOfMonth(today).toISOString()
  const monthEnd = endOfMonth(today).toISOString()

  const kpiActivas = openings.filter((o) => ACTIVE_STATUSES.includes(o.status as OpeningStatus)).length
  const kpiTrabadas = openings.filter((o) => o.status === 'trabado').length
  const kpiBanco = openings.filter((o) => BANK_STATUSES.includes(o.status as OpeningStatus)).length
  const kpiAbiertas = openings.filter(
    (o) =>
      o.status === 'cuenta_abierta' &&
      o.account_opened_at &&
      o.account_opened_at >= monthStart &&
      o.account_opened_at <= monthEnd
  ).length

  // Filtered list
  let filtered = openings
  if (filter === 'activas') filtered = openings.filter((o) => ACTIVE_STATUSES.includes(o.status as OpeningStatus))
  else if (filter === 'trabadas') filtered = openings.filter((o) => o.status === 'trabado')
  else if (filter === 'banco') filtered = openings.filter((o) => BANK_STATUSES.includes(o.status as OpeningStatus))
  else if (filter === 'cerradas') filtered = openings.filter((o) => o.status === 'cuenta_abierta' || o.status === 'descartado')

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'activas', label: 'Activas' },
    { key: 'trabadas', label: 'Trabadas' },
    { key: 'banco', label: 'Enviadas al banco' },
    { key: 'cerradas', label: 'Cerradas' },
    { key: 'todas', label: 'Todas' },
  ]

  return (
    <div className="p-8">
      <AutoRefresh intervalMs={5000} />
      <AutoSyncOpenings />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Apertura de cuentas</h1>
          <p className="mt-1 text-sm text-gray-500">
            {kpiActivas} activas · {kpiBanco} en banco · {kpiTrabadas} trabadas
          </p>
        </div>
        <Link
          href="/openings/new"
          className="px-4 py-2 text-white text-sm rounded hover:bg-[#354A5E] transition-colors bg-[#2D3F52]"
        >
          Nueva apertura
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-lg border border-[#E2E8F0] p-4">
          <p className="text-xs text-gray-400">Activas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{kpiActivas}</p>
          <p className="text-xs text-gray-400 mt-0.5">en proceso</p>
        </div>
        <div className={`rounded-lg border p-4 ${kpiTrabadas > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-[#E2E8F0]'}`}>
          <p className={`text-xs ${kpiTrabadas > 0 ? 'text-red-500' : 'text-gray-400'}`}>Trabadas</p>
          <p className={`text-2xl font-bold mt-1 ${kpiTrabadas > 0 ? 'text-red-700' : 'text-gray-900'}`}>{kpiTrabadas}</p>
          <p className={`text-xs mt-0.5 ${kpiTrabadas > 0 ? 'text-red-400' : 'text-gray-400'}`}>requieren atencion</p>
        </div>
        <div className="bg-white rounded-lg border border-[#E2E8F0] p-4">
          <p className="text-xs text-gray-400">En banco</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{kpiBanco}</p>
          <p className="text-xs text-gray-400 mt-0.5">enviadas o en revision</p>
        </div>
        <div className={`rounded-lg border p-4 ${kpiAbiertas > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-[#E2E8F0]'}`}>
          <p className={`text-xs ${kpiAbiertas > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>Abiertas este mes</p>
          <p className={`text-2xl font-bold mt-1 ${kpiAbiertas > 0 ? 'text-emerald-700' : 'text-gray-900'}`}>{kpiAbiertas}</p>
          <p className={`text-xs mt-0.5 ${kpiAbiertas > 0 ? 'text-emerald-500' : 'text-gray-400'}`}>cuentas nuevas</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/openings?filter=${f.key}`}
            className={`px-3 py-1 text-xs rounded border transition-colors ${
              filter === f.key
                ? 'text-white border-transparent bg-[#2D3F52]'
                : 'bg-white text-gray-600 border-[#E2E8F0] hover:border-gray-400'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No hay aperturas en esta categoria.</p>
            <Link href="/openings/new" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
              Iniciar nueva apertura
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente / Carpeta</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Asesor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dias</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notas</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tareas</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((o) => {
                const isTerminal = TERMINAL_STATUSES.includes(o.status as OpeningStatus)
                const days = isTerminal && o.account_opened_at
                  ? differenceInDays(parseISO(o.account_opened_at), parseISO(o.start_date))
                  : differenceInDays(today, parseISO(o.start_date))
                const isDelayed = !isTerminal && days > 30

                const checklist = o.checklist_items ?? []
                const checklistDone = checklist.filter((i) => i.completed).length
                const checklistTotal = checklist.length

                const openNotes = openNotesByOpening[o.id] ?? 0
                const pendingTasks = pendingTasksByOpening[o.id] ?? 0

                return (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <Link
                          href={`/openings/${o.id}`}
                          className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                        >
                          {o.folder_name}
                        </Link>
                        {o.client && (
                          <div className="mt-0.5">
                            <Link
                              href={`/clients/${o.client.id}`}
                              className="text-xs text-gray-400 hover:text-blue-600 hover:underline"
                            >
                              {o.client.first_name} {o.client.last_name}
                            </Link>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${STATUS_COLOR[o.status as OpeningStatus]}`}>
                          {STATUS_LABEL[o.status as OpeningStatus]}
                        </span>
                        {(o.priority === 'alta' || o.priority === 'urgente') && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[o.priority]}`}>
                            {o.priority.charAt(0).toUpperCase() + o.priority.slice(1)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{o.advisor ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${isDelayed ? 'text-red-600' : 'text-gray-500'}`}>
                        {o.status === 'descartado' ? '—' : `${days}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {checklistTotal > 0 ? `${checklistDone}/${checklistTotal}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {openNotes > 0 ? (
                        <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          {openNotes}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pendingTasks > 0 ? (
                        <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                          {pendingTasks}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {o.status === 'carpeta_creada' && (
                          <StartOpeningButton openingId={o.id} />
                        )}
                        <Link
                          href={`/openings/${o.id}`}
                          className="text-xs px-3 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                        >
                          Ver detalle
                        </Link>
                        <DeleteOpeningButton openingId={o.id} folderName={o.folder_name} />
                      </div>
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
