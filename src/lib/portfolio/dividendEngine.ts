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

// mensual ×12 / trimestral ×4 / semestral ×2 / anual ×1 — detectada por la
// separación típica entre pagos, nunca asumida de antemano.
export type DistributionFrequency = 'mensual' | 'trimestral' | 'semestral' | 'anual'

export interface FundDividendResult {
  totalCollected: number
  // Tasa anualizada de dividendos — el segundo número protagonista, junto a
  // totalCollected. Promedio SIMPLE (nunca compuesto: es la tasa de
  // distribución en efectivo, no supone reinversión) de la tasa de cada
  // distribución reciente, multiplicado por la frecuencia detectada. Prioriza
  // los últimos 12 meses para que refleje el nivel ACTUAL de distribución.
  annualizedYieldPct: number | null
  // true = pocos datos para confiar en la frecuencia detectada (menos de 3
  // distribuciones con rendimiento determinado, o sin historial de los
  // últimos 12 meses) — se muestra como "estimada" en vez de definitiva.
  isEstimate: boolean
  frequency: DistributionFrequency | null
  currentCapital: number // compras - ventas a la fecha de hoy (0 si nunca hubo compras registradas)
  last12mCollected: number
  history: DividendHistoryEntry[] // más reciente primero, información secundaria
  pendingReviewCount: number // dividendos con rendimiento no determinado
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function detectFrequency(gapDays: number): DistributionFrequency {
  if (gapDays <= 45) return 'mensual'
  if (gapDays <= 135) return 'trimestral'
  if (gapDays <= 270) return 'semestral'
  return 'anual'
}

const FREQUENCY_MULTIPLIER: Record<DistributionFrequency, number> = {
  mensual: 12, trimestral: 4, semestral: 2, anual: 1,
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
  const pendingReviewCount = history.length - withYield.length

  const todayIso = today.toISOString().slice(0, 10)
  const currentCapital = capitalAt(todayIso) ?? capitalMoves.reduce((s, m) => s + (m.type === 'compra' ? Number(m.amount) : -Number(m.amount)), 0)

  const cutoff = new Date(today)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const last12mCollected = history.filter(h => h.date && h.date >= cutoffIso).reduce((s, h) => s + h.collected, 0)

  // Tasa anualizada: se prioriza la evidencia de los últimos 12 meses para
  // que refleje el nivel ACTUAL de distribución, sin que dividendos viejos
  // (de una época en que el fondo pagaba distinto) la distorsionen. Si no
  // hay suficiente historial reciente, se cae a todo el historial
  // disponible y se marca como estimada.
  const withYieldAsc = [...withYield].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const recent = withYieldAsc.filter(h => h.date && h.date >= cutoffIso)
  const usingRecent = recent.length >= 2
  const sample = usingRecent ? recent : withYieldAsc

  let annualizedYieldPct: number | null = null
  let frequency: DistributionFrequency | null = null
  let isEstimate = !usingRecent

  if (sample.length > 0) {
    const avgRatePct = sample.reduce((s, h) => s + (h.yieldPct as number), 0) / sample.length
    if (sample.length >= 2) {
      const dates = sample.map(h => h.date as string)
      const gaps: number[] = []
      for (let i = 1; i < dates.length; i++) {
        gaps.push(Math.round((new Date(dates[i] + 'T00:00:00').getTime() - new Date(dates[i - 1] + 'T00:00:00').getTime()) / 86400000))
      }
      frequency = detectFrequency(median(gaps))
      annualizedYieldPct = avgRatePct * FREQUENCY_MULTIPLIER[frequency]
      if (sample.length < 3) isEstimate = true
    } else {
      // Una sola distribución conocida: no hay separación para detectar
      // frecuencia — se muestra el número más conservador (sin multiplicar)
      // y siempre marcado como estimado, nunca como definitivo.
      annualizedYieldPct = avgRatePct
      isEstimate = true
    }
  }

  return { totalCollected, annualizedYieldPct, isEstimate, frequency, currentCapital, last12mCollected, history, pendingReviewCount }
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

// "Valor del fondo" que se muestra al lado de los dividendos cobrados: la
// posición REAL que ya tiene Portafolio (del último import), no una suma de
// las compras/ventas cargadas a mano en la planilla de dividendos — evita
// mostrar dos números distintos para "cuánto tengo invertido" en la misma app.
export function findFundPositionValue(
  isin: string | null | undefined,
  fundName: string,
  positions: { isin: string | null; name: string; market_value: string | number }[]
): number | null {
  const isinNorm = isin?.trim().toUpperCase()
  const nameNorm = fundName.trim().toLowerCase()
  if (isinNorm) {
    const byIsin = positions.filter(p => p.isin?.trim().toUpperCase() === isinNorm)
    if (byIsin.length > 0) return byIsin.reduce((s, p) => s + Number(p.market_value), 0)
  }
  // El nombre cargado en Dividendos suele ser más corto que el de la
  // posición real (que trae clase/ticker, ej. "AB American Income Fund"
  // vs. "AB American Income Fund Class A2 (ACFAX)") — exigir igualdad
  // exacta hacía que nunca se encontrara. Alcanza con que uno contenga al
  // otro para considerarlo el mismo fondo.
  const byName = positions.filter(p => {
    const posName = p.name.trim().toLowerCase()
    return posName === nameNorm || posName.includes(nameNorm) || nameNorm.includes(posName)
  })
  if (byName.length === 0) return null
  return byName.reduce((s, p) => s + Number(p.market_value), 0)
}
