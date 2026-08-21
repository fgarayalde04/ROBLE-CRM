/**
 * Unrealized Gain/Loss parser — reads the "Unrealized Gain Loss_<CLIENT>.xlsx"
 * export (Pershing). Real Cost Basis / Gain-Loss per position — never
 * calculated or estimated by us.
 *
 * Sheet shape (verified against a real export):
 *   Row 0: "Unrealized Gain Loss"
 *   Row 1: "Client: <NAME>"
 *   ...metadata rows (Quote Type, As Of, Number of records, Net Unrealized
 *   Gain/loss, ST/LT gain/loss breakdown)
 *   (blank)
 *   Header row: Security Type | Security Identifier | Security Description |
 *     Account | Account Description | Gain/Loss | Gain/Loss % | Price Date |
 *     Current Total Cost | Market Value | ... | Quantity | Unit Cost | Cusip | ...
 *   Data rows — ONE PER TAX LOT, not one per position: the same security can
 *   appear several times (different purchase lots). We aggregate by Cusip
 *   (falls back to Security Identifier) into one row per security.
 */
import * as XLSX from 'xlsx'
import { parseNum, parseStr } from '@/lib/factsheet-parser'

export interface UnrealizedGainLossRow {
  cusip: string
  securityIdentifier: string | null
  description: string
  quantity: number | null
  costBasis: number
  marketValue: number
  gainLoss: number
  gainLossPct: number
}

export interface ParsedUnrealizedGainLoss {
  clientName: string | null
  asOfDate: string | null
  netGainLoss: number | null
  rows: UnrealizedGainLossRow[]
  warnings: string[]
}

const HEADER_ALIASES: Record<string, string[]> = {
  securityIdentifier: ['security identifier'],
  description:        ['security description'],
  gainLoss:           ['gain/loss'],
  costBasis:          ['current total cost'],
  marketValue:        ['market value'],
  quantity:           ['quantity'],
  cusip:              ['cusip'],
  tradeDate:          ['trade date'],
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

function extractClientName(metaLines: string[]): string | null {
  for (const line of metaLines) {
    const m = line.match(/^client\s*:?\s*(.+)/i)
    if (m) return m[1].trim()
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

function extractNetGainLoss(metaLines: string[]): number | null {
  for (const line of metaLines) {
    const m = line.match(/^net\s*unrealized\s*gain\/loss\s*:?\s*([\d,.\-]+)/i)
    if (m) return parseNum(m[1])
  }
  return null
}

export function parseUnrealizedGainLossExcel(buffer: ArrayBuffer): ParsedUnrealizedGainLoss {
  const warnings: string[] = []

  const wb  = XLSX.read(buffer, { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (!raw || raw.length < 3) {
    return { clientName: null, asOfDate: null, netGainLoss: null, rows: [], warnings: ['Archivo vacío o sin datos'] }
  }

  let headerIdx = -1
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const recognized = (raw[i] as unknown[]).filter(c => matchCol(String(c))).length
    if (recognized >= 5) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { clientName: null, asOfDate: null, netGainLoss: null, rows: [], warnings: ['No se encontró una fila de encabezados reconocible'] }
  }

  const metaLines = (raw.slice(0, headerIdx) as unknown[][]).map(r => r.map(c => String(c ?? '')).join(' ').trim()).filter(Boolean)
  const clientName  = extractClientName(metaLines)
  const asOfDate    = extractAsOfDate(metaLines)
  const netGainLoss = extractNetGainLoss(metaLines)

  if (!asOfDate) warnings.push('No se pudo detectar la fecha ("As Of") en el archivo')

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

  // Group tax-lot rows by security (Cusip). When a security has more than
  // one lot, the export already includes its own subtotal row (Trade Date =
  // "Multiple") — use that row alone rather than summing it together with
  // the individual lots underneath it, which would double-count.
  interface LotRow { securityIdentifier: string | null; description: string; quantity: number; costBasis: number; marketValue: number; gainLoss: number; isSubtotal: boolean }
  const lotsByCusip = new Map<string, LotRow[]>()

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const cusip = parseStr(get(row, 'cusip'))
    const description = parseStr(get(row, 'description'))
    if (!cusip || !description) continue

    const lot: LotRow = {
      securityIdentifier: parseStr(get(row, 'securityIdentifier')),
      description,
      quantity: parseNum(get(row, 'quantity')) ?? 0,
      costBasis: parseNum(get(row, 'costBasis')) ?? 0,
      marketValue: parseNum(get(row, 'marketValue')) ?? 0,
      gainLoss: parseNum(get(row, 'gainLoss')) ?? 0,
      isSubtotal: parseStr(get(row, 'tradeDate'))?.toLowerCase() === 'multiple',
    }
    const list = lotsByCusip.get(cusip)
    if (list) list.push(lot); else lotsByCusip.set(cusip, [lot])
  }

  const byCusip = new Map<string, { securityIdentifier: string | null; description: string; quantity: number; costBasis: number; marketValue: number; gainLoss: number }>()
  for (const [cusip, lots] of Array.from(lotsByCusip)) {
    const subtotal = lots.find(l => l.isSubtotal)
    const used = subtotal ? [subtotal] : lots
    byCusip.set(cusip, {
      securityIdentifier: used[0].securityIdentifier,
      description: used[0].description,
      quantity: used.reduce((s, l) => s + l.quantity, 0),
      costBasis: used.reduce((s, l) => s + l.costBasis, 0),
      marketValue: used.reduce((s, l) => s + l.marketValue, 0),
      gainLoss: used.reduce((s, l) => s + l.gainLoss, 0),
    })
  }

  const rows: UnrealizedGainLossRow[] = Array.from(byCusip.entries()).map(([cusip, agg]) => ({
    cusip,
    securityIdentifier: agg.securityIdentifier,
    description: agg.description,
    quantity: agg.quantity,
    costBasis: parseFloat(agg.costBasis.toFixed(2)),
    marketValue: parseFloat(agg.marketValue.toFixed(2)),
    gainLoss: parseFloat(agg.gainLoss.toFixed(2)),
    gainLossPct: agg.costBasis > 0 ? parseFloat(((agg.gainLoss / agg.costBasis) * 100).toFixed(2)) : 0,
  }))

  if (!rows.length) warnings.push('No se encontraron posiciones en el archivo')

  return { clientName, asOfDate, netGainLoss, rows, warnings }
}
