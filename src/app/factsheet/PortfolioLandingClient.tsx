'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import ImportPositionsModal from '@/components/portfolio/ImportPositionsModal'
import NewReportModal from '@/components/portfolio/NewReportModal'

interface AccountRow {
  id: string
  account_number: string
  client_number: string | null
  client_name: string | null
  advisor: string | null
  snapshot_date: string
  total_market_value: string
  position_count: number
  created_at: string
}

const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })

export default function PortfolioLandingClient() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showNewReport, setShowNewReport] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(accountNumber: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}`, { method: 'DELETE' })
      if (res.ok) {
        setAccounts(a => a.filter(x => x.account_number !== accountNumber))
      }
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/portfolio/accounts')
      if (res.ok) setAccounts(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return accounts
    return accounts.filter(a =>
      (a.client_name ?? '').toLowerCase().includes(term) ||
      a.account_number.toLowerCase().includes(term) ||
      (a.client_number ?? '').toLowerCase().includes(term)
    )
  }, [accounts, q])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Portafolio</h1>
            <p className="text-xs text-gray-400 mt-0.5">Posiciones y valor de cartera por cuenta</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowNewReport(true)}
              className="px-4 py-2 text-sm font-bold text-white bg-[#2E7D52] rounded-lg hover:bg-[#256841] transition">
              Nuevo Reporte
            </button>
            <button onClick={() => setShowImport(true)}
              className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              + Importar posiciones
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por cliente, cuenta o número…"
          className="w-full text-sm border border-gray-200 rounded-lg px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E7D52]/20 focus:border-[#2E7D52]/40"
        />

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm font-semibold text-gray-600">
              {accounts.length === 0 ? 'Todavía no hay cuentas importadas' : 'Sin resultados'}
            </p>
            {accounts.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Importá un Excel de posiciones para empezar.</p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {filtered.map(a => (
              <div key={a.account_number} className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition">
                <button
                  onClick={() => router.push(`/factsheet/${encodeURIComponent(a.account_number)}`)}
                  className="flex-1 min-w-0 flex items-center justify-between gap-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.client_name || a.account_number}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {a.account_number}{a.client_number ? ` · Cliente #${a.client_number}` : ''} · {a.position_count} posiciones
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{fmtUSD(Number(a.total_market_value))}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Actualizado {fmtDate(a.snapshot_date)}</p>
                  </div>
                </button>

                {confirmDelete === a.account_number ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-gray-500">¿Eliminar?</span>
                    <button
                      onClick={() => handleDelete(a.account_number)}
                      disabled={deleting}
                      className="text-[11px] font-medium px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {deleting ? '...' : 'Sí'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-[11px] px-2 py-1 border border-gray-200 rounded text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(a.account_number)}
                    title="Eliminar portafolio"
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showImport && (
        <ImportPositionsModal
          onClose={() => setShowImport(false)}
          onImported={(accountNumber) => { setShowImport(false); router.push(`/factsheet/${encodeURIComponent(accountNumber)}`) }}
        />
      )}
      {showNewReport && (
        <NewReportModal
          onClose={() => setShowNewReport(false)}
          onImported={(accountNumber, custodianMode) => {
            setShowNewReport(false)
            const suffix = custodianMode === 'morgan' ? '?custodian=Morgan Stanley' : custodianMode === 'consolidado' ? '?custodian=consolidado' : ''
            router.push(`/factsheet/${encodeURIComponent(accountNumber)}${suffix}`)
          }}
        />
      )}
    </div>
  )
}
