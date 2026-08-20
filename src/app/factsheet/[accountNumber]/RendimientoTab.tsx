'use client'
import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fmtUSD, fmtDate } from './PortfolioAccountClient'

type Period = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'
const PERIODS: { key: Period; label: string }[] = [
  { key: '1M', label: '1M' }, { key: '3M', label: '3M' }, { key: '6M', label: '6M' },
  { key: 'YTD', label: 'YTD' }, { key: '1Y', label: '1A' }, { key: 'ALL', label: 'Todo' },
]

interface HistoryPoint { snapshot_date: string; total_market_value: string }

interface CompareResult {
  from: { date: string; totalMarketValue: number }
  to: { date: string; totalMarketValue: number }
  diferencia: number
  nuevas: { name: string; marketValue: number }[]
  eliminadas: { name: string; marketValue: number }[]
  aumentaron: { name: string; from: number; to: number; diff: number }[]
  disminuyeron: { name: string; from: number; to: number; diff: number }[]
}

function cutoffFor(period: Period): Date | null {
  const now = new Date()
  switch (period) {
    case '1M': { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d }
    case '3M': { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d }
    case '6M': { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d }
    case 'YTD': return new Date(now.getFullYear(), 0, 1)
    case '1Y': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d }
    case 'ALL': return null
  }
}

export default function RendimientoTab({ accountNumber, history }: { accountNumber: string; history: HistoryPoint[] }) {
  const [period, setPeriod] = useState<Period>('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [comparing, setComparing] = useState(false)
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [compareError, setCompareError] = useState('')

  const sorted = useMemo(() => [...history].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)), [history])

  const chartData = useMemo(() => {
    const cutoff = cutoffFor(period)
    const filtered = cutoff ? sorted.filter(h => new Date(h.snapshot_date + 'T00:00:00') >= cutoff) : sorted
    return filtered.map(h => ({ date: h.snapshot_date, value: Number(h.total_market_value) }))
  }, [sorted, period])

  async function handleCompare() {
    if (!fromDate || !toDate) return
    setComparing(true); setCompareError(''); setCompareResult(null)
    try {
      const res = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/compare?from=${fromDate}&to=${toDate}`)
      const data = await res.json()
      if (!res.ok) { setCompareError(data.error ?? 'Error al comparar'); return }
      setCompareResult(data)
    } catch (e: any) {
      setCompareError(e.message)
    } finally {
      setComparing(false)
    }
  }

  if (sorted.length < 2) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <div className="text-3xl mb-3">📈</div>
        <p className="text-sm font-semibold text-gray-600">Todavía no hay suficiente historial</p>
        <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
          Se necesitan al menos dos importaciones de posiciones para mostrar la evolución del valor de mercado.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-gray-900">Evolución del valor de mercado</p>
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${period === p.key ? 'bg-[#1B3A2B] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">
          Muestra el Market Value de la cuenta en cada importación. No representa rentabilidad — puede incluir depósitos, retiros u operaciones.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => fmtDate(v)} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => fmtUSD(Number(v))} labelFormatter={(v) => fmtDate(String(v))} />
            <Line type="monotone" dataKey="value" stroke="#2E7D52" strokeWidth={2} dot={{ r: 3, fill: '#2E7D52' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-bold text-gray-900 mb-1">Comparar dos snapshots</p>
        <p className="text-[11px] text-gray-400 mb-4">Diferencia de Market Value entre dos fechas importadas — tampoco es rentabilidad.</p>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Desde</label>
            <select value={fromDate} onChange={e => setFromDate(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">Seleccionar…</option>
              {sorted.map(h => <option key={h.snapshot_date} value={h.snapshot_date}>{fmtDate(h.snapshot_date)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Hasta</label>
            <select value={toDate} onChange={e => setToDate(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">Seleccionar…</option>
              {sorted.map(h => <option key={h.snapshot_date} value={h.snapshot_date}>{fmtDate(h.snapshot_date)}</option>)}
            </select>
          </div>
          <button onClick={handleCompare} disabled={!fromDate || !toDate || comparing}
            className="px-4 py-2 text-sm font-bold text-white bg-[#2E7D52] rounded-lg hover:bg-[#256841] transition disabled:opacity-40">
            {comparing ? 'Comparando…' : 'Comparar'}
          </button>
        </div>

        {compareError && <p className="text-xs text-red-600 mb-3">{compareError}</p>}

        {compareResult && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#F3F4F6] rounded-lg p-3">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{fmtDate(compareResult.from.date)} → {fmtDate(compareResult.to.date)}</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{fmtUSD(compareResult.from.totalMarketValue)} → {fmtUSD(compareResult.to.totalMarketValue)}</p>
              </div>
              <p className={`text-base font-bold ${compareResult.diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {compareResult.diferencia >= 0 ? '+' : ''}{fmtUSD(compareResult.diferencia)}
              </p>
            </div>

            {[
              ['Posiciones nuevas', compareResult.nuevas.map(n => ({ name: n.name, val: n.marketValue }))],
              ['Posiciones eliminadas', compareResult.eliminadas.map(n => ({ name: n.name, val: n.marketValue }))],
              ['Aumentaron', compareResult.aumentaron.map(n => ({ name: n.name, val: n.diff }))],
              ['Disminuyeron', compareResult.disminuyeron.map(n => ({ name: n.name, val: n.diff }))],
            ].map(([label, items]) => {
              const list = items as { name: string; val: number }[]
              if (list.length === 0) return null
              return (
                <div key={label as string}>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">{label as string}</p>
                  <div className="space-y-1">
                    {list.slice(0, 10).map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate">{it.name}</span>
                        <span className={`font-mono shrink-0 ml-2 ${it.val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{it.val >= 0 ? '+' : ''}{fmtUSD(it.val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
