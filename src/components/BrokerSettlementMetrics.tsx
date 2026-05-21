'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrokerTable {
  id: string
  advisor_name: string
  company: string
  year: number
}

interface BrokerRow {
  id: string
  concept: string
  sort_order: number
  is_formula: boolean
  formula_type: string | null
  values: Record<string, { id?: string; value: number | null; raw_value: string | null }>
}

interface Props {
  table: BrokerTable
  rows: BrokerRow[]
  months: string[]
}

// ─── Formula computation (duplicate — no shared util) ─────────────────────────

function computeFormulas(
  rows: BrokerRow[],
  months: string[]
): Record<string, Record<string, number>> {
  function getVal(concept: string, month: string): number {
    const row = rows.find(r => r.concept === concept)
    if (!row) return 0
    return row.values[month]?.value ?? 0
  }

  const result: Record<string, Record<string, number>> = {
    facturacion: {},
    porcentaje_40: {},
    subtotal: {},
    total: {},
  }

  for (const month of months) {
    const lh2       = getVal('LH2', month)
    const lh3       = getVal('LH3', month)
    const feeLH2    = getVal('Fee LH2', month)
    const feeLH3    = getVal('Fee LH3', month)
    const retencion = getVal('Retencion impuesto a los dividendos 7%', month)
    const otros     = getVal('otros', month)

    const facturacion = lh2 + lh3
    const pct40       = facturacion * 0.40
    const subtotal    = pct40 + feeLH2 + feeLH3
    const total       = subtotal - retencion + otros

    result['facturacion'][month]   = facturacion
    result['porcentaje_40'][month] = pct40
    result['subtotal'][month]      = subtotal
    result['total'][month]         = total
  }

  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayMonth(m: string): string {
  const [mon, yr] = m.split('-')
  return `${mon.charAt(0).toUpperCase()}${mon.slice(1)} ${yr}`
}

function fmtNum(n: number): string {
  return n.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-[#2D3F52] tabular-nums">{value}</p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BrokerSettlementMetrics({ rows, months }: Props) {
  const computed = useMemo(() => computeFormulas(rows, months), [rows, months])

  function getVal(concept: string, month: string): number {
    const row = rows.find(r => r.concept === concept)
    return row?.values[month]?.value ?? 0
  }

  // KPI values
  const totalFacturado = months.reduce((sum, m) => sum + (computed.facturacion[m] ?? 0), 0)
  const totalLiquidado = months.reduce((sum, m) => sum + (computed.total[m] ?? 0), 0)
  const promedio       = months.length > 0 ? totalLiquidado / months.length : 0

  const totalesPorMes = months.map(m => ({ month: m, val: computed.total[m] ?? 0 }))
  const mejorMes      = totalesPorMes.reduce((best, x) => x.val > best.val ? x : best, { month: '', val: -Infinity })
  const peorMes       = totalesPorMes
    .filter(x => x.val !== 0)
    .reduce((worst, x) => x.val < worst.val ? x : worst, { month: '', val: Infinity })

  const feesAcumulados = months.reduce((sum, m) => {
    return sum + Math.abs(getVal('Fee LH2', m)) + Math.abs(getVal('Fee LH3', m))
  }, 0)

  // Chart data
  const barData1 = months.map(m => ({
    mes: displayMonth(m),
    Facturacion: computed.facturacion[m] ?? 0,
    'Total a liquidar': computed.total[m] ?? 0,
  }))

  const barData2 = months.map(m => ({
    mes: displayMonth(m),
    LH2: getVal('LH2', m),
    LH3: getVal('LH3', m),
  }))

  const lineData = (() => {
    let acc = 0
    return months.map(m => {
      acc += computed.total[m] ?? 0
      return { mes: displayMonth(m), Acumulado: acc }
    })
  })()

  const feesData = months.map(m => ({
    mes: displayMonth(m),
    'Fee LH2': Math.abs(getVal('Fee LH2', m)),
    'Fee LH3': Math.abs(getVal('Fee LH3', m)),
  }))

  return (
    <div className="space-y-8">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Total facturado" value={`$${fmtNum(totalFacturado)}`} />
        <KpiCard label="Total liquidado" value={`$${fmtNum(totalLiquidado)}`} />
        <KpiCard label="Promedio mensual" value={`$${fmtNum(promedio)}`} />
        <KpiCard
          label="Mejor mes"
          value={mejorMes.month ? `${displayMonth(mejorMes.month)} ($${fmtNum(mejorMes.val)})` : '-'}
        />
        <KpiCard
          label="Peor mes"
          value={peorMes.month && isFinite(peorMes.val) ? `${displayMonth(peorMes.month)} ($${fmtNum(peorMes.val)})` : '-'}
        />
        <KpiCard label="Fees descontados" value={`$${fmtNum(feesAcumulados)}`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Facturacion vs Total */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">Facturacion vs Total a liquidar</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData1} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => (v !== undefined ? `$${fmtNum(Number(v))}` : '')} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Facturacion" fill="#2D3F52" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Total a liquidar" fill="#16A34A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* LH2 vs LH3 */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">LH2 vs LH3 por mes</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData2} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => (v !== undefined ? `$${fmtNum(Number(v))}` : '')} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="LH2" fill="#1D4ED8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="LH3" fill="#7C3AED" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Linea acumulada */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">Evolucion acumulada de liquidado</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => (v !== undefined ? `$${fmtNum(Number(v))}` : '')} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="Acumulado"
                stroke="#16A34A"
                strokeWidth={2}
                dot={{ fill: '#16A34A', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Fees */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#2D3F52] mb-4">Fees descontados por mes</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={feesData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => (v !== undefined ? `$${fmtNum(Number(v))}` : '')} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Fee LH2" fill="#EF4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Fee LH3" fill="#F87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  )
}
