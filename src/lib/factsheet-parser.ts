/**
 * Factsheet parser — reads Unrealized Gain/Loss Excel from Pershing/Insigneo
 * and normalizes it into FactsheetPosition[].
 */
import * as XLSX from 'xlsx'
import type { ParsedFactsheet, FactsheetPosition } from '@/types/factsheet'

// ── Asset class mapping ───────────────────────────────────────────────────────

// For funds: classify by what they hold, not just "Mutual Fund"
function mapFundByName(name: string): string {
  const n = name.toLowerCase()

  // Private credit / alternative credit / BDC → Alternatives
  if (/private.?credit|private.?debt|private.?equity|bdc\b|business.?develop/i.test(n))
    return 'Alternatives'

  // Fixed income funds (credit, bonds, contingent capital, target maturity)
  if (/credit|bond|income.*fund|fixed|debt\b|contingent.?capital|coco\b|at1\b|millesima|maturity|duration|high.?yield|investment.?grade|treasury|sovereign/i.test(n))
    return 'Fixed Income'

  // Equity funds
  if (/equit|stock|franchise|growth|dividend|emerging.?market|market.*emerging|global.*fund|world|international|small.?cap|large.?cap|mid.?cap/i.test(n))
    return 'Equity'

  // Default unknown funds → Alternatives
  return 'Alternatives'
}

export function mapAssetClass(securityType: string, name: string): string {
  const t = (securityType + ' ' + name).toLowerCase()

  // Cash / money market
  if (/money\s*market|cash\b|mmf|t.?bill|sweep|liquidity/i.test(t))         return 'Cash'

  // Explicit bond security types
  if (/government|treasury|sovereign|municipal|muni/i.test(securityType))   return 'Fixed Income'
  if (/corporate.?bond|corp.?bond|\bbond\b|fixed.?income|note\b|debenture/i.test(securityType)) return 'Fixed Income'

  // ETFs
  if (/\betf\b|exchange.?traded/i.test(securityType))                        return 'ETF'

  // Real estate
  if (/reit|real.?estate/i.test(t))                                           return 'Real Estate'

  // Equity
  if (/common.?stock|ordinary|adr\b|gdr\b|equit/i.test(securityType))        return 'Equity'

  // Funds → classify by name content, not as "Mutual Fund"
  if (/open.?end|closed.?end|mutual.?fund|interval.?fund|limited.?partner|hedge.?fund|alternative|bdc\b/i.test(securityType))
    return mapFundByName(name)

  if (/annuit/i.test(securityType)) return 'Alternatives'

  // Fallback: name heuristics
  if (/\b(bond|bono|note\b|nt\b)\b/i.test(name))                             return 'Fixed Income'
  if (/\betf\b/i.test(name))                                                  return 'ETF'
  if (/\bfund\b|\bfondo\b/i.test(name))                                       return mapFundByName(name)

  return 'Equity'
}

export function mapRegion(name: string, symbol: string): string {
  const t = (name + ' ' + symbol).toLowerCase()
  if (/argentin|ypf\b|arcor\b|galicia\b|ggal\b|pampa\b|merval/i.test(t))  return 'LatAm'
  if (/brazil|brasil|\bvale\b|petrobras|cosan\b|itau\b/i.test(t))           return 'LatAm'
  if (/mexic|pemex|cemex\b|femsa\b|homex\b/i.test(t))                       return 'LatAm'
  if (/latam|latin\s*am|colombia|peru\b|chile\b|uruguay|paraguay/i.test(t)) return 'LatAm'
  if (/emerg|eem\b|vwo\b|iemg\b/i.test(t))                                  return 'Emerging Markets'
  if (/china|india\b|korea|taiwan|asia|japan|jpn\b/i.test(t))               return 'Asia'
  if (/europe|european|\buk\b|germany|france|spain|eafe\b|vea\b/i.test(t)) return 'Europe'
  if (/global|world|international|msci\s*world/i.test(t))                   return 'Global'
  return 'USA'
}

export function mapSector(securityType: string, name: string): string {
  const t = (securityType + ' ' + name).toLowerCase()
  if (/tech|software|semiconductor|cloud|nvidia|apple|microsoft|google|meta|amazon\b|intel\b/i.test(t)) return 'Technology'
  if (/financ|bank|insurance|galicia|itau|macro|ggal|bdc\b/i.test(t))      return 'Financials'
  if (/energy|oil|gas|petrol|pemex|ypf\b|vale\b|coal|mining/i.test(t))     return 'Energy / Materials'
  if (/health|pharma|medical|biotech|unitedheal/i.test(t))                  return 'Healthcare'
  if (/consumer|retail|target\b|pepsi|coca.?cola|walmart/i.test(t))         return 'Consumer'
  if (/industrial|manufactur|aerospace|defense|caterpillar/i.test(t))       return 'Industrials'
  if (/utilit|electric|water|gas\s*util/i.test(t))                          return 'Utilities'
  if (/telecom|communication|media|netflix|disney|comcast/i.test(t))        return 'Communication'
  if (/reit|real.?estate|property/i.test(t))                                return 'Real Estate'
  if (/bond|fixed.?income|treasury|sovereign|government/i.test(t))          return 'Fixed Income'
  if (/money.?market|cash|t.?bill/i.test(t))                                return 'Cash'
  return 'Diversified'
}

// ── Column aliases ────────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  symbol:       ['symbol', 'ticker', 'simbolo', 'bbg ticker', 'bloomberg ticker', 'sec symbol'],
  name:         ['security description', 'description', 'name', 'asset name', 'nombre', 'security name', 'instrumento'],
  securityType: ['security type', 'sec type', 'asset type', 'instrument type', 'tipo'],
  identifier:   ['security identifier', 'cusip', 'isin', 'identifier', 'sec id'],
  tradeDate:    ['trade date', 'fecha', 'date', 'acquisition date', 'purchase date'],
  quantity:     ['quantity', 'qty', 'units', 'shares', 'nominales', 'cantidad'],
  marketValue:  ['market value', 'mkt value', 'fair value', 'valor mercado', 'current value'],
  costBasis:    ['current total cost', 'total cost', 'cost basis', 'total cost basis', 'book value', 'costo', 'base cost'],
  unrealizedGL: ['gain/loss', 'unrealized gain/loss', 'unrealized g/l', 'unreal g/l', 'unrealized', 'ganancia/perdida', 'g/l'],
  returnPct:    ['gain/loss %', 'unrealized gain/loss %', 'return %', '% gain/loss', 'rendimiento %', '% return'],
  weight:       ['% of portfolio', '% portfolio', 'weight', 'allocation', 'peso', '% port'],
  currency:     ['currency', 'moneda', 'ccy'],
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_\-\.]+/g, ' ')
}

function matchCol(header: string): string | null {
  const h = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    if (aliases.some(a => normalizeHeader(a) === h || h.includes(normalizeHeader(a)))) return field
  }
  return null
}

function parseNum(v: unknown): number | null {
  if (v == null || v === '' || v === '-') return null
  const s = String(v).replace(/[$,%\s()]/g, '').replace(',', '.')
  // Parentheses = negative
  const negative = String(v).trim().startsWith('(') || String(v).trim().startsWith('-')
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return negative && n > 0 ? -n : n
}

// ── Metadata extraction from first rows ──────────────────────────────────────

function extractMeta(rows: unknown[][]): Partial<{ clientName: string; reportDate: string; advisor: string; accountNumber: string }> {
  const meta: Partial<{ clientName: string; reportDate: string; advisor: string; accountNumber: string }> = {}
  for (const row of rows) {
    const line = row.map(c => String(c ?? '')).join(' ').trim()
    if (!line || line.length < 3) continue

    if (!meta.clientName && /account\s*(name|holder)|client\s*name|name:/i.test(line)) {
      const match = line.match(/(?:account\s*(?:name|holder)|client\s*name|name)[\s:]+(.+)/i)
      if (match) meta.clientName = match[1].trim()
    }
    if (!meta.accountNumber && /account\s*(number|#|no)/i.test(line)) {
      const match = line.match(/account\s*(?:number|#|no)[\s:]+([A-Z0-9\-]+)/i)
      if (match) meta.accountNumber = match[1].trim()
    }
    if (!meta.advisor && /advisor|rep|representative|asesor/i.test(line)) {
      const match = line.match(/(?:advisor|rep|representative|asesor)[\s:]+(.+)/i)
      if (match) meta.advisor = match[1].trim().replace(/\s+(advisor|rep)$/i, '').trim()
    }
    if (!meta.reportDate && /as\s*of|date|fecha/i.test(line)) {
      const match = line.match(/(?:as\s*of|date|fecha)[\s:]+(.+)/i)
      if (match) meta.reportDate = match[1].trim()
    }
  }
  return meta
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseFactsheetExcel(buffer: ArrayBuffer): ParsedFactsheet {
  const warnings: string[] = []

  const wb   = XLSX.read(buffer, { type: 'array' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const raw  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  // ws['!rows'] is indexed from 0 = Excel row 1.
  // sheet_to_json starts from the first row in ws['!ref'], which may not be row 1.
  // Offset = start row of the used range (0-indexed).
  const sheetRange = XLSX.utils.decode_range((ws as any)['!ref'] ?? 'A1')
  const rowOffset  = sheetRange.s.r   // e.g. 0 if sheet starts at row 1, 2 if at row 3
  const rowsInfo   = ((ws as any)['!rows'] as Array<{ hidden?: boolean; level?: number } | null | undefined>) ?? []

  // raw[i] corresponds to Excel row (rowOffset + i + 1), i.e. rowsInfo[rowOffset + i]
  const isHidden = (rawIdx: number): boolean => rowsInfo[rowOffset + rawIdx]?.hidden === true

  if (!raw || raw.length < 3) {
    return { meta: {}, positions: [], totalValue: 0, warnings: ['Archivo vacío o sin datos'] }
  }

  // Find header row — skip hidden rows, look for ≥ 3 recognizable columns
  let headerIdx = 0
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    if (isHidden(i)) continue
    const recognized = (raw[i] as unknown[]).filter(c => matchCol(String(c))).length
    if (recognized >= 3) { headerIdx = i; break }
  }

  const metaRows = raw.slice(0, headerIdx) as unknown[][]
  const meta     = extractMeta(metaRows)
  const headers  = (raw[headerIdx] as unknown[]).map(h => String(h))

  // Build column index map
  const colMap: Record<number, string> = {}
  headers.forEach((h, i) => {
    const f = matchCol(h)
    if (f && !(i in colMap)) colMap[i] = f
  })

  const get = (row: unknown[], field: string): unknown => {
    const entry = Object.entries(colMap).find(([, f]) => f === field)
    return entry ? row[Number(entry[0])] : undefined
  }

  const SUMMARY_ROW = /\btotal\b|\bsubtotal\b|grand\s*total|account\s*total/i

  // ── Pass 1: collect all data rows, tag which identifier has a "Multiple" row ─
  // Pershing format: positions with multiple purchase lots have Trade Date = "Multiple"
  // on the consolidated row, and individual lot rows with specific dates below it.
  // SheetJS does NOT read Excel hidden-row flags, so we use Trade Date to distinguish.

  interface DataRow {
    rawIdx:    number
    identifier: string  // Security Identifier (K) — most reliable unique key
    tradeDate:  string
    name:       string
    sym:        string
    secType:    string
    currency:   string
    mv:         number
    costBasis:  number | null
    gl:         number | null
    retPct:     number | null
    qty:        number | null
    weight:     number | null
  }

  const allRows: DataRow[] = []
  const multiLotIds = new Set<string>()  // identifiers that have a "Multiple" row
  let grandTotal = 0

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row  = raw[i] as unknown[]
    const name = String(get(row, 'name') ?? '').trim()
    if (!name || name.length < 2) continue

    if (SUMMARY_ROW.test(name)) {
      const tv = parseNum(get(row, 'marketValue'))
      if (tv && tv > grandTotal) grandTotal = tv
      continue
    }

    const mv = parseNum(get(row, 'marketValue'))
    // skip rows with no market value (section headers, zero-value lots)
    // but keep zero-value positions like defaulted bonds (MV = 0 is valid)
    if (mv == null) continue

    const sym        = String(get(row, 'symbol')     ?? '').trim().toUpperCase()
    const identifier = String(get(row, 'identifier') ?? sym).trim() || sym
    const tradeDate  = String(get(row, 'tradeDate' as any) ?? '').trim()
    const secType    = String(get(row, 'securityType') ?? '').trim()
    const currency   = String(get(row, 'currency')   ?? 'USD').trim() || 'USD'
    const costBasis  = parseNum(get(row, 'costBasis'))
    const gl         = parseNum(get(row, 'unrealizedGL'))
    const retPct     = parseNum(get(row, 'returnPct'))
    let   weight     = parseNum(get(row, 'weight'))
    if (weight != null && weight > 0 && weight <= 1) weight = weight * 100

    const key = identifier || name.toLowerCase().replace(/\s+/g, ' ')

    if (tradeDate === 'Multiple') multiLotIds.add(key)

    allRows.push({ rawIdx: i, identifier: key, tradeDate, name, sym, secType, currency, mv, costBasis, gl, retPct, qty: parseNum(get(row, 'quantity')), weight })
  }

  // ── Pass 2: keep only position rows, skip individual lots ─────────────────
  // Rule: if a symbol has a "Multiple" row → keep only that row, skip specific-date rows
  //       if a symbol never has "Multiple" → it's a single-lot position, keep it

  const positions: FactsheetPosition[] = []

  for (const r of allRows) {
    const isMultiLot  = multiLotIds.has(r.identifier)
    const isAggregate = r.tradeDate === 'Multiple'

    // Skip individual lot rows (specific date, but symbol has a "Multiple" aggregate)
    if (isMultiLot && !isAggregate) continue

    const returnPct = r.retPct
      ?? (r.costBasis && r.costBasis !== 0
          ? parseFloat(((r.gl ?? 0) / Math.abs(r.costBasis) * 100).toFixed(2))
          : null)

    positions.push({
      symbol:       r.sym || r.name.slice(0, 8).toUpperCase(),
      name:         r.name,
      securityType: r.secType,
      assetClass:   mapAssetClass(r.secType, r.name),
      sector:       mapSector(r.secType, r.name),
      region:       mapRegion(r.name, r.sym),
      currency:     r.currency,
      quantity:     r.qty,
      marketValue:  r.mv,
      weight:       r.weight ?? 0,
      costBasis:    r.costBasis,
      unrealizedGL: r.gl,
      returnPct,
      riskScore:    null,
    })
  }

  // Total: prefer grand-total row; fall back to sum of positions
  const sumMV    = positions.reduce((s, p) => s + p.marketValue, 0)
  const totalValue = grandTotal > 0 ? grandTotal : sumMV

  // Recalculate weights from real market values
  if (totalValue > 0) {
    for (const p of positions) {
      p.weight = parseFloat(((p.marketValue / totalValue) * 100).toFixed(4))
    }
  }

  if (!positions.length) warnings.push('No se encontraron posiciones en el archivo')

  return { meta, positions, totalValue, warnings }
}
