// ── Bond accrued-interest ("Cupón Corrido") calculations ────────────────
// Centralized here so ProposalEditor.tsx (live editing UI) and
// ProposalPDFTemplate.tsx (static PDF render) compute the exact same
// numbers from the exact same code — never duplicated, never diverging.
//
// All dates are plain 'YYYY-MM-DD' strings (matches how `date` columns come
// back from pg in this project — see src/lib/db/pool.ts, which disables
// automatic Date-object parsing specifically to avoid local-timezone drift).
// All arithmetic here uses Date.UTC, never `new Date(dateString)`, for the
// same reason.

export type CouponFrequency = 'annual' | 'semiannual' | 'quarterly' | 'monthly'
export type DayCountConvention = '30/360' | 'actual/360' | 'actual/365' | 'actual/actual'

export const COUPON_FREQUENCIES: { value: CouponFrequency; label: string }[] = [
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'monthly', label: 'Mensual' },
]

export const DAY_COUNT_CONVENTIONS: { value: DayCountConvention; label: string }[] = [
  { value: 'actual/360', label: 'Act/360' },
  { value: '30/360', label: '30/360' },
  { value: 'actual/365', label: 'Act/365' },
  { value: 'actual/actual', label: 'Act/Act' },
]

export const DEFAULT_COUPON_FREQUENCY: CouponFrequency = 'semiannual'
export const DEFAULT_DAY_COUNT_CONVENTION: DayCountConvention = 'actual/360'

const PERIODS_PER_YEAR: Record<CouponFrequency, number> = {
  annual: 1, semiannual: 2, quarterly: 4, monthly: 12,
}

// ── Date helpers ──────────────────────────────────────────────────────────

interface YMD { y: number; m: number; d: number } // m is 1-12

function parseYMD(s: string): YMD {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

function toUTCMillis(ymd: YMD): number {
  return Date.UTC(ymd.y, ymd.m - 1, ymd.d)
}

function ymdToString(ymd: YMD): string {
  return `${String(ymd.y).padStart(4, '0')}-${String(ymd.m).padStart(2, '0')}-${String(ymd.d).padStart(2, '0')}`
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last day of this month
}

// Adds `months` (+/-) to a YMD, clamping the day to the target month's real
// length — e.g. Jan 31 minus 1 month = Dec 31, not an overflowed date.
function addMonthsClamped(ymd: YMD, months: number): YMD {
  const totalMonthIndex = ymd.y * 12 + (ymd.m - 1) + months
  const y = Math.floor(totalMonthIndex / 12)
  const m = ((totalMonthIndex % 12) + 12) % 12 + 1
  const d = Math.min(ymd.d, daysInMonth(y, m))
  return { y, m, d }
}

function compareYMD(a: YMD, b: YMD): number {
  return toUTCMillis(a) - toUTCMillis(b)
}

function realDaysBetween(a: YMD, b: YMD): number {
  return Math.round((toUTCMillis(b) - toUTCMillis(a)) / 86400000)
}

// Standard US 30/360 (bond-basis) day count.
function days30_360(a: YMD, b: YMD): number {
  let d1 = a.d, d2 = b.d
  if (d1 === 31) d1 = 30
  if (d2 === 31 && d1 === 30) d2 = 30
  return (b.y - a.y) * 360 + (b.m - a.m) * 30 + (d2 - d1)
}

// ── Coupon-date bracket resolution ───────────────────────────────────────
// Coupon dates recur every 12/periodsPerYear months, anchored to the
// maturity date's month/day. Walk backward from maturity until we bracket
// settlementDate — fully derived, never manually entered.

export interface CouponBracket {
  lastCouponDate: string
  nextCouponDate: string
  periodsPerYear: number
}

export function resolveCouponBracket(
  maturityDate: string,
  frequency: CouponFrequency,
  settlementDate: string
): CouponBracket {
  const periodsPerYear = PERIODS_PER_YEAR[frequency]
  const monthsStep = 12 / periodsPerYear
  const maturity = parseYMD(maturityDate)
  const settlement = parseYMD(settlementDate)

  let cursor = maturity
  let stepsBack = 0
  while (compareYMD(cursor, settlement) > 0 && stepsBack < 2400) { // safety valve: 200yrs of monthly coupons
    stepsBack++
    cursor = addMonthsClamped(maturity, -stepsBack * monthsStep)
  }

  const lastCouponDate = cursor
  const nextCouponDate = stepsBack === 0
    ? addMonthsClamped(maturity, monthsStep) // settlement on/after maturity — edge case fallback
    : addMonthsClamped(maturity, -(stepsBack - 1) * monthsStep)

  return {
    lastCouponDate: ymdToString(lastCouponDate),
    nextCouponDate: ymdToString(nextCouponDate),
    periodsPerYear,
  }
}

// ── Day-count fraction (fraction of the annual coupon rate accrued) ──────

export function dayCountFraction(
  lastCouponDate: string,
  settlementDate: string,
  nextCouponDate: string,
  periodsPerYear: number,
  convention: DayCountConvention
): number {
  const last = parseYMD(lastCouponDate)
  const settlement = parseYMD(settlementDate)
  const next = parseYMD(nextCouponDate)

  switch (convention) {
    case 'actual/360':
      return realDaysBetween(last, settlement) / 360
    case 'actual/365':
      return realDaysBetween(last, settlement) / 365
    case '30/360':
      return days30_360(last, settlement) / 360
    case 'actual/actual': {
      // ICMA-style approximation: real days elapsed in the current coupon
      // period / (real days in the full period × periods per year).
      const periodDays = realDaysBetween(last, next)
      return periodDays > 0 ? realDaysBetween(last, settlement) / (periodDays * periodsPerYear) : 0
    }
  }
}

export function accruedDaysCount(lastCouponDate: string, settlementDate: string): number {
  return realDaysBetween(parseYMD(lastCouponDate), parseYMD(settlementDate))
}

// ── Bond-level accrual calculation ───────────────────────────────────────

export interface BondAccrualInput {
  quantity: number | null
  price: number | null
  coupon: number | null
  maturity_date: string | null
  frequency: CouponFrequency | null
  day_count_convention: DayCountConvention | null
}

export interface BondAccrualResult {
  nominal: number               // Cantidad × 1000
  purchaseValue: number         // Valor de Compra = Nominal × Precio/100
  accruedInterest: number       // Cupón Corrido — computed on Nominal, never on price
  estimatedCashRequired: number // Desembolso Estimado = Valor de Compra + Cupón Corrido
  accruedDays: number | null
  lastCouponDate: string | null
  nextCouponDate: string | null
}

export function calculateBondAccrual(bond: BondAccrualInput, settlementDate: string | null): BondAccrualResult {
  const quantity = bond.quantity ?? 0
  const price = bond.price ?? 0
  const nominal = quantity * 1000
  const purchaseValue = nominal * (price / 100)

  if (!bond.maturity_date || !settlementDate || bond.coupon == null || nominal === 0) {
    return {
      nominal, purchaseValue, accruedInterest: 0,
      estimatedCashRequired: purchaseValue,
      accruedDays: null, lastCouponDate: null, nextCouponDate: null,
    }
  }

  const frequency = bond.frequency ?? DEFAULT_COUPON_FREQUENCY
  const convention = bond.day_count_convention ?? DEFAULT_DAY_COUNT_CONVENTION
  const { lastCouponDate, nextCouponDate, periodsPerYear } =
    resolveCouponBracket(bond.maturity_date, frequency, settlementDate)

  const fraction = dayCountFraction(lastCouponDate, settlementDate, nextCouponDate, periodsPerYear, convention)
  const accruedInterest = nominal * (bond.coupon / 100) * fraction

  return {
    nominal,
    purchaseValue,
    accruedInterest,
    estimatedCashRequired: purchaseValue + accruedInterest,
    accruedDays: accruedDaysCount(lastCouponDate, settlementDate),
    lastCouponDate,
    nextCouponDate,
  }
}
