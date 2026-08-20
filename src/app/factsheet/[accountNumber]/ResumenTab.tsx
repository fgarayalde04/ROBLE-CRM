'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { PortfolioPositionRow, PortfolioCashProjectionRow, PortfolioCashProjectionsImportRow } from '@/types/portfolio'
import { fmtUSD, fmtPct, fmtDate } from './PortfolioAccountClient'
import DonutChart from '@/components/portfolio/DonutChart'
import { COLORS, DONUT_COLORS } from '@/lib/portfolio/theme'

function SectionCard({ title, subtitle, children, className = '' }: { title?: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-5 ${className}`}>
      {title && (
        <div className="mb-4">
          <p className="text-sm font-bold text-gray-900">{title}</p>
          {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function DonutCard({ title, data }: { title: string; data: { label: string; value: number; pct: number }[] }) {
  if (data.length === 0) return null
  const total = data.reduce((s, d) => s + d.value, 0)
  const segments = data.map((d, i) => ({ label: d.label, value: d.value, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
  return (
    <SectionCard title={title}>
      <div className="flex flex-col items-center gap-4">
        <DonutChart segments={segments} centerLabel={fmtUSD(total)} centerSub="Total" />
        <div className="w-full space-y-1.5">
          {data.map((d, i) => (
            <div key={d.label} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="text-gray-600 truncate">{d.label}</span>
              </div>
              <div className="text-right shrink-0">
                <span className="font-semibold text-gray-900">{fmtPct(d.pct)}</span>
                <span className="text-gray-400 ml-1.5">{fmtUSD(d.value)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

export default function ResumenTab({
  totalValue, snapshotDate, variation, assetAllocation, fixedIncomeBreakdown, currencyExposure,
  liquidity, sortedByValue, maturityBuckets, nextMaturity, cashProjImport, projectedIncome12m, nextPayment,
  cleanedNames, onSeeAll,
}: {
  totalValue: number
  snapshotDate: string
  variation: { abs: number; pct: number } | null
  positions: PortfolioPositionRow[]
  assetAllocation: { assetClass: string; label: string; value: number; pct: number }[]
  fixedIncomeBreakdown: { label: string; value: number; pct: number }[]
  currencyExposure: { label: string; value: number; pct: number }[]
  liquidity: { value: number; pct: number }
  sortedByValue: PortfolioPositionRow[]
  maturityBuckets: { year: number; value: number; count: number }[]
  nextMaturity: PortfolioPositionRow | null
  cashProjImport: PortfolioCashProjectionsImportRow | null
  projectedIncome12m: number
  nextPayment: PortfolioCashProjectionRow | null
  cleanedNames: Map<string, { name: string; detail: string | null }>
  onSeeAll: () => void
}) {
  const topHoldings = sortedByValue.slice(0, 6)
  const maxHoldingValue = topHoldings[0] ? Number(topHoldings[0].market_value) : 1

  return (
    <div className="space-y-5">
      {/* ── Hero: Portfolio Value ── */}
      <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.darkGreen}, ${COLORS.charcoal})` }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Valor del portafolio</p>
        <p className="text-4xl font-bold mt-1.5">{fmtUSD(totalValue)}</p>
        <p className="text-xs text-white/50 mt-1.5">Actualizado al {fmtDate(snapshotDate)}</p>
        {variation && (
          <div className="mt-4 pt-4 border-t border-white/15">
            <p className="text-[10px] uppercase tracking-wide text-white/50">Variación desde última actualización</p>
            <p className={`text-base font-bold mt-0.5 ${variation.abs >= 0 ? 'text-emerald-400' : 'text-red-300'}`}>
              {variation.abs >= 0 ? '+' : ''}{fmtUSD(variation.abs)} ({variation.abs >= 0 ? '+' : ''}{variation.pct.toFixed(2)}%)
            </p>
            <p className="text-[10px] text-white/40 mt-1 leading-relaxed">Variación de Market Value, no es rentabilidad — puede incluir depósitos, retiros u operaciones.</p>
          </div>
        )}
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SectionCard>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Posiciones</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{sortedByValue.length}</p>
        </SectionCard>
        <SectionCard>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Liquidez</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmtUSD(liquidity.value)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{fmtPct(liquidity.pct)} del portafolio</p>
        </SectionCard>
        <SectionCard>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Unrealized Gain/Loss</p>
          <p className="text-sm font-semibold text-gray-400 mt-1.5 leading-snug">No disponible</p>
          <p className="text-[10px] text-gray-400 mt-0.5">El archivo de posiciones no incluye costo base</p>
        </SectionCard>
        <SectionCard>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Income próx. 12 meses</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{cashProjImport ? fmtUSD(projectedIncome12m) : '—'}</p>
          {!cashProjImport && <p className="text-[11px] text-gray-400 mt-0.5">Sin cash projections importadas</p>}
        </SectionCard>
      </div>

      {/* ── Donuts ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutCard title="Asset Allocation" data={assetAllocation.map(a => ({ label: a.label, value: a.value, pct: a.pct }))} />
        <DonutCard title="Fixed Income Allocation" data={fixedIncomeBreakdown} />
        <DonutCard title="Currency Exposure" data={currencyExposure} />
      </div>

      {/* ── Principales inversiones ── */}
      <SectionCard>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-gray-900">Principales inversiones</p>
          <button onClick={onSeeAll} className="text-xs font-semibold text-[#2E7D52] hover:underline">Ver todas →</button>
        </div>
        <div className="space-y-3.5">
          {topHoldings.map(p => {
            const pct = p.weight_pct != null ? Number(p.weight_pct) : 0
            const mv = Number(p.market_value)
            const clean = cleanedNames.get(p.id)
            return (
              <div key={p.id}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-medium text-gray-800 truncate">{clean?.name ?? p.name}</span>
                  <span className="text-xs font-semibold text-gray-900 shrink-0">{fmtUSD(mv)} · {fmtPct(pct)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max((mv / maxHoldingValue) * 100, 3)}%`, background: `linear-gradient(90deg, ${COLORS.darkGreen}, ${COLORS.midGreen})` }} />
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* ── Portfolio Income ── */}
      <SectionCard title="Portfolio Income" subtitle="Ingresos proyectados por cupones, intereses y distribuciones">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ background: COLORS.bgSoft }}>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Projected Income — próximos 12 meses</p>
            <p className="text-2xl font-bold mt-1" style={{ color: COLORS.darkGreen }}>{cashProjImport ? fmtUSD(projectedIncome12m) : '—'}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: COLORS.bgSoft }}>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Próximo cobro</p>
            {nextPayment ? (
              <>
                <p className="text-sm font-bold text-gray-900 mt-1">{fmtDate(nextPayment.pay_date)}</p>
                <p className="text-xs text-gray-600 truncate mt-0.5">{cleanedNames.get(nextPayment.id)?.name ?? nextPayment.description}</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color: COLORS.darkGreen }}>{nextPayment.estimated_amount != null ? fmtUSD(Number(nextPayment.estimated_amount)) : '—'}</p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-1">Sin cash projections importadas</p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Bond Maturity Schedule ── */}
      {maturityBuckets.length > 0 && (
        <SectionCard title="Bond Maturity Schedule" subtitle="Market Value que vence en cada año — solo instrumentos con fecha de vencimiento">
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={maturityBuckets} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: COLORS.slate }} />
              <YAxis tick={{ fontSize: 10, fill: COLORS.slate }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any, n: any, p: any) => [fmtUSD(Number(v)), `${p.payload.count} instrumento(s)`]} />
              <Bar dataKey="value" fill={COLORS.midGreen} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {nextMaturity && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Próximo vencimiento</p>
                <p className="text-xs font-semibold text-gray-800 truncate">{cleanedNames.get(nextMaturity.id)?.name ?? nextMaturity.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold text-gray-800">{fmtDate(nextMaturity.maturity_date as string)}</p>
                <p className="text-[11px] text-gray-400">{fmtUSD(Number(nextMaturity.market_value))}</p>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
