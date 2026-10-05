// Cálculos, textos y avisos del Calendario de Cupones. Puro (sin DOM ni Node):
// lo usan la pantalla, el HTML del PDF y el generador de Excel, así los tres
// muestran exactamente los mismos números.

import { inferFrequency } from './parse'
import type { CouponBond, CouponCalendar } from './types'

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Hasta esta cantidad de bonos el documento entra en una hoja A4 apaisada. */
export const MAX_BONDS_ONE_PAGE = 25

// ─── Montos ─────────────────────────────────────────────────────────────────

export const frequencyOf = (b: CouponBond) => b.payMonths.length || 1

/** Cupón de cada pago: nominal × cupón ÷ pagos por año. */
export const couponPayment = (b: CouponBond) => (b.nominal * b.couponRate) / frequencyOf(b)

/** Fila mensual del bono (índice 0 = enero). */
export function bondMonths(b: CouponBond): number[] {
  const pay = couponPayment(b)
  return Array.from({ length: 12 }, (_, i) => (b.payMonths.includes(i + 1) ? pay : 0))
}

const round2 = (n: number) => Math.round(n * 100) / 100

export interface NextPayment {
  date: string
  bond: CouponBond
  amount: number
}

export interface CalendarSummary {
  rows: number[][]
  monthTotals: number[]
  annual: number
  nominal: number
  currentYield: number
  monthlyAverage: number
  monthsWithPayment: number
  maxMonth: number
  next: NextPayment | null
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Primer cobro posterior a `afterIso` según meses y día de pago de cada bono. */
export function nextPayment(bonds: CouponBond[], afterIso: string): NextPayment | null {
  let best: NextPayment | null = null
  const y0 = Number(afterIso.slice(0, 4))
  for (const bond of bonds) {
    if (!bond.payMonths.length || bond.nominal <= 0) continue
    for (const y of [y0, y0 + 1]) {
      for (const m of bond.payMonths) {
        const d = Math.min(bond.payDay || 1, daysInMonth(y, m))
        const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        if (date <= afterIso) continue
        if (bond.maturity && date > bond.maturity) continue
        if (!best || date < best.date) best = { date, bond, amount: couponPayment(bond) }
      }
    }
  }
  return best
}

export function summarize(cal: CouponCalendar): CalendarSummary {
  const rows = cal.bonds.map(bondMonths)
  const monthTotals = Array.from({ length: 12 }, (_, i) => rows.reduce((s, r) => s + r[i], 0))
  const annual = monthTotals.reduce((s, v) => s + v, 0)
  const nominal = cal.bonds.reduce((s, b) => s + b.nominal, 0)
  return {
    rows,
    monthTotals,
    annual,
    nominal,
    currentYield: nominal ? annual / nominal : 0,
    monthlyAverage: annual / 12,
    monthsWithPayment: monthTotals.filter((v) => round2(v) > 0).length,
    maxMonth: Math.max(0, ...monthTotals),
    next: nextPayment(cal.bonds, cal.docDate),
  }
}

// ─── Formatos ───────────────────────────────────────────────────────────────

/** "$ 1,234.56" (guion si es cero). */
export function money(n: number, dashIfZero = true) {
  if (dashIfZero && Math.abs(round2(n)) === 0) return '-'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `($ ${s})` : `$ ${s}`
}

/** "2.990,60" — formato local, el que usa la línea de próximo cobro. */
export const moneyEs = (n: number) =>
  n.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ')

export const pct = (n: number, decimals = 2) => `${(n * 100).toFixed(decimals)}%`

const parts = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: iso.slice(8, 10) })

/** "05 de octubre de 2026" */
export function longDate(iso: string) {
  const { y, m, d } = parts(iso)
  return `${d} de ${MESES_LARGOS[m - 1]} de ${y}`
}

/** "02/10/2026" */
export function ddmmyyyy(iso: string) {
  const { y, m, d } = parts(iso)
  return `${d}/${String(m).padStart(2, '0')}/${y}`
}

/** "10/18/28" — el formato de las descripciones de Pershing. */
export function mmddyy(iso: string) {
  const { y, m, d } = parts(iso)
  return `${String(m).padStart(2, '0')}/${d}/${String(y).slice(2)}`
}

/** "18 Oct 2026" */
export function shortDate(iso: string) {
  const { y, m, d } = parts(iso)
  return `${d} ${MESES[m - 1]} ${y}`
}

/** Columna VENCIMIENTO: "2028 / Oct / 18" o "Perpetuo". */
export function maturityLabel(b: CouponBond) {
  if (!b.maturity) return 'Perpetuo'
  const { y, m, d } = parts(b.maturity)
  return `${y} / ${MESES[m - 1]} / ${d}`
}

/** Columna FECHAS DE PAGO: "18 Abr · 18 Oct". */
export function payDatesLabel(b: CouponBond) {
  const d = String(b.payDay).padStart(2, '0')
  return b.payMonths.map((m) => `${d} ${MESES[m - 1]}`).join(' · ')
}

/** Segunda línea de la columna BONO: "ISIN … · 6.224% 05/09/34 · N/C". */
export function bondSubline(b: CouponBond) {
  const id = b.isin ? `ISIN ${b.isin}` : `CUSIP ${b.cusip}`
  const rate = b.fixedFloat ? 'FIJA/FLOT.' : pct(b.couponRate, 3)
  const mat = b.maturity ? mmddyy(b.maturity) : 'PERPETUO'
  const call = b.nonCallable ? 'N/C' : b.callDate ? `CLB ${mmddyy(b.callDate)}` : null
  return [id, `${rate} ${mat}`, call].filter(Boolean).join(' · ')
}

const NAME_OVERRIDES: Record<string, string> = { JPMORGAN: 'JPMorgan', 'JPMORGAN CHASE': 'JPMorgan' }
const LEGAL_SUFFIX = /(\s+(&\s*CO|INC|CORP|CORPORATION|PLC|CO|LLC|LTD|SA|S\s?A|B\s?V|N\s?V|AG|SE|HOLDINGS|GROUP|FINANCIAL))+$/

/** Nombre corto del emisor para textos: "BANK OF AMERICA CORP" → "Bank of America". */
export function shortIssuer(issuer: string) {
  const base = issuer.toUpperCase().replace(LEGAL_SUFFIX, '').trim() || issuer.toUpperCase()
  if (NAME_OVERRIDES[base]) return NAME_OVERRIDES[base]
  return base
    .split(/\s+/)
    .map((w) => {
      if (['OF', 'DE', 'DEL', 'THE', 'AND', 'Y'].includes(w)) return w.toLowerCase()
      if (!/[AEIOU]/.test(w)) return w // siglas: HSBC, BBVA…
      return w.charAt(0) + w.slice(1).toLowerCase()
    })
    .join(' ')
}

export function nextPaymentLabel(next: NextPayment | null, ccy = 'USD') {
  if (!next) return '—'
  return `${shortDate(next.date)} · ${shortIssuer(next.bond.issuer)} · ${ccy} ${moneyEs(next.amount)}`
}

/** Párrafo de notas al pie del documento. */
export function notesText(cal: CouponCalendar) {
  const freqs = new Set(cal.bonds.map(frequencyOf))
  const NOMBRE: Record<number, string> = { 1: 'anual', 2: 'semestral', 4: 'trimestral', 12: 'mensual' }
  const f = freqs.size === 1 ? Array.from(freqs)[0] : null
  const base = f
    ? `Notas: flujos brutos por cupón ${NOMBRE[f] ?? ''} (Nominal × tasa ÷ ${f}), antes de impuestos y comisiones.`
    : 'Notas: flujos brutos por cupón (Nominal × tasa ÷ pagos por año), antes de impuestos y comisiones.'

  const callables = cal.bonds
    .filter((b) => b.callDate && !b.nonCallable)
    .sort((a, b) => a.callDate!.localeCompare(b.callDate!))
    .map((b, i) => `${shortIssuer(b.issuer)} ${i === 0 ? 'callable desde' : 'desde'} ${mmddyy(b.callDate!)}`)
  const rescates = callables.length
    ? ` No incluye amortizaciones ni rescates anticipados (${callables.join('; ')}).`
    : ' No incluye amortizaciones ni rescates anticipados.'

  const ff = cal.bonds.some((b) => b.fixedFloat)
    ? ' En los bonos fija/flotante el cupón indicado corresponde al período de tasa fija vigente y puede variar al pasar a tasa flotante.'
    : ''
  const fuente = ` Fuente: Projected Cash Flow, cuenta ${cal.accountNumber}${cal.asOfDate ? `, al ${ddmmyyyy(cal.asOfDate)}` : ''}.`
  return base + rescates + ff + fuente
}

export const DISCLAIMER =
  'This was prepared for informational purposes only. It is not an official confirmation of terms. It is based on information generally available to the public from sources believed to be reliable. No representation is made that it is accurate or complete or that any returns indicated will be achieved. Changes to assumptions may have a material impact on returns. Past performance is not indicative of future results. Price/availability is subject to change without notice. Additional info is available on request. Any unauthorized copying, disclosure or distribution of this material is strictly forbidden.'

export const FOOTER_LEFT = 'ROBLE CAPITAL WEALTH MANAGEMENT'
export const footerRight = (cliente: string) => `Documento confidencial · Preparado exclusivamente para ${cliente}`

// ─── Avisos ─────────────────────────────────────────────────────────────────

export interface CalendarWarning {
  level: 'error' | 'warn' | 'ok'
  text: string
}

function addMonths(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** Vence o tiene call dentro de los 12 meses siguientes a la fecha del documento. */
export function eventWithin12Months(b: CouponBond, docDate: string): 'vence' | 'call' | null {
  const limit = addMonths(docDate, 12)
  const inRange = (iso: string | null) => !!iso && iso >= docDate && iso <= limit
  if (inRange(b.maturity)) return 'vence'
  if (!b.nonCallable && inRange(b.callDate)) return 'call'
  return null
}

/** El reporte trae todos los pagos de un año para cada bono (según su frecuencia). */
export function reportCoversYear(cal: Pick<CouponCalendar, 'bonds'>) {
  return cal.bonds.every((b) => {
    const f = inferFrequency(b.payments.map((p) => p.payDate))
    return f != null && b.payments.length >= f
  })
}

export function calendarWarnings(cal: CouponCalendar): CalendarWarning[] {
  const out: CalendarWarning[] = []
  const s = summarize(cal)

  if (cal.others.length) {
    const list = cal.others
      .map((o) => `${o.type} · ${o.description || o.cusip}${o.payDate ? ` · ${ddmmyyyy(o.payDate)}` : ''} · ${money(o.amount, false)}`)
      .join('; ')
    out.push({ level: 'warn', text: `El reporte trae ${cal.others.length} movimiento(s) que no son intereses de bonos y no se incluyen en la grilla: ${list}.` })
  }

  for (const b of cal.bonds) {
    if (b.rateFromDescription != null && b.rateFromPayments != null && Math.abs(b.rateFromDescription - b.rateFromPayments) > 0.0001) {
      out.push({
        level: 'warn',
        text: `${b.issuer}: la tasa de la descripción (${pct(b.rateFromDescription, 3)}) no coincide con la que surge de los pagos (${pct(b.rateFromPayments, 3)}).`,
      })
    }
    if (b.needsFrequency) {
      out.push({
        level: 'error',
        text: `${b.issuer}: el reporte muestra ${b.payments.length === 1 ? 'un solo pago' : `${b.payments.length} pagos`}. Confirmá la frecuencia (semestral, trimestral o anual) antes de anualizar.`,
      })
    }
    if (b.nominal <= 0 || b.couponRate <= 0) out.push({ level: 'error', text: `${b.issuer}: falta el nominal o el cupón.` })
    const ev = eventWithin12Months(b, cal.docDate)
    if (ev) {
      out.push({
        level: 'warn',
        text: `${b.issuer}: ${ev === 'vence' ? `vence el ${ddmmyyyy(b.maturity!)}` : `tiene call el ${ddmmyyyy(b.callDate!)}`}, dentro de los próximos 12 meses.`,
      })
    }
  }

  if (!reportCoversYear(cal)) {
    out.push({ level: 'warn', text: 'El reporte parece cubrir menos de 12 meses: la renta anual se estima anualizando los pagos según la frecuencia de cada bono.' })
  } else if (cal.accountTotal != null) {
    const othersTotal = cal.others.reduce((t, o) => t + o.amount, 0)
    const expected = cal.accountTotal - othersTotal
    const diff = s.annual - expected
    const ref = othersTotal ? `el Account Total del reporte sin los otros movimientos (${money(expected, false)})` : `el Account Total del reporte (${money(expected, false)})`
    out.push(
      Math.abs(diff) <= 0.01
        ? { level: 'ok', text: `La renta anual coincide con ${ref}.` }
        : { level: 'error', text: `La renta anual (${money(s.annual, false)}) no coincide con ${ref}: diferencia ${money(diff, false)}.` },
    )
  }

  if (cal.bonds.length > MAX_BONDS_ONE_PAGE) {
    out.push({ level: 'warn', text: `Hay ${cal.bonds.length} bonos: más de ${MAX_BONDS_ONE_PAGE} puede no entrar en una sola hoja A4.` })
  }
  return out
}
