'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import ImportPositionsModal from '@/components/portfolio/ImportPositionsModal'

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
          <button onClick={() => setShowImport(true)}
            className="px-4 py-2 text-sm font-bold text-white bg-[#2E7D52] rounded-lg hover:bg-[#256841] transition shrink-0">
            + Importar posiciones
          </button>
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
              <button
                key={a.account_number}
                onClick={() => router.push(`/factsheet/${encodeURIComponent(a.account_number)}`)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{a.client_name ?? a.account_number}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {a.account_number}{a.client_number ? ` · Cliente #${a.client_number}` : ''} · {a.position_count} posiciones
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-gray-900">{fmtUSD(Number(a.total_market_value))}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Actualizado {fmtDate(a.snapshot_date)}</p>
                </div>
              </button>
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
    </div>
  )
}
