import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import type { Client } from '@/types/platform'
import OneDriveFolderButton from '@/components/OneDriveFolderButton'
import ClientStatusToggle from '@/components/ClientStatusToggle'
import DeleteClientButton from '@/components/DeleteClientButton'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Roles que pueden ver TODOS los clientes (no solo los propios)
const ALL_CLIENTS_ROLES = ['admin', 'asistente', 'ceo']

export const metadata: Metadata = { title: 'Clientes' }
export const dynamic = 'force-dynamic'

const ADVISORS = ['Francisco', 'Guillermo', 'Sandra', 'Ines', 'Javier', 'Fernando - Federico']

type SortKey = 'nombre' | 'created_at' | 'updated_at'
type SortDir = 'asc' | 'desc'

interface Props {
  searchParams: { q?: string; advisor?: string; tab?: string; sort?: string; dir?: string }
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

  const activeSort: SortKey = (searchParams.sort as SortKey) ?? 'updated_at'
  const activeDir:  SortDir = (searchParams.dir  as SortDir) ?? 'desc'

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
      .select('id, first_name, last_name, status, advisor, phone, onedrive_folder_url, drive_id, item_id, web_url, updated_at, created_at, closed_at, closed_by, close_reason')

    if (activeSort === 'nombre') {
      query = query
        .order('last_name',  { ascending: activeDir === 'asc' })
        .order('first_name', { ascending: activeDir === 'asc' })
    } else {
      query = query.order(activeSort, { ascending: activeDir === 'asc' })
    }

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
    if (activeSort !== 'updated_at') merged.sort = activeSort
    if (activeDir !== 'desc') merged.dir = activeDir
    Object.assign(merged, params)
    Object.keys(merged).forEach((k) => { if (!merged[k]) delete merged[k] })
    const qs = new URLSearchParams(merged).toString()
    return `/clients${qs ? `?${qs}` : ''}`
  }

  function sortHref(col: SortKey) {
    const newDir: SortDir = activeSort === col && activeDir === 'asc' ? 'desc' : 'asc'
    return filterHref({ sort: col, dir: newDir })
  }

  function SortIcon({ col }: { col: SortKey }) {
    const active = activeSort === col
    return (
      <svg className={`ml-1 w-3 h-3 ${active ? 'text-[#2D3F52]' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {!active && <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />}
        {active && activeDir === 'asc'  && <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />}
        {active && activeDir === 'desc' && <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
      </svg>
    )
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
    <div className="p-4 md:p-8">
      {/* Header — hidden on mobile (title shown in MobileHeader) */}
      <div className="hidden md:flex items-center justify-between mb-6">
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

      {/* ─── Mobile cards ─── */}
      <div className="md:hidden space-y-2">
        {clients.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400">
              {isCerradosTab ? 'No hay clientes cerrados.' : 'No se encontraron clientes.'}
            </p>
          </div>
        ) : clients.map((c) => {
          const openTasks = taskCounts[c.id] ?? 0
          const isClosed = c.status === 'cerrado'
          return (
            <div
              key={c.id}
              className={`bg-white border border-gray-200 rounded-xl px-4 py-3 ${isClosed ? 'opacity-60' : ''}`}
            >
              {/* Name + badges row */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <Link
                  href={`/clients/${c.id}`}
                  className={`font-semibold text-[15px] leading-tight ${isClosed ? 'text-gray-400 line-through' : 'text-[#2D3F52]'}`}
                >
                  {c.first_name} {c.last_name}
                </Link>
                {openTasks > 0 && (
                  <Link
                    href={`/clients/${c.id}#tareas`}
                    className="shrink-0 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                  >
                    {openTasks} tarea{openTasks !== 1 ? 's' : ''}
                  </Link>
                )}
              </div>

              {/* Meta row */}
              <div className="flex items-center flex-wrap gap-2 mb-3">
                {c.advisor && (
                  <span className="text-xs font-medium text-[#2D3F52] bg-[#2D3F52]/6 px-2 py-0.5 rounded">
                    {c.advisor}
                  </span>
                )}
                <ClientStatusToggle
                  clientId={c.id}
                  clientName={`${c.first_name} ${c.last_name}`}
                  isClosed={isClosed}
                  closedAt={c.closed_at}
                  closedBy={c.closed_by}
                  closeReason={c.close_reason}
                />
                {c.created_at && (
                  <span className="text-[11px] text-gray-400">
                    Alta {format(new Date(c.created_at), "d MMM yyyy", { locale: es })}
                  </span>
                )}
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/clients/${c.id}`}
                  className="flex-1 text-center text-xs font-medium text-[#2D3F52] bg-[#2D3F52]/5 border border-[#2D3F52]/15 px-3 py-1.5 rounded-lg hover:bg-[#2D3F52]/10 transition-colors"
                >
                  Ver ficha
                </Link>
                {(c.drive_id || c.item_id || c.web_url || c.onedrive_folder_url) && (
                  <div className="flex-1">
                    <OneDriveFolderButton
                      driveId={c.drive_id}
                      itemId={c.item_id}
                      webUrl={c.web_url ?? c.onedrive_folder_url}
                      label="Carpeta"
                    />
                  </div>
                )}
                {c.phone && (
                  <a
                    href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WA
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Desktop table ─── */}
      <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
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
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Link href={sortHref('nombre')} className="inline-flex items-center hover:text-[#2D3F52] transition-colors">
                    Nombre<SortIcon col="nombre" />
                  </Link>
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Asesor</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Fecha cierre</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cerrado por</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Motivo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Link href={sortHref('created_at')} className="inline-flex items-center hover:text-[#2D3F52] transition-colors">
                    Fecha de alta<SortIcon col="created_at" />
                  </Link>
                </th>
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
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {c.created_at ? format(new Date(c.created_at), "d MMM yyyy", { locale: es }) : '—'}
                  </td>
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
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Link href={sortHref('nombre')} className="inline-flex items-center hover:text-[#2D3F52] transition-colors">
                    Nombre<SortIcon col="nombre" />
                  </Link>
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Asesor</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tareas</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Link href={sortHref('created_at')} className="inline-flex items-center hover:text-[#2D3F52] transition-colors">
                    Fecha de alta<SortIcon col="created_at" />
                  </Link>
                </th>
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
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {c.created_at ? format(new Date(c.created_at), "d MMM yyyy", { locale: es }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <OneDriveFolderButton
                        driveId={c.drive_id}
                        itemId={c.item_id}
                        webUrl={c.web_url ?? c.onedrive_folder_url}
                        label="Abrir carpeta"
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
                )
              })}
            </tbody>
          </table>
        )}
      </div>{/* end desktop table */}
    </div>
  )
}
