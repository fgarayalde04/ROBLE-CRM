import type { Metadata } from 'next'
import Link from 'next/link'
import { getDeadlines } from '@/lib/supabase/queries'
import type { Deadline, Client } from '@/types/platform'
import StatusBadge from '@/components/StatusBadge'
import { format, isThisWeek, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

type DeadlineWithClient = Deadline & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null }

export const metadata: Metadata = { title: 'Vencimientos' }
export const dynamic = 'force-dynamic'

const categoryLabel: Record<string, string> = {
  documento: 'Documento',
  tarea: 'Tarea',
  revision_cliente: 'Revisión cliente',
  reporte: 'Reporte',
  renovacion: 'Renovación',
  seguimiento: 'Seguimiento',
}

interface Props {
  searchParams: { status?: string; category?: string; clientId?: string; responsible?: string }
}

export default async function CalendarPage({ searchParams }: Props) {
  let deadlines: DeadlineWithClient[]
  try {
    deadlines = await getDeadlines({
      status: searchParams.status,
      category: searchParams.category,
      clientId: searchParams.clientId,
      responsible: searchParams.responsible,
    })
  } catch {
    deadlines = []
  }

  const today = new Date().toISOString().split('T')[0]
  const overdue = deadlines.filter((d) => d.status === 'pendiente' && d.due_date < today)
  const thisWeek = deadlines.filter((d) => {
    try { return d.status === 'pendiente' && isThisWeek(parseISO(d.due_date), { weekStartsOn: 1 }) } catch { return false }
  })
  const upcoming = deadlines.filter((d) => d.status === 'pendiente' && d.due_date >= today)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vencimientos</h1>
          <p className="mt-1 text-sm text-gray-500">{deadlines.length} registros</p>
        </div>
        <Link
          href="/calendar/new"
          className="px-4 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors"
        >
          Nuevo vencimiento
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className={`bg-white rounded border p-4 ${overdue.length > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <p className="text-xs text-gray-400">Vencidos</p>
          <p className={`text-2xl font-bold ${overdue.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdue.length}</p>
        </div>
        <div className={`bg-white rounded border p-4 ${thisWeek.length > 0 ? 'border-amber-200' : 'border-gray-200'}`}>
          <p className="text-xs text-gray-400">Esta semana</p>
          <p className={`text-2xl font-bold ${thisWeek.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{thisWeek.length}</p>
        </div>
        <div className="bg-white rounded border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Pendientes totales</p>
          <p className="text-2xl font-bold text-gray-900">{upcoming.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Todos', value: '' },
            { label: 'Pendiente', value: 'pendiente' },
            { label: 'Completado', value: 'completado' },
            { label: 'Vencido', value: 'vencido' },
          ].map((f) => (
            <Link
              key={f.value}
              href={`/calendar${f.value ? `?status=${f.value}` : ''}`}
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
        <div className="flex gap-2 flex-wrap">
          {Object.entries(categoryLabel).map(([value, label]) => (
            <Link
              key={value}
              href={`/calendar?category=${value}`}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                searchParams.category === value
                  ? 'bg-slate-600 text-white border-slate-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Grouped by month */}
      {deadlines.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No hay vencimientos registrados.</p>
          <Link href="/calendar/new" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
            Agregar vencimiento
          </Link>
        </div>
      ) : (
        <DeadlineTable deadlines={deadlines} today={today} />
      )}
    </div>
  )
}

function DeadlineTable({ deadlines, today }: { deadlines: DeadlineWithClient[]; today: string }) {
  const groups: Record<string, typeof deadlines> = {}
  for (const d of deadlines) {
    try {
      const key = format(parseISO(d.due_date), 'MMMM yyyy', { locale: es })
      if (!groups[key]) groups[key] = []
      groups[key].push(d)
    } catch {}
  }

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([month, items]) => (
        <div key={month} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide capitalize">{month}</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {items.map((d) => {
                const isOverdue = d.status === 'pendiente' && d.due_date < today
                return (
                  <tr key={d.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                    <td className="px-5 py-3 w-28">
                      <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                        {format(parseISO(d.due_date), 'd MMM', { locale: es })}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{d.title}</p>
                      {d.client && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {d.client.first_name} {d.client.last_name}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{categoryLabel[d.category] ?? d.category}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{d.responsible ?? '—'}</td>
                    <td className="px-5 py-3">
                      <StatusBadge type="task_status" value={d.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
