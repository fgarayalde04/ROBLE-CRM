'use client'

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { AumRecord, ProductionRecord, RevenueRecord } from '@/types/platform'

interface Props {
  aumRecords: AumRecord[]
  productionRecords: ProductionRecord[]
  revenueRecords: RevenueRecord[]
}

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toLocaleString()}`
}

function groupByPeriod(records: { period: string; [key: string]: any }[], valueKey: string) {
  const map: Record<string, number> = {}
  for (const r of records) {
    map[r.period] = (map[r.period] ?? 0) + (r[valueKey] as number)
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period: period.slice(0, 7), value }))
    .slice(-18)
}

function groupByAdvisor(records: ProductionRecord[]) {
  const map: Record<string, number> = {}
  for (const r of records) {
    const key = r.advisor ?? 'Sin asignar'
    map[key] = (map[key] ?? 0) + r.production_value
  }
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .map(([advisor, value]) => ({ advisor, value }))
    .slice(0, 10)
}

function groupBySegment(records: AumRecord[]) {
  const map: Record<string, number> = {}
  const latest = records.reduce<string>((acc, r) => r.period > acc ? r.period : acc, '')
  const latestRecords = records.filter((r) => r.period === latest)
  for (const r of latestRecords) {
    const key = r.segment ?? 'Sin segmento'
    map[key] = (map[key] ?? 0) + r.aum_value
  }
  return Object.entries(map).map(([segment, value]) => ({ segment, value }))
}

const TICK_COLOR = '#9CA3AF'
const AXIS_STYLE = { fontSize: 11, fill: TICK_COLOR }
const GREEN = '#16A34A'
const CHARCOAL = '#2D3F52'
const LIGHT_GREEN = '#D4B46A'

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-48 flex flex-col items-center justify-center gap-2">
      <p className="text-sm text-gray-400">{label}</p>
      <a href="/ceo/import" className="text-xs text-blue-600 hover:underline">Importar datos</a>
    </div>
  )
}

export default function CeoCharts({ aumRecords, productionRecords, revenueRecords }: Props) {
  const aumByPeriod = groupByPeriod(aumRecords, 'aum_value')
  const productionByPeriod = groupByPeriod(productionRecords, 'production_value')
  const revenueByPeriod = groupByPeriod(revenueRecords, 'value')
  const productionByAdvisor = groupByAdvisor(productionRecords)
  const aumBySegment = groupBySegment(aumRecords)

  return (
    <div className="space-y-6">

      {/* Row 1: AUM + Producción mensual */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartCard title="Evolución AUM" subtitle="Valor total de activos bajo gestión por mes">
          {aumByPeriod.length === 0 ? (
            <EmptyChart label="Sin datos de AUM" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={aumByPeriod} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                <XAxis dataKey="period" tick={AXIS_STYLE} />
                <YAxis tickFormatter={fmt} tick={AXIS_STYLE} width={65} />
                <Tooltip formatter={(v: any) => [fmt(Number(v)), 'AUM']} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
                <Line type="monotone" dataKey="value" stroke={GREEN} strokeWidth={2} dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Produccion mensual" subtitle="Produccion total por mes">
          {productionByPeriod.length === 0 ? (
            <EmptyChart label="Sin datos de produccion" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={productionByPeriod} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" vertical={false} />
                <XAxis dataKey="period" tick={AXIS_STYLE} />
                <YAxis tickFormatter={fmt} tick={AXIS_STYLE} width={65} />
                <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Produccion']} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
                <Bar dataKey="value" fill={GREEN} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 2: Ingresos + Producción por asesor */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartCard title="Ingresos / Comisiones" subtitle="Evolución mensual de ingresos">
          {revenueByPeriod.length === 0 ? (
            <EmptyChart label="Sin datos de ingresos" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByPeriod} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" vertical={false} />
                <XAxis dataKey="period" tick={AXIS_STYLE} />
                <YAxis tickFormatter={fmt} tick={AXIS_STYLE} width={65} />
                <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Ingresos']} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
                <Bar dataKey="value" fill={CHARCOAL} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Produccion por asesor" subtitle="Acumulado total por asesor">
          {productionByAdvisor.length === 0 ? (
            <EmptyChart label="Sin datos de produccion" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={productionByAdvisor}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" horizontal={false} />
                <XAxis type="number" tickFormatter={fmt} tick={AXIS_STYLE} />
                <YAxis type="category" dataKey="advisor" tick={AXIS_STYLE} width={90} />
                <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Produccion']} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
                <Bar dataKey="value" fill={LIGHT_GREEN} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 3: AUM por segmento (tabla) */}
      {aumBySegment.length > 0 && (
        <ChartCard title="AUM por segmento" subtitle="Distribucion del patrimonio segun segmento (ultimo periodo)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EEF0F4]">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Segmento</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">AUM</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F3F0]">
                {(() => {
                  const total = aumBySegment.reduce((s, r) => s + r.value, 0)
                  return aumBySegment
                    .sort((a, b) => b.value - a.value)
                    .map((row) => (
                      <tr key={row.segment} className="hover:bg-[#F4F6F8]">
                        <td className="px-4 py-2.5 font-medium text-gray-700">{row.segment}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(row.value)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400">
                          {total > 0 ? `${((row.value / total) * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))
                })()}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEF0F4]">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
