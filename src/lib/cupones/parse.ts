// Parseo del reporte "Incoming Cash" (Projected Cash Flow de Pershing) a bonos
// del Calendario de Cupones. Puro: recibe la grilla de celdas ya leída del
// .xlsx (fila 0 = fila 1 de Excel), así se puede testear sin archivos.

import type { CouponBond, IncomingCashReport, OtherDistribution, ReportPayment } from './types'

export class IncomingCashError extends Error {}

const HEADERS = {
  payDate: 'PAY DATE',
  type: 'DISTRIBUTION TYPE',
  cusip: 'CUSIP',
  description: 'SECURITY DESCRIPTION',
  amount: 'PROJECTED CASH',
  asOf: 'AS OF DATE',
  quantity: 'QUANTITY',
} as const
type Col = keyof typeof HEADERS

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

/** Celda → YYYY-MM-DD. Acepta Date, serial de Excel, ISO y MM/DD/YYYY. */
export function toIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return null
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return isFinite(n) ? n : null
}

// ─── Descripción del título ─────────────────────────────────────────────────

/** MM/DD/YY de la descripción → YYYY-MM-DD (siglo 2000). */
function descDate(mm: string, dd: string, yy: string) {
  return `${2000 + Number(yy)}-${mm}-${dd}`
}

// Abreviaturas de Pershing que se leen mejor expandidas en el documento.
const ISSUER_EXPANSIONS: [RegExp, string][] = [
  [/\bBANK AMER\b/, 'BANK OF AMERICA'],
  [/\bHLDGS\b/, 'HOLDINGS'],
  [/\bFINL\b/, 'FINANCIAL'],
  [/\bINTL\b/, 'INTERNATIONAL'],
]

const ISSUER_STOPS = [
  /\s+SR\s+NTS?\b/, /\s+SUB\s+NTS?\b/, /\s+ISIN#/, /\s+MEDIUM\s+TERM\b/, /\s+VARIABL/,
  /\s+FIXED[\s/]/, /\s+REG\s+S\b/, /\s+B\/E\b/, /\s+\d{1,2}\.\d+%/, /\s+\d{2}\/\d{2}\/\d{2}\b/,
]

export function parseDescription(desc: string) {
  const d = desc.replace(/\s+/g, ' ').trim()

  let cut = d.length
  for (const re of ISSUER_STOPS) {
    const m = re.exec(d)
    if (m && m.index < cut) cut = m.index
  }
  let issuer = d.slice(0, cut).trim()
  for (const [re, rep] of ISSUER_EXPANSIONS) issuer = issuer.replace(re, rep)

  const isin = d.match(/ISIN#\s*([A-Z]{2}[A-Z0-9]{9}\d)/)?.[1] ?? null
  const rateMatch = d.match(/(\d{1,2}\.\d{1,4})%/)
  const rate = rateMatch ? Number(rateMatch[1]) / 100 : null

  // Vencimiento: la primera MM/DD/YY que no viene después de "DTD" ni "CLB".
  let maturity: string | null = null
  const dateRe = /\b(\d{2})\/(\d{2})\/(\d{2})\b/g
  for (let m; (m = dateRe.exec(d)); ) {
    const before = d.slice(0, m.index).trimEnd()
    if (/\b(DTD|CLB)$/.test(before)) continue
    maturity = descDate(m[1], m[2], m[3])
    break
  }

  const call = d.match(/\bCLB\s+(\d{2})\/(\d{2})\/(\d{2})\b/)
  return {
    issuer,
    isin,
    rate,
    maturity,
    callDate: call ? descDate(call[1], call[2], call[3]) : null,
    nonCallable: /\bN\/C\b/.test(d),
    fixedFloat: /VARIABL|FIXED\s*\/\s*FLTG|FIXED TO FLTG/.test(d),
  }
}

// ─── Frecuencia y meses de pago ─────────────────────────────────────────────

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1

/** Pagos por año inferidos de la distancia entre los dos primeros pagos; null si hay uno solo. */
export function inferFrequency(dates: string[]): 1 | 2 | 4 | 12 | null {
  if (dates.length < 2) return null
  const gap = monthIndex(dates[1]) - monthIndex(dates[0])
  if (gap <= 1) return 12
  if (gap <= 4) return 4
  if (gap <= 8) return 2
  return 1
}

/** Meses de pago (1–12) a partir de un mes conocido y la frecuencia. */
export function monthsFor(firstMonth: number, freq: number): number[] {
  const step = 12 / freq
  const out = Array.from({ length: freq }, (_, i) => ((firstMonth - 1 + i * step) % 12) + 1)
  return out.sort((a, b) => a - b)
}

/** Orden del calendario: mes y día del primer pago del año. */
export function sortBonds(bonds: CouponBond[]) {
  return [...bonds].sort(
    (a, b) => (a.payMonths[0] ?? 13) - (b.payMonths[0] ?? 13) || a.payDay - b.payDay || a.issuer.localeCompare(b.issuer),
  )
}

// ─── Reporte ────────────────────────────────────────────────────────────────

export function parseIncomingCash(grid: unknown[][]): IncomingCashReport {
  const cell = (r: number, c: number) => grid[r]?.[c]
  const label = (r: number) => norm(cell(r, 0))

  // Encabezados: la fila 5 en el formato estándar; se busca en las primeras 10
  // por si el reporte viene con una fila de más arriba.
  let headerRow = -1
  const cols: Partial<Record<Col, number>> = {}
  for (let r = 0; r < Math.min(grid.length, 10) && headerRow < 0; r++) {
    const row = (grid[r] ?? []).map(norm)
    if (!row.includes(HEADERS.payDate) || !row.includes(HEADERS.cusip)) continue
    headerRow = r
    for (const [key, h] of Object.entries(HEADERS) as [Col, string][]) {
      const idx = row.findIndex((v) => v === h || v.startsWith(h + ' ') || v.startsWith(h + '('))
      if (idx >= 0) cols[key] = idx
    }
  }
  const missing = (Object.keys(HEADERS) as Col[]).filter((k) => cols[k] == null)
  if (headerRow < 0 || missing.length) {
    throw new IncomingCashError(
      headerRow < 0
        ? 'El archivo no parece un "Incoming Cash" de Pershing: no se encontró la fila de encabezados (PAY DATE, DISTRIBUTION TYPE, CUSIP…).'
        : `Al reporte le faltan columnas: ${missing.map((k) => HEADERS[k]).join(', ')}.`,
    )
  }

  const accountNumber = String(cell(0, 1) ?? '').trim()
  if (!label(0).startsWith('ACCOUNT') || !accountNumber) {
    throw new IncomingCashError('El archivo no tiene el número de cuenta en B1 ("Account #"). Exportá el reporte Incoming Cash sin modificarlo.')
  }

  const c = cols as Record<Col, number>
  const byCusip = new Map<string, { desc: string; qty: number | null; payments: ReportPayment[] }>()
  const others: OtherDistribution[] = []
  let accountTotal: number | null = null
  let asOfDate: string | null = null

  for (let r = headerRow + 1; r < grid.length; r++) {
    const payDate = toIsoDate(cell(r, c.payDate))
    const cusip = String(cell(r, c.cusip) ?? '').trim()
    const desc = String(cell(r, c.description) ?? '').replace(/\s+/g, ' ').trim()
    if (!payDate && !cusip) {
      if (/^ACCOUNT TOTAL/i.test(desc)) accountTotal = toNumber(cell(r, c.amount))
      continue
    }
    const type = norm(cell(r, c.type))
    const amount = toNumber(cell(r, c.amount)) ?? 0
    asOfDate ??= toIsoDate(cell(r, c.asOf))

    if (type !== 'BOND INT') {
      others.push({ payDate, type: type || '(sin tipo)', cusip, description: desc, amount })
      continue
    }
    if (!payDate || !cusip) continue
    const b = byCusip.get(cusip) ?? { desc, qty: null, payments: [] }
    b.qty ??= toNumber(cell(r, c.quantity))
    b.payments.push({ payDate, amount })
    byCusip.set(cusip, b)
  }

  if (byCusip.size === 0 && others.length === 0) {
    throw new IncomingCashError('El reporte no tiene pagos: no hay filas con PAY DATE y CUSIP.')
  }

  const bonds: CouponBond[] = []
  for (const [cusip, b] of Array.from(byCusip.entries())) {
    const payments = b.payments.sort((x, y) => x.payDate.localeCompare(y.payDate))
    const info = parseDescription(b.desc)
    const inferred = inferFrequency(payments.map((p) => p.payDate))
    const freq = inferred ?? 2
    const nominal = b.qty ?? 0
    const first = payments[0].payDate
    const avg = payments.reduce((s, p) => s + p.amount, 0) / payments.length
    const rateFromPayments = nominal > 0 ? (avg * freq) / nominal : null
    bonds.push({
      cusip,
      isin: info.isin,
      description: b.desc,
      issuer: info.issuer,
      nominal,
      couponRate: info.rate ?? rateFromPayments ?? 0,
      rateFromDescription: info.rate,
      rateFromPayments,
      payMonths: monthsFor(Number(first.slice(5, 7)), freq),
      payDay: Number(first.slice(8, 10)),
      maturity: info.maturity,
      callDate: info.callDate,
      nonCallable: info.nonCallable,
      fixedFloat: info.fixedFloat,
      payments,
      needsFrequency: inferred == null || payments.length < freq,
    })
  }

  return {
    accountNumber,
    accountShortName: String(cell(1, 1) ?? '').trim(),
    baseCcy: String(cell(2, 1) ?? '').trim() || 'USD',
    asOfDate,
    accountTotal,
    bonds: sortBonds(bonds),
    others,
  }
}
