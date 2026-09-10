/**
 * Parser genérico del reporte de "Activity" / movimientos de cuenta
 * (Pershing / Morgan Stanley). Como el layout varía bastante entre
 * custodios, se detecta la fila de encabezados por contenido (una columna
 * de fecha + una de monto) y se mapean los nombres de columna más comunes.
 * Devuelve una lista plana de movimientos.
 */
import * as XLSX from 'xlsx'
import { parseDateStr, parseNum, parseStr } from '@/lib/factsheet-parser'

export interface ActivityRow {
  tradeDate:    string | null   // YYYY-MM-DD
  settleDate:   string | null
  activityType: string | null
  description:  string
  symbol:       string | null
  cusip:        string | null
  quantity:     number | null
  price:        number | null
  amount:       number | null
}

export interface ParsedActivity {
  accountNumber: string | null
  asOfDate:      string | null
  rows:          ActivityRow[]
  warnings:      string[]
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[()$/.,:]/g, ' ').replace(/\s+/g, ' ').trim()

const ALIASES: Record<keyof Omit<ActivityRow, never>, string[]> = {
  tradeDate:    ['trade date', 'date', 'activity date', 'transaction date', 'process date', 'entry date', 'as of date', 'posted date'],
  settleDate:   ['settlement date', 'settle date', 'settlement'],
  activityType: ['activity', 'activity type', 'transaction type', 'type', 'transaction', 'action'],
  description:  ['description', 'security description', 'details', 'activity description', 'name', 'transaction description', 'memo'],
  symbol:       ['symbol', 'ticker'],
  cusip:        ['cusip'],
  quantity:     ['quantity', 'shares', 'qty', 'units'],
  price:        ['price', 'unit price', 'trade price'],
  amount:       ['amount', 'net amount', 'transaction amount', 'net cash', 'value', 'credit debit', 'gross amount', 'total amount'],
}

function matchCol(header: string): keyof ActivityRow | null {
  const h = norm(header)
  for (const [field, names] of Object.entries(ALIASES)) {
    if (names.some(n => n === h)) return field as keyof ActivityRow
  }
  return null
}

export function parseActivityExcel(buffer: ArrayBuffer): ParsedActivity {
  const wb  = XLSX.read(buffer, { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }) as unknown[][]
  if (!raw || raw.length < 2) return { accountNumber: null, asOfDate: null, rows: [], warnings: ['Archivo vacío o sin datos'] }

  let headerIdx = -1
  for (let i = 0; i < Math.min(30, raw.length); i++) {
    const cols = (raw[i] as unknown[]).map(c => matchCol(String(c))).filter(Boolean)
    const hasDate = cols.includes('tradeDate') || cols.includes('settleDate')
    const hasAmount = cols.includes('amount')
    if (hasDate && hasAmount && cols.length >= 3) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { accountNumber: null, asOfDate: null, rows: [], warnings: ['No se encontró una fila de encabezados reconocible (se necesita una columna de fecha y una de monto)'] }
  }

  const headers = (raw[headerIdx] as unknown[]).map(h => String(h))
  const colIdx: Partial<Record<keyof ActivityRow, number>> = {}
  headers.forEach((h, i) => {
    const f = matchCol(h)
    if (f && colIdx[f] == null) colIdx[f] = i
  })
  const get = (row: unknown[], f: keyof ActivityRow) => (colIdx[f] != null ? row[colIdx[f]!] : undefined)

  // Meta de las filas previas al header.
  const metaLines = raw.slice(0, headerIdx).map(r => (r as unknown[]).map(c => String(c ?? '')).join(' ').trim()).filter(Boolean)
  let accountNumber: string | null = null
  for (const l of metaLines) {
    const m = l.match(/account\s*(?:number|#|:)?\s*[:#]?\s*([A-Za-z0-9-]{4,})/i)
    if (m) { accountNumber = m[1].replace(/-/g, '').toUpperCase(); break }
  }

  const rows: ActivityRow[] = []
  const dates: string[] = []
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const desc = parseStr(get(row, 'description'))
    const type = parseStr(get(row, 'activityType'))
    const td = parseDateStr(get(row, 'tradeDate'))
    const sd = parseDateStr(get(row, 'settleDate'))
    const amount = parseNum(get(row, 'amount'))
    // fin de datos: fila vacía o "total"/texto legal
    const firstCell = norm(row[0])
    if (!desc && !type && td == null && sd == null && amount == null) continue
    if (/^total\b|^grand total\b|^disclosure|^disclaimer/.test(firstCell)) break
    if (td == null && sd == null && amount == null) continue

    const d = td ?? sd
    if (d) dates.push(d)
    rows.push({
      tradeDate: td,
      settleDate: sd,
      activityType: type,
      description: desc ?? type ?? '—',
      symbol: (() => { const s = parseStr(get(row, 'symbol')); return s && s !== '-' ? s : null })(),
      cusip: (() => { const s = parseStr(get(row, 'cusip')); return s && s !== '-' ? s : null })(),
      quantity: parseNum(get(row, 'quantity')),
      price: parseNum(get(row, 'price')),
      amount,
    })
  }

  rows.sort((a, b) => (b.tradeDate ?? b.settleDate ?? '').localeCompare(a.tradeDate ?? a.settleDate ?? ''))
  const asOfDate = dates.length ? dates.sort().pop()! : null
  const warnings = rows.length === 0 ? ['No se encontraron movimientos en el archivo'] : []
  return { accountNumber, asOfDate, rows, warnings }
}
