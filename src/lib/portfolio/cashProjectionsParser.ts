/**
 * Incoming Cash Projections parser — reads the "Incoming Cash
 * Projections_<ACCOUNT>.xlsx" export (Pershing) and normalizes it into
 * a list of projected coupon/interest payments.
 *
 * Sheet shape (verified against a real export):
 *   Row 0: "Incoming Cash Projections"
 *   Row 1: "Account: <ACCOUNT_NUMBER>"
 *   Row 2: "Client: ..."
 *   ...metadata rows (Time Period, Total Cash Flow, etc.)
 *   Row with "As of : <date>"
 *   Row with "Total Cash Flow: <amount>"
 *   (blank)
 *   Header row: Pay Date | Security Identifier | Distribution Type | CUSIP | Security Description | Quantity
 *   Data rows, until blank / "Disclaimer" section.
 *
 * The sheet has no per-row dollar amount — "Quantity" is the bond's face
 * value. The estimated cash amount is derived from the coupon rate embedded
 * in the Security Description (e.g. "7.625%"), assuming semi-annual
 * payments — verified to reproduce the sheet's own "Total Cash Flow" total.
 */
import * as XLSX from 'xlsx'
import { parseDateStr, parseNum, parseStr } from '@/lib/factsheet-parser'

export interface CashProjectionRow {
  payDate:          string   // YYYY-MM-DD
  securityIdentifier: string | null
  distributionType: string | null
  cusip:            string | null
  description:      string
  quantity:         number | null
  couponPct:        number | null
  estimatedAmount:  number | null
}

export interface ParsedCashProjections {
  accountNumber:  string | null
  asOfDate:       string | null
  totalCashFlow:  number | null
  rows:           CashProjectionRow[]
  warnings:       string[]
}

function extractAccountNumber(metaLines: string[]): string | null {
  for (const line of metaLines) {
    const m = line.match(/^account\s*:?\s*([A-Za-z0-9]+)/i)
    if (m) return m[1].trim().toUpperCase()
  }
  return null
}

function extractAsOfDate(metaLines: string[]): string | null {
  for (const line of metaLines) {
    const m = line.match(/as\s*of\s*:?\s*([A-Za-z]+ \d{1,2},\s*\d{4})/i)
    if (m) {
      const d = new Date(m[1])
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  }
  return null
}

function extractTotalCashFlow(metaLines: string[]): number | null {
  for (const line of metaLines) {
    const m = line.match(/^total\s*cash\s*flow\s*:?\s*([\d,.-]+)/i)
    if (m) return parseNum(m[1])
  }
  return null
}

const HEADER_ALIASES: Record<string, string[]> = {
  payDate:            ['pay date'],
  securityIdentifier: ['security identifier'],
  distributionType:   ['distribution type'],
  cusip:              ['cusip'],
  description:        ['security description'],
  quantity:           ['quantity'],
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_\-.]+/g, ' ')
}

function matchCol(header: string): string | null {
  const h = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(a => normalizeHeader(a) === h)) return field
  }
  return null
}

export function parseCashProjectionsExcel(buffer: ArrayBuffer): ParsedCashProjections {
  const warnings: string[] = []

  const wb  = XLSX.read(buffer, { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (!raw || raw.length < 3) {
    return { accountNumber: null, asOfDate: null, totalCashFlow: null, rows: [], warnings: ['Archivo vacío o sin datos'] }
  }

  let headerIdx = -1
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const recognized = (raw[i] as unknown[]).filter(c => matchCol(String(c))).length
    if (recognized >= 4) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { accountNumber: null, asOfDate: null, totalCashFlow: null, rows: [], warnings: ['No se encontró una fila de encabezados reconocible'] }
  }

  const metaLines = (raw.slice(0, headerIdx) as unknown[][]).map(r => r.map(c => String(c ?? '')).join(' ').trim()).filter(Boolean)
  const accountNumber = extractAccountNumber(metaLines)
  const asOfDate       = extractAsOfDate(metaLines)
  const totalCashFlow  = extractTotalCashFlow(metaLines)

  if (!accountNumber) warnings.push('No se pudo detectar el número de cuenta en el archivo')

  const headers = (raw[headerIdx] as unknown[]).map(h => String(h))
  const colMap: Record<number, string> = {}
  headers.forEach((h, i) => {
    const f = matchCol(h)
    if (f && !(i in colMap)) colMap[i] = f
  })
  const get = (row: unknown[], field: string): unknown => {
    const idx = Object.entries(colMap).find(([, f]) => f === field)?.[0]
    return idx != null ? row[Number(idx)] : undefined
  }

  const rows: CashProjectionRow[] = []
  let footerReached = false

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const description = parseStr(get(row, 'description'))

    if (!description) continue
    if (/^disclaimer|^disclosures?$/i.test(description)) { footerReached = true; continue }
    if (footerReached) continue

    const payDate = parseDateStr(get(row, 'payDate'))
    if (!payDate) { warnings.push(`"${description}" — sin fecha de pago válida, se omitió`); continue }

    const quantity = parseNum(get(row, 'quantity'))
    const couponMatch = description.match(/(\d+(?:\.\d+)?)\s*%/)
    const couponPct = couponMatch ? parseFloat(couponMatch[1]) : null
    const estimatedAmount = quantity != null && couponPct != null
      ? parseFloat((quantity * (couponPct / 100) / 2).toFixed(2))
      : null

    rows.push({
      payDate,
      securityIdentifier: parseStr(get(row, 'securityIdentifier')),
      distributionType:   parseStr(get(row, 'distributionType')),
      cusip:               parseStr(get(row, 'cusip')),
      description,
      quantity,
      couponPct,
      estimatedAmount,
    })
  }

  if (!rows.length) warnings.push('No se encontraron pagos proyectados en el archivo')

  rows.sort((a, b) => a.payDate.localeCompare(b.payDate))

  return { accountNumber, asOfDate, totalCashFlow, rows, warnings }
}
