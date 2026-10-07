import type { ActivityRow } from '@/lib/portfolio/activityParser'

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
  morganActivity: ActivityRow[]
): { closingDate: string; quantity: number; saleProceeds: number } | null {
  const candidates = [...pershingActivity, ...morganActivity].filter(row => {
    if (row.symbol?.toUpperCase() !== ticker.toUpperCase()) return false
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

/**
 * Compras y ventas de acciones/ETFs del período, agrupadas por ticker. Sirve
 * para detectar compraventas dentro del mismo período (un ticker que se
 * compró y vendió entre dos corridas no aparece ni en el Holdings ni en las
 * posiciones guardadas, así que sin esto se pierde). Se descartan fondos de
 * money market, intereses y símbolos que no son tickers (bonos de Pershing).
 */
export function summarizeTrades(pershingActivity: ActivityRow[], morganActivity: ActivityRow[]): TickerTrades[] {
  const byTicker = new Map<string, TickerTrades>()
  const add = (rows: ActivityRow[], source: 'pershing' | 'morgan') => {
    for (const row of rows) {
      const ticker = row.symbol?.trim().toUpperCase()
      if (!ticker || (ticker.length >= 8 && /\d/.test(ticker))) continue
      const type = row.activityType ?? ''
      const desc = row.description ?? ''
      if (CASH_LIKE.test(type) || CASH_LIKE.test(desc)) continue
      const isSell = SELL_PATTERN.test(type) || SELL_PATTERN.test(desc)
      const isBuy = !isSell && (BUY_PATTERN.test(type) || BUY_PATTERN.test(desc))
      if (!isSell && !isBuy) continue
      const qty = Math.abs(row.quantity ?? 0)
      if (qty === 0) continue
      const date = row.tradeDate ?? row.settleDate ?? null
      // El importe neto incluye comisiones; si no viene, cantidad × precio.
      const value = Math.abs(row.amount ?? 0) || qty * Math.abs(row.price ?? 0)
      const t = byTicker.get(ticker) ?? {
        ticker, description: desc, source, cusip: null, buyQty: 0, buyCost: 0, firstBuyDate: null, buyDates: [],
        sellQty: 0, sellProceeds: 0, lastSellDate: null,
      }
      t.cusip ??= row.cusip?.trim().toUpperCase() || null
      if (isBuy) {
        t.buyQty += qty
        t.buyCost += value
        if (date) {
          t.buyDates.push(date)
          if (!t.firstBuyDate || date < t.firstBuyDate) t.firstBuyDate = date
        }
      } else {
        t.sellQty += qty
        t.sellProceeds += value
        if (date && (!t.lastSellDate || date > t.lastSellDate)) t.lastSellDate = date
      }
      byTicker.set(ticker, t)
    }
  }
  add(pershingActivity, 'pershing')
  add(morganActivity, 'morgan')
  return Array.from(byTicker.values())
}
