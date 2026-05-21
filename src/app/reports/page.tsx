import type { Metadata } from 'next'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import StatusBadge from '@/components/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const metadata: Metadata = { title: 'Reportes' }
export const dynamic = 'force-dynamic'

async function getReportData() {
  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const nextThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: clientsPendingDoc },
    { data: overdueTasks },
    { data: docsToReview },
    { data: upcomingDeadlines },
    { data: recentDocs },
    { data: tasksByResponsible },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id, client_number, first_name, last_name, advisor, status')
      .eq('status', 'pendiente_documentacion')
      .order('updated_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, title, responsible, priority, due_date, client:clients(id, first_name, last_name)')
      .in('status', ['pendiente', 'en_proceso'])
      .lt('due_date', today)
      .order('due_date', { ascending: true }),
    supabase
      .from('documents')
      .select('id, name, status, client:clients(id, first_name, last_name), responsible, updated_at')
      .in('status', ['pendiente', 'revisar'])
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('deadlines')
      .select('id, title, due_date, category, responsible, client:clients(id, first_name, last_name)')
      .eq('status', 'pendiente')
      .lte('due_date', nextThirtyDays)
      .gte('due_date', today)
      .order('due_date', { ascending: true }),
    supabase
      .from('documents')
      .select('id, name, category, status, created_at, client:clients(id, first_name, last_name)')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('tasks')
      .select('responsible, status')
      .in('status', ['pendiente', 'en_proceso', 'bloqueado']),
  ])

  const responsibleCount: Record<string, number> = {}
  for (const t of tasksByResponsible ?? []) {
    const key = t.responsible ?? 'Sin asignar'
    responsibleCount[key] = (responsibleCount[key] ?? 0) + 1
  }

  return {
    clientsPendingDoc: clientsPendingDoc ?? [],
    overdueTasks: overdueTasks ?? [],
    docsToReview: docsToReview ?? [],
    upcomingDeadlines: upcomingDeadlines ?? [],
    recentDocs: recentDocs ?? [],
    tasksByResponsible: Object.entries(responsibleCount).sort((a, b) => b[1] - a[1]),
  }
}

const categoryLabel: Record<string, string> = {
  contrato: 'Contrato', perfil_riesgo: 'Perfil de riesgo', reporte: 'Reporte',
  propuesta: 'Propuesta', documento_legal: 'Doc. legal', fact_sheet: 'Fact sheet',
  comunicacion: 'Comunicación', formulario: 'Formulario', analisis_inversion: 'Análisis', otro: 'Otro',
}

const deadlineCategoryLabel: Record<string, string> = {
  documento: 'Documento', tarea: 'Tarea', revision_cliente: 'Rev. cliente',
  reporte: 'Reporte', renovacion: 'Renovación', seguimiento: 'Seguimiento',
}

export default async function ReportsPage() {
  let data
  try {
    data = await getReportData()
  } catch {
    data = {
      clientsPendingDoc: [],
      overdueTasks: [],
      docsToReview: [],
      upcomingDeadlines: [],
      recentDocs: [],
      tasksByResponsible: [],
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Reportes</h1>
        <p className="mt-1 text-sm text-gray-500">Resumen operativo generado en tiempo real</p>
      </div>

      <div className="space-y-6">

        {/* Tareas vencidas */}
        <ReportSection
          title="Tareas vencidas"
          count={data.overdueTasks.length}
          href="/tasks"
          urgent={data.overdueTasks.length > 0}
        >
          {data.overdueTasks.length === 0 ? (
            <EmptyRow label="Sin tareas vencidas" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Tarea</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Cliente</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Responsable</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Prioridad</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Vencio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.overdueTasks.map((t: any) => (
                  <tr key={t.id} className="hover:bg-red-50/20">
                    <td className="px-4 py-2 font-medium text-gray-900">{t.title}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {t.client ? `${t.client.first_name} ${t.client.last_name}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{t.responsible ?? '—'}</td>
                    <td className="px-4 py-2"><StatusBadge type="priority" value={t.priority} /></td>
                    <td className="px-4 py-2 text-red-600 font-medium">
                      {t.due_date ? format(new Date(t.due_date + 'T00:00:00'), 'd MMM yyyy', { locale: es }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        {/* Vencimientos próximos 30 días */}
        <ReportSection
          title="Vencimientos próximos (30 días)"
          count={data.upcomingDeadlines.length}
          href="/calendar"
          urgent={data.upcomingDeadlines.length > 0}
        >
          {data.upcomingDeadlines.length === 0 ? (
            <EmptyRow label="Sin vencimientos próximos" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Descripción</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Cliente</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Categoría</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.upcomingDeadlines.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">
                      {format(new Date(d.due_date + 'T00:00:00'), 'd MMM', { locale: es })}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{d.title}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {d.client ? `${d.client.first_name} ${d.client.last_name}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{deadlineCategoryLabel[d.category] ?? d.category}</td>
                    <td className="px-4 py-2 text-gray-500">{d.responsible ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        {/* Documentos para revisar */}
        <ReportSection
          title="Documentos pendientes o para revisar"
          count={data.docsToReview.length}
          href="/documents?status=revisar"
        >
          {data.docsToReview.length === 0 ? (
            <EmptyRow label="Sin documentos pendientes" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Documento</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Cliente</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Estado</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.docsToReview.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{d.name}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {d.client ? `${d.client.first_name} ${d.client.last_name}` : '—'}
                    </td>
                    <td className="px-4 py-2"><StatusBadge type="document_status" value={d.status} /></td>
                    <td className="px-4 py-2 text-gray-500">{d.responsible ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        {/* Clientes con documentación pendiente */}
        <ReportSection
          title="Clientes con documentación pendiente"
          count={data.clientsPendingDoc.length}
          href="/clients?status=pendiente_documentacion"
        >
          {data.clientsPendingDoc.length === 0 ? (
            <EmptyRow label="Sin clientes con documentación pendiente" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">N° Cliente</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Nombre</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Asesor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.clientsPendingDoc.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{c.client_number}</td>
                    <td className="px-4 py-2">
                      <Link href={`/clients/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                        {c.first_name} {c.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{c.advisor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        {/* Tareas por responsable */}
        <ReportSection title="Tareas abiertas por responsable" count={data.tasksByResponsible.length} href="/tasks">
          {data.tasksByResponsible.length === 0 ? (
            <EmptyRow label="Sin tareas abiertas" />
          ) : (
            <div className="px-5 py-4">
              <div className="space-y-2">
                {data.tasksByResponsible.map(([name, count]) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-40 truncate">{name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-[#2D3F52] h-2 rounded-full"
                        style={{ width: `${Math.min(100, (count / (data.tasksByResponsible[0]?.[1] ?? 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ReportSection>

        {/* Documentos agregados este mes */}
        <ReportSection title="Documentos agregados en los últimos 30 días" count={data.recentDocs.length} href="/documents">
          {data.recentDocs.length === 0 ? (
            <EmptyRow label="Sin documentos recientes" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Documento</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Cliente</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Categoría</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Estado</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recentDocs.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{d.name}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {d.client ? `${d.client.first_name} ${d.client.last_name}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{categoryLabel[d.category] ?? d.category}</td>
                    <td className="px-4 py-2"><StatusBadge type="document_status" value={d.status} /></td>
                    <td className="px-4 py-2 text-gray-500">
                      {format(new Date(d.created_at), 'd MMM', { locale: es })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

      </div>
    </div>
  )
}

function ReportSection({
  title,
  count,
  href,
  urgent,
  children,
}: {
  title: string
  count: number
  href: string
  urgent?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          {count > 0 && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urgent ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
              {count}
            </span>
          )}
        </div>
        <Link href={href} className="text-xs text-blue-600 hover:underline">
          Ver en lista
        </Link>
      </div>
      {children}
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return <p className="px-5 py-4 text-sm text-gray-400">{label}</p>
}
