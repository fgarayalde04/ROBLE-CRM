'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'
import type { PortfolioPositionRow, PortfolioImportRow, PortfolioAccountInfo, PortfolioCashProjectionRow, PortfolioCashProjectionsImportRow } from '@/types/portfolio'
import ImportPositionsModal from '@/components/portfolio/ImportPositionsModal'
import PositionsTab from './PositionsTab'
import RendimientoTab from './RendimientoTab'
import MovimientosTab from './MovimientosTab'
import ImportHistoryModal from '@/components/portfolio/ImportHistoryModal'

// ── Brand ──────────────────────────────────────────────────────────────────
const C = {
  darkGreen: '#1B3A2B', midGreen: '#2E7D52', lightGreen: '#E8F5E9',
  gray100: '#F3F4F6', gray200: '#E5E7EB', gray400: '#9CA3AF', gray500: '#6B7280', gray900: '#111827',
  red: '#DC2626',
}
const CHART_COLORS = ['#1B3A2B', '#2E7D52', '#4CAF72', '#81C995', '#A5D6B7', '#C8E6C9', '#6B7280']
const ASSET_CLASS_ES: Record<string, string> = {
  'Equity': 'Renta Variable',
  'ETF': 'Renta Variable (ETF)',
  'Fixed Income': 'Fondos de Renta Fija / Crédito',
  'Alternatives': 'Otros',
  'Real Estate': 'Otros',
  'Cash': 'Money Market / Liquidez',
}

export const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
export const fmtUSD2 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
export const fmtPct = (n: number, decimals = 1) => `${n.toFixed(decimals)}%`
export const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })

type Tab = 'resumen' | 'posiciones' | 'rendimiento' | 'movimientos'

export default function PortfolioAccountClient({ accountNumber }: { accountNumber: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('resumen')
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<PortfolioAccountInfo | null>(null)
  const [importRow, setImportRow] = useState<PortfolioImportRow | null>(null)
  const [positions, setPositions] = useState<PortfolioPositionRow[]>([])
  const [history, setHistory] = useState<{ snapshot_date: string; total_market_value: string }[]>([])
  const [showImport, setShowImport] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [cashProjImport, setCashProjImport] = useState<PortfolioCashProjectionsImportRow | null>(null)
  const [cashProjRows, setCashProjRows] = useState<PortfolioCashProjectionRow[]>([])

  async function load() {
    setLoading(true)
    const [detailRes, historyRes, cashRes] = await Promise.all([
      fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}`),
      fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/history`),
      fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/cashflows`),
    ])
    if (detailRes.ok) {
      const d = await detailRes.json()
      setAccount(d.account); setImportRow(d.import); setPositions(d.positions)
    }
    if (historyRes.ok) setHistory(await historyRes.json())
    if (cashRes.ok) {
      const c = await cashRes.json()
      setCashProjImport(c.import); setCashProjRows(c.rows ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [accountNumber])

  const totalValue = importRow ? Number(importRow.total_market_value) : 0

  const previousSnapshot = useMemo(() => {
    if (!importRow || history.length < 2) return null
    const idx = history.findIndex(h => h.snapshot_date === importRow.snapshot_date)
    return idx > 0 ? history[idx - 1] : null
  }, [history, importRow])

  const variation = previousSnapshot
    ? { abs: totalValue - Number(previousSnapshot.total_market_value), pct: (totalValue - Number(previousSnapshot.total_market_value)) / Number(previousSnapshot.total_market_value) * 100 }
    : null

  const sortedByValue = useMemo(() => [...positions].sort((a, b) => Number(b.market_value) - Number(a.market_value)), [positions])

  const assetAllocation = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of positions) map.set(p.asset_class, (map.get(p.asset_class) ?? 0) + Number(p.market_value))
    return Array.from(map.entries())
      .map(([assetClass, value]) => ({ assetClass, label: ASSET_CLASS_ES[assetClass] ?? assetClass, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [positions, totalValue])

  const concentration = useMemo(() => {
    const top = (n: number) => sortedByValue.slice(0, n).reduce((s, p) => s + Number(p.market_value), 0) / (totalValue || 1) * 100
    return { top1: top(1), top3: top(3), top5: top(5), top10: top(10) }
  }, [sortedByValue, totalValue])

  const liquidity = useMemo(() => {
    const value = positions.filter(p => p.asset_class === 'Cash').reduce((s, p) => s + Number(p.market_value), 0)
    return { value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }
  }, [positions, totalValue])

  const largestPosition = sortedByValue[0] ?? null

  const maturityBuckets = useMemo(() => {
    const withMaturity = positions.filter(p => p.maturity_date)
    const map = new Map<number, { value: number; count: number }>()
    for (const p of withMaturity) {
      const year = new Date(p.maturity_date as string).getUTCFullYear()
      const cur = map.get(year) ?? { value: 0, count: 0 }
      map.set(year, { value: cur.value + Number(p.market_value), count: cur.count + 1 })
    }
    return Array.from(map.entries()).map(([year, d]) => ({ year, ...d })).sort((a, b) => a.year - b.year)
  }, [positions])

  const nextMaturity = useMemo(() => {
    const withMaturity = positions.filter(p => p.maturity_date).sort((a, b) => (a.maturity_date as string).localeCompare(b.maturity_date as string))
    return withMaturity[0] ?? null
  }, [positions])

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">Cargando…</div>
  }

  if (!importRow) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header router={router} account={account} accountNumber={accountNumber} importRow={null} onImport={() => setShowImport(true)} onHistory={() => setShowHistory(true)} />
        <div className="max-w-3xl mx-auto p-6 text-center py-16">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm font-semibold text-gray-600">Todavía no hay posiciones importadas para esta cuenta</p>
          <button onClick={() => setShowImport(true)} className="mt-4 px-4 py-2 text-sm font-bold text-white bg-[#2E7D52] rounded-lg hover:bg-[#256841] transition">
            Importar posiciones
          </button>
        </div>
        {showImport && <ImportPositionsModal onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load() }} />}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header router={router} account={account} accountNumber={accountNumber} importRow={importRow} onImport={() => setShowImport(true)} onHistory={() => setShowHistory(true)} />

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-6xl mx-auto flex gap-1">
          {([
            ['resumen', 'Resumen'], ['posiciones', 'Posiciones'], ['rendimiento', 'Rendimiento'], ['movimientos', 'Movimientos'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${tab === key ? 'border-[#2E7D52] text-[#1B3A2B]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {tab === 'resumen' && (
          <ResumenTab
            totalValue={totalValue} snapshotDate={importRow.snapshot_date} variation={variation}
            positions={positions} assetAllocation={assetAllocation} concentration={concentration}
            liquidity={liquidity} largestPosition={largestPosition} sortedByValue={sortedByValue}
            maturityBuckets={maturityBuckets} nextMaturity={nextMaturity}
            onSeeAll={() => setTab('posiciones')}
          />
        )}
        {tab === 'posiciones' && <PositionsTab positions={positions} totalValue={totalValue} />}
        {tab === 'rendimiento' && <RendimientoTab accountNumber={accountNumber} history={history} />}
        {tab === 'movimientos' && (
          <MovimientosTab accountNumber={accountNumber} cashProjImport={cashProjImport} cashProjRows={cashProjRows} onCashProjImported={load} />
        )}
      </div>

      {showImport && <ImportPositionsModal onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load() }} />}
      {showHistory && <ImportHistoryModal accountNumber={accountNumber} onClose={() => setShowHistory(false)} />}
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────

function Header({ router, account, accountNumber, importRow, onImport, onHistory }: {
  router: ReturnType<typeof useRouter>
  account: PortfolioAccountInfo | null
  accountNumber: string
  importRow: PortfolioImportRow | null
  onImport: () => void
  onHistory: () => void
}) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="min-w-0">
          <button onClick={() => router.push('/factsheet')} className="text-xs text-gray-400 hover:text-gray-600 transition mb-1">← Portafolio</button>
          <h1 className="text-lg font-bold text-gray-900 truncate">{account?.clientName ?? accountNumber}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-0.5">
            <span>{accountNumber}</span>
            {account?.clientNumber && <span>· Cliente #{account.clientNumber}</span>}
            {account?.entity && <span>· {account.entity === 'roble' ? 'Roble Capital' : account.entity}</span>}
            {importRow && <span>· Actualizado al {fmtDate(importRow.snapshot_date)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onHistory} className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Historial de importaciones
          </button>
          {importRow && (
            <a href={`/factsheet/pdf`} className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              Generar PDF
            </a>
          )}
          <button onClick={onImport} className="px-4 py-2 text-sm font-bold text-white bg-[#2E7D52] rounded-lg hover:bg-[#256841] transition">
            Importar posiciones
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Resumen tab ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1 truncate">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

function ResumenTab({ totalValue, snapshotDate, variation, positions, assetAllocation, concentration, liquidity, largestPosition, sortedByValue, maturityBuckets, nextMaturity, onSeeAll }: {
  totalValue: number
  snapshotDate: string
  variation: { abs: number; pct: number } | null
  positions: PortfolioPositionRow[]
  assetAllocation: { assetClass: string; label: string; value: number; pct: number }[]
  concentration: { top1: number; top3: number; top5: number; top10: number }
  liquidity: { value: number; pct: number }
  largestPosition: PortfolioPositionRow | null
  sortedByValue: PortfolioPositionRow[]
  maturityBuckets: { year: number; value: number; count: number }[]
  nextMaturity: PortfolioPositionRow | null
  onSeeAll: () => void
}) {
  return (
    <div className="space-y-5">
      {/* Valor + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Valor del portafolio</p>
          <p className="text-3xl font-bold text-gray-900 mt-1.5">{fmtUSD(totalValue)}</p>
          <p className="text-xs text-gray-400 mt-1.5">Actualizado al {fmtDate(snapshotDate)}</p>
          {variation && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Variación desde última actualización</p>
              <p className={`text-sm font-bold mt-0.5 ${variation.abs >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {variation.abs >= 0 ? '+' : ''}{fmtUSD(variation.abs)} ({variation.abs >= 0 ? '+' : ''}{variation.pct.toFixed(2)}%)
              </p>
              <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">Variación de Market Value, no es rentabilidad — puede incluir depósitos, retiros u operaciones.</p>
            </div>
          )}
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <KpiCard label="Posiciones" value={String(positions.length)} />
          <KpiCard label="Liquidez" value={fmtUSD(liquidity.value)} sub={fmtPct(liquidity.pct)} />
          <KpiCard label="Mayor posición" value={largestPosition ? fmtPct(largestPosition.weight_pct != null ? Number(largestPosition.weight_pct) : 0) : '—'} sub={largestPosition?.name} />
          <KpiCard label="Top 5" value={fmtPct(concentration.top5)} sub="del portafolio" />
        </div>
      </div>

      {/* Asset allocation */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-bold text-gray-900 mb-4">Distribución del portafolio</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={assetAllocation} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {assetAllocation.map((a, i) => <Cell key={a.assetClass} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {assetAllocation.map((a, i) => (
              <div key={a.assetClass} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-xs text-gray-700 truncate">{a.label}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-gray-900">{fmtUSD(a.value)}</span>
                  <span className="text-[11px] text-gray-400 ml-1.5">{fmtPct(a.pct)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top holdings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-900">Principales posiciones</p>
            <button onClick={onSeeAll} className="text-xs font-semibold text-[#2E7D52] hover:underline">Ver todas →</button>
          </div>
          <div className="space-y-3">
            {sortedByValue.slice(0, 8).map(p => {
              const pct = p.weight_pct != null ? Number(p.weight_pct) : 0
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-gray-700 truncate">{p.name}</span>
                    <span className="text-xs font-semibold text-gray-900 shrink-0">{fmtUSD(Number(p.market_value))} · {fmtPct(pct)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#2E7D52] rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Concentración */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-bold text-gray-900 mb-3">Concentración</p>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[['Top 1', concentration.top1], ['Top 3', concentration.top3], ['Top 5', concentration.top5], ['Top 10', concentration.top10]].map(([label, val]) => (
              <div key={label as string} className="text-center">
                <p className="text-base font-bold text-gray-900">{fmtPct(val as number)}</p>
                <p className="text-[10px] text-gray-400">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-[#1B3A2B]" style={{ width: `${Math.min(concentration.top1, 100)}%` }} />
            <div className="bg-[#2E7D52]" style={{ width: `${Math.max(Math.min(concentration.top5, 100) - concentration.top1, 0)}%` }} />
            <div className="bg-[#A5D6B7]" style={{ width: `${Math.max(Math.min(concentration.top10, 100) - concentration.top5, 0)}%` }} />
          </div>
        </div>
      </div>

      {/* Vencimientos */}
      {maturityBuckets.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-bold text-gray-900 mb-3">Vencimientos</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={maturityBuckets} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: C.gray500 }} />
              <YAxis tick={{ fontSize: 10, fill: C.gray500 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any, n: any, p: any) => [fmtUSD(Number(v)), `${p.payload.count} instrumento(s)`]} />
              <Bar dataKey="value" fill={C.midGreen} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {nextMaturity && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Próximo vencimiento</p>
                <p className="text-xs font-semibold text-gray-800 truncate">{nextMaturity.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold text-gray-800">{fmtDate(nextMaturity.maturity_date as string)}</p>
                <p className="text-[11px] text-gray-400">{fmtUSD(Number(nextMaturity.market_value))}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
