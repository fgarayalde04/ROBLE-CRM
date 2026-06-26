'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { ManagerWithStats } from './page'

const LOGOS: Record<string, string> = {
  blackrock:          'https://logo.clearbit.com/blackrock.com',
  'jp-morgan-am':     'https://logo.clearbit.com/jpmorgan.com',
  pimco:              'https://logo.clearbit.com/pimco.com',
  'franklin-templeton':'https://logo.clearbit.com/franklintempleton.com',
  fidelity:           'https://logo.clearbit.com/fidelity.com',
  schroders:          'https://logo.clearbit.com/schroders.com',
  'capital-group':    'https://logo.clearbit.com/capitalgroup.com',
  vanguard:           'https://logo.clearbit.com/vanguard.com',
  mg:                 'https://logo.clearbit.com/mandg.com',
  invesco:            'https://logo.clearbit.com/invesco.com',
  'morgan-stanley':   'https://logo.clearbit.com/morganstanley.com',
  wellington:         'https://logo.clearbit.com/wellington.com',
  'janus-henderson':  'https://logo.clearbit.com/janushenderson.com',
}

function timeAgo(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 7)  return `hace ${d} días`
  if (d < 30) return `hace ${Math.floor(d / 7)} sem.`
  return `hace ${Math.floor(d / 30)} meses`
}

interface Props { managers: ManagerWithStats[] }

export default function FondosClient({ managers }: Props) {
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const lq = q.toLowerCase().trim()
    if (!lq) return managers
    return managers.filter(m =>
      m.name.toLowerCase().includes(lq) ||
      m.slug.toLowerCase().includes(lq)
    )
  }, [q, managers])

  const total = managers.reduce((s, m) => s + m.fund_count, 0)
  const withFunds = managers.filter(m => m.fund_count > 0).length

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/fondos/sync', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setSyncMsg(`Sincronización completa — ${json.imported} nuevos factsheets importados`)
      } else {
        setSyncMsg(json.error ?? 'Error en la sincronización')
      }
    } catch {
      setSyncMsg('Error de red')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 6000)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fondos</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {total} fondos · {withFunds} gestoras con factsheets
              </p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-[#2D3F52] text-white rounded-xl text-sm font-medium hover:bg-opacity-90 transition-all disabled:opacity-60"
            >
              {syncing ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {syncing ? 'Sincronizando…' : 'Sincronizar Gmail'}
            </button>
          </div>

          {syncMsg && (
            <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm ${
              syncMsg.includes('Error') ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'
            }`}>
              {syncMsg}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar fondo, ISIN, ticker o casa de inversión..."
              className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm bg-white outline-none focus:border-[#2D3F52] focus:ring-4 focus:ring-[#2D3F52]/5 transition-all placeholder:text-gray-400"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">No se encontró ninguna gestora</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(m => (
              <ManagerCard key={m.id} manager={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ManagerCard({ manager: m }: { manager: ManagerWithStats }) {
  const logoUrl = m.logo_url ?? LOGOS[m.slug]

  return (
    <Link href={`/fondos/${m.slug}`}
      className="group bg-white border border-gray-100 rounded-2xl p-5 hover:border-[#2D3F52]/30 hover:shadow-md transition-all flex flex-col gap-3"
    >
      {/* Logo area */}
      <div className="h-12 flex items-center">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={m.name}
            className="h-8 max-w-[100px] object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-10 h-10 bg-[#2D3F52] rounded-xl flex items-center justify-center text-white font-bold text-sm">
            {m.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-sm font-semibold text-gray-800 leading-tight group-hover:text-[#2D3F52] transition-colors">
        {m.name}
      </p>

      {/* Stats */}
      <div className="mt-auto pt-2 border-t border-gray-50 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Fondos</span>
          <span className={`text-xs font-semibold ${m.fund_count > 0 ? 'text-[#2D3F52]' : 'text-gray-300'}`}>
            {m.fund_count > 0 ? m.fund_count : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Actualizado</span>
          <span className={`text-xs ${m.latest_factsheet ? 'text-gray-500' : 'text-gray-300'}`}>
            {timeAgo(m.latest_factsheet) ?? '—'}
          </span>
        </div>
      </div>
    </Link>
  )
}
