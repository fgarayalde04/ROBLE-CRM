/**
 * Motor de cálculo de dividendos — puro, sin DB ni UI. Reconstruye
 * cronológicamente el capital invertido en un fondo (compras suman, ventas
 * restan) y para cada dividendo calcula cobrado ÷ capital invertido EN ESE
 * MOMENTO — nunca la posición actual. Si no se puede determinar el capital
 * en la fecha de un dividendo (por ejemplo, un "total acumulado" sin fecha,
 * o un dividendo anterior a cualquier compra registrada), el monto se
 * cuenta en el total igual, pero el rendimiento queda pendiente de revisar
 * en vez de inventarse.
 */

export type DividendTxnType = 'compra' | 'venta' | 'dividendo' | 'dividendo_total'

export interface DividendTxn {
  id: string
  date: string | null // YYYY-MM-DD
  type: DividendTxnType
  amount: number | null
}

export interface DividendHistoryEntry {
  id: string
  date: string | null
  collected: number
  capitalAtPayment: number | null // null = no se pudo determinar
  yieldPct: number | null // null = pendiente de revisar
}

export interface FundDividendResult {
  totalCollected: number
  averageYieldPct: number | null // promedio simple de las distribuciones con rendimiento determinado
  currentCapital: number // compras - ventas a la fecha de hoy (0 si nunca hubo compras registradas)
  last12mCollected: number
  last12mYieldPct: number | null // last12mCollected ÷ currentCapital
  history: DividendHistoryEntry[] // más reciente primero
  pendingReviewCount: number // dividendos con rendimiento no determinado
}

export function computeFundDividends(transactions: DividendTxn[], today: Date = new Date()): FundDividendResult {
  // Las compras/ventas SIN fecha no pueden ubicarse en la línea de tiempo —
  // se excluyen del capital cronológico (no se inventa un orden).
  const capitalMoves = transactions
    .filter(t => (t.type === 'compra' || t.type === 'venta') && t.date && t.amount != null)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))

  const dividendEvents = transactions.filter(t => t.type === 'dividendo' || t.type === 'dividendo_total')

  const capitalAt = (dateIso: string | null): number | null => {
    if (!dateIso) return null
    let capital = 0
    let any = false
    for (const m of capitalMoves) {
      if ((m.date as string) > dateIso) break
      capital += m.type === 'compra' ? Number(m.amount) : -Number(m.amount)
      any = true
    }
    return any ? capital : null
  }

  const history: DividendHistoryEntry[] = dividendEvents.map(d => {
    const collected = Number(d.amount ?? 0)
    // "dividendo_total" (un solo monto acumulado, sin fecha puntual de cobro
    // real) nunca tiene un capital de referencia válido — se cuenta el
    // monto, nunca se inventa el rendimiento.
    const capital = d.type === 'dividendo_total' ? null : capitalAt(d.date)
    const yieldPct = capital != null && capital > 0 ? (collected / capital) * 100 : null
    return { id: d.id, date: d.date, collected, capitalAtPayment: capital, yieldPct }
  }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const totalCollected = history.reduce((s, h) => s + h.collected, 0)
  const withYield = history.filter(h => h.yieldPct != null)
  const averageYieldPct = withYield.length > 0 ? withYield.reduce((s, h) => s + (h.yieldPct as number), 0) / withYield.length : null
  const pendingReviewCount = history.length - withYield.length

  const todayIso = today.toISOString().slice(0, 10)
  const currentCapital = capitalAt(todayIso) ?? capitalMoves.reduce((s, m) => s + (m.type === 'compra' ? Number(m.amount) : -Number(m.amount)), 0)

  const cutoff = new Date(today)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const last12mCollected = history.filter(h => h.date && h.date >= cutoffIso).reduce((s, h) => s + h.collected, 0)
  const last12mYieldPct = currentCapital > 0 ? (last12mCollected / currentCapital) * 100 : null

  return { totalCollected, averageYieldPct, currentCapital, last12mCollected, last12mYieldPct, history, pendingReviewCount }
}

// Clave de fondo para agrupar/consolidar — ISIN cuando está disponible
// (permite juntar el mismo fondo entre custodios), si no el nombre tal cual
// se cargó.
export function fundGroupKey(isin: string | null | undefined, fundName: string): string {
  return isin?.trim() ? isin.trim().toUpperCase() : fundName.trim()
}

// Huella para detectar "posible duplicado" al importar Activity — mismo
// fondo/ISIN, fecha, tipo, monto y moneda. No usa un transaction ID porque
// la mayoría de los exports de Activity no lo traen; con estos campos
// alcanza para el caso real (resubir el mismo archivo, o uno que se
// superpone en fechas con uno ya cargado).
export function buildExternalRef(input: {
  fundKey: string
  date: string | null
  type: string
  amount: number | null
  currency?: string | null
}): string {
  return [input.fundKey.toUpperCase(), input.date ?? '', input.type, (input.amount ?? '').toString(), input.currency ?? ''].join('|')
}
