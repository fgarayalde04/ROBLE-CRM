/**
 * Portfolio positions parser — normalizes a positions export into
 * PortfolioPositionParsed[] + import-level metadata (account, as-of date,
 * base currency, total market value). Supports two source formats:
 *
 * 1. "Positions_<ACCOUNT>.xlsx" (Pershing NetX360 "Positions" report):
 *   Row 0: "Positions"
 *   Row 1: "Account: <ACCOUNT_NUMBER>"
 *   Row 2: "Quote Type: ..."
 *   Row 3: "Cash Included: ..."
 *   Row 4: "Base Currency: USD"
 *   Row 5: "As of: Aug 17, 2026 1:36 PM EDT"
 *   Row 6: (blank)
 *   Row 7: header row
 *   Row 8+: one row per position, until a blank row / "Disclaimer" section.
 *
 * 2. "Unrealized Gain Loss_<CLIENT>.xlsx" (primary source going forward —
 *   see parsePositionsFromUnrealizedFormat below): detected by its title
 *   row and tax-lot-aggregated the same way as the dedicated Unrealized
 *   Gain/Loss import.
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
  purchaseDate:    string | null   // null when the position spans multiple lots bought on different dates
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

// ── Alternate source: "Unrealized Gain Loss_<CLIENT>.xlsx" (Pershing) ───────
// Went from a secondary/optional import to the primary positions source —
// it carries real Quantity/Market Value/Cusip/Account per tax lot, so it can
// stand in for the older "Positions_<ACCOUNT>.xlsx" export entirely. Rows
// are tax-lot level (same "Multiple" subtotal-row aggregation used by the
// dedicated Unrealized Gain/Loss import).
const UGL_COL_ALIASES: Record<string, string[]> = {
  securityType:  ['security type'],
  description:   ['security description'],
  account:       ['account'],
  quantity:      ['quantity'],
  marketValue:   ['market value'],
  cusip:         ['cusip'],
  tradeDate:     ['trade date'],
  symbol:        ['symbol'],
  lastPrice:     ['last price'],
}

function matchUglCol(header: string): string | null {
  const h = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(UGL_COL_ALIASES)) {
    if (aliases.some(a => normalizeHeader(a) === h)) return field
  }
  return null
}

function parsePositionsFromUnrealizedFormat(raw: unknown[][]): ParsedPortfolioImport {
  const warnings: string[] = []

  let headerIdx = -1
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const recognized = (raw[i] as unknown[]).filter(c => matchUglCol(String(c))).length
    if (recognized >= 5) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { accountNumber: null, snapshotDate: null, baseCurrency: 'USD', totalMarketValue: 0, positions: [], warnings: ['No se encontró una fila de encabezados reconocible'] }
  }

  const metaLines = (raw.slice(0, headerIdx) as unknown[][]).map(r => r.map(c => String(c ?? '')).join(' ').trim()).filter(Boolean)
  const snapshotDate = extractSnapshotDate(metaLines)
  if (!snapshotDate) warnings.push('No se pudo detectar la fecha ("As Of") en el archivo')

  const headers = (raw[headerIdx] as unknown[]).map(h => String(h))
  const colMap: Record<number, string> = {}
  headers.forEach((h, i) => {
    const f = matchUglCol(h)
    if (f && !(i in colMap)) colMap[i] = f
  })
  const get = (row: unknown[], field: string): unknown => {
    const idx = Object.entries(colMap).find(([, f]) => f === field)?.[0]
    return idx != null ? row[Number(idx)] : undefined
  }

  interface LotRow {
    securityType: string; description: string; symbol: string | null
    quantity: number; marketValue: number; lastPrice: number | null
    purchaseDate: string | null   // null for the "Multiple" subtotal row (several lots, no single date)
    isSubtotal: boolean
  }
  const lotsByCusip = new Map<string, LotRow[]>()
  let accountNumber: string | null = null

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const cusip = parseStr(get(row, 'cusip'))
    const description = parseStr(get(row, 'description'))
    if (!cusip || !description) continue

    if (!accountNumber) {
      const account = parseStr(get(row, 'account'))
      if (account) accountNumber = account.trim().toUpperCase()
    }

    const tradeDateRaw = get(row, 'tradeDate')
    const lot: LotRow = {
      securityType: parseStr(get(row, 'securityType')) ?? '',
      description,
      symbol:       parseStr(get(row, 'symbol')),
      quantity:     parseNum(get(row, 'quantity')) ?? 0,
      marketValue:  parseNum(get(row, 'marketValue')) ?? 0,
      lastPrice:    parseNum(get(row, 'lastPrice')),
      purchaseDate: parseDateStr(tradeDateRaw),
      isSubtotal:   parseStr(tradeDateRaw)?.toLowerCase() === 'multiple',
    }
    const list = lotsByCusip.get(cusip)
    if (list) list.push(lot); else lotsByCusip.set(cusip, [lot])
  }

  const positions: PortfolioPositionParsed[] = []
  for (const [cusip, lots] of Array.from(lotsByCusip)) {
    const subtotal = lots.find(l => l.isSubtotal)
    const used = subtotal ? [subtotal] : lots
    const first = used[0]
    const quantity = used.reduce((s, l) => s + l.quantity, 0)
    const marketValue = used.reduce((s, l) => s + l.marketValue, 0)

    if (marketValue < 0) warnings.push(`"${first.description.trim()}" — Market Value negativo (${marketValue}), se importó igual`)

    positions.push({
      symbol:       first.symbol,
      name:         first.description.trim(),
      securityType: first.securityType,
      assetClass:   mapAssetClass(first.securityType, first.description),
      region:       mapRegion(first.description, first.symbol ?? ''),
      sector:       mapSector(first.securityType, first.description),
      currency:     'USD',
      quantity,
      price:        first.lastPrice,
      marketValue,
      weight:       0, // recalculated below from real totals
      isin:            null,
      cusip,
      maturityDate:    null,
      purchaseDate:    first.purchaseDate,
      coupon:          null,
      accruedInterest: null,
      fundFamily:      null,
      dividendPolicy:  null,
    })
  }

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0)
  if (totalMarketValue > 0) {
    for (const p of positions) p.weight = parseFloat(((p.marketValue / totalMarketValue) * 100).toFixed(4))
  }

  if (!accountNumber) warnings.push('No se pudo detectar el número de cuenta en el archivo')
  if (!positions.length) warnings.push('No se encontraron posiciones en el archivo')

  return { accountNumber, snapshotDate, baseCurrency: 'USD', totalMarketValue, positions, warnings }
}

export function parsePortfolioExcel(buffer: ArrayBuffer): ParsedPortfolioImport {
  const warnings: string[] = []

  const wb  = XLSX.read(buffer, { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (!raw || raw.length < 3) {
    return { accountNumber: null, snapshotDate: null, baseCurrency: 'USD', totalMarketValue: 0, positions: [], warnings: ['Archivo vacío o sin datos'] }
  }

  const firstCell = String(raw[0]?.[0] ?? '').trim().toLowerCase()
  if (firstCell === 'unrealized gain loss') {
    return parsePositionsFromUnrealizedFormat(raw)
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
      purchaseDate:    null, // not present in this export format
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
