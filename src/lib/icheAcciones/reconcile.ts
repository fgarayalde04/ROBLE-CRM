/**
 * Reconciliación pura (no toca la DB): compara el estado actual de
 * `iche_open_positions` contra los 4 archivos nuevos y arma un
 * `ReconcilePlan` — cambios que se pueden aplicar solos, y preguntas para
 * cuando algo es ambiguo. Nunca adivina (ver SKILL.md original en
 * `planilla excel/.claude/skills/iche-acciones-mensual/`): un ticker nuevo
 * sin analista, o una posición que desaparece sin venta encontrada, siempre
 * se pregunta.
 */
import type { ActivityRow } from '@/lib/portfolio/activityParser'
import type { PortfolioPositionParsed } from '@/lib/portfolio/parser'
import { findSale } from './activityMatcher'
import type { PershingUnrealizedRow } from './pershingUnrealizedParser'
import type { IcheQuestion, Lot, OpenPosition, ReconcilePlan, TickerChange } from './types'

const PERSHING_ASSET_CATEGORIES = new Set(['Common Stocks', 'Exchange-Traded Funds'])
const MORGAN_PRODUCT_TYPES = new Set(['Stocks / Options', 'ETFs / CEFs'])

function normDesc(s: string): string {
  return s.toUpperCase().replace(/\s+/g, ' ').trim()
}

function matchByDescription(desc: string, candidates: OpenPosition[]): OpenPosition | null {
  const norm = normDesc(desc)
  const exact = candidates.find(c => normDesc(c.description) === norm)
  if (exact) return exact
  const prefix = candidates.find(c => {
    const cn = normDesc(c.description)
    return cn.slice(0, 15) === norm.slice(0, 15)
  })
  return prefix ?? null
}

let questionCounter = 0
function nextQuestionId(): string {
  questionCounter += 1
  return `q${Date.now()}_${questionCounter}`
}

export function reconcile(
  currentOpen: OpenPosition[],
  pershingRows: PershingUnrealizedRow[],
  morganPositions: PortfolioPositionParsed[],
  pershingActivity: ActivityRow[],
  morganActivity: ActivityRow[]
): ReconcilePlan {
  const changes: TickerChange[] = []
  const pendingQuestions: IcheQuestion[] = []
  const warnings: string[] = []
  const matched = new Set<string>() // `${analyst}:${ticker}` de currentOpen ya resueltos

  const pershingStocks = pershingRows.filter(r => PERSHING_ASSET_CATEGORIES.has(r.assetCategory))
  const morganStocks = morganPositions.filter(p => MORGAN_PRODUCT_TYPES.has(p.securityType ?? ''))

  const pershingOpen = currentOpen.filter(p => p.source === 'pershing')
  const morganOpen = currentOpen.filter(p => p.source === 'morgan')

  // ── Pershing: match por CUSIP, luego por descripción ──────────────────────
  for (const row of pershingStocks) {
    let match = pershingOpen.find(p => p.cusip && p.cusip === row.cusip) ?? null
    if (!match) match = matchByDescription(row.description, pershingOpen)

    if (!match) {
      pendingQuestions.push({
        id: nextQuestionId(),
        type: 'assign_analyst',
        suggestedTicker: row.cusip,
        tickerEditable: true,
        cusip: row.cusip,
        description: row.description,
        quantity: row.quantity,
        unitCost: row.unitCost,
        tradeDate: row.tradeDate,
        source: 'pershing',
      })
      continue
    }

    matched.add(`${match.analyst}:${match.ticker}`)
    const currentQty = match.lots.reduce((s, l) => s + l.quantity, 0)

    if (Math.abs(currentQty - row.quantity) < 0.0001) {
      // El "Last Price" real se deriva de marketValue/quantity — row.unitCost
      // es el costo de compra, no la cotización actual.
      const newLastPrice = row.quantity > 0 ? parseFloat((row.marketValue / row.quantity).toFixed(4)) : match.lastPrice
      if (newLastPrice != null && (match.lastPrice == null || Math.abs(match.lastPrice - newLastPrice) > 0.0001)) {
        changes.push({ kind: 'price_update', ticker: match.ticker, analyst: match.analyst, newLastPrice, cusip: row.cusip })
      } else {
        changes.push({ kind: 'unchanged', ticker: match.ticker, analyst: match.analyst, cusip: row.cusip })
      }
    } else if (row.quantity > currentQty) {
      const deltaQty = row.quantity - currentQty
      // Costo del lote nuevo: se infiere del delta de costo total contra lo
      // que ya había, no se puede leer directo (el archivo da el agregado).
      const priorCost = match.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
      const deltaCost = row.originalTotalCost - priorCost
      const newLot: Lot = {
        quantity: deltaQty,
        unitCost: deltaQty > 0 ? parseFloat((deltaCost / deltaQty).toFixed(4)) : row.unitCost,
        tradeDate: row.tradeDate,
      }
      const newLastPrice = row.quantity > 0 ? parseFloat((row.marketValue / row.quantity).toFixed(4)) : null
      changes.push({ kind: 'new_lot', ticker: match.ticker, analyst: match.analyst, newLot, newLastPrice, cusip: row.cusip })
    } else {
      changes.push({ kind: 'quantity_mismatch', ticker: match.ticker, analyst: match.analyst, oldQuantity: currentQty, newQuantity: row.quantity })
      warnings.push(`${match.ticker}: la cantidad bajó de ${currentQty} a ${row.quantity} sin que el ticker haya desaparecido — revisar a mano, no se aplicó ningún cambio automático.`)
    }
  }

  // ── Morgan: match directo por ticker ──────────────────────────────────────
  for (const pos of morganStocks) {
    const ticker = pos.symbol
    if (!ticker) {
      warnings.push(`Morgan: posición "${pos.name}" sin símbolo, se ignoró (no se puede matchear ni pedir analista sin ticker).`)
      continue
    }
    const match = morganOpen.find(p => p.ticker.toUpperCase() === ticker.toUpperCase()) ?? null

    if (!match) {
      pendingQuestions.push({
        id: nextQuestionId(),
        type: 'assign_analyst',
        suggestedTicker: ticker,
        tickerEditable: true,
        cusip: pos.cusip,
        description: pos.name,
        quantity: pos.quantity ?? 0,
        unitCost: pos.quantity ? (pos.marketValue) / (pos.quantity || 1) : 0,
        tradeDate: null,
        source: 'morgan',
      })
      continue
    }

    matched.add(`${match.analyst}:${match.ticker}`)
    const currentQty = match.lots.reduce((s, l) => s + l.quantity, 0)
    const newQty = pos.quantity ?? 0

    if (Math.abs(currentQty - newQty) < 0.0001) {
      const newLastPrice = pos.price
      if (newLastPrice != null && (match.lastPrice == null || Math.abs(match.lastPrice - newLastPrice) > 0.0001)) {
        changes.push({ kind: 'price_update', ticker: match.ticker, analyst: match.analyst, newLastPrice })
      } else {
        changes.push({ kind: 'unchanged', ticker: match.ticker, analyst: match.analyst })
      }
    } else if (newQty > currentQty) {
      warnings.push(`${match.ticker} (Morgan): la cantidad aumentó de ${currentQty} a ${newQty}, pero Morgan Holdings no da lotes individuales — se guarda como una posición agregada nueva, revisar el costo unitario resultante.`)
      const priorCost = match.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
      const totalCost = newQty * ((pos.marketValue ?? 0) / (newQty || 1)) // placeholder si no hay costo total real
      changes.push({
        kind: 'new_lot',
        ticker: match.ticker,
        analyst: match.analyst,
        newLot: { quantity: newQty - currentQty, unitCost: totalCost > priorCost ? (totalCost - priorCost) / (newQty - currentQty) : 0, tradeDate: null },
        newLastPrice: pos.price,
      })
    } else {
      changes.push({ kind: 'quantity_mismatch', ticker: match.ticker, analyst: match.analyst, oldQuantity: currentQty, newQuantity: newQty })
      warnings.push(`${match.ticker} (Morgan): la cantidad bajó de ${currentQty} a ${newQty} sin que el ticker haya desaparecido — revisar a mano.`)
    }
  }

  // ── Posiciones que desaparecieron de ambas fuentes ────────────────────────
  for (const pos of currentOpen) {
    if (matched.has(`${pos.analyst}:${pos.ticker}`)) continue
    const sale = findSale(pos.ticker, pershingActivity, morganActivity)
    if (sale) {
      changes.push({
        kind: 'closed_matched',
        ticker: pos.ticker,
        analyst: pos.analyst,
        closingDate: sale.closingDate,
        quantity: sale.quantity,
        saleProceeds: sale.saleProceeds,
      })
    } else {
      pendingQuestions.push({
        id: nextQuestionId(),
        type: 'unmatched_close',
        ticker: pos.ticker,
        description: pos.description,
        analyst: pos.analyst,
        lastKnownQuantity: pos.lots.reduce((s, l) => s + l.quantity, 0),
      })
    }
  }

  return { changes, pendingQuestions, warnings, inputsFolder: null }
}
