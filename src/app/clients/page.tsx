import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import type { Client } from '@/types/platform'
import FolderButton from '@/components/FolderButton'
import ClientStatusToggle from '@/components/ClientStatusToggle'
import DeleteClientButton from '@/components/DeleteClientButton'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Roles que pueden ver TODOS los clientes (no solo los propios)
const ALL_CLIENTS_ROLES = ['admin', 'asistente', 'ceo']

export const metadata: Metadata = { title: 'Clientes' }
export const dynamic = 'force-dynamic'

const ADVISORS = ['Francisco', 'Guillermo', 'Sandra', 'Ines', 'Javier', 'Fernando - Federico']

interface Props {
  searchParams: { q?: string; advisor?: string; tab?: string }
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)   return 'ahora'
  if (mins  < 60)  return `hace ${mins}m`
  if (hours < 24)  return `hace ${hours}h`
  if (days  < 30)  return `hace ${days}d`
  return new Date(dateStr).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

export default async function ClientsPage({ searchParams }: Props) {
  noStore()

  const session = await getSession()
  // allowed_folders: null = sin restricción, string[] = filtrar por esas carpetas
  const folderFilter = session?.allowed_folders ?? null

  const activeTab = searchParams.tab === 'cerrados' ? 'cerrados'
    : searchParams.tab === 'todos' ? 'todos'
    : 'activos'

  let clients: Client[] = []
  let taskCounts: Record<string, number> = {}
  let totalActivos = 0
  let totalCerrados = 0

  try {
    // Counts for tab badges (scoped by advisor if needed)
    let qActivos = supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'activo')
    let qCerrados = supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'cerrado')
    if (folderFilter) {
      qActivos = qActivos.in('advisor', folderFilter)
      qCerrados = qCerrados.in('advisor', folderFilter)
    }
    const [{ count: ca }, { count: cc }] = await Promise.all([qActivos, qCerrados])
    totalActivos  = ca ?? 0
    totalCerrados = cc ?? 0

    let query = supabaseAdmin
      .from('clients')
      .select('id, first_name, last_name, status, advisor, onedrive_folder_url, updated_at, closed_at, closed_by, close_reason')
      .order('updated_at', { ascending: false })

    if (activeTab === 'activos') {
      query = query.eq('status', 'activo')
    } else if (activeTab === 'cerrados') {
      query = query.eq('status', 'cerrado')
    }

    // Scope by allowed folders
    if (folderFilter) {
      query = query.in('advisor', folderFilter)
    }

    if (searchParams.q) {
      query = query.or(
        `first_name.ilike.%${searchParams.q}%,last_name.ilike.%${searchParams.q}%`
      )
    }
    // Manual advisor filter pill — only when no folder restriction
    if (!folderFilter && searchParams.advisor) {
      query = query.eq('advisor', searchParams.advisor)
    }

    const [{ data: clientData }, { data: taskData }] = await Promise.all([
      query,
      supabaseAdmin
        .from('tasks')
        .select('client_id')
        .eq('status', 'pendiente')
        .not('client_id', 'is', null),
    ])

    clients = (clientData ?? []) as Client[]

    for (const t of taskData ?? []) {
      if (t.client_id) taskCounts[t.client_id] = (taskCounts[t.client_id] ?? 0) + 1
    }
  } catch {
    clients = []
  }

  function filterHref(params: Record<string, string>) {
    const merged: Record<string, string> = {}
    if (searchParams.q) merged.q = searchParams.q
    if (searchParams.advisor) merged.advisor = searchParams.advisor
    if (activeTab !== 'activos') merged.tab = activeTab
    Object.assign(merged, params)
    Object.keys(merged).forEach((k) => { if (!merged[k]) delete merged[k] })
    const qs = new URLSearchParams(merged).toString()
    return `/clients${qs ? `?${qs}` : ''}`
  }

  function tabHref(tab: string) {
    const merged: Record<string, string> = {}
    if (searchParams.q) merged.q = searchParams.q
    if (tab !== 'activos') merged.tab = tab
    const qs = new URLSearchParams(merged).toString()
    return `/clients${qs ? `?${qs}` : ''}`
  }

  const isCerradosTab = activeTab === 'cerrados'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D3F52]">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500">{clients.length} registros</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {/* Estado tabs */}
        {([
          { key: 'activos',   label: 'Activos',   count: totalActivos },
          { key: 'cerrados',  label: 'Cerrados',  count: totalCerrados },
          { key: 'todos',     label: 'Todos',     count: totalActivos + totalCerrados },
        ] as { key: string; label: string; count: number }[]).map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              activeTab === t.key
                ? 'border-[#2D3F52] text-[#2D3F52]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === t.key ? 'bg-[#2D3F52] text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {t.count}
            </span>
          </Link>
        ))}

        <div className="flex-1" />

        <Link
          href="/clients/carpetas"
          className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 -mb-px transition-colors"
        >
          Carpetas
        </Link>
      </div>

      {/* Banner cerrados */}
      {isCerradosTab && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          Clientes cerrados — no aparecen en métricas, dashboards ni operativa activa. Podés reabrirlos desde la ficha.
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <form className="flex gap-2 items-center flex-1 min-w-48">
          {searchParams.advisor && <input type="hidden" name="advisor" value={searchParams.advisor} />}
          {activeTab !== 'activos' && <input type="hidden" name="tab" value={activeTab} />}
          <input
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Buscar por nombre..."
            className="flex-1 text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-gray-100 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Buscar
          </button>
        </form>

        {/* Advisor pills — only when no folder restriction */}
        {!folderFilter && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Asesor:</span>
            <Link
              href={filterHref({ advisor: '' })}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                !searchParams.advisor
                  ? 'bg-[#2D3F52] text-white border-[#2D3F52]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              Todos
            </Link>
            {ADVISORS.map((a) => (
              <Link
                key={a}
                href={filterHref({ advisor: a })}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  searchParams.advisor === a
                    ? 'bg-[#16A34A] text-white border-[#16A34A]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {a}
              </Link>
            ))}
          </div>
        )}
        {/* Badge when folder-scoped */}
        {folderFilter && folderFilter.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-[#2D3F52] bg-[#2D3F52]/5 px-3 py-1.5 rounded-lg border border-[#2D3F52]/10">
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            Carpeta{folderFilter.length > 1 ? 's' : ''}: <strong>{folderFilter.join(', ')}</strong>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {clients.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-400">
              {isCerradosTab ? 'No hay clientes cerrados.' : 'No se encontraron clientes.'}
            </p>
          </div>
        ) : isCerradosTab ? (
          /* ─── Tabla cerrados ─── */
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Asesor</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Fecha cierre</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cerrado por</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Motivo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Últ. actividad</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/60 transition-colors bg-gray-50/30">
                  <td className="px-5 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium text-gray-500 hover:text-[#2D3F52] hover:underline line-through decoration-gray-300">
                      {c.first_name} {c.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {c.advisor
                      ? <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{c.advisor}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {c.closed_at
                      ? format(new Date(c.closed_at), "d MMM yyyy", { locale: es })
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.closed_by ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">{c.close_reason ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(c.updated_at)}</td>
                  <td className="px-4 py-3">
                    <ClientStatusToggle
                      clientId={c.id}
                      clientName={`${c.first_name} ${c.last_name}`}
                      isClosed={true}
                      closedAt={c.closed_at}
                      closedBy={c.closed_by}
                      closeReason={c.close_reason}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <DeleteClientButton
                      clientId={c.id}
                      clientName={`${c.first_name} ${c.last_name}`}
                      compact
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /* ─── Tabla activos / todos ─── */
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Asesor</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tareas</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Últ. actividad</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Carpeta</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((c) => {
                const openTasks = taskCounts[c.id] ?? 0
                const isClosed = c.status === 'cerrado'
                return (
                  <tr key={c.id} className={`hover:bg-gray-50/60 transition-colors ${isClosed ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-3">
                      <Link href={`/clients/${c.id}`} className={`font-medium hover:underline ${isClosed ? 'text-gray-400 line-through decoration-gray-300' : 'text-[#2D3F52]'}`}>
                        {c.first_name} {c.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {c.advisor
                        ? <span className="text-xs font-medium text-[#2D3F52] bg-[#2D3F52]/5 px-2 py-0.5 rounded">{c.advisor}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <ClientStatusToggle
                        clientId={c.id}
                        clientName={`${c.first_name} ${c.last_name}`}
                        isClosed={isClosed}
                        closedAt={c.closed_at}
                        closedBy={c.closed_by}
                        closeReason={c.close_reason}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {openTasks > 0 ? (
                        <Link href={`/clients/${c.id}#tareas`} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded hover:bg-amber-100 transition-colors">
                          <span>{openTasks}</span>
                          <span className="text-amber-500">tarea{openTasks !== 1 ? 's' : ''}</span>
                        </Link>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(c.updated_at)}</td>
                    <td className="px-4 py-3">
                      <FolderButton path={c.onedrive_folder_url} label="Abrir" />
                    </td>
                    <td className="px-3 py-3">
                      <DeleteClientButton
                        clientId={c.id}
                        clientName={`${c.first_name} ${c.last_name}`}
                        compact
                      />
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
