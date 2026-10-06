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
  quantity?: number | null // nominal del bono al cobrar el cupón (del Activity)
}

export interface DividendHistoryEntry {
  id: string
  date: string | null
  collected: number
  capitalAtPayment: number | null // null = no se pudo determinar
  yieldPct: number | null // null = pendiente de revisar
  // Bonos: cupón menor al completo (nominal × tasa ÷ frecuencia), típico del
  // primer cobro después de una transferencia — cuenta en lo cobrado pero
  // no en la tasa anualizada.
  partial?: boolean
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
  history: DividendHistoryEntry[] // más reciente primero, información secundaria
  pendingReviewCount: number // dividendos con rendimiento no determinado
  // true = la tasa es la nominal del bono (todos los cupones cobrados fueron
  // parciales), no una calculada con lo cobrado.
  yieldIsNominal: boolean
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

// Un bono se reconoce por el nombre limpio del Activity / posición: cupón
// con % seguido de vencimiento ("7.125% 01/20/37") o tasa variable con
// vencimiento ("VARIABL 05/25/34").
export function looksLikeBond(name: string): boolean {
  return /\d+(?:\.\d+)?%\s+\d{1,2}\/\d{1,2}\/\d{2,4}/.test(name) || /\bVARIABL\w*\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(name)
}

export function computeFundDividends(
  transactions: DividendTxn[],
  today: Date = new Date(),
  // Bonos: con un solo cupón cobrado no hay separación entre pagos para
  // detectar la frecuencia — se asume semestral (lo estándar en bonos en USD)
  // en vez de dejar la tasa de un cupón sin anualizar.
  // couponRatePct: tasa nominal del bono (del nombre, ver bondCouponRatePct)
  // — permite detectar cupones parciales.
  opts: { isBond?: boolean; couponRatePct?: number | null } = {}
): FundDividendResult {
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
    return { id: d.id, date: d.date, collected, capitalAtPayment: capital, yieldPct, nominal: d.quantity ?? null }
  }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  // La frecuencia sale de la separación entre TODOS los cobros con fecha
  // (no solo los que tienen capital determinado): un cupón sin compra previa
  // registrada igual sirve para saber cada cuánto paga el instrumento.
  const paymentDates = Array.from(new Set(history.filter(h => h.date).map(h => h.date as string))).sort()
  const gaps: number[] = []
  for (let i = 1; i < paymentDates.length; i++) {
    gaps.push(Math.round((new Date(paymentDates[i] + 'T00:00:00').getTime() - new Date(paymentDates[i - 1] + 'T00:00:00').getTime()) / 86400000))
  }
  const detectedFrequency: DistributionFrequency | null = gaps.length > 0 ? detectFrequency(median(gaps)) : opts.isBond ? 'semestral' : null

  // Cupón parcial: menos del 95% del cupón completo esperado para el nominal
  // que tenía el cliente al cobrar. Solo se puede saber en bonos con tasa
  // fija (en el nombre) y nominal conocido.
  const couponRate = opts.isBond ? opts.couponRatePct ?? null : null
  for (const h of history as (DividendHistoryEntry & { nominal?: number | null })[]) {
    if (couponRate != null && detectedFrequency && h.nominal && h.nominal > 0) {
      const fullCoupon = h.nominal * couponRate / 100 / FREQUENCY_MULTIPLIER[detectedFrequency]
      if (h.collected < fullCoupon * 0.95) h.partial = true
    }
    delete h.nominal
  }

  const totalCollected = history.reduce((s, h) => s + h.collected, 0)
  const withYield = history.filter(h => h.yieldPct != null && !h.partial)
  const pendingReviewCount = history.filter(h => h.yieldPct == null).length

  const todayIso = today.toISOString().slice(0, 10)
  const currentCapital = capitalAt(todayIso) ?? capitalMoves.reduce((s, m) => s + (m.type === 'compra' ? Number(m.amount) : -Number(m.amount)), 0)

  // Tasa anualizada: promedio SIMPLE de todos los yields con capital
  // determinado (todo el historial disponible, sin ventana de recencia —
  // no hay que inventar un recorte que no se pidió), multiplicado por la
  // frecuencia de distribución detectada por la separación real entre
  // fechas.
  const withYieldAsc = [...withYield].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  let annualizedYieldPct: number | null = null
  let frequency: DistributionFrequency | null = null
  let isEstimate = false
  let yieldIsNominal = false

  if (withYieldAsc.length > 0) {
    const avgRatePct = withYieldAsc.reduce((s, h) => s + (h.yieldPct as number), 0) / withYieldAsc.length
    if (detectedFrequency) {
      frequency = detectedFrequency
      annualizedYieldPct = avgRatePct * FREQUENCY_MULTIPLIER[frequency]
      if (withYieldAsc.length < 3) isEstimate = true
    } else {
      // Una sola distribución conocida: no hay separación para detectar
      // frecuencia — se muestra el número más conservador (sin multiplicar)
      // y siempre marcado como estimado, nunca como definitivo.
      annualizedYieldPct = avgRatePct
      isEstimate = true
    }
  } else if (couponRate != null && history.some(h => h.partial)) {
    // Todos los cupones cobrados fueron parciales (ej. la posición llegó por
    // transferencia a mitad del período): la tasa calculada con ellos
    // subestimaría el rendimiento, así que se muestra la nominal del bono.
    annualizedYieldPct = couponRate
    frequency = detectedFrequency
    isEstimate = true
    yieldIsNominal = true
  }

  return { totalCollected, annualizedYieldPct, isEstimate, frequency, currentCapital, history, pendingReviewCount, yieldIsNominal }
}

// Tasa nominal de un bono de tasa fija según su nombre ("… 7.125% 01/20/37"
// → 7.125). null en bonos de tasa variable o si el nombre no la trae.
export function bondCouponRatePct(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)%\s+\d{1,2}\/\d{1,2}\/\d{2,4}/)
  if (!m) return null
  const rate = Number(m[1])
  return rate > 0 && rate < 30 ? rate : null
}

// Clave de fondo para agrupar/consolidar — ISIN cuando está disponible
// (permite juntar el mismo fondo entre custodios), si no el nombre tal cual
// se cargó.
export function fundGroupKey(isin: string | null | undefined, fundName: string): string {
  // Sin ISIN, agrupa por nombre — pero mayúsculas/minúsculas distintas entre
  // un dividendo importado del Activity y una compra tipeada a mano para el
  // mismo fondo no deben separarlos en dos grupos.
  return isin?.trim() ? isin.trim().toUpperCase() : fundName.trim().toLowerCase()
}

// Dos nombres de fondo "son el mismo" si son iguales o si uno contiene al
// otro (ej. "AB American Income" tipeado a mano vs "AB AMERICAN INCOME
// FUND CLASS A (USD)" tal cual lo trae el Activity) — exigir igualdad
// exacta separaba en grupos distintos algo que para el cliente es un solo
// fondo. Se usa tanto para fusionar grupos sin ISIN como para matchear
// contra las posiciones reales de Portafolio.
export function fuzzyNameMatch(a: string, b: string): boolean {
  const an = a.trim().toLowerCase(), bn = b.trim().toLowerCase()
  return an === bn || an.includes(bn) || bn.includes(an)
}

// Un mismo archivo de Activity puede traer varias cuentas mezcladas (ej.
// distintas titularidades del mismo cliente) — normaliza para comparar la
// cuenta detectada en una fila contra la cuenta destino del import.
export function normalizeAccountNumber(v: string | null | undefined): string {
  return (v ?? '').replace(/-/g, '').trim().toUpperCase()
}

// Huella para detectar "posible duplicado" al importar Activity — mismo
// fondo/ISIN, fecha, tipo, monto, moneda y cuenta. No usa un transaction ID
// porque la mayoría de los exports de Activity no lo traen; con estos
// campos alcanza para el caso real (resubir el mismo archivo, o uno que se
// superpone en fechas con uno ya cargado).
export function buildExternalRef(input: {
  fundKey: string
  date: string | null
  type: string
  amount: number | null
  currency?: string | null
  account?: string | null
}): string {
  return [input.fundKey.toUpperCase(), input.date ?? '', input.type, (input.amount ?? '').toString(), input.currency ?? '', (input.account ?? '').toUpperCase()].join('|')
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
  const byName = positions.filter(p => fuzzyNameMatch(p.name, nameNorm))
  if (byName.length === 0) return null
  return byName.reduce((s, p) => s + Number(p.market_value), 0)
}
