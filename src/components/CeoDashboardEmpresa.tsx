'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import type { GastosSummary } from '@/lib/ceo-data'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  gastosSummaries: GastosSummary[]
  currentYear: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MONTH_ORDER: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
}

function sortMonths(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split('-')
    const [mb, yb] = b.split('-')
    const yearA = parseInt(ya ?? '0'), yearB = parseInt(yb ?? '0')
    if (yearA !== yearB) return yearA - yearB
    return (MONTH_ORDER[ma] ?? 0) - (MONTH_ORDER[mb] ?? 0)
  })
}

function displayMonth(m: string): string {
  const [mon, yr] = m.split('-')
  if (!mon) return m
  return yr ? `${mon.charAt(0).toUpperCase()}${mon.slice(1)} ${yr}` : mon.charAt(0).toUpperCase() + mon.slice(1)
}

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

const BAR_COLORS = ['#2D3F52', '#16A34A', '#1D4ED8', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0891B2']

// ─── Component ────────────────────────────────────────────────────────────────

export default function CeoDashboardEmpresa({ gastosSummaries, currentYear }: Props) {
  if (gastosSummaries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-10 text-center">
        <p className="text-gray-500 text-sm">
          No hay datos de pagos mensuales para {currentYear}. Carga los gastos en la seccion Pagos mensuales.
        </p>
      </div>
    )
  }

  const roble = gastosSummaries.find((s) => s.company === 'roble')
  const geliene = gastosSummaries.find((s) => s.company === 'geliene')

  const gastoRoble = roble?.total ?? 0
  const gastoGeliene = geliene?.total ?? 0
  const totalCombinado = gastoRoble + gastoGeliene

  const fijosTotal = (roble?.fijos ?? 0) + (geliene?.fijos ?? 0)
  const variablesTotal = (roble?.variables ?? 0) + (geliene?.variables ?? 0)

  const monthsWithDataSet = new Set<string>()
  for (const s of gastosSummaries) {
    for (const m of Object.keys(s.por_mes)) {
      if (s.por_mes[m] > 0) monthsWithDataSet.add(m)
    }
  }
  const monthsWithData = sortMonths(Array.from(monthsWithDataSet))
  const avgMensual = monthsWithData.length > 0 ? totalCombinado / monthsWithData.length : 0

  // ─── Union months for chart ─────────────────────────────────────────────────

  const allMonthsSet = new Set<string>()
  for (const s of gastosSummaries) {
    for (const m of Object.keys(s.por_mes)) allMonthsSet.add(m)
  }
  const allMonths = sortMonths(Array.from(allMonthsSet))

  // Chart 1: Gastos mensuales Roble vs Geliene
  const gastosChartData = allMonths.map((month) => ({
    month: displayMonth(month),
    Roble: roble?.por_mes[month] ?? 0,
    Geliene: geliene?.por_mes[month] ?? 0,
  }))

  // Chart 2: Fijos vs Variables
  const fijosVarData = [
    { name: 'Fijo', value: fijosTotal },
    { name: 'Variable', value: variablesTotal },
  ].filter((d) => d.value > 0)

  // Chart 3: Top categorias
  const categoriaMap: Record<string, number> = {}
  for (const s of gastosSummaries) {
    for (const [cat, val] of Object.entries(s.por_categoria)) {
      categoriaMap[cat] = (categoriaMap[cat] ?? 0) + val
    }
  }
  const topCategorias = Object.entries(categoriaMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, total]) => ({ cat: cat.charAt(0).toUpperCase() + cat.slice(1), total }))

  const topCat = topCategorias[0]

  // Insights
  const insights: string[] = []
  if (totalCombinado > 0) insights.push(`Gasto total combinado: ${fmt(totalCombinado)}.`)
  if (totalCombinado > 0) {
    const fijoPct = Math.round((fijosTotal / totalCombinado) * 100)
    insights.push(`Los gastos fijos representan ${fijoPct}% del total.`)
  }
  if (gastoRoble > 0 || gastoGeliene > 0) {
    const roblePct = totalCombinado > 0 ? Math.round((gastoRoble / totalCombinado) * 100) : 0
    const gelienePct = totalCombinado > 0 ? Math.round((gastoGeliene / totalCombinado) * 100) : 0
    insights.push(`Roble concentra ${roblePct}% del gasto; Geliene el ${gelienePct}%.`)
  }
  if (topCat) {
    insights.push(`La categoria mas relevante es ${topCat.cat} con ${fmt(topCat.total)}.`)
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        <Kpi label="Gasto Roble" value={gastoRoble > 0 ? fmt(gastoRoble) : '—'} sub={String(currentYear)} />
        <Kpi label="Gasto Geliene" value={gastoGeliene > 0 ? fmt(gastoGeliene) : '—'} sub={String(currentYear)} />
        <Kpi label="Total combinado" value={totalCombinado > 0 ? fmt(totalCombinado) : '—'} sub={String(currentYear)} />
        <Kpi label="Gastos fijos" value={fijosTotal > 0 ? fmt(fijosTotal) : '—'} sub="ambas empresas" />
        <Kpi label="Gastos variables" value={variablesTotal > 0 ? fmt(variablesTotal) : '—'} sub="ambas empresas" />
        <Kpi label="Promedio mensual" value={avgMensual > 0 ? fmt(avgMensual) : '—'} sub="combinado" />
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

      {/* Chart: Gastos mensuales */}
      {allMonths.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-sm font-semibold text-[#2D3F52] mb-4">Gastos mensuales por empresa</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={gastosChartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v: number) => fmt(v)} />
              <Tooltip formatter={(value) => fmt(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Roble" fill="#2D3F52" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Geliene" fill="#16A34A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Chart: Fijos vs Variables */}
        {fijosVarData.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-sm font-semibold text-[#2D3F52] mb-4">Fijos vs Variables</p>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={fijosVarData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${fmt(value as number)}`}
                  labelLine={false}
                >
                  <Cell fill="#1D4ED8" />
                  <Cell fill="#D97706" />
                </Pie>
                <Tooltip formatter={(value) => fmt(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Chart: Top categorias */}
        {topCategorias.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-sm font-semibold text-[#2D3F52] mb-4">Top categorias de gasto</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topCategorias} layout="vertical" margin={{ top: 0, right: 24, left: 80, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v: number) => fmt(v)} />
                <YAxis dataKey="cat" type="category" tick={{ fontSize: 11, fill: '#6B7280' }} width={80} />
                <Tooltip formatter={(value) => fmt(Number(value))} />
                <Bar dataKey="total" name="Total" radius={[0, 3, 3, 0]}>
                  {topCategorias.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
