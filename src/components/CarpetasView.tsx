'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ClientFolder {
  folder_name: string
  folder_path: string
  linked: boolean
  crm_id: string | null
  crm_name: string | null
  crm_number: string | null
  crm_status: string | null
}

interface AdvisorGroup {
  advisor: string
  total: number
  linked: number
  clients: ClientFolder[]
}

interface BrowseData {
  advisors: AdvisorGroup[]
  summary: {
    total_folders: number
    total_linked: number
    total_unlinked: number
  }
}

const STATUS_LABEL: Record<string, string> = {
  prospecto: 'Prospecto',
  activo: 'Activo',
  en_apertura: 'En apertura',
  pendiente_documentacion: 'Pend. doc.',
  en_revision: 'En revisión',
  inactivo: 'Inactivo',
  cerrado: 'Cerrado',
  descartado: 'Descartado',
}

const STATUS_COLOR: Record<string, string> = {
  activo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  en_apertura: 'bg-blue-50 text-blue-700 border-blue-200',
  prospecto: 'bg-amber-50 text-amber-700 border-amber-200',
  pendiente_documentacion: 'bg-orange-50 text-orange-700 border-orange-200',
  en_revision: 'bg-purple-50 text-purple-700 border-purple-200',
  inactivo: 'bg-gray-100 text-gray-500 border-gray-200',
  cerrado: 'bg-gray-100 text-gray-400 border-gray-200',
  descartado: 'bg-red-50 text-red-400 border-red-100',
}

// Only these advisors are shown — everything else (Prodigy, etc.) is hidden
const KNOWN_ADVISORS = ['Francisco', 'Guillermo', 'Sandra', 'Ines', 'Javier', 'Federico-Fernando']

export default function CarpetasView() {
  const router = useRouter()
  const [data, setData] = useState<BrowseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ created: number } | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/browse-clientes')
      if (res.ok) {
        const json: BrowseData = await res.json()
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function syncAll() {
    setSyncing(true)
    setSyncResult(null)
    const res = await fetch('/api/sync-clientes', { method: 'POST' })
    if (res.ok) {
      const json = await res.json()
      setSyncResult({ created: json.created })
      await load()
      router.refresh()
    }
    setSyncing(false)
  }

  function toggle(advisor: string) {
    setExpanded((p) => ({ ...p, [advisor]: !p[advisor] }))
  }

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#2D3F52] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-400">Leyendo carpetas de OneDrive...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="py-8 px-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        No se pudo leer la carpeta. Verificá que CLIENTS_FOLDER_PATH esté configurado en .env.local
      </div>
    )
  }

  // Sort advisors: known ones first in order, then others
  const sortedAdvisors = [...data.advisors].sort((a, b) => {
    const ai = KNOWN_ADVISORS.indexOf(a.advisor)
    const bi = KNOWN_ADVISORS.indexOf(b.advisor)
    if (ai === -1 && bi === -1) return a.advisor.localeCompare(b.advisor)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const q = search.toLowerCase()

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex gap-3">
          <SummaryChip label="Total carpetas" value={data.summary.total_folders} />
          <SummaryChip label="Vinculadas" value={data.summary.total_linked} color="emerald" />
          <SummaryChip label="Sin vincular" value={data.summary.total_unlinked} color={data.summary.total_unlinked > 0 ? 'amber' : 'gray'} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={syncAll}
            disabled={syncing || data.summary.total_unlinked === 0}
            className="flex items-center gap-2 px-4 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-40"
          >
            <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Vinculando...' : 'Vincular todo al CRM'}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className={`mb-5 px-4 py-3 rounded-lg border text-sm font-medium ${
          syncResult.created > 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          {syncResult.created > 0
            ? `✓ ${syncResult.created} carpeta${syncResult.created !== 1 ? 's' : ''} agregada${syncResult.created !== 1 ? 's' : ''} al CRM como clientes nuevos`
            : 'Todas las carpetas ya estaban vinculadas al CRM'}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A] w-56"
          />
        </div>
        <button
          onClick={() => setShowUnlinkedOnly((p) => !p)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            showUnlinkedOnly
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          }`}
        >
          Solo sin vincular
        </button>
      </div>

      {/* Advisor grid (cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {sortedAdvisors.filter(a => KNOWN_ADVISORS.includes(a.advisor)).map((advisor) => {
          const pct = advisor.total > 0 ? Math.round((advisor.linked / advisor.total) * 100) : 0
          const isOpen = !!expanded[advisor.advisor]
          return (
            <button
              key={advisor.advisor}
              onClick={() => toggle(advisor.advisor)}
              className={`text-left p-4 rounded-xl border transition-all ${
                isOpen
                  ? 'bg-[#2D3F52] border-[#2D3F52] text-white shadow-md'
                  : 'bg-white border-[#E2E8F0] hover:border-[#16A34A] hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <p className={`text-sm font-semibold ${isOpen ? 'text-white' : 'text-[#2D3F52]'}`}>
                  {advisor.advisor}
                </p>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  isOpen ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {advisor.total}
                </span>
              </div>
              {/* Progress bar */}
              <div className={`h-1.5 rounded-full mb-2 ${isOpen ? 'bg-white/20' : 'bg-gray-100'}`}>
                <div
                  className={`h-full rounded-full transition-all ${isOpen ? 'bg-[#16A34A]' : 'bg-[#2D3F52]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className={`text-[11px] ${isOpen ? 'text-white/70' : 'text-gray-400'}`}>
                {advisor.linked} vinculadas · {advisor.total - advisor.linked} sin vincular
              </p>
            </button>
          )
        })}
      </div>

      {/* Folders from unknown advisors (Prodigy, etc.) are intentionally hidden */}

      {/* Expanded advisor client lists */}
      {sortedAdvisors
        .filter((a) => expanded[a.advisor])
        .map((advisor) => {
          let clients = advisor.clients
          if (q) clients = clients.filter(c =>
            c.folder_name.toLowerCase().includes(q) ||
            (c.crm_name ?? '').toLowerCase().includes(q) ||
            (c.crm_number ?? '').toLowerCase().includes(q)
          )
          if (showUnlinkedOnly) clients = clients.filter(c => !c.linked)

          return (
            <div key={advisor.advisor} className="mb-4 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
              {/* Section header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggle(advisor.advisor)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <span className="text-sm font-semibold text-[#2D3F52]">{advisor.advisor}</span>
                  <span className="text-xs text-gray-400">{clients.length} de {advisor.total}</span>
                </div>
                <div className="flex items-center gap-2">
                  {advisor.linked > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                      {advisor.linked} vinculadas
                    </span>
                  )}
                  {advisor.total - advisor.linked > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      {advisor.total - advisor.linked} sin vincular
                    </span>
                  )}
                </div>
              </div>

              {/* Client rows */}
              <div className="divide-y divide-gray-50">
                {clients.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-400 text-center">Sin resultados</p>
                ) : (
                  clients.map((c) => (
                    <div
                      key={c.folder_path}
                      className={`flex items-center gap-4 px-5 py-2.5 hover:bg-gray-50 transition-colors ${!c.linked ? 'opacity-75' : ''}`}
                    >
                      {/* Status dot */}
                      <span className={`w-2 h-2 rounded-full shrink-0 ${c.linked ? 'bg-emerald-400' : 'bg-amber-300'}`} />

                      {/* Folder name */}
                      <span className="text-sm text-gray-800 font-medium flex-1 truncate">
                        {c.folder_name}
                      </span>

                      {/* CRM number */}
                      {c.crm_number ? (
                        <span className="text-xs font-mono text-gray-400 shrink-0 w-24 text-right">
                          {c.crm_number}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-200 shrink-0 w-24 text-right">—</span>
                      )}

                      {/* CRM name */}
                      <span className={`text-xs shrink-0 w-40 truncate ${c.crm_name ? 'text-gray-500' : 'text-gray-300 italic'}`}>
                        {c.crm_name ?? 'no vinculado'}
                      </span>

                      {/* Status badge */}
                      <div className="shrink-0 w-28 text-right">
                        {c.crm_status ? (
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${STATUS_COLOR[c.crm_status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                            {STATUS_LABEL[c.crm_status] ?? c.crm_status}
                          </span>
                        ) : null}
                      </div>

                      {/* Action */}
                      <div className="shrink-0 w-20 text-right">
                        {c.linked && c.crm_id ? (
                          <Link href={`/clients/${c.crm_id}`} className="text-xs text-[#16A34A] hover:underline font-medium">
                            Ver →
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
    </div>
  )
}

function SummaryChip({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const num: Record<string, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    gray: 'text-[#2D3F52]',
  }
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl px-5 py-3 text-center min-w-[90px]">
      <p className={`text-2xl font-bold ${num[color]}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}
