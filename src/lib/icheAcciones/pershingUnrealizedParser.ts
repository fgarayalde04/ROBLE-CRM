/**
 * Parser dedicado del reporte "Unrealized Gain Loss" de Pershing usado para
 * Iche (hoja `ExportExcel`, headers en la fila 14: Settlement Date, Original
 * Quantity, Security Description, Original Total Cost, Quantity, Market
 * Value, Gain/Loss, Gain/Loss %, % of Portfolio, Trade Date, Cusip, Current
 * Total Cost, Asset Category, Unit Cost).
 *
 * NO reusar `src/lib/portfolio/unrealizedGainLossParser.ts`: ese parser está
 * hecho para otro reporte de Pershing ("Client: <nombre>" en vez de
 * "Account: <número>") cuya columna de costo es "Current Total Cost" — acá
 * hace falta específicamente "Original Total Cost" (costo de compra
 * original, no ajustado por wash sale) y "Asset Category" (para filtrar
 * solo acciones/ETFs), ninguna de las dos expuestas por ese parser.
 */
import * as XLSX from 'xlsx'

export interface PershingUnrealizedRow {
  cusip: string
  description: string
  quantity: number
  originalTotalCost: number
  marketValue: number
  unitCost: number
  assetCategory: string
  tradeDate: string | null // YYYY-MM-DD; null cuando el lote es "Multiple"
}

export interface ParsedPershingUnrealized {
  accountNumber: string | null
  rows: PershingUnrealizedRow[]
  warnings: string[]
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

const HEADERS: Record<string, string> = {
  'security description': 'description',
  'original total cost': 'originalTotalCost',
  quantity: 'quantity',
  'market value': 'marketValue',
  'trade date': 'tradeDate',
  cusip: 'cusip',
  'asset category': 'assetCategory',
  'unit cost': 'unitCost',
}

function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isNaN(n) ? null : n
}

function parseDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (/^multiple$/i.test(s)) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function parsePershingUnrealizedExcel(buffer: ArrayBuffer): ParsedPershingUnrealized {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames.includes('ExportExcel') ? 'ExportExcel' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (!raw || raw.length < 15) {
    return { accountNumber: null, rows: [], warnings: ['Archivo vacío o con muy pocas filas'] }
  }

  let accountNumber: string | null = null
  for (const line of raw.slice(0, 14)) {
    const text = (line as unknown[]).map(c => String(c ?? '')).join(' ')
    const m = text.match(/account\s*:?\s*([A-Za-z0-9]+)/i)
    if (m) { accountNumber = m[1].toUpperCase(); break }
  }

  let headerIdx = -1
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const matched = (raw[i] as unknown[]).filter(c => HEADERS[norm(c)]).length
    if (matched >= 5) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { accountNumber, rows: [], warnings: ['No se encontró la fila de encabezados (Security Description / Original Total Cost / Asset Category)'] }
  }

  const headers = (raw[headerIdx] as unknown[]).map(h => String(h))
  const colIdx: Partial<Record<string, number>> = {}
  headers.forEach((h, i) => {
    const field = HEADERS[norm(h)]
    if (field && colIdx[field] == null) colIdx[field] = i
  })
  const get = (row: unknown[], field: string) => (colIdx[field] != null ? row[colIdx[field]!] : undefined)

  interface LotRow { description: string; quantity: number; originalTotalCost: number; marketValue: number; unitCost: number | null; assetCategory: string; tradeDate: string | null; isSubtotal: boolean }
  const lotsByCusip = new Map<string, LotRow[]>()

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const cusip = String(get(row, 'cusip') ?? '').trim()
    const description = String(get(row, 'description') ?? '').trim()
    if (!cusip || !description) continue

    const tradeDateRaw = get(row, 'tradeDate')
    const lot: LotRow = {
      description,
      quantity: parseNum(get(row, 'quantity')) ?? 0,
      originalTotalCost: parseNum(get(row, 'originalTotalCost')) ?? 0,
      marketValue: parseNum(get(row, 'marketValue')) ?? 0,
      unitCost: parseNum(get(row, 'unitCost')),
      assetCategory: String(get(row, 'assetCategory') ?? '').trim(),
      tradeDate: parseDate(tradeDateRaw),
      isSubtotal: /^multiple$/i.test(String(tradeDateRaw ?? '').trim()),
    }
    const list = lotsByCusip.get(cusip)
    if (list) list.push(lot); else lotsByCusip.set(cusip, [lot])
  }

  const rows: PershingUnrealizedRow[] = []
  for (const [cusip, lots] of Array.from(lotsByCusip)) {
    // Igual criterio que los parsers ya existentes: si hay una fila
    // subtotal ("Multiple"), es la que representa el total real — sumar
    // también las de abajo duplicaría cantidad/costo.
    const subtotal = lots.find(l => l.isSubtotal)
    const used = subtotal ? [subtotal] : lots
    const quantity = used.reduce((s, l) => s + l.quantity, 0)
    const originalTotalCost = used.reduce((s, l) => s + l.originalTotalCost, 0)
    const marketValue = used.reduce((s, l) => s + l.marketValue, 0)
    rows.push({
      cusip,
      description: used[0].description,
      quantity,
      originalTotalCost: parseFloat(originalTotalCost.toFixed(4)),
      marketValue: parseFloat(marketValue.toFixed(2)),
      unitCost: quantity > 0 ? parseFloat((originalTotalCost / quantity).toFixed(4)) : 0,
      assetCategory: used[0].assetCategory,
      tradeDate: used[0].tradeDate,
    })
  }

  const warnings: string[] = []
  if (!rows.length) warnings.push('No se encontraron posiciones en el archivo')

  return { accountNumber, rows, warnings }
}
