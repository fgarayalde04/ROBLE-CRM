// ── Consolidation Engine ─────────────────────────────────────────────────
// Merges two custodians' already-imported position lists (Pershing + Morgan
// Stanley) into one position-level view for the Consolidado report. Matching
// is confidence-gated and never guesses: ISIN → CUSIP → (ticker + similar
// name) → otherwise kept as two separate lines. The output is shaped exactly
// like `PortfolioPositionRow[]` (same field names, same string-encoded
// numerics) so it can be fed straight into the existing, unmodified
// `engine.ts` functions and the existing PDF/tab components — consolidation
// never requires the shared calculation layer to know how many custodians
// contributed to a line.
import type { PortfolioPositionRow, PortfolioUnrealizedGainLossRow } from '@/types/portfolio'

export type Custodian = 'Pershing' | 'Morgan Stanley'

export interface ConsolidatedPosition extends PortfolioPositionRow {
  custodian: Custodian | 'Pershing + Morgan'
  custodianBreakdown: { pershing?: number; morgan?: number }
}

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Token-overlap similarity (Jaccard on word sets) — cheap, deterministic,
// and conservative: only used as the second half of the ticker+name match
// rule, never on its own.
function nameSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeName(a).split(' ').filter(w => w.length > 1))
  const setB = new Set(normalizeName(b).split(' ').filter(w => w.length > 1))
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const w of Array.from(setA)) if (setB.has(w)) intersection++
  const union = setA.size + setB.size - intersection
  return union > 0 ? intersection / union : 0
}

// All-or-nothing: exact ISIN, else exact CUSIP, else exact ticker with a
// sufficiently similar name. Anything weaker never merges — two positions
// stay as two separate lines rather than risk consolidating different
// assets.
function isSameSecurity(a: PortfolioPositionRow, b: PortfolioPositionRow): boolean {
  if (a.isin && b.isin && a.isin.trim() && a.isin.trim() === b.isin.trim()) return true
  if (a.cusip && b.cusip && a.cusip.trim() && a.cusip.trim() === b.cusip.trim()) return true
  if (a.symbol && b.symbol && a.symbol.trim() && a.symbol.trim().toUpperCase() === b.symbol.trim().toUpperCase()) {
    if (nameSimilarity(a.name, b.name) >= 0.6) return true
  }
  return false
}

export interface ConsolidationResult {
  positions: ConsolidatedPosition[]
  totalMarketValue: number
  matchedCount: number
}

// pershingTotal/morganTotal are each custodian's own reported total (from
// their import row), not a re-sum of positions — consolidated total is the
// sum of those two authoritative numbers, same trust boundary Pershing
// already applies to its own single-custodian total.
export function consolidatePositions(
  pershingPositions: PortfolioPositionRow[],
  morganPositions: PortfolioPositionRow[],
  pershingTotal: number,
  morganTotal: number
): ConsolidationResult {
  const result: ConsolidatedPosition[] = []
  const usedMorganIds = new Set<string>()
  let matchedCount = 0

  for (const p of pershingPositions) {
    const match = morganPositions.find(m => !usedMorganIds.has(m.id) && isSameSecurity(p, m))
    if (!match) {
      result.push({ ...p, custodian: 'Pershing', custodianBreakdown: { pershing: Number(p.market_value) } })
      continue
    }
    usedMorganIds.add(match.id)
    matchedCount++
    const pMv = Number(p.market_value)
    const mMv = Number(match.market_value)
    const primary = pMv >= mMv ? p : match // display fields (name/symbol/etc.) come from the larger leg
    result.push({
      ...primary,
      id: `consolidated:${p.cusip ?? p.isin ?? p.symbol ?? p.id}`,
      market_value: String(pMv + mMv),
      quantity: null, // combining face values/share counts across two custodians isn't meaningful
      weight_pct: null, // recalculated live against the consolidated total, never trusted from either leg
      custodian: 'Pershing + Morgan',
      custodianBreakdown: { pershing: pMv, morgan: mMv },
    })
  }

  for (const m of morganPositions) {
    if (usedMorganIds.has(m.id)) continue
    result.push({ ...m, custodian: 'Morgan Stanley', custodianBreakdown: { morgan: Number(m.market_value) } })
  }

  return { positions: result, totalMarketValue: pershingTotal + morganTotal, matchedCount }
}

// Pre-aggregates multi-custodian G/L rows into one synthetic row per CUSIP
// (summed cost basis / gain-loss, percentage recomputed from the summed
// values — never averaged) so the existing computeUnrealizedGLTotals in
// engine.ts can consume it unchanged, exactly like it does for a single
// custodian's Map<cusip, row>.
export function consolidateUnrealizedGL(
  pershingRows: PortfolioUnrealizedGainLossRow[],
  morganRows: PortfolioUnrealizedGainLossRow[]
): Map<string, PortfolioUnrealizedGainLossRow> {
  const byCusip = new Map<string, PortfolioUnrealizedGainLossRow[]>()
  for (const r of [...pershingRows, ...morganRows]) {
    const list = byCusip.get(r.cusip)
    if (list) list.push(r); else byCusip.set(r.cusip, [r])
  }
  const merged = new Map<string, PortfolioUnrealizedGainLossRow>()
  for (const [cusip, rows] of Array.from(byCusip)) {
    const costBasis = rows.reduce((s, r) => s + Number(r.cost_basis), 0)
    const gainLoss = rows.reduce((s, r) => s + Number(r.gain_loss), 0)
    const marketValue = rows.reduce((s, r) => s + Number(r.market_value), 0)
    merged.set(cusip, {
      ...rows[0],
      cost_basis: String(costBasis),
      market_value: String(marketValue),
      gain_loss: String(gainLoss),
      gain_loss_pct: String(costBasis > 0 ? (gainLoss / costBasis) * 100 : 0),
    })
  }
  return merged
}

// Complementary "Portfolio by Custodian" summary — a small supplementary
// section, never the report's main focus.
export function computeCustodianBreakdown(pershingTotal: number, morganTotal: number): { label: Custodian; value: number; pct: number }[] {
  const total = pershingTotal + morganTotal
  return [
    { label: 'Pershing' as const, value: pershingTotal, pct: total > 0 ? (pershingTotal / total) * 100 : 0 },
    { label: 'Morgan Stanley' as const, value: morganTotal, pct: total > 0 ? (morganTotal / total) * 100 : 0 },
  ].filter(c => c.value > 0)
}
