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
import type { UnrealizedGainLossRow } from '@/lib/portfolio/unrealizedGainLossParser'
import { findBuys, findSale, summarizeTrades, type BuyLot } from './activityMatcher'
import type { PershingUnrealizedRow } from './pershingUnrealizedParser'
import type { ClosedPosition, IcheQuestion, Lot, OpenPosition, ReconcilePlan, TickerChange } from './types'

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

const QTY_EPS = 0.0001

// Lotes del archivo que todavía no están cargados (mismo trade date y cantidad
// que un lote existente = ya conocido). Un lote existente sin fecha matchea
// solo por cantidad.
function diffNewLots(existing: Lot[], fileLots: Lot[]): Lot[] {
  const pool = [...existing]
  const fresh: Lot[] = []
  for (const fl of fileLots) {
    const i = pool.findIndex(l =>
      Math.abs(l.quantity - fl.quantity) < QTY_EPS && (l.tradeDate == null || l.tradeDate === fl.tradeDate)
    )
    if (i >= 0) pool.splice(i, 1)
    else fresh.push(fl)
  }
  return fresh
}

// Compras más recientes del Activity que suman exactamente la cantidad nueva.
function pickRecentBuys(buys: BuyLot[], delta: number): BuyLot[] | null {
  const picked: BuyLot[] = []
  let sum = 0
  for (const b of [...buys].reverse()) {
    picked.unshift(b)
    sum += b.quantity
    if (Math.abs(sum - delta) < QTY_EPS) return picked
    if (sum > delta) return null
  }
  return null
}

let questionCounter = 0
function nextQuestionId(): string {
  questionCounter += 1
  return `q${Date.now()}_${questionCounter}`
}

// Las cerradas cargadas del Excel original tienen fechas MM/DD/YYYY.
const isoDate = (d: string) => {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : d
}

const isPlaceholderTicker = (t: string) => t.length >= 8 && /\d/.test(t)
const isValidDate = (d: string | null) => d == null || /^\d{4}-\d{2}-\d{2}$/.test(d)

export function reconcile(
  currentOpenRaw: OpenPosition[],
  pershingRows: PershingUnrealizedRow[],
  morganPositions: PortfolioPositionParsed[],
  pershingActivity: ActivityRow[],
  morganActivity: ActivityRow[],
  morganCosts: UnrealizedGainLossRow[] = [],
  knownTickers: Map<string, string> = new Map(),
  closedPositions: ClosedPosition[] = []
): ReconcilePlan {
  const changes: TickerChange[] = []
  const pendingQuestions: IcheQuestion[] = []
  const warnings: string[] = []
  const matched = new Set<string>() // `${analyst}:${ticker}` de currentOpen ya resueltos

  // Pershing no trae ticker: se busca por CUSIP en Morgan, en las posiciones ya
  // cargadas, en ambos Activity y en el maestro de instrumentos.
  const resolveTicker = (cusip: string): string | null => {
    const key = cusip.trim().toUpperCase()
    const fromMorgan = morganPositions.find(p => p.cusip?.toUpperCase() === key && p.symbol)?.symbol
    const fromOpen = currentOpenRaw.find(p => p.cusip?.toUpperCase() === key && p.ticker.toUpperCase() !== key)?.ticker
    const fromActivity = [...pershingActivity, ...morganActivity].find(r => r.cusip?.toUpperCase() === key && r.symbol)?.symbol
    return (fromMorgan ?? fromOpen ?? fromActivity ?? knownTickers.get(key) ?? null)?.trim().toUpperCase() ?? null
  }

  const pershingStocks = pershingRows.filter(r => PERSHING_ASSET_CATEGORIES.has(r.assetCategory))

  // Reparación de filas ya guardadas con datos malos de corridas anteriores:
  // ticker = CUSIP (Pershing no trae ticker) y fechas de compra inválidas.
  const currentOpen = currentOpenRaw.map(p => {
    let ticker = p.ticker
    let lots = p.lots
    let newTicker: string | null = null
    let newLots: Lot[] | null = null
    if (isPlaceholderTicker(p.ticker)) {
      const resolved = resolveTicker(p.cusip ?? p.ticker)
      if (resolved && resolved !== p.ticker.toUpperCase()) { newTicker = resolved; ticker = resolved }
    }
    if (p.source === 'pershing' && p.lots.some(l => !isValidDate(l.tradeDate))) {
      const row = p.cusip ? pershingStocks.find(r => r.cusip === p.cusip) : undefined
      const qty = p.lots.reduce((s, l) => s + l.quantity, 0)
      if (row && Math.abs(row.quantity - qty) < QTY_EPS) { newLots = row.lots; lots = row.lots }
      else warnings.push(`${p.ticker}: tiene fechas de compra inválidas y no se pudieron reparar solas — revisar a mano.`)
    }
    if (newTicker || newLots) {
      changes.push({ kind: 'position_fix', id: p.id, ticker: p.ticker, analyst: p.analyst, newTicker, newLots })
      return { ...p, ticker, lots }
    }
    return p
  })
  const morganStocks = morganPositions.filter(p => MORGAN_PRODUCT_TYPES.has(p.securityType ?? ''))

  const pershingOpen = currentOpen.filter(p => p.source === 'pershing')
  const morganOpen = currentOpen.filter(p => p.source === 'morgan')

  // ── Pershing: match por CUSIP, luego por descripción ──────────────────────
  for (const row of pershingStocks) {
    let match = pershingOpen.find(p => p.cusip && p.cusip === row.cusip) ?? null
    if (!match) match = matchByDescription(row.description, pershingOpen)

    if (!match) {
      const resolved = resolveTicker(row.cusip)
      if (!resolved) warnings.push(`${row.description}: no se encontró el ticker del CUSIP ${row.cusip} — ingresarlo a mano en el formulario.`)
      pendingQuestions.push({
        id: nextQuestionId(),
        type: 'assign_analyst',
        suggestedTicker: resolved ?? row.cusip,
        tickerEditable: true,
        cusip: row.cusip,
        description: row.description,
        quantity: row.quantity,
        unitCost: row.unitCost,
        tradeDate: row.lots.length === 1 ? row.lots[0].tradeDate : null,
        lots: row.lots,
        lastPrice: row.quantity > 0 ? parseFloat((row.marketValue / row.quantity).toFixed(4)) : null,
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
      const newLastPrice = row.quantity > 0 ? parseFloat((row.marketValue / row.quantity).toFixed(4)) : null
      const fresh = diffNewLots(match.lots, row.lots)
      const freshQty = fresh.reduce((s, l) => s + l.quantity, 0)
      if (fresh.length > 0 && Math.abs(freshQty - deltaQty) < QTY_EPS) {
        // Lotes nuevos con su fecha y costo reales, tal cual vienen de Pershing.
        for (const newLot of fresh) {
          changes.push({ kind: 'new_lot', ticker: match.ticker, analyst: match.analyst, newLot, newLastPrice, cusip: row.cusip })
        }
      } else {
        // No se pudo aislar la compra: costo inferido del delta y SIN fecha
        // (antes se usaba la fecha del primer lote, que es otra compra).
        const priorCost = match.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
        const deltaCost = row.originalTotalCost - priorCost
        const newLot: Lot = {
          quantity: deltaQty,
          unitCost: deltaQty > 0 ? parseFloat((deltaCost / deltaQty).toFixed(4)) : row.unitCost,
          tradeDate: null,
        }
        changes.push({ kind: 'new_lot', ticker: match.ticker, analyst: match.analyst, newLot, newLastPrice, cusip: row.cusip })
        warnings.push(`${match.ticker}: la compra nueva no se pudo identificar entre los lotes de Pershing — se cargó sin fecha, completar el Trade Date a mano.`)
      }
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

    const cost = pos.cusip ? (morganCosts.find(r => r.cusip === pos.cusip)?.costBasis ?? null) : null
    const buys = findBuys(ticker, morganActivity)

    if (!match) {
      const qty = pos.quantity ?? 0
      const buyLots = buys.length > 0 && Math.abs(buys.reduce((s, b) => s + b.quantity, 0) - qty) < QTY_EPS ? buys : null
      const avgCost = cost != null && qty > 0 ? parseFloat((cost / qty).toFixed(4)) : 0
      if (!buyLots) warnings.push(`${ticker} (Morgan): no se encontraron compras en el Activity que sumen ${qty} acciones — se carga sin fecha, completar el Trade Date a mano.`)
      if (cost == null) warnings.push(`${ticker} (Morgan): el Holdings no trae costo total — el costo unitario quedó en 0, revisarlo.`)
      pendingQuestions.push({
        id: nextQuestionId(),
        type: 'assign_analyst',
        suggestedTicker: ticker,
        tickerEditable: true,
        cusip: pos.cusip,
        description: pos.name,
        quantity: qty,
        unitCost: avgCost,
        tradeDate: buyLots && buyLots.length === 1 ? buyLots[0].tradeDate : null,
        lots: buyLots ? buyLots.map(b => ({ quantity: b.quantity, unitCost: b.unitCost, tradeDate: b.tradeDate })) : [{ quantity: qty, unitCost: avgCost, tradeDate: null }],
        lastPrice: pos.price,
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
      const delta = newQty - currentQty
      const recent = pickRecentBuys(buys, delta)
      if (recent) {
        for (const b of recent) {
          changes.push({
            kind: 'new_lot', ticker: match.ticker, analyst: match.analyst,
            newLot: { quantity: b.quantity, unitCost: b.unitCost, tradeDate: b.tradeDate },
            newLastPrice: pos.price,
          })
        }
      } else {
        const priorCost = match.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
        const unitCost = cost != null && cost > priorCost ? parseFloat(((cost - priorCost) / delta).toFixed(4)) : 0
        warnings.push(`${match.ticker} (Morgan): la cantidad aumentó de ${currentQty} a ${newQty} y no se encontró la compra en el Activity — se carga sin fecha y con costo inferido (${unitCost}), completar el Trade Date a mano.`)
        changes.push({
          kind: 'new_lot', ticker: match.ticker, analyst: match.analyst,
          newLot: { quantity: delta, unitCost, tradeDate: null },
          newLastPrice: pos.price,
        })
      }
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

  // ── Compraventas dentro del período ──────────────────────────────────────
  // Un ticker comprado y vendido entre dos corridas no está en el Holdings ni
  // en las posiciones guardadas, así que los pasos de arriba no lo ven. Se
  // arma desde el Activity. Si el Activity cubre más de un mes, las que ya
  // están en iche_closed_positions (mismo ticker, fecha y cantidad) se saltean.
  const heldTickers = new Set<string>([
    ...morganStocks.map(p => (p.symbol ?? '').toUpperCase()),
    ...pendingQuestions.flatMap(q => (q.type === 'assign_analyst' ? [q.suggestedTicker.toUpperCase()] : [])),
  ])
  const heldCusips = new Set(pershingStocks.map(r => r.cusip.toUpperCase()))
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 })

  for (const t of summarizeTrades(pershingActivity, morganActivity)) {
    if (t.sellQty === 0 || !t.lastSellDate) continue
    const open = currentOpen.filter(p => p.ticker.toUpperCase() === t.ticker)
    // Abierta antes y ya no está: la venta la resuelve closed_matched / unmatched_close.
    if (open.length > 0 && !open.some(p => matched.has(`${p.analyst}:${p.ticker}`))) continue
    const sellDate = t.lastSellDate
    const alreadyClosed = closedPositions.some(c =>
      c.ticker.toUpperCase() === t.ticker && Math.abs(c.quantity - t.sellQty) < QTY_EPS &&
      (isoDate(c.closingDate) === sellDate || (c.closingDate === 'Multiple' && c.year === Number(sellDate.slice(0, 4))))
    )
    if (alreadyClosed) continue

    const label = `${t.ticker} (${t.source === 'pershing' ? 'Pershing' : 'Morgan'})`
    if (t.buyQty + QTY_EPS < t.sellQty) {
      warnings.push(`${label}: el Activity muestra ventas por ${fmt(t.sellQty)} acciones pero compras por solo ${fmt(t.buyQty)} — no se pudo armar el cierre de la compraventa, cargarlo a mano.`)
      continue
    }
    const roundtrip = Math.abs(t.buyQty - t.sellQty) < QTY_EPS
    const costBasis = parseFloat((t.buyCost * (t.sellQty / t.buyQty)).toFixed(2))
    const dates = [...new Set(t.buyDates)]
    const openingDate = dates.length === 1 ? dates[0] : 'Multiple'
    const details = {
      ticker: t.ticker,
      description: t.description,
      openingDate,
      costBasis,
      closingDate: t.lastSellDate,
      quantity: t.sellQty,
      saleProceeds: parseFloat(t.sellProceeds.toFixed(2)),
    }

    if (open.length > 0) {
      // Sigue abierta: solo se registra si compró y vendió la misma cantidad
      // (la cantidad final no cambió). Otros casos se avisan para no adivinar
      // qué lote se vendió.
      const pos = open.find(p => matched.has(`${p.analyst}:${p.ticker}`))!
      const kind = changes.find(c => c.ticker === pos.ticker && c.analyst === pos.analyst && c.kind !== 'position_fix')?.kind
      if (roundtrip && (kind === 'unchanged' || kind === 'price_update') && open.length === 1) {
        changes.push({ kind: 'roundtrip_closed', analyst: pos.analyst, ...details, description: pos.description })
      } else {
        warnings.push(`${label}: hubo compras (${fmt(t.buyQty)}) y ventas (${fmt(t.sellQty)}) en el período sobre una posición que sigue abierta — la venta no se registró como cierre, revisarla a mano.`)
      }
      continue
    }

    const stillHeld = heldTickers.has(t.ticker) || (t.cusip != null && heldCusips.has(t.cusip))
    if (stillHeld || !roundtrip) {
      warnings.push(`${label}: posición nueva vendida en parte (compró ${fmt(t.buyQty)}, vendió ${fmt(t.sellQty)}) — la parte vendida no se registró como cierre, cargarla a mano.`)
      continue
    }
    pendingQuestions.push({ id: nextQuestionId(), type: 'roundtrip_close', source: t.source, ...details })
  }

  return { changes, pendingQuestions, warnings, inputsFolder: null }
}
