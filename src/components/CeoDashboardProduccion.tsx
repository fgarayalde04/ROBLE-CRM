'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import type { BrokerSummary } from '@/lib/ceo-data'
import type { AumRecord, ProductionRecord, RevenueRecord } from '@/types/platform'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  brokerSummaries: BrokerSummary[]
  aumRecords: AumRecord[]
  productionRecords: ProductionRecord[]
  revenueRecords: RevenueRecord[]
  currentYear: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function displayMonth(m: string): string {
  const [mon, yr] = m.split('-')
  if (!mon || !yr) return m
  return `${mon.charAt(0).toUpperCase()}${mon.slice(1)} ${yr}`
}

const BROKER_COLORS = ['#2D3F52', '#16A34A', '#1D4ED8', '#7C3AED']

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-5" style={{ borderTop: '3px solid #16A34A' }}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#2D3F52]">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CeoDashboardProduccion({
  brokerSummaries,
  aumRecords,
  productionRecords,
  revenueRecords,
  currentYear,
}: Props) {
  if (brokerSummaries.length === 0 && aumRecords.length === 0 && productionRecords.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-10 text-center">
        <p className="text-gray-500 text-sm">
          No hay datos de liquidaciones para {currentYear}. Carga datos en Liquidacion Brokers.
        </p>
      </div>
    )
  }

  // ─── Compute KPIs from brokerSummaries ─────────────────────────────────────

  let totalFacturado = 0
  let totalLiquidado = 0

  for (const s of brokerSummaries) {
    for (const v of Object.values(s.facturacion)) totalFacturado += v
    for (const v of Object.values(s.total_liquidado)) totalLiquidado += v
  }

  // All months union
  const allMonthsSet = new Set<string>()
  for (const s of brokerSummaries) {
    for (const m of s.months) allMonthsSet.add(m)
  }

  // Sort months
  const MONTH_ORDER: Record<string, number> = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
  }
  const allMonths = Array.from(allMonthsSet).sort((a, b) => {
    const [ma, ya] = a.split('-')
    const [mb, yb] = b.split('-')
    const yearA = parseInt(ya ?? '0'), yearB = parseInt(yb ?? '0')
    if (yearA !== yearB) return yearA - yearB
    return (MONTH_ORDER[ma] ?? 0) - (MONTH_ORDER[mb] ?? 0)
  })

  // Month totals for liquidado
  const monthLiquidado: Record<string, number> = {}
  for (const m of allMonths) {
    let sum = 0
    for (const s of brokerSummaries) sum += s.total_liquidado[m] ?? 0
    monthLiquidado[m] = sum
  }

  const monthsWithData = allMonths.filter((m) => (monthLiquidado[m] ?? 0) !== 0)
  const avgMensual = monthsWithData.length > 0 ? totalLiquidado / monthsWithData.length : 0

  let bestMonth = ''
  let bestMonthVal = -Infinity
  for (const [m, v] of Object.entries(monthLiquidado)) {
    if (v > bestMonthVal) { bestMonthVal = v; bestMonth = m }
  }

  // AUM latest
  let aumTotal = 0
  if (aumRecords.length > 0) {
    const latest = aumRecords.reduce((a, b) => (a.period > b.period ? a : b)).period
    aumTotal = aumRecords.filter((r) => r.period === latest).reduce((s, r) => s + r.aum_value, 0)
  }

  // Top producer
  const brokerTotals = brokerSummaries.map((s) => ({
    name: s.advisor_name,
    total: Object.values(s.total_liquidado).reduce((a, b) => a + b, 0),
  }))
  brokerTotals.sort((a, b) => b.total - a.total)
  const topBroker = brokerTotals[0]

  // ─── Chart data ────────────────────────────────────────────────────────────

  // Bar chart 1: Facturacion por asesor por mes (grouped)
  const facturacionChartData = allMonths.map((month) => {
    const entry: Record<string, string | number> = { month: displayMonth(month) }
    for (const s of brokerSummaries) {
      entry[s.advisor_name] = s.facturacion[month] ?? 0
    }
    return entry
  })

  // Bar chart 2: Total a liquidar por mes (sum of all brokers)
  const liquidadoChartData = allMonths.map((month) => ({
    month: displayMonth(month),
    total: monthLiquidado[month] ?? 0,
  }))

  // Insights
  const insights: string[] = []
  if (totalFacturado > 0) insights.push(`Facturacion total del ano: ${fmt(totalFacturado)}.`)
  if (totalLiquidado > 0) insights.push(`Total liquidado: ${fmt(totalLiquidado)}.`)
  if (brokerSummaries.length > 1 && topBroker) {
    insights.push(`Mayor productor: ${topBroker.name} con ${fmt(topBroker.total)} liquidado.`)
  }
  if (bestMonth) {
    insights.push(`Mejor mes: ${displayMonth(bestMonth)} con ${fmt(bestMonthVal)} liquidado.`)
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {aumTotal > 0 && (
          <Kpi label="AUM total" value={fmt(aumTotal)} sub="ultimo periodo" />
        )}
        <Kpi label="Facturado ano" value={totalFacturado > 0 ? fmt(totalFacturado) : '—'} sub={String(currentYear)} />
        <Kpi label="Total liquidado" value={totalLiquidado > 0 ? fmt(totalLiquidado) : '—'} sub={String(currentYear)} />
        <Kpi label="Promedio mensual" value={avgMensual > 0 ? fmt(avgMensual) : '—'} sub="liquidado" />
        <Kpi
          label="Mejor mes"
          value={bestMonth ? displayMonth(bestMonth) : '—'}
          sub={bestMonthVal > -Infinity && bestMonthVal > 0 ? fmt(bestMonthVal) : undefined}
        />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Insights</p>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <p key={i} className="text-sm text-gray-700 pl-3 border-l-2 border-[#2D3F52]">{insight}</p>
            ))}
          </div>
        </div>
      )}

      {/* Broker tables */}
      {brokerSummaries.map((s) => {
        const months = s.months
        return (
          <div key={`${s.advisor_name}-${s.company}`} className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0F4] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#2D3F52]">
                {s.advisor_name} — {s.company.charAt(0).toUpperCase() + s.company.slice(1)}
              </h3>
              <span className="text-xs text-gray-400">{s.year}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide sticky left-0 bg-gray-50 min-w-[160px]">
                      Concepto
                    </th>
                    {months.map((m) => (
                      <th key={m} className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide min-w-[110px] whitespace-nowrap">
                        {displayMonth(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { label: 'Facturacion', key: 'facturacion' as const },
                    { label: '40%', key: null, compute: (m: string) => (s.facturacion[m] ?? 0) * 0.4 },
                    { label: 'Fees', key: 'fees' as const },
                    { label: 'Total a liquidar', key: 'total_liquidado' as const, bold: true },
                  ].map((row) => (
                    <tr key={row.label} className={row.bold ? 'bg-[#2D3F52]/5 font-bold border-t-2 border-[#2D3F52]/20' : 'hover:bg-gray-50'}>
                      <td className={`px-4 py-2.5 sticky left-0 text-sm ${row.bold ? 'text-[#2D3F52] font-bold bg-[#2D3F52]/5' : 'text-gray-700 bg-white'}`}>
                        {row.label}
                      </td>
                      {months.map((m) => {
                        const val = row.key
                          ? (s[row.key][m] ?? 0)
                          : row.compute!(m)
                        return (
                          <td key={m} className={`px-4 py-2.5 text-right tabular-nums ${row.bold ? 'text-[#2D3F52] font-bold' : 'text-gray-700'}`}>
                            {val !== 0 ? fmt(val) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* Chart: Facturacion mensual por asesor */}
      {brokerSummaries.length > 0 && allMonths.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-sm font-semibold text-[#2D3F52] mb-4">Facturacion mensual por asesor</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={facturacionChartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v: number) => fmt(v)} />
              <Tooltip formatter={(value) => fmt(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {brokerSummaries.map((s, i) => (
                <Bar key={s.advisor_name} dataKey={s.advisor_name} fill={BROKER_COLORS[i % BROKER_COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chart: Total a liquidar por mes */}
      {allMonths.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-sm font-semibold text-[#2D3F52] mb-4">Total a liquidar por mes</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={liquidadoChartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v: number) => fmt(v)} />
              <Tooltip formatter={(value) => fmt(Number(value))} />
              <Bar dataKey="total" name="Total liquidado" fill="#16A34A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legacy production/revenue if data exists */}
      {(productionRecords.length > 0 || aumRecords.length > 0) && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-xs text-gray-400 text-center">
            Datos historicos de produccion disponibles — ver seccion Importar datos para detalles.
          </p>
        </div>
      )}
    </div>
  )
}
