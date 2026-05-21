'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts'
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { useState } from 'react'
import type { PaymentRow } from './PagosMensualesTable'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableEntry {
  table: { company: string; year: number; exchange_rate: number }
  rows: PaymentRow[]
}

interface Props {
  tables: TableEntry[]
  currentYear: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ['mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']
const MONTH_LABELS: Record<string, string> = {
  mayo: 'Mayo', junio: 'Jun', julio: 'Jul', agosto: 'Ago',
  setiembre: 'Set', octubre: 'Oct', noviembre: 'Nov', diciembre: 'Dic',
}

const COLOR_ROBLE = '#2D3F52'
const COLOR_GELIENE = '#16A34A'
const COLOR_FIJO = '#3B82F6'
const COLOR_VARIABLE = '#F59E0B'

const PIE_COLORS = [
  '#2D3F52', '#16A34A', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#8B5CF6', '#06B6D4',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseVal(raw: string | null | undefined): number {
  if (!raw || raw === '?') return 0
  const n = parseFloat(raw.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function tooltipFormatter(v: ValueType | undefined): string {
  return typeof v === 'number' ? fmtNum(v) : String(v ?? '')
}

function rowTotal(row: PaymentRow): number {
  return MONTHS.reduce((s, m) => s + parseVal(row.values[m]?.raw_value), 0)
}

function computeTotals(entries: TableEntry[]) {
  let total = 0
  let fijo = 0
  let variable = 0
  const byCategory: Record<string, number> = {}
  const byConcept: Record<string, number> = {}

  for (const { rows } of entries) {
    for (const row of rows) {
      const t = rowTotal(row)
      total += t
      if (row.expense_type === 'fijo') fijo += t
      else variable += t
      byCategory[row.category] = (byCategory[row.category] ?? 0) + t
      byConcept[row.concept] = (byConcept[row.concept] ?? 0) + t
    }
  }

  return { total, fijo, variable, byCategory, byConcept }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PagosMensualesDashboard({ tables, currentYear }: Props) {
  const [filterCompany, setFilterCompany] = useState<'all' | 'roble' | 'geliene'>('all')
  const [filterType, setFilterType] = useState<'all' | 'fijo' | 'variable'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  // Entries for current year
  const yearEntries = tables.filter((t) => t.table.year === currentYear)

  // Apply filters
  const filteredEntries: TableEntry[] = yearEntries
    .filter((t) => filterCompany === 'all' || t.table.company === filterCompany)
    .map((t) => ({
      ...t,
      rows: t.rows.filter((r) => {
        if (filterType !== 'all' && r.expense_type !== filterType) return false
        if (filterCategory !== 'all' && r.category !== filterCategory) return false
        return true
      }),
    }))

  // Roble and Geliene for current year
  const robleEntry = yearEntries.find((t) => t.table.company === 'roble')
  const gelieneEntry = yearEntries.find((t) => t.table.company === 'geliene')

  // Overall totals
  const overall = computeTotals(filteredEntries)
  const robleTotals = computeTotals(robleEntry ? [robleEntry] : [])
  const gelieneTotals = computeTotals(gelieneEntry ? [gelieneEntry] : [])
  const allYearTotals = computeTotals(yearEntries)

  // Monthly evolution data
  const monthlyData = MONTHS.map((m) => {
    const roble = (robleEntry?.rows ?? []).reduce((s, r) => s + parseVal(r.values[m]?.raw_value), 0)
    const geliene = (gelieneEntry?.rows ?? []).reduce((s, r) => s + parseVal(r.values[m]?.raw_value), 0)
    return { month: MONTH_LABELS[m], Roble: roble, Geliene: geliene }
  })

  // Category pie data
  const catEntries = Object.entries(allYearTotals.byCategory)
    .sort((a, b) => b[1] - a[1])
  const topCats = catEntries.slice(0, 6)
  const otrosTotal = catEntries.slice(6).reduce((s, [, v]) => s + v, 0)
  const pieData = [
    ...topCats.map(([name, value]) => ({ name, value })),
    ...(otrosTotal > 0 ? [{ name: 'Otros', value: otrosTotal }] : []),
  ]

  // Top 10 concepts
  const top10 = Object.entries(allYearTotals.byConcept)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, value }))

  // Fijo vs Variable
  const tipoData = [
    { name: 'Fijo', value: allYearTotals.fijo },
    { name: 'Variable', value: allYearTotals.variable },
  ]

  // Multi-year comparison
  const allYears = Array.from(new Set(tables.map((t) => t.table.year))).sort()
  const yearCompData = allYears.map((yr) => {
    const yrEntries = tables.filter((t) => t.table.year === yr)
    const roble = computeTotals(yrEntries.filter((t) => t.table.company === 'roble')).total
    const geliene = computeTotals(yrEntries.filter((t) => t.table.company === 'geliene')).total
    return { year: String(yr), Roble: roble, Geliene: geliene }
  })

  // All categories for filter
  const allCategories = Array.from(
    new Set(yearEntries.flatMap((t) => t.rows.map((r) => r.category)))
  ).sort()

  // Insights
  const totalAll = allYearTotals.total
  const salariosTotal = Object.entries(allYearTotals.byCategory).find(([k]) => k === 'salarios')?.[1] ?? 0
  const topCatEntry = catEntries[0]
  const robleShare = totalAll > 0 ? (robleTotals.total / totalAll) * 100 : 0
  const gelieneShare = totalAll > 0 ? (gelieneTotals.total / totalAll) * 100 : 0
  const fijoShare = totalAll > 0 ? (allYearTotals.fijo / totalAll) * 100 : 0
  const salariosShare = totalAll > 0 ? (salariosTotal / totalAll) * 100 : 0

  const insights = [
    salariosShare > 0 && `Los sueldos representan el ${salariosShare.toFixed(1)}% del gasto total.`,
    robleShare > 0 && `Roble concentra el ${robleShare.toFixed(1)}% del gasto total.`,
    gelieneShare > 0 && `Geliene concentra el ${gelieneShare.toFixed(1)}% del gasto total.`,
    fijoShare > 0 && `Los gastos fijos representan el ${fijoShare.toFixed(1)}% del total.`,
    topCatEntry && `La categoria mas relevante es "${topCatEntry[0]}" con ${fmtNum(topCatEntry[1])}.`,
  ].filter(Boolean) as string[]

  // KPI cards
  const kpiCards = [
    { label: 'Gasto total anual', value: fmtNum(allYearTotals.total), sub: `Roble + Geliene ${currentYear}` },
    { label: 'Total Roble', value: fmtNum(robleTotals.total), sub: String(currentYear) },
    { label: 'Total Geliene', value: fmtNum(gelieneTotals.total), sub: String(currentYear) },
    { label: 'Gastos fijos', value: fmtNum(allYearTotals.fijo), sub: `${fijoShare.toFixed(0)}% del total` },
    { label: 'Gastos variables', value: fmtNum(allYearTotals.variable), sub: `${(100 - fijoShare).toFixed(0)}% del total` },
    {
      label: 'Promedio mensual',
      value: fmtNum(allYearTotals.total / Math.max(1, MONTHS.filter((m) => {
        return yearEntries.some((t) => t.rows.some((r) => parseVal(r.values[m]?.raw_value) > 0))
      }).length)),
      sub: 'meses con datos',
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">{card.label}</p>
            <p className="text-lg font-bold text-[#2D3F52]">{card.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-[#E2E8F0] rounded-xl p-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filtros:</span>

        <div className="flex gap-1">
          {(['all', 'roble', 'geliene'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFilterCompany(c)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                filterCompany === c
                  ? 'border-[#2D3F52] bg-[#2D3F52] text-white'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {c === 'all' ? 'Todos' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {(['all', 'fijo', 'variable'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                filterType === t
                  ? 'border-[#16A34A] bg-[#16A34A] text-white'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {t === 'all' ? 'Todos' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-2 py-1 text-xs border border-gray-200 rounded-full focus:outline-none"
        >
          <option value="all">Todas las categorias</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Evolucion mensual */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">Evolucion mensual</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={tooltipFormatter} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Roble" stackId="a" fill={COLOR_ROBLE} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Geliene" stackId="a" fill={COLOR_GELIENE} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gasto por categoria */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">Gasto por categoria</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={false}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipFormatter} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-gray-600 truncate">{d.name}</span>
                  <span className="ml-auto text-gray-400 text-[10px]">{fmtNum(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fijo vs Variable */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">Fijos vs Variables</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie
                  data={tipoData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                >
                  <Cell fill={COLOR_FIJO} />
                  <Cell fill={COLOR_VARIABLE} />
                </Pie>
                <Tooltip formatter={tooltipFormatter} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_FIJO }} />
                  <span className="text-xs text-gray-600">Fijo</span>
                </div>
                <p className="text-base font-bold text-[#2D3F52] ml-4">{fmtNum(allYearTotals.fijo)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_VARIABLE }} />
                  <span className="text-xs text-gray-600">Variable</span>
                </div>
                <p className="text-base font-bold text-[#2D3F52] ml-4">{fmtNum(allYearTotals.variable)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Top 10 gastos */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">Top 10 gastos por concepto</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={top10}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip formatter={tooltipFormatter} />
              <Bar dataKey="value" fill={COLOR_ROBLE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Multi-year comparison */}
      {allYears.length > 1 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">Comparacion entre anos</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={yearCompData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={tooltipFormatter} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Roble" stroke={COLOR_ROBLE} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Geliene" stroke={COLOR_GELIENE} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-3">Insights automaticos</h3>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: i % 2 === 0 ? COLOR_ROBLE : COLOR_GELIENE }}
                />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
