/**
 * Morgan Stanley "Holdings - Cost Basis" parser — normalizes a single Morgan
 * Stanley export into the exact same shapes Pershing already produces
 * (`ParsedPortfolioImport` from parser.ts and `ParsedUnrealizedGainLoss` from
 * unrealizedGainLossParser.ts), so it can flow through the identical
 * createImport()/createUnrealizedGainLossImport() DB layer, the identical
 * Portfolio Engine, and the identical PDF template that Pershing already
 * uses. This file only produces data — it never changes how that data is
 * calculated or rendered.
 *
 * Sheet shape (verified against a real Morgan Stanley export, "Holdings -
 * Cost Basis.xlsx" — "View Cost Basis" report):
 *   Row 0: "View Cost Basis"
 *   Row 2: "Cost Basis for <account nickname> as of <M/D/YYYY hh:mm AM/PM ET>"
 *   Row 4: Total Market Value: | Adjusted Cost: | Total Unrealized
 *     Gain/Loss ($): | ST Gain/Loss Total: | LT Gain/Loss Total:
 *   Row 5: Total Cost: | Wash Sale Cost: | Total Unrealized Gain/Loss (%): |
 *     ST/LT Wash Sale Cost Adj:
 *   Header row: Name | Symbol | CUSIP | Last | As Of | Acquired | Period |
 *     Quantity | Market Value ($) | Today's Change (%) | Today's Change ($) |
 *     Total Cost ($) | Adj. Cost ($) | Unit Cost ($) | Unrealized Gain/Loss
 *     (%) | Unrealized Gain/Loss ($) | Covered Indicator | Wash Sale
 *     Indicator | Wash Sale Cost Adjust($)
 *   Data rows — ONE PER TAX LOT (same security can repeat with a different
 *   "Acquired" date), aggregated by CUSIP into one row per security, exactly
 *   like Pershing's Unrealized Gain Loss format.
 *   A "Total:" row follows the last position, then legal disclaimer text.
 *
 * Unlike Pershing, this file has no "security type" column at all, so asset
 * class can't be read — it's inferred from shape (see mapMorganAssetClass).
 * When the heuristic isn't confident, the position is left "Sin clasificar"
 * rather than guessed as Equity — the advisor reclassifies it by hand from
 * the Posiciones tab.
 */
import * as XLSX from 'xlsx'
import { mapRegion, mapSector, parseDateStr, parseNum, parseStr } from '@/lib/factsheet-parser'
import type { ParsedPortfolioImport, PortfolioPositionParsed } from './parser'
import type { ParsedUnrealizedGainLoss, UnrealizedGainLossRow } from './unrealizedGainLossParser'

export interface ParsedMorganHoldings {
  portfolio: ParsedPortfolioImport
  unrealizedGL: ParsedUnrealizedGainLoss
}

const COL_ALIASES: Record<string, string[]> = {
  name:         ['name'],
  symbol:       ['symbol'],
  cusip:        ['cusip'],
  price:        ['last'],
  purchaseDate: ['acquired'],
  quantity:     ['quantity'],
  marketValue:  ['market value $'],
  costBasis:    ['total cost $'],
  gainLoss:     ['unrealized gain loss $'],
}

// $ and % are kept as literal tokens (not stripped) so "Market Value ($)"
// and "Unrealized Gain/Loss (%)" vs "($)" don't collide after normalizing.
function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[()\/.,]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchCol(header: string): string | null {
  const h = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    if (aliases.some(a => normalizeHeader(a) === h)) return field
  }
  return null
}

// "Cost Basis for Three diamonds - 2818 as of 8/25/2026 12:46 PM ET"
function extractTitleMeta(metaLines: string[]): { nickname: string | null; asOfDate: string | null } {
  for (const line of metaLines) {
    const m = line.match(/cost basis for\s+(.+?)\s+as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)
    if (m) {
      const d = new Date(m[2])
      return { nickname: m[1].trim(), asOfDate: isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
    }
  }
  return { nickname: null, asOfDate: null }
}

// Grand-total rows (e.g. "Total Market Value: 1751620.91") are laid out as
// alternating label/value cell pairs — scan every pre-header row generically
// instead of hardcoding which physical row each label sits on.
function extractLabeledTotals(rows: unknown[][]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      const label = String(row[i] ?? '').trim()
      if (!label.endsWith(':')) continue
      const num = parseNum(row[i + 1])
      if (num != null) map.set(label.slice(0, -1).trim().toLowerCase(), num)
    }
  }
  return map
}

// No security-type column exists in this export, so asset class is inferred
// from shape: cash program by symbol/name, bonds by face-value-style
// quantity + near-par price, funds by fractional share quantity. Anything
// that doesn't clearly match is left unclassified rather than guessed as
// Equity — confirmed with the user rather than assumed.
export function mapMorganAssetClass(symbol: string | null, name: string, quantity: number | null, price: number | null): string {
  if (symbol === 'BDPS' || /bank deposit program/i.test(name)) return 'Cash'
  if (quantity != null && Number.isInteger(quantity) && quantity !== 0 && quantity % 1000 === 0 && price != null && price >= 80 && price <= 120) {
    return 'Fixed Income'
  }
  if (quantity != null && !Number.isInteger(quantity)) return 'Fund'
  return 'Sin clasificar'
}

export function parseMorganHoldingsExcel(buffer: ArrayBuffer): ParsedMorganHoldings {
  const emptyPortfolio: ParsedPortfolioImport = { accountNumber: null, snapshotDate: null, baseCurrency: 'USD', totalMarketValue: 0, positions: [], warnings: [] }
  const emptyGL: ParsedUnrealizedGainLoss = { clientName: null, asOfDate: null, netGainLoss: null, rows: [], warnings: [] }

  const wb  = XLSX.read(buffer, { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (!raw || raw.length < 3) {
    return { portfolio: { ...emptyPortfolio, warnings: ['Archivo vacío o sin datos'] }, unrealizedGL: { ...emptyGL, warnings: ['Archivo vacío o sin datos'] } }
  }

  let headerIdx = -1
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const recognized = (raw[i] as unknown[]).filter(c => matchCol(String(c))).length
    if (recognized >= 6) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    const w = ['No se encontró una fila de encabezados reconocible']
    return { portfolio: { ...emptyPortfolio, warnings: w }, unrealizedGL: { ...emptyGL, warnings: w } }
  }

  const preHeaderRows = raw.slice(0, headerIdx) as unknown[][]
  const metaLines = preHeaderRows.map(r => r.map(c => String(c ?? '')).join(' ').trim()).filter(Boolean)
  const { nickname, asOfDate } = extractTitleMeta(metaLines)
  const totals = extractLabeledTotals(preHeaderRows)

  const warnings: string[] = []
  if (!asOfDate) warnings.push('No se pudo detectar la fecha ("as of") en el archivo')
  // This export never carries a full account number — only a nickname/suffix
  // — so accountNumber stays null and the advisor types it in manually, the
  // same fallback already used when Pershing's own account-detection fails.
  warnings.push('Morgan Stanley no incluye el número de cuenta completo en este archivo — ingresalo manualmente.')

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

  interface LotRow {
    name: string; symbol: string | null; price: number | null
    quantity: number; marketValue: number; costBasis: number; gainLoss: number
    purchaseDate: string | null
  }
  const lotsByCusip = new Map<string, LotRow[]>()

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const cusip = parseStr(get(row, 'cusip'))
    const name = parseStr(get(row, 'name'))
    if (!cusip) {
      if (name && /^total\b/i.test(name)) break // grand-total row — no more real data after it
      continue // blank separator row — keep scanning
    }
    if (!name) continue

    const lot: LotRow = {
      name,
      symbol: parseStr(get(row, 'symbol')),
      price: parseNum(get(row, 'price')),
      quantity: parseNum(get(row, 'quantity')) ?? 0,
      marketValue: parseNum(get(row, 'marketValue')) ?? 0,
      costBasis: parseNum(get(row, 'costBasis')) ?? 0,
      gainLoss: parseNum(get(row, 'gainLoss')) ?? 0,
      purchaseDate: parseDateStr(get(row, 'purchaseDate')),
    }
    const list = lotsByCusip.get(cusip)
    if (list) list.push(lot); else lotsByCusip.set(cusip, [lot])
  }

  const positions: PortfolioPositionParsed[] = []
  const glRows: UnrealizedGainLossRow[] = []

  for (const [cusip, lots] of Array.from(lotsByCusip)) {
    const first = lots[0]
    const quantity = lots.reduce((s, l) => s + l.quantity, 0)
    const marketValue = lots.reduce((s, l) => s + l.marketValue, 0)
    const costBasis = lots.reduce((s, l) => s + l.costBasis, 0)
    const gainLoss = lots.reduce((s, l) => s + l.gainLoss, 0)

    if (marketValue < 0) warnings.push(`"${first.name}" — Market Value negativo (${marketValue}), se importó igual`)

    const lotDates = Array.from(new Set(lots.filter(l => l.purchaseDate).map(l => l.purchaseDate as string))).sort()
    const purchaseDate = lotDates.length === 0 ? null : lotDates.length === 1 ? lotDates[0] : lotDates.join(', ')

    const assetClass = mapMorganAssetClass(first.symbol, first.name, quantity, first.price)

    positions.push({
      symbol: first.symbol,
      name: first.name,
      securityType: '', // not present in this export — assetClass already inferred below
      assetClass,
      region: mapRegion(first.name, first.symbol ?? ''),
      sector: mapSector('', first.name),
      currency: 'USD', // Morgan Stanley statements display everything converted to USD
      quantity,
      price: first.price,
      marketValue: parseFloat(marketValue.toFixed(2)),
      weight: 0, // recalculated below from real totals
      isin: null, // not present in this export
      cusip,
      maturityDate: null, // not present in this export
      purchaseDate,
      coupon: null, // not present in this export
      accruedInterest: null, // not present in this export
      fundFamily: null,
      dividendPolicy: null,
    })

    glRows.push({
      cusip,
      securityIdentifier: null,
      description: first.name,
      quantity,
      costBasis: parseFloat(costBasis.toFixed(2)),
      marketValue: parseFloat(marketValue.toFixed(2)),
      gainLoss: parseFloat(gainLoss.toFixed(2)),
      gainLossPct: costBasis > 0 ? parseFloat(((gainLoss / costBasis) * 100).toFixed(2)) : 0,
      purchaseDate,
    })
  }

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0)
  if (totalMarketValue > 0) {
    for (const p of positions) p.weight = parseFloat(((p.marketValue / totalMarketValue) * 100).toFixed(4))
  }

  const fileDeclaredTotal = totals.get('total market value')
  if (fileDeclaredTotal != null && fileDeclaredTotal > 0) {
    const diffPct = Math.abs(totalMarketValue - fileDeclaredTotal) / fileDeclaredTotal * 100
    if (diffPct > 1) {
      warnings.push(`El Market Value calculado (${totalMarketValue.toFixed(2)}) difiere del total declarado en el archivo (${fileDeclaredTotal.toFixed(2)}) en más de 1%`)
    }
  }

  if (!positions.length) warnings.push('No se encontraron posiciones en el archivo')
  const unclassifiedCount = positions.filter(p => p.assetClass === 'Sin clasificar').length
  if (unclassifiedCount > 0) warnings.push(`${unclassifiedCount} posición(es) quedaron "Sin clasificar" — revisalas y asigná la clase de activo manualmente en Posiciones`)

  const netGainLoss = totals.get('total unrealized gain/loss ($)') ?? glRows.reduce((s, r) => s + r.gainLoss, 0)

  return {
    portfolio: { accountNumber: null, snapshotDate: asOfDate, baseCurrency: 'USD', totalMarketValue, positions, warnings },
    unrealizedGL: { clientName: nickname, asOfDate, netGainLoss, rows: glRows, warnings: [] },
  }
}
