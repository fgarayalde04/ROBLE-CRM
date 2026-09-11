// ── Portfolio Engine ─────────────────────────────────────────────────────
// Custodian-agnostic calculation layer. These functions were extracted
// verbatim from the useMemo bodies that used to live inline in
// PortfolioAccountClient.tsx — same inputs, same math, same output shape.
// They work identically whether `positions`/`totalValue` describe a single
// custodian's snapshot or an already-merged consolidated position list: the
// functions themselves never branch on custodian, they just group/sum/divide
// whatever position list and total they're given.
import type { PortfolioPositionRow, PortfolioUnrealizedGainLossRow, PortfolioCashProjectionRow, PortfolioPerformanceRow } from '@/types/portfolio'

export const ASSET_CLASS_ES: Record<string, string> = {
  'Equity': 'Renta Variable',
  'ETF': 'Renta Variable (ETF)',
  'Fixed Income': 'Fondos de Renta Fija / Crédito',
  'Alternatives': 'Otros',
  'Real Estate': 'Otros',
  'Cash': 'Liquidez',
  'Sin clasificar': 'Sin clasificar',
}

// Orden de los grupos por clase de activo al listar posiciones (pantalla y
// PDF): renta variable primero, liquidez y sin clasificar al final. Una
// clase que no esté acá va después, ordenada por su subtotal.
export const ASSET_CLASS_ORDER = ['Equity', 'ETF', 'Fund', 'Fixed Income', 'Alternatives', 'Real Estate', 'Cash', 'Sin clasificar']
export function assetClassRank(ac: string): number {
  const i = ASSET_CLASS_ORDER.indexOf(ac)
  return i === -1 ? ASSET_CLASS_ORDER.length : i
}

// Agrupa posiciones por clase de activo, con el subtotal de Market Value de
// cada grupo, ordenadas por ASSET_CLASS_ORDER (y a igualdad, por subtotal
// descendente). El orden interno de cada grupo es el que traía `positions`.
export function groupPositionsByAssetClass<T extends { asset_class: string; market_value: string | number }>(
  positions: T[]
): { assetClass: string; label: string; rows: T[]; subtotalValue: number }[] {
  const byClass = new Map<string, T[]>()
  for (const p of positions) {
    const arr = byClass.get(p.asset_class) ?? []
    arr.push(p)
    byClass.set(p.asset_class, arr)
  }
  return Array.from(byClass.entries())
    .map(([assetClass, rows]) => ({
      assetClass,
      label: ASSET_CLASS_ES[assetClass] ?? assetClass,
      rows,
      subtotalValue: rows.reduce((s, p) => s + Number(p.market_value), 0),
    }))
    .sort((a, b) => {
      const rk = assetClassRank(a.assetClass) - assetClassRank(b.assetClass)
      return rk !== 0 ? rk : b.subtotalValue - a.subtotalValue
    })
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

// Serie de "valor de la cuenta a lo largo del tiempo" reconstruida SOLO a
// partir del reporte de performance del custodio (no necesita historial de
// snapshots): cada período trae su "Beginning Value" y el reporte trae el
// "Ending Value" actual — se fechan retrocediendo desde period_end.
export function computePerfValueSeries(
  p: PortfolioPerformanceRow | null
): { date: string; value: number; label: string }[] {
  if (!p || p.ending_value == null) return []
  const ending = Number(p.ending_value)
  const end = p.period_end ? new Date(p.period_end + 'T00:00:00') : new Date()
  const bv = p.beginning_value
  const byDate = new Map<string, { date: string; value: number; label: string }>()
  const add = (d: Date, v: number | null | undefined, label: string) => {
    if (v == null || !isFinite(v) || isNaN(d.getTime())) return
    byDate.set(d.toISOString().slice(0, 10), { date: d.toISOString().slice(0, 10), value: Number(v), label })
  }
  const back = (years: number) => { const d = new Date(end); d.setFullYear(d.getFullYear() - years); return d }
  // Si no hay "Beginning Value" real en el reporte, se estima el valor al
  // inicio del período a partir del retorno: valor_inicio = valor_actual / (1 + ret%/100).
  // Ignora aportes/retiros, pero alcanza para el gráfico "en cuánto arrancó".
  const fromRet = (ret: string | number | null) => {
    if (ret == null) return null
    const n = Number(ret)
    return !isFinite(n) || n <= -100 ? null : ending / (1 + n / 100)
  }

  // "Beginning Value" de Since Start Date es el valor ANTES de que la
  // cuenta existiera (0) — el monto inicial real que el cliente ve como
  // "con cuánto arrancó" es ese 0 más el "Net Contribution" de ese mismo
  // período (lo que efectivamente depositó al abrir la cuenta).
  const nc = p.net_contribution
  // Preferir siempre Net Contribution para el punto de arranque — Beginning
  // Value de Since Start Date casi siempre es 0 y no aporta nada por sí
  // solo; si tampoco hay Net Contribution (reportes viejos) recién ahí se
  // cae a la estimación por retorno.
  const inceptionValue = nc?.sinceInception != null
    ? (bv?.sinceInception ?? 0) + nc.sinceInception
    : (bv?.sinceInception ?? fromRet(p.return_since_inception))
  if (p.inception_date) add(new Date(p.inception_date + 'T00:00:00'), inceptionValue, 'Inicio')
  add(back(5), bv?.fiveYear ?? fromRet(p.return_5y), 'Hace 5 años')
  add(back(3), bv?.threeYear ?? fromRet(p.return_3y), 'Hace 3 años')
  add(back(1), bv?.oneYear ?? fromRet(p.return_1y), 'Hace 1 año')
  add(new Date(Date.UTC(end.getUTCFullYear(), 0, 1)), bv?.ytd ?? fromRet(p.return_ytd), 'Inicio de año')
  if (p.period_start) add(new Date(p.period_start + 'T00:00:00'), bv?.selected ?? fromRet(p.return_selected), 'Inicio del período')
  add(end, ending, 'Actual')

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// Valor con el que arrancó la cuenta — el "Beginning Value" de Since Start
// Date (normalmente 0, el valor antes de que la cuenta existiera) más el
// "Net Contribution" de ese mismo período: lo que efectivamente se
// depositó al abrir la cuenta. No depende de tener Beginning Value
// guardado (columna nueva) — con Net Contribution alcanza.
export function computeInitialAccountValue(p: PortfolioPerformanceRow | null): number | null {
  if (!p) return null
  const nc = p.net_contribution?.sinceInception
  if (nc == null) return null
  const bv = p.beginning_value?.sinceInception ?? 0
  return bv + nc
}
