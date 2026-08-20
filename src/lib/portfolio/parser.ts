/**
 * Portfolio positions parser — reads the "Positions_<ACCOUNT>.xlsx" export
 * (Pershing NetX360 "Positions" report) and normalizes it into
 * PortfolioPositionParsed[] + import-level metadata (account, as-of date,
 * base currency, total market value).
 *
 * Sheet shape (verified against a real export):
 *   Row 0: "Positions"
 *   Row 1: "Account: <ACCOUNT_NUMBER>"
 *   Row 2: "Quote Type: ..."
 *   Row 3: "Cash Included: ..."
 *   Row 4: "Base Currency: USD"
 *   Row 5: "As of: Aug 17, 2026 1:36 PM EDT"
 *   Row 6: (blank)
 *   Row 7: header row
 *   Row 8+: one row per position, until a blank row / "Disclaimer" section.
 */
import * as XLSX from 'xlsx'
import { mapAssetClass, mapRegion, mapSector, parseDateStr, parseNum, parseStr } from '@/lib/factsheet-parser'

export interface PortfolioPositionParsed {
  symbol:          string | null
  name:            string
  securityType:    string
  assetClass:      string
  region:          string
  sector:          string
  currency:        string
  quantity:        number | null
  price:           number | null
  marketValue:     number   // always USD-equivalent — what totals/weights are based on
  weight:          number   // % of portfolio, recalculated from marketValue
  isin:            string | null
  cusip:           string | null
  maturityDate:    string | null
  coupon:          number | null
  accruedInterest: number | null
  fundFamily:      string | null
  dividendPolicy:  string | null
}

export interface ParsedPortfolioImport {
  accountNumber:    string | null
  snapshotDate:     string | null   // YYYY-MM-DD
  baseCurrency:     string
  totalMarketValue: number
  positions:        PortfolioPositionParsed[]
  warnings:         string[]
}

// ── Column aliases — tailored to the confirmed real header row, with a few
// fallback variants in case a different account export renames columns. ──────
const COL_ALIASES: Record<string, string[]> = {
  symbol:          ['symbol', 'ticker'],
  name:            ['description', 'security description', 'name'],
  securityType:    ['security type', 'asset type', 'sec type'],
  currency:        ['position ccy', 'currency', 'ccy'],
  quantity:        ['trade date quantity', 'settlement date quantity', 'quantity', 'qty'],
  // USD-equivalent market value drives totals/weights; position-currency value
  // is a fallback only for accounts where the USDE column isn't present.
  marketValueUsd:  ['market value (usde)', 'market value usd'],
  marketValue:     ['market value (position ccy)', 'market value'],
  weight:          ['% of portfolio', '% portfolio'],
  isin:            ['isin'],
  cusip:           ['cusip'],
  price:           ['market price (position ccy)', 'market price', 'price'],
  maturityDate:    ['maturity date', 'maturity'],
  coupon:          ['% coupon rate', 'coupon rate', 'coupon'],
  accruedInterest: ['accrued interest (usde)', 'accrued interest (position ccy)', 'accrued interest'],
  fundFamily:      ['fund family'],
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_\-.]+/g, ' ')
}

function matchCol(header: string): string | null {
  const h = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    if (aliases.some(a => normalizeHeader(a) === h)) return field
  }
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    if (aliases.some(a => h.startsWith(normalizeHeader(a)))) return field
  }
  return null
}

function extractAccountNumber(metaLines: string[]): string | null {
  for (const line of metaLines) {
    const m = line.match(/^account\s*:?\s*([A-Za-z0-9]+)/i)
    if (m) return m[1].trim().toUpperCase()
  }
  return null
}

function extractBaseCurrency(metaLines: string[]): string {
  for (const line of metaLines) {
    const m = line.match(/base\s*currency\s*:?\s*([A-Za-z]{3})/i)
    if (m) return m[1].trim().toUpperCase()
  }
  return 'USD'
}

function extractSnapshotDate(metaLines: string[]): string | null {
  for (const line of metaLines) {
    const m = line.match(/as\s*of\s*:?\s*([A-Za-z]+ \d{1,2},\s*\d{4})/i)
    if (m) {
      const d = new Date(m[1])
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  }
  return null
}

export function parsePortfolioExcel(buffer: ArrayBuffer): ParsedPortfolioImport {
  const warnings: string[] = []

  const wb  = XLSX.read(buffer, { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (!raw || raw.length < 3) {
    return { accountNumber: null, snapshotDate: null, baseCurrency: 'USD', totalMarketValue: 0, positions: [], warnings: ['Archivo vacío o sin datos'] }
  }

  // Find header row — first row with ≥ 4 recognizable columns.
  let headerIdx = -1
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const recognized = (raw[i] as unknown[]).filter(c => matchCol(String(c))).length
    if (recognized >= 4) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { accountNumber: null, snapshotDate: null, baseCurrency: 'USD', totalMarketValue: 0, positions: [], warnings: ['No se encontró una fila de encabezados reconocible'] }
  }

  const metaLines = (raw.slice(0, headerIdx) as unknown[][]).map(r => r.map(c => String(c ?? '')).join(' ').trim()).filter(Boolean)
  const accountNumber = extractAccountNumber(metaLines)
  const baseCurrency   = extractBaseCurrency(metaLines)
  const snapshotDate   = extractSnapshotDate(metaLines)

  if (!accountNumber) warnings.push('No se pudo detectar el número de cuenta en el archivo')
  if (!snapshotDate)  warnings.push('No se pudo detectar la fecha ("As of") en el archivo')

  const headers = (raw[headerIdx] as unknown[]).map(h => String(h))
  const colMap: Record<number, string> = {}
  headers.forEach((h, i) => {
    const f = matchCol(h)
    if (f && !(i in colMap)) colMap[i] = f
  })

  const get = (row: unknown[], field: string): unknown => {
    // Prefer the lowest-index match (leftmost column) when a field has
    // multiple candidate columns (e.g. marketValue vs marketValue-in-USDE).
    const indices = Object.entries(colMap).filter(([, f]) => f === field).map(([i]) => Number(i)).sort((a, b) => a - b)
    return indices.length ? row[indices[0]] : undefined
  }

  const positions: PortfolioPositionParsed[] = []
  const seenIdentifiers = new Map<string, number>()
  let footerReached = false

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const name = parseStr(get(row, 'name'))
    const nameLower = (name ?? '').toLowerCase()

    if (!name) continue // blank row — keep scanning, footer disclaimers follow
    if (/^disclaimer|^disclosures?$/i.test(name)) { footerReached = true; continue }
    if (footerReached) continue // disclaimer / disclosure paragraphs

    const mvUsd = parseNum(get(row, 'marketValueUsd'))
    const mvPos = parseNum(get(row, 'marketValue'))
    const mv = mvUsd ?? mvPos

    if (mv == null) {
      warnings.push(`"${name}" — sin Market Value, se omitió`)
      continue
    }
    if (mv < 0) {
      warnings.push(`"${name}" — Market Value negativo (${mv}), se importó igual`)
    }

    const secType = parseStr(get(row, 'securityType')) ?? ''
    const currency = parseStr(get(row, 'currency')) ?? baseCurrency
    const isin  = parseStr(get(row, 'isin'))
    const cusip = parseStr(get(row, 'cusip'))
    const identifier = isin ?? cusip
    if (identifier) {
      const count = (seenIdentifiers.get(identifier) ?? 0) + 1
      seenIdentifiers.set(identifier, count)
      if (count === 2) warnings.push(`ISIN/CUSIP duplicado: ${identifier}`)
    }

    positions.push({
      symbol:       parseStr(get(row, 'symbol')),
      name,
      securityType: secType,
      assetClass:   mapAssetClass(secType, name),
      region:       mapRegion(name, parseStr(get(row, 'symbol')) ?? ''),
      sector:       mapSector(secType, name),
      currency,
      quantity:     parseNum(get(row, 'quantity')),
      price:        parseNum(get(row, 'price')),
      marketValue:  mv,
      weight:       0, // recalculated below from real totals
      isin, cusip,
      maturityDate:    parseDateStr(get(row, 'maturityDate')),
      coupon:          parseNum(get(row, 'coupon')),
      accruedInterest: parseNum(get(row, 'accruedInterest')),
      fundFamily:      parseStr(get(row, 'fundFamily')),
      dividendPolicy:  null,
    })
  }

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0)
  if (totalMarketValue > 0) {
    for (const p of positions) p.weight = parseFloat(((p.marketValue / totalMarketValue) * 100).toFixed(4))
  }

  if (!positions.length) warnings.push('No se encontraron posiciones en el archivo')

  return { accountNumber, snapshotDate, baseCurrency, totalMarketValue, positions, warnings }
}
