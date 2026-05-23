/**
 * Parse portfolio CSV / Excel files into a normalized list of positions.
 * Tries to be flexible with column names (multiple aliases per field).
 */

import * as XLSX from 'xlsx'

export interface RawPosition {
  raw_name:       string
  raw_identifier: string
  identifier_type: 'cusip' | 'isin' | 'ticker' | 'unknown'
  cusip?:  string
  isin?:   string
  ticker?: string
  quantity?:     number
  market_value?: number
  weight?:       number
}

// ─── Column name aliases ───────────────────────────────────────────────────────

const ALIASES: Record<string, string[]> = {
  name:         ['name','nombre','instrumento','instrument','description','descripcion','security','security name','asset','asset name','denominacion'],
  cusip:        ['cusip','id cusip','cusip id'],
  isin:         ['isin','id isin','isin code'],
  ticker:       ['ticker','symbol','simbolo','bbg ticker','bloomberg ticker','ric'],
  quantity:     ['quantity','cantidad','shares','units','unidades','nominales','nominal','qty','participaciones'],
  market_value: ['market value','valor de mercado','market val','mv','fair value','precio de mercado','mkt value','valor mercado','valor','value'],
  weight:       ['weight','peso','%','pct','% cartera','allocation','% portfolio','% weight','porcentaje'],
}

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/[_\-\.]/g, ' ')
}

function matchColumn(header: string): string | null {
  const h = normalize(header)
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (aliases.some(a => normalize(a) === h || h.includes(normalize(a)))) return field
  }
  return null
}

function parseNumber(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const s = String(v).replace(/[$,%\s]/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? undefined : n
}

/** Detect identifier type from a raw string */
function detectIdentifier(v: string): { type: 'cusip' | 'isin' | 'ticker' | 'unknown'; value: string } {
  const s = v.trim().toUpperCase()
  // ISIN: 2 letters + 10 alphanumeric
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(s)) return { type: 'isin', value: s }
  // CUSIP: 9 chars alphanumeric
  if (/^[A-Z0-9]{9}$/.test(s)) return { type: 'cusip', value: s }
  // Ticker: short alphabetic (1-6 chars)
  if (/^[A-Z]{1,6}$/.test(s)) return { type: 'ticker', value: s }
  return { type: 'unknown', value: s }
}

function rowsToPositions(headers: string[], rows: unknown[][]): RawPosition[] {
  // Map column index → field
  const colMap: Record<number, string> = {}
  headers.forEach((h, i) => {
    const field = matchColumn(h)
    if (field) colMap[i] = field
  })

  const positions: RawPosition[] = []

  for (const row of rows) {
    const get = (field: string): unknown => {
      const idx = Object.entries(colMap).find(([, f]) => f === field)?.[0]
      return idx !== undefined ? row[Number(idx)] : undefined
    }

    const name = String(get('name') ?? '').trim()
    if (!name || name.toLowerCase() === 'total' || name.toLowerCase() === 'subtotal') continue

    // Build position
    const cusip  = String(get('cusip')  ?? '').trim() || undefined
    const isin   = String(get('isin')   ?? '').trim() || undefined
    const ticker = String(get('ticker') ?? '').trim() || undefined

    // If no dedicated identifier columns, try to detect from name
    let raw_identifier = cusip ?? isin ?? ticker ?? ''
    let identifier_type: RawPosition['identifier_type'] = 'unknown'

    if (cusip)  { raw_identifier = cusip;  identifier_type = 'cusip'  }
    else if (isin)   { raw_identifier = isin;   identifier_type = 'isin'   }
    else if (ticker) { raw_identifier = ticker; identifier_type = 'ticker' }
    else {
      // Try detecting from name itself
      const detected = detectIdentifier(name)
      if (detected.type !== 'unknown') {
        raw_identifier  = detected.value
        identifier_type = detected.type
      } else {
        raw_identifier = name
      }
    }

    const quantity     = parseNumber(get('quantity'))
    const market_value = parseNumber(get('market_value'))
    let   weight       = parseNumber(get('weight'))

    // If weight > 1 assume it's already a percentage
    // If weight <= 1 convert to percentage
    if (weight !== undefined && weight <= 1) weight = weight * 100

    positions.push({
      raw_name:       name,
      raw_identifier,
      identifier_type,
      cusip:          cusip  || undefined,
      isin:           isin   || undefined,
      ticker:         ticker || undefined,
      quantity,
      market_value,
      weight,
    })
  }

  return positions
}

// ─── Recalculate weights if missing ───────────────────────────────────────────

function fillWeights(positions: RawPosition[]): RawPosition[] {
  const hasWeights = positions.some(p => p.weight != null)
  if (hasWeights) return positions

  const totalValue = positions.reduce((s, p) => s + (p.market_value ?? 0), 0)
  if (!totalValue) return positions

  return positions.map(p => ({
    ...p,
    weight: p.market_value != null ? (p.market_value / totalValue) * 100 : undefined,
  }))
}

// ─── Public parsers ───────────────────────────────────────────────────────────

export function parseCSV(text: string): RawPosition[] {
  // Detect delimiter
  const firstLine = text.split('\n')[0]
  const delimiter = firstLine.includes(';') ? ';' : ','

  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  if (lines.length < 2) return []

  const headers = lines[0].split(delimiter).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(line =>
    line.split(delimiter).map(cell => cell.replace(/^"|"$/g, '').trim())
  )

  return fillWeights(rowsToPositions(headers, rows))
}

export function parseExcel(buffer: ArrayBuffer): RawPosition[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  if (!data || data.length < 2) return []

  // Find the header row — first row with recognizable column names
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i] as unknown[]
    const recognized = row.filter(cell => matchColumn(String(cell))).length
    if (recognized >= 2) { headerRowIdx = i; break }
  }

  const headers = (data[headerRowIdx] as unknown[]).map(h => String(h))
  const rows    = (data.slice(headerRowIdx + 1) as unknown[][])

  return fillWeights(rowsToPositions(headers, rows))
}
