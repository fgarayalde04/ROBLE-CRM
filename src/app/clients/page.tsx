import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import type { Client } from '@/types/platform'
import ClientsTable from '@/components/ClientsTable'
import { listClients, countClientsByStatus } from '@/lib/db/clients'
import { getPendingTaskClientIds } from '@/lib/db/tasks'

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

export default async function ClientsPage({ searchParams }: Props) {
  noStore()

  const session = await getSession()
  // allowed_folders: null = sin restricción, string[] = filtrar por esas carpetas
  const folderFilter = session?.allowed_folders ?? null

  const activeTab = searchParams.tab === 'cerrados' ? 'cerrados'
    : searchParams.tab === 'todos' ? 'todos'
    : searchParams.tab === 'pendientes' ? 'pendientes'
    : 'activos'

  const activeSort: SortKey = (searchParams.sort as SortKey) ?? 'updated_at'
  const activeDir:  SortDir = (searchParams.dir  as SortDir) ?? 'desc'

  let clients: Client[] = []
  let taskCounts: Record<string, number> = {}
  let totalActivos = 0
  let totalCerrados = 0
  let totalPendientes = 0

  try {
    // Counts for tab badges (scoped by advisor if needed)
    const [ca, cc, cp] = await Promise.all([
      countClientsByStatus('activo', folderFilter),
      countClientsByStatus('cerrado', folderFilter),
      countClientsByStatus('pendiente', folderFilter),
    ])
    totalActivos    = ca
    totalCerrados   = cc
    totalPendientes = cp

    const [clientData, pendingTaskClientIds] = await Promise.all([
      listClients({
        tab: activeTab,
        sort: activeSort,
        dir: activeDir,
        folderFilter,
        search: searchParams.q,
        advisor: searchParams.advisor,
      }),
      getPendingTaskClientIds(),
    ])

    clients = clientData

    for (const clientId of pendingTaskClientIds) {
      taskCounts[clientId] = (taskCounts[clientId] ?? 0) + 1
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
  const isPendientesTab = activeTab === 'pendientes'

  const sortHrefs = {
    nombre: sortHref('nombre'),
    created_at: sortHref('created_at'),
    updated_at: sortHref('updated_at'),
  }

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
          { key: 'activos',    label: 'Activos',    count: totalActivos },
          { key: 'pendientes', label: 'Pendientes', count: totalPendientes },
          { key: 'cerrados',   label: 'Cerrados',   count: totalCerrados },
          { key: 'todos',      label: 'Todos',      count: totalActivos + totalCerrados + totalPendientes },
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

      {/* Banner pendientes */}
      {isPendientesTab && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Cuentas en proceso de apertura — se activan automáticamente cuando se completa el onboarding.
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

      <ClientsTable
        clients={clients}
        taskCounts={taskCounts}
        isCerradosTab={isCerradosTab}
        isPendientesTab={isPendientesTab}
        activeSort={activeSort}
        activeDir={activeDir}
        sortHrefs={sortHrefs}
      />
    </div>
  )
}
