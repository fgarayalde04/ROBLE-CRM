// ── Portfolio Engine ─────────────────────────────────────────────────────
// Custodian-agnostic calculation layer. These functions were extracted
// verbatim from the useMemo bodies that used to live inline in
// PortfolioAccountClient.tsx — same inputs, same math, same output shape.
// They work identically whether `positions`/`totalValue` describe a single
// custodian's snapshot or an already-merged consolidated position list: the
// functions themselves never branch on custodian, they just group/sum/divide
// whatever position list and total they're given.
import type { PortfolioPositionRow, PortfolioUnrealizedGainLossRow, PortfolioCashProjectionRow } from '@/types/portfolio'

export const ASSET_CLASS_ES: Record<string, string> = {
  'Equity': 'Renta Variable',
  'ETF': 'Renta Variable (ETF)',
  'Fixed Income': 'Fondos de Renta Fija / Crédito',
  'Alternatives': 'Otros',
  'Real Estate': 'Otros',
  'Cash': 'Money Market / Liquidez',
  'Sin clasificar': 'Sin clasificar',
}

// Fixed Income sub-classification (security_type → client-facing bucket).
export function fixedIncomeBucket(securityType: string): string {
  const t = securityType.toLowerCase()
  if (/corporate/.test(t)) return 'Corporate Bonds'
  if (/government|treasury|sovereign|municipal/.test(t)) return 'Sovereign Bonds'
  if (/open.?end|closed.?end|mutual.?fund|interval.?fund/.test(t)) return 'Fixed Income Funds'
  if (/note|structured/.test(t)) return 'Structured / Notes'
  return 'Other'
}

export interface AllocationSlice { assetClass: string; label: string; value: number; pct: number }

export function computeAssetAllocation(positions: PortfolioPositionRow[], totalValue: number): AllocationSlice[] {
  const map = new Map<string, number>()
  for (const p of positions) map.set(p.asset_class, (map.get(p.asset_class) ?? 0) + Number(p.market_value))
  return Array.from(map.entries())
    .map(([assetClass, value]) => ({ assetClass, label: ASSET_CLASS_ES[assetClass] ?? assetClass, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

export interface LiquidityInfo { value: number; pct: number }

export function computeLiquidity(positions: PortfolioPositionRow[], totalValue: number): LiquidityInfo {
  const value = positions.filter(p => p.asset_class === 'Cash').reduce((s, p) => s + Number(p.market_value), 0)
  return { value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }
}

export interface FixedIncomeSlice { label: string; value: number; pct: number }

// Percentage denominator here is the Fixed-Income subtotal, not the account
// total — intentionally different from every other breakdown in this file.
export function computeFixedIncomeBreakdown(positions: PortfolioPositionRow[]): FixedIncomeSlice[] {
  const fi = positions.filter(p => p.asset_class === 'Fixed Income')
  const map = new Map<string, number>()
  for (const p of fi) {
    const bucket = fixedIncomeBucket(p.security_type ?? '')
    map.set(bucket, (map.get(bucket) ?? 0) + Number(p.market_value))
  }
  const fiTotal = fi.reduce((s, p) => s + Number(p.market_value), 0)
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value, pct: fiTotal > 0 ? (value / fiTotal) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

export interface CurrencySlice { label: string; value: number; pct: number }

export function computeCurrencyExposure(positions: PortfolioPositionRow[], totalValue: number): CurrencySlice[] {
  const map = new Map<string, number>()
  for (const p of positions) map.set(p.currency, (map.get(p.currency) ?? 0) + Number(p.market_value))
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

export interface UnrealizedGLTotals { costBasis: number; gainLoss: number; pct: number; matched: number; total: number }

// Matched by CUSIP against a separately-imported Unrealized-GL file. Never
// estimated: a position without a match in glByCusip simply contributes
// nothing to the total. pct is dollar-weighted (Σgain / Σcost), never an
// average of per-position percentages — this is what "never average
// percentages" means in practice, and it's why a caller that wants a
// consolidated total must pre-sum multi-custodian GL rows into a single
// synthetic row per CUSIP (recomputing gain_loss_pct from the summed
// cost_basis/gain_loss) before calling this function, rather than this
// function itself trying to branch on how many custodians contributed.
export function computeUnrealizedGLTotals(
  positions: PortfolioPositionRow[],
  glByCusip: Map<string, PortfolioUnrealizedGainLossRow>,
  hasImport: boolean
): UnrealizedGLTotals | null {
  if (!hasImport) return null
  let costBasis = 0, gainLoss = 0, matched = 0
  for (const p of positions) {
    const gl = p.cusip ? glByCusip.get(p.cusip) : undefined
    if (!gl) continue
    matched++
    costBasis += Number(gl.cost_basis)
    gainLoss += Number(gl.gain_loss)
  }
  return { costBasis, gainLoss, pct: costBasis > 0 ? (gainLoss / costBasis) * 100 : 0, matched, total: positions.length }
}

export interface MaturityBucket { year: number; value: number; count: number }

export function computeMaturityBuckets(positions: PortfolioPositionRow[]): MaturityBucket[] {
  const withMaturity = positions.filter(p => p.maturity_date)
  const map = new Map<number, { value: number; count: number }>()
  for (const p of withMaturity) {
    const year = new Date(p.maturity_date as string).getUTCFullYear()
    const cur = map.get(year) ?? { value: 0, count: 0 }
    map.set(year, { value: cur.value + Number(p.market_value), count: cur.count + 1 })
  }
  return Array.from(map.entries()).map(([year, d]) => ({ year, ...d })).sort((a, b) => a.year - b.year)
}

export function computeNextMaturity(positions: PortfolioPositionRow[]): PortfolioPositionRow | null {
  const withMaturity = positions.filter(p => p.maturity_date).sort((a, b) => (a.maturity_date as string).localeCompare(b.maturity_date as string))
  return withMaturity[0] ?? null
}

export function computeProjectedIncome12m(cashProjRows: PortfolioCashProjectionRow[]): number {
  const today = new Date()
  const in12m = new Date(today); in12m.setFullYear(in12m.getFullYear() + 1)
  return cashProjRows
    .filter(r => { const d = new Date(r.pay_date + 'T00:00:00'); return d >= today && d <= in12m })
    .reduce((s, r) => s + (r.estimated_amount != null ? Number(r.estimated_amount) : 0), 0)
}
