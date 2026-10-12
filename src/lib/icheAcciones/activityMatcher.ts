import { parsePershingTradeText, type ActivityRow } from '@/lib/portfolio/activityParser'

const SELL_PATTERN = /\bsold\b|\bsell\b|\bsale\b|\bvent/i

/**
 * Busca la venta de un ticker que desapareció de las posiciones abiertas en
 * el Activity de Pershing y de Morgan Stanley. No adivina: si no encuentra
 * una venta clara, devuelve null y quien llama debe preguntarle al usuario
 * en vez de asumir que se cerró.
 */
export function findSale(
  ticker: string,
  pershingActivity: ActivityRow[],
  morganActivity: ActivityRow[],
  since: string | null = null
): { closingDate: string; quantity: number; saleProceeds: number } | null {
  const candidates = [...pershingActivity, ...morganActivity].filter(row => {
    if (row.symbol?.toUpperCase() !== ticker.toUpperCase()) return false
    const date = row.tradeDate ?? row.settleDate
    if (since && date && date < since) return false
    const type = row.activityType ?? ''
    const desc = row.description ?? ''
    return SELL_PATTERN.test(type) || SELL_PATTERN.test(desc)
  })

  if (candidates.length === 0) return null

  // Si hay más de una venta parcial del mismo ticker en la ventana, se suman
  // (mismo criterio que una posición cerrada en varios tramos) — pero si las
  // cantidades no forman un total coherente con lo que había, mejor no
  // adivinar: se deja para que la pregunta al usuario lo resuelva.
  const totalQty = candidates.reduce((s, r) => s + Math.abs(r.quantity ?? 0), 0)
  const totalProceeds = candidates.reduce((s, r) => s + Math.abs(r.amount ?? 0), 0)
  const latestDate = candidates
    .map(r => r.tradeDate ?? r.settleDate)
    .filter((d): d is string => !!d)
    .sort()
    .pop()

  if (!latestDate || totalQty === 0) return null

  return { closingDate: latestDate, quantity: totalQty, saleProceeds: totalProceeds }
}

const BUY_PATTERN = /\bbought\b|\bbuy\b|\bpurchase/i

export interface BuyLot {
  quantity: number
  unitCost: number
  tradeDate: string
}

/**
 * Compras de un ticker en el Activity de Morgan. Morgan Holdings no trae
 * fecha ni lotes, así que la fecha real de una compra nueva sale de acá.
 * Solo se devuelven compras con fecha, cantidad y precio completos.
 */
export function findBuys(ticker: string, activity: ActivityRow[]): BuyLot[] {
  return activity
    .filter(row => {
      if (row.symbol?.toUpperCase() !== ticker.toUpperCase()) return false
      return BUY_PATTERN.test(row.activityType ?? '') || BUY_PATTERN.test(row.description ?? '')
    })
    .map(row => ({
      quantity: Math.abs(row.quantity ?? 0),
      unitCost: Math.abs(row.price ?? 0),
      tradeDate: row.tradeDate ?? row.settleDate ?? '',
    }))
    .filter(b => b.quantity > 0 && b.unitCost > 0 && b.tradeDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
}

const CASH_LIKE = /money\s*(fund|market)|\bmmf\b|fdic|sweep|interest|dividend/i

export interface TickerTrades {
  ticker: string
  description: string
  source: 'pershing' | 'morgan'
  cusip: string | null
  buyQty: number
  buyCost: number
  firstBuyDate: string | null
  buyDates: string[]
  sellQty: number
  sellProceeds: number
  lastSellDate: string | null
}

interface TradeEvent {
  date: string | null
  side: 'buy' | 'sell'
  qty: number
  value: number
  description: string
  cusip: string | null
}

const emptyTrades = (ticker: string, source: 'pershing' | 'morgan'): TickerTrades => ({
  ticker, description: '', source, cusip: null, buyQty: 0, buyCost: 0, firstBuyDate: null, buyDates: [],
  sellQty: 0, sellProceeds: 0, lastSellDate: null,
})

function addEvent(t: TickerTrades, e: TradeEvent) {
  if (!t.description) t.description = e.description
  t.cusip ??= e.cusip
  if (e.side === 'buy') {
    t.buyQty += e.qty
    t.buyCost += e.value
    if (e.date) {
      t.buyDates.push(e.date)
      if (!t.firstBuyDate || e.date < t.firstBuyDate) t.firstBuyDate = e.date
    }
  } else {
    t.sellQty += e.qty
    t.sellProceeds += e.value
    if (e.date && (!t.lastSellDate || e.date > t.lastSellDate)) t.lastSellDate = e.date
  }
}

const CYCLE_EPS = 0.0001

/**
 * Compras y ventas de acciones/ETFs del período, por ticker. Sirve para
 * detectar compraventas dentro del período (un ticker que se compró y vendió
 * entre dos corridas no aparece ni en el Holdings ni en las posiciones
 * guardadas, así que sin esto se pierde). Se descartan fondos de money
 * market, intereses, bonos y símbolos que no son tickers.
 *
 * - `since` (YYYY-MM-DD): solo se miran operaciones desde esa fecha (la
 *   última corrida). El Activity suele venir con "All Dates" y sin este corte
 *   se mezclaban compraventas viejas ya cargadas.
 * - Tickers en `openTickers` (ya abiertos antes del período) salen en un solo
 *   bloque con todo lo operado. El resto se parte en ciclos: arranca en 0,
 *   compra, vende, y cuando vuelve a 0 es una compraventa cerrada. Así un
 *   ticker comprado y vendido dos veces en el mes da dos cierres. El último
 *   ciclo puede quedar incompleto (sigue abierto o vendió solo una parte).
 */
export function summarizeTrades(
  pershingActivity: ActivityRow[],
  morganActivity: ActivityRow[],
  opts: { since?: string | null; openTickers?: Set<string> } = {}
): TickerTrades[] {
  const events = new Map<string, { source: 'pershing' | 'morgan'; list: TradeEvent[] }>()
  const add = (rows: ActivityRow[], source: 'pershing' | 'morgan') => {
    for (const row of rows) {
      const ticker = row.symbol?.trim().toUpperCase()
      if (!ticker || (ticker.length >= 8 && /\d/.test(ticker))) continue
      const type = row.activityType ?? ''
      const desc = row.description ?? ''
      if (CASH_LIKE.test(type) || CASH_LIKE.test(desc)) continue
      if (parsePershingTradeText(type)?.isShares === false) continue // bono (parValue)
      const isSell = SELL_PATTERN.test(type) || SELL_PATTERN.test(desc)
      const isBuy = !isSell && (BUY_PATTERN.test(type) || BUY_PATTERN.test(desc))
      if (!isSell && !isBuy) continue
      const qty = Math.abs(row.quantity ?? 0)
      if (qty === 0) continue
      const date = row.tradeDate ?? row.settleDate ?? null
      if (opts.since && date && date < opts.since) continue
      // El importe neto incluye comisiones; si no viene, cantidad × precio.
      const value = Math.abs(row.amount ?? 0) || qty * Math.abs(row.price ?? 0)
      const entry = events.get(ticker) ?? { source, list: [] }
      entry.list.push({ date, side: isBuy ? 'buy' : 'sell', qty, value, description: desc, cusip: row.cusip?.trim().toUpperCase() || null })
      events.set(ticker, entry)
    }
  }
  add(pershingActivity, 'pershing')
  add(morganActivity, 'morgan')

  const out: TickerTrades[] = []
  events.forEach(({ source, list }, ticker) => {
    // Orden cronológico; el mismo día, compras antes que ventas.
    list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1))
    if (opts.openTickers?.has(ticker)) {
      const t = emptyTrades(ticker, source)
      list.forEach(e => addEvent(t, e))
      out.push(t)
      return
    }
    let t = emptyTrades(ticker, source)
    let running = 0
    for (const e of list) {
      addEvent(t, e)
      running += e.side === 'buy' ? e.qty : -e.qty
      if (e.side === 'sell' && Math.abs(running) < CYCLE_EPS) {
        out.push(t)
        t = emptyTrades(ticker, source)
        running = 0
      }
    }
    if (t.buyQty > 0 || t.sellQty > 0) out.push(t)
  })
  return out
}
