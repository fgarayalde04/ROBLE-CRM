/**
 * Morgan Stanley "Projected Income" parser — reads the "ProjectedIncome.xlsx"
 * export and normalizes it into the exact same `ParsedCashProjections` shape
 * Pershing's "Incoming Cash Projections" parser already produces, so it
 * flows through the identical DB layer and the identical income chart/table
 * code (which already buckets by `pay_date.slice(0,7)`).
 *
 * Sheet shape (verified against a real export):
 *   Row 4: "Projected Income for account <nickname> for next 12 months"
 *   Header row: Security | Payment Date | <Month Year> x 13 | Total
 *   Data rows: one per security, with a $ amount (or "-") in each month
 *     column instead of Pershing's one-row-per-payment shape.
 *   "Total" row, then boilerplate legal text.
 *
 * Each non-dash month cell is exploded into its own synthetic row (payDate =
 * the 1st of that month, estimatedAmount = the cell value, cusip = null —
 * no fuzzy name-matching against Holdings positions, to avoid guessing an
 * association that isn't actually in the file).
 */
import * as XLSX from 'xlsx'
import { parseNum, parseStr } from '@/lib/factsheet-parser'
import type { ParsedCashProjections, CashProjectionRow } from './cashProjectionsParser'

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

// "August 2026" → "2026-08-01"; returns null for any other header (Security,
// Payment Date, Total).
function parseMonthColumnHeader(h: string): string | null {
  const m = h.trim().toLowerCase().match(/^([a-z]+)\s+(\d{4})$/)
  if (!m) return null
  const month = MONTH_NAMES[m[1]]
  if (!month) return null
  return `${m[2]}-${String(month).padStart(2, '0')}-01`
}

export function parseMorganProjectedIncomeExcel(buffer: ArrayBuffer): ParsedCashProjections {
  const warnings: string[] = []

  const wb  = XLSX.read(buffer, { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (!raw || raw.length < 3) {
    return { accountNumber: null, asOfDate: null, totalCashFlow: null, rows: [], warnings: ['Archivo vacío o sin datos'] }
  }

  let headerIdx = -1
  for (let i = 0; i < Math.min(15, raw.length); i++) {
    const cells = (raw[i] as unknown[]).map(c => String(c).trim().toLowerCase())
    if (cells.includes('security') && cells.includes('payment date')) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { accountNumber: null, asOfDate: null, totalCashFlow: null, rows: [], warnings: ['No se encontró una fila de encabezados reconocible'] }
  }

  const headers = (raw[headerIdx] as unknown[]).map(h => String(h))
  const securityIdx = headers.findIndex(h => h.trim().toLowerCase() === 'security')
  const totalIdx = headers.findIndex(h => h.trim().toLowerCase() === 'total')
  const monthCols = headers
    .map((h, i) => ({ i, date: parseMonthColumnHeader(h) }))
    .filter((c): c is { i: number; date: string } => c.date != null)

  if (securityIdx === -1 || monthCols.length === 0) {
    return { accountNumber: null, asOfDate: null, totalCashFlow: null, rows: [], warnings: ['No se pudo interpretar la grilla mensual de income proyectado'] }
  }

  const rows: CashProjectionRow[] = []
  let totalCashFlow: number | null = null

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const security = parseStr(row[securityIdx])
    if (!security) continue
    if (/^total\b/i.test(security)) {
      if (totalIdx !== -1) totalCashFlow = parseNum(row[totalIdx])
      break // grand-total row — no more real data after it
    }

    for (const { i: colIdx, date } of monthCols) {
      const amount = parseNum(row[colIdx])
      if (amount == null) continue // "-" — no payment that month
      rows.push({
        payDate: date,
        securityIdentifier: null,
        distributionType: null,
        cusip: null,
        description: security,
        quantity: null,
        couponPct: null,
        estimatedAmount: amount,
      })
    }
  }

  if (!rows.length) warnings.push('No se encontraron pagos proyectados en el archivo')
  rows.sort((a, b) => a.payDate.localeCompare(b.payDate))

  // No "as of" field exists in this export — the account/cashflows route
  // already defaults a missing asOfDate to today rather than blocking.
  return { accountNumber: null, asOfDate: null, totalCashFlow, rows, warnings }
}
