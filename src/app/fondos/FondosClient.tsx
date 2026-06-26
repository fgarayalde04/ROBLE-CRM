'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { ManagerWithStats } from './page'

const LOGOS: Record<string, string> = {
  'ab-bernstein':       'https://logo.clearbit.com/alliancebernstein.com',
  aberdeen:             'https://logo.clearbit.com/abrdn.com',
  aegon:                'https://logo.clearbit.com/aegonam.com',
  amundi:               'https://logo.clearbit.com/amundi.com',
  barings:              'https://logo.clearbit.com/barings.com',
  blackrock:            'https://logo.clearbit.com/blackrock.com',
  compass:              'https://logo.clearbit.com/cgcompass.com',
  credicorp:            'https://logo.clearbit.com/credicorpcapital.com',
  dnca:                 'https://logo.clearbit.com/dnca-investments.com',
  dominion:             'https://logo.clearbit.com/dominion-cs.com',
  doubleline:           'https://logo.clearbit.com/doubleline.com',
  'eaton-vance':        'https://logo.clearbit.com/eatonvance.com',
  'edmond-rothschild':  'https://logo.clearbit.com/edmond-de-rothschild.com',
  federated:            'https://logo.clearbit.com/federatedhermes.com',
  fidelity:             'https://logo.clearbit.com/fidelity.com',
  'franklin-templeton': 'https://logo.clearbit.com/franklintempleton.com',
  gam:                  'https://logo.clearbit.com/gam.com',
  h2o:                  'https://logo.clearbit.com/h2o-am.com',
  invesco:              'https://logo.clearbit.com/invesco.com',
  'janus-henderson':    'https://logo.clearbit.com/janushenderson.com',
  'jp-morgan-am':       'https://logo.clearbit.com/jpmorgan.com',
  jupiter:              'https://logo.clearbit.com/jupiteram.com',
  lazard:               'https://logo.clearbit.com/lazardassetmanagement.com',
  'lord-abbett':        'https://logo.clearbit.com/lordabbett.com',
  'man-group':          'https://logo.clearbit.com/man.com',
  mg:                   'https://logo.clearbit.com/mandg.com',
  mfs:                  'https://logo.clearbit.com/mfs.com',
  moneda:               'https://logo.clearbit.com/moneda.com',
  'morgan-stanley':     'https://logo.clearbit.com/morganstanley.com',
  muzinich:             'https://logo.clearbit.com/muzinich.com',
  'neuberger-berman':   'https://logo.clearbit.com/nb.com',
  'new-capital':        'https://logo.clearbit.com/newcapitalfunds.com',
  'ninety-one':         'https://logo.clearbit.com/ninetyone.com',
  nomura:               'https://logo.clearbit.com/nomura-am.com',
  nuveen:               'https://logo.clearbit.com/nuveen.com',
  'pacific-am':         'https://logo.clearbit.com/pacific-am.com',
  pictet:               'https://logo.clearbit.com/pictet.com',
  pimco:                'https://logo.clearbit.com/pimco.com',
  pinebridge:           'https://logo.clearbit.com/pinebridge.com',
  putnam:               'https://logo.clearbit.com/putnam.com',
  robeco:               'https://logo.clearbit.com/robeco.com',
  schroders:            'https://logo.clearbit.com/schroders.com',
  thornburg:            'https://logo.clearbit.com/thornburg.com',
  vanguard:             'https://logo.clearbit.com/vanguard.com',
  'vinci-compass':      'https://logo.clearbit.com/vincicompass.com',
  virtus:               'https://logo.clearbit.com/virtus.com',
  vontobel:             'https://logo.clearbit.com/vontobel.com',
  wcm:                  'https://logo.clearbit.com/wcminvest.com',
  wellington:           'https://logo.clearbit.com/wellington.com',
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
  const [syncLog, setSyncLog] = useState<{ text: string; ok: boolean; pending?: number } | null>(null)
  const [totalImported, setTotalImported] = useState(0)

  const filtered = useMemo(() => {
    const lq = q.toLowerCase().trim()
    if (!lq) return managers
    return managers.filter(m =>
      m.name.toLowerCase().includes(lq) ||
      m.slug.toLowerCase().includes(lq)
    )
  }, [q, managers])

  const total         = managers.reduce((s, m) => s + m.fund_count, 0)
  const withFactsheet = managers.filter(m => m.latest_factsheet).length
  const totalManagers = managers.filter(m => m.fund_count > 0).length

  async function handleSync(autoRun = false) {
    if (!autoRun) { setSyncing(true); setTotalImported(0) }
    setSyncLog(null)
    try {
      const res  = await fetch('/api/fondos/sync-web', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        const newTotal = totalImported + (json.imported ?? 0)
        setTotalImported(newTotal)
        if (json.pending > 0) {
          setSyncLog({ text: `${newTotal} importados hasta ahora — continuando con los siguientes ${json.tried}…`, ok: true, pending: json.pending })
          setTimeout(() => handleSync(true), 1000)
        } else {
          setSyncLog({ text: json.message ?? `Completado: ${newTotal} factsheets importados.`, ok: true, pending: 0 })
          setSyncing(false)
        }
      } else {
        setSyncLog({ text: json.error ?? 'Error en la sincronización', ok: false })
        setSyncing(false)
      }
    } catch {
      setSyncLog({ text: 'Error de red', ok: false })
      setSyncing(false)
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
                {total} fondos · {totalManagers} gestoras · {withFactsheet} con factsheets
              </p>
            </div>
            <button
              onClick={() => handleSync(false)}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-[#2D3F52] text-white rounded-xl text-sm font-medium hover:bg-opacity-90 transition-all disabled:opacity-50"
            >
              {syncing
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
              }
              {syncing ? 'Buscando factsheets…' : 'Buscar factsheets'}
            </button>
          </div>

          {syncLog && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-3 ${
              syncLog.ok ? 'bg-blue-50 text-blue-800 border border-blue-100' : 'bg-red-50 text-red-700 border border-red-100'
            }`}>
              {syncing && syncLog.pending && syncLog.pending > 0 && (
                <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              <span>{syncLog.text}</span>
              {syncLog.pending === 0 && <span className="ml-auto text-green-600 font-medium">✓ Listo</span>}
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
              placeholder="Buscar gestora…"
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
            <p className="text-sm">No se encontró ninguna gestora</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
  const hasFactsheet = !!m.latest_factsheet

  return (
    <Link href={`/fondos/${m.slug}`}
      className="group bg-white border border-gray-100 rounded-2xl p-5 hover:border-[#2D3F52]/30 hover:shadow-md transition-all flex flex-col gap-3"
    >
      {/* Logo area */}
      <div className="h-10 flex items-center">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={m.name}
            className="h-7 max-w-[90px] object-contain grayscale group-hover:grayscale-0 transition-all"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-9 h-9 bg-[#2D3F52] rounded-xl flex items-center justify-center text-white font-bold text-xs">
            {m.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-xs font-semibold text-gray-800 leading-tight group-hover:text-[#2D3F52] transition-colors">
        {m.name}
      </p>

      {/* Stats */}
      <div className="mt-auto pt-2 border-t border-gray-50 flex items-center justify-between gap-2">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
          m.fund_count > 0 ? 'bg-[#2D3F52]/8 text-[#2D3F52]' : 'text-gray-300'
        }`}>
          {m.fund_count > 0 ? `${m.fund_count} fondos` : '—'}
        </span>
        <span className={`text-[10px] ${hasFactsheet ? 'text-green-600' : 'text-gray-300'}`}>
          {hasFactsheet ? timeAgo(m.latest_factsheet) ?? '—' : 'sin factsheet'}
        </span>
      </div>
    </Link>
  )
}
