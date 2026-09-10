'use client'
import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, LabelList, ReferenceLine } from 'recharts'
import { fmtUSD, fmtDate } from './PortfolioAccountClient'
import DocumentUploadButton from '@/components/portfolio/DocumentUploadButton'
import type { PortfolioPerformanceRow } from '@/types/portfolio'

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

export default function RendimientoTab({ accountNumber, history, performance, onPerformanceImported }: {
  accountNumber: string
  history: HistoryPoint[]
  performance: PortfolioPerformanceRow | null
  onPerformanceImported: () => void
}) {
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

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-gray-900">Performance reportada</p>
          <DocumentUploadButton accountNumber={accountNumber} endpoint="performance" accept=".pdf"
            label={performance ? 'Actualizar reporte de performance' : 'Importar reporte de performance (PDF Pershing o Morgan Stanley)'} onImported={onPerformanceImported} />
        </div>
        {performance ? (
          <>
            <p className="text-[11px] text-gray-400 mb-4">
              Rentabilidad real (TWRR) reportada por el custodio — no calculada por el sistema. Reporte al {fmtDate(performance.report_date)}
              {performance.inception_date && <> · Desde {fmtDate(performance.inception_date)}</>}.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
              {[
                ['YTD', performance.return_ytd], ['1 Año', performance.return_1y], ['3 Años', performance.return_3y],
                ['5 Años', performance.return_5y], ['Desde inicio', performance.return_since_inception],
              ].map(([label, val]) => (
                <div key={label as string} className="bg-[#F3F4F6] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className={`text-base font-bold mt-0.5 ${val == null ? 'text-gray-300' : Number(val) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {val == null ? '—' : `${Number(val) >= 0 ? '+' : ''}${Number(val).toFixed(2)}%`}
                  </p>
                </div>
              ))}
            </div>

            {performance.change_in_value && (() => {
              const civ = performance.change_in_value!
              const cells: [string, number | null][] = [
                ['YTD', civ.ytd], ['1 Año', civ.oneYear], ['3 Años', civ.threeYear],
                ['5 Años', civ.fiveYear], ['Desde inicio', civ.sinceInception],
              ]
              if (cells.every(([, v]) => v == null)) return null
              const nc = performance.net_contribution
              const bv = performance.beginning_value
              return (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Cuánto creció en dinero</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {cells.map(([label, val]) => (
                      <div key={label} className="bg-[#F3F4F6] rounded-lg p-3 text-center">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                        <p className={`text-base font-bold mt-0.5 ${val == null ? 'text-gray-300' : val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {val == null ? '—' : `${val >= 0 ? '+' : ''}${fmtUSD(val)}`}
                        </p>
                      </div>
                    ))}
                  </div>
                  {(bv?.selected != null || nc?.selected != null) && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      Período reportado:
                      {bv?.selected != null && <> valor inicial <span className="font-semibold text-gray-600">{fmtUSD(bv.selected)}</span></>}
                      {nc?.selected != null && <> · aportes/retiros netos <span className="font-semibold text-gray-600">{nc.selected >= 0 ? '+' : ''}{fmtUSD(nc.selected)}</span></>}
                      {civ.selected != null && <> · crecimiento <span className={`font-semibold ${civ.selected >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{civ.selected >= 0 ? '+' : ''}{fmtUSD(civ.selected)}</span></>}
                      {performance.ending_value != null && <> · valor final <span className="font-semibold text-gray-600">{fmtUSD(Number(performance.ending_value))}</span></>}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    Crecimiento en dinero por mercado (sin contar aportes ni retiros) — el equivalente en plata del TWRR de arriba.
                  </p>
                </div>
              )
            })()}
            {performance.benchmarks.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Benchmarks (desde inicio)</p>
                <div className="space-y-1">
                  {performance.benchmarks.map(b => (
                    <div key={b.name} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 truncate">{b.name}</span>
                      <span className={`font-mono shrink-0 ml-2 ${b.sinceInception != null && b.sinceInception >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {b.sinceInception != null ? `${b.sinceInception >= 0 ? '+' : ''}${b.sinceInception.toFixed(2)}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">
            Todavía no hay un reporte de performance importado. Subí el PDF de "Portfolio Performance" (Pershing) o "Time Weighted Performance Summary" (Morgan Stanley) para ver la rentabilidad real (TWRR) de la cuenta.
          </p>
        )}
      </div>

      {(() => {
        const perfBars = (performance ? ([
          ['YTD', performance.return_ytd], ['1 Año', performance.return_1y], ['3 Años', performance.return_3y],
          ['5 Años', performance.return_5y], ['Desde inicio', performance.return_since_inception],
        ] as [string, unknown][]).map(([label, v]) => ({ label, value: v == null ? null : Number(v) }))
          .filter((d): d is { label: string; value: number } => d.value != null) : [])

        return (
          <>
            {perfBars.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-bold text-gray-900 mb-1">Rentabilidad por período (TWRR)</p>
                <p className="text-[11px] text-gray-400 mb-4">
                  Rentabilidad real reportada por el custodio. Los períodos mayores a un año están anualizados.
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={perfBars} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(v) => `${v}%`} />
                    <ReferenceLine y={0} stroke="#9CA3AF" />
                    <Tooltip formatter={(v: any) => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`} cursor={{ fill: '#F3F4F6' }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={64}>
                      {perfBars.map((d, i) => <Cell key={i} fill={d.value >= 0 ? '#2E7D52' : '#B91C1C'} />)}
                      <LabelList dataKey="value" position="top" formatter={(v: any) => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`}
                        style={{ fontSize: 11, fontWeight: 700, fill: '#111827' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {sorted.length >= 2 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-gray-900">Evolución del valor de la cuenta</p>
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
            )}

            {perfBars.length === 0 && sorted.length < 2 && (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <div className="text-3xl mb-3">📈</div>
                <p className="text-sm font-semibold text-gray-600">Todavía no hay datos para graficar</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                  Se necesitan al menos dos importaciones de posiciones para la evolución del valor, o el reporte
                  de performance del custodio para la rentabilidad por período.
                </p>
              </div>
            )}
          </>
        )
      })()}

      {sorted.length >= 2 && (
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
      )}
    </div>
  )
}
