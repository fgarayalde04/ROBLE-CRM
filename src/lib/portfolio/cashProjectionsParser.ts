/**
 * "Account.PCF.IncomingCash<...>.xlsx" parser (Pershing) — normaliza el
 * export en una lista de pagos proyectados.
 *
 * Sheet shape (verificado contra un export real):
 *   Row 0: "Account #                  :" | "<ACCOUNT_NUMBER>"
 *   Row 1: "Account Short Name:" | "<nickname>"
 *   Row 2: "Base CCY:" | "USD"
 *   Header row: PAY DATE | DISTRIBUTION TYPE | CUSIP | SECURITY DESCRIPTION |
 *     PROJECTED CASH (BASE CCY) | PROJECTED REINVESTED CASH (BASE CCY) |
 *     AS OF DATE | QUANTITY
 *   Data rows — el archivo YA trae el monto en dólares por pago en
 *   "Projected Cash"; no hace falta (ni se debe) derivarlo del % de cupón
 *   embebido en la descripción — eso rompía las notas a tasa variable,
 *   que no traen el % en el texto pero sí tienen su monto real en esta
 *   columna. Cada security trae además una fila "Sub-total:" y cada mes
 *   una fila "<Mes> <Año> Monthly Sub-total:" (sin Pay Date) y al final
 *   una fila "Account Total:" — todas se saltean.
 *   El "Account Total:" de la planilla = suma de "Projected Cash" (no
 *   incluye "Projected Reinvested Cash").
 */
import * as XLSX from 'xlsx'
import { parseDateStr, parseNum, parseStr } from '@/lib/factsheet-parser'
import { parseMorganProjectedIncomeExcel } from './morganProjectedIncomeParser'

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
    const m = line.match(/^account\s*#?\s*:?\s*([A-Za-z0-9]+)/i)
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
  amount:             ['projected cash (base ccy)', 'projected cash', 'estimated amount', 'amount'],
  asOfDateCol:        ['as of date', 'as of'],
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

// Dispatcher: el archivo de income proyectado puede venir de Pershing
// ("Incoming Cash Projections", una fila por pago, sin monto — se deriva
// del cupón) o de Morgan Stanley ("Projected Income", una fila por
// security con una grilla de columnas por mes que YA trae el monto — no
// hay nada que derivar, es sumar esas celdas). Se detecta por la fila de
// encabezados y se despacha al parser que corresponde.
export function parseCashProjectionsExcel(buffer: ArrayBuffer): ParsedCashProjections {
  const wb  = XLSX.read(buffer, { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  const looksMorgan = raw.slice(0, 15).some(r => {
    const cells = (r as unknown[]).map(c => String(c).trim().toLowerCase())
    return cells.includes('security') && cells.includes('payment date')
  })
  if (looksMorgan) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseMorganProjectedIncomeExcel } = require('./morganProjectedIncomeParser')
    return parseMorganProjectedIncomeExcel(buffer)
  }
  return parsePershingCashProjectionsExcel(raw)
}

function parsePershingCashProjectionsExcel(raw: unknown[][]): ParsedCashProjections {
  const warnings: string[] = []

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
  let asOfFromData: string | null = null

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const description = parseStr(get(row, 'description'))
    const payDate = parseDateStr(get(row, 'payDate'))

    // Filas de Sub-total (por security), "<Mes> <Año> Monthly Sub-total:"
    // y "Account Total:" — nunca traen Pay Date. Se saltean sin avisar,
    // no son pagos omitidos por error.
    if (!payDate) {
      if (description && /disclaimer|disclosures?/i.test(description)) footerReached = true
      continue
    }
    if (footerReached) continue
    if (!description) continue

    if (!asOfFromData) {
      const d = parseDateStr(get(row, 'asOfDateCol'))
      if (d) asOfFromData = d
    }

    const quantity = parseNum(get(row, 'quantity'))
    const couponMatch = description.match(/(\d+(?:\.\d+)?)\s*%/)
    const couponPct = couponMatch ? parseFloat(couponMatch[1]) : null
    // El monto ya viene calculado por el custodio en "Projected Cash" — no
    // se deriva del cupón (eso fallaba para notas a tasa variable, que no
    // traen el % en la descripción pero sí tienen su monto real acá).
    const estimatedAmount = parseNum(get(row, 'amount'))

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

  return {
    accountNumber,
    asOfDate: asOfDate ?? asOfFromData,
    totalCashFlow: totalCashFlow ?? (rows.length ? rows.reduce((s, r) => s + (r.estimatedAmount ?? 0), 0) : null),
    rows,
    warnings,
  }
}
