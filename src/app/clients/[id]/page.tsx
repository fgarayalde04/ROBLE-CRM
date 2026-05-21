import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDocuments, getTasks, getDeadlines } from '@/lib/supabase/queries'
import { supabaseAdmin } from '@/lib/supabase/admin'
import StatusBadge from '@/components/StatusBadge'
import ComplianceBlock from '@/components/ComplianceBlock'
import FolderButton from '@/components/FolderButton'
import ClientCloseButton from '@/components/ClientCloseButton'
import DeleteClientButton from '@/components/DeleteClientButton'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Client } from '@/types/platform'

export const dynamic = 'force-dynamic'

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { data } = await supabaseAdmin.from('clients').select('first_name, last_name').eq('id', params.id).single()
    if (!data) return { title: 'Cliente' }
    return { title: `${data.first_name} ${data.last_name}` }
  } catch {
    return { title: 'Cliente' }
  }
}

const riskLabel: Record<string, string> = {
  conservador: 'Conservador',
  moderado: 'Moderado',
  moderado_agresivo: 'Moderado agresivo',
  agresivo: 'Agresivo',
}

const categoryLabel: Record<string, string> = {
  contrato: 'Contrato', perfil_riesgo: 'Perfil de riesgo', reporte: 'Reporte',
  propuesta: 'Propuesta', documento_legal: 'Documento legal', fact_sheet: 'Fact sheet',
  comunicacion: 'Comunicación', formulario: 'Formulario', analisis_inversion: 'Análisis de inversión', otro: 'Otro',
}

export default async function ClientDetailPage({ params }: Props) {
  const { data: clientData } = await supabaseAdmin.from('clients').select('*').eq('id', params.id).single()
  if (!clientData) notFound()
  const client = clientData as Client

  let documents, tasks, deadlines
  try {
    ;[documents, tasks, deadlines] = await Promise.all([
      getDocuments({ clientId: params.id }),
      getTasks({ clientId: params.id }),
      getDeadlines({ clientId: params.id }),
    ])
  } catch {
    notFound()
  }

  const openTasks = tasks.filter((t) => t.status !== 'completado')
  const pendingDocs = documents.filter((d) => d.status === 'pendiente' || d.status === 'revisar')

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/clients" className="hover:text-gray-600">Clientes</Link>
        <span>/</span>
        <span className="text-gray-600">{client.first_name} {client.last_name}</span>
      </div>

      {/* Closed banner */}
      {client.status === 'cerrado' && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <span>
            <span className="font-medium text-gray-700">Cuenta cerrada</span>
            {client.closed_at && (
              <> · {new Date(client.closed_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</>
            )}
            {client.closed_by && <> · por <span className="font-medium text-gray-700">{client.closed_by}</span></>}
            {client.close_reason && <> · <span className="italic">"{client.close_reason}"</span></>}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className={`text-2xl font-semibold ${client.status === 'cerrado' ? 'text-gray-400' : 'text-gray-900'}`}>
              {client.first_name} {client.last_name}
            </h1>
            <StatusBadge type="client_status" value={client.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            #{client.client_number}
            {client.advisor ? ` · Asesor: ${client.advisor}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {client.onedrive_folder_url && (
            <FolderButton path={client.onedrive_folder_url} label="Abrir carpeta" variant="badge" />
          )}
          <Link
            href={`/clients/${client.id}/edit`}
            className="px-4 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors"
          >
            Editar
          </Link>
          <ClientCloseButton
            clientId={client.id}
            clientName={`${client.first_name} ${client.last_name}`}
            isClosed={client.status === 'cerrado'}
            closedAt={client.closed_at}
            closedBy={client.closed_by}
            closeReason={client.close_reason}
          />
          <DeleteClientButton
            clientId={client.id}
            clientName={`${client.first_name} ${client.last_name}`}
            redirectAfter
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Datos del cliente */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Datos de contacto</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-400">Nombre completo</dt>
                <dd className="text-sm text-gray-900 mt-0.5">{client.first_name} {client.last_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">N° de cliente</dt>
                <dd className="text-sm font-mono text-gray-900 mt-0.5">{client.client_number}</dd>
              </div>
              {client.email && (
                <div>
                  <dt className="text-xs text-gray-400">Email</dt>
                  <dd className="text-sm text-gray-900 mt-0.5">
                    <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a>
                  </dd>
                </div>
              )}
              {client.phone && (
                <div>
                  <dt className="text-xs text-gray-400">Teléfono</dt>
                  <dd className="text-sm text-gray-900 mt-0.5">{client.phone}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Perfil</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-400">Estado</dt>
                <dd className="mt-0.5"><StatusBadge type="client_status" value={client.status} /></dd>
              </div>
              {client.risk_profile && (
                <div>
                  <dt className="text-xs text-gray-400">Perfil de riesgo</dt>
                  <dd className="text-sm text-gray-900 mt-0.5">{riskLabel[client.risk_profile]}</dd>
                </div>
              )}
              {client.advisor && (
                <div>
                  <dt className="text-xs text-gray-400">Asesor</dt>
                  <dd className="text-sm text-gray-900 mt-0.5">{client.advisor}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-400">Alta</dt>
                <dd className="text-sm text-gray-900 mt-0.5">
                  {format(new Date(client.created_at), "d 'de' MMMM yyyy", { locale: es })}
                </dd>
              </div>
            </dl>
          </div>

          {client.onedrive_folder_url && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Carpeta</h2>
              <FolderButton path={client.onedrive_folder_url} label="Abrir carpeta del cliente" variant="badge" />
            </div>
          )}

          {client.notes && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Notas</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Panel derecho */}
        <div className="xl:col-span-2 space-y-4">
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-400">Documentos</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{documents.length}</p>
              {pendingDocs.length > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">{pendingDocs.length} pendientes</p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-400">Tareas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{tasks.length}</p>
              {openTasks.length > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">{openTasks.length} abiertas</p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-400">Vencimientos</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{deadlines.length}</p>
            </div>
          </div>

          {/* Documentos */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Documentos</h2>
              <Link href={`/documents?clientId=${client.id}`} className="text-xs text-blue-600 hover:underline">Ver todos</Link>
            </div>
            {documents.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">Sin documentos.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {documents.slice(0, 5).map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-900">{d.name}</p>
                        <p className="text-xs text-gray-400">{categoryLabel[d.category] ?? d.category}</p>
                      </td>
                      <td className="px-5 py-2.5"><StatusBadge type="document_status" value={d.status} /></td>
                      <td className="px-5 py-2.5 text-right">
                        {d.onedrive_url ? (
                          <a href={d.onedrive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                            Abrir
                          </a>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Tareas */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Tareas / Pendientes</h2>
              <Link href={`/tasks?clientId=${client.id}`} className="text-xs text-blue-600 hover:underline">Ver todas</Link>
            </div>
            {openTasks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">Sin tareas abiertas.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {openTasks.slice(0, 5).map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-900">{t.title}</p>
                        {t.due_date && (
                          <p className="text-xs text-gray-400">
                            Vence: {format(new Date(t.due_date + 'T00:00:00'), "d MMM yyyy", { locale: es })}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-2.5"><StatusBadge type="priority" value={t.priority} /></td>
                      <td className="px-5 py-2.5"><StatusBadge type="task_status" value={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Vencimientos */}
          {deadlines.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">Vencimientos</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {deadlines.slice(0, 5).map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-900">{d.title}</p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(d.due_date + 'T00:00:00'), "d 'de' MMMM yyyy", { locale: es })}
                        </p>
                      </td>
                      <td className="px-5 py-2.5">
                        <StatusBadge type="task_status" value={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Banco Central */}
          <div className="mt-6 bg-white border border-[#E2E8F0] rounded-lg p-5">
            <ComplianceBlock clientId={client.id} />
          </div>
        </div>
      </div>
    </div>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}
