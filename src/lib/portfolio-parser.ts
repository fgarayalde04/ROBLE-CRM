/**
 * Parse portfolio CSV / Excel files into a normalized list of positions.
 * Tries to be flexible with column names (multiple aliases per field).
 */

import * as XLSX from 'xlsx'

// ─── Client metadata extracted from document header rows ──────────────────────

export interface ClientMeta {
  client_name?:   string
  client_number?: string
  account?:       string
  date?:          string
}

/**
 * Scan the first ~15 rows of a sheet looking for client name / account number.
 * Typical patterns:  "Cliente: APELLIDO, Nombre"
 *                    "Nombre del cliente: ..."
 *                    "Account: 12345"
 *                    "Cuenta: ..."
 */
const CLIENT_NAME_LABELS = [
  'cliente', 'client', 'nombre', 'name', 'titular', 'holder',
  'cuenta a nombre de', 'account name', 'investor', 'inversor',
]
const CLIENT_NUMBER_LABELS = [
  'cuenta', 'account', 'n° cliente', 'numero de cliente', 'client number',
  'account number', 'n° cuenta', 'numero cuenta', 'codigo', 'code',
]
const DATE_LABELS = [
  'fecha', 'date', 'al', 'as of', 'periodo', 'period',
]

function extractMetaFromRows(rows: unknown[][]): ClientMeta {
  const meta: ClientMeta = {}
  const scanRows = rows.slice(0, 20)

  for (const row of scanRows) {
    for (let i = 0; i < row.length - 1; i++) {
      const cell  = String(row[i] ?? '').toLowerCase().trim().replace(/[:\s]+$/, '')
      const value = String(row[i + 1] ?? '').trim()
      if (!value || value.length < 2) continue

      if (!meta.client_name && CLIENT_NAME_LABELS.some(l => cell.includes(l))) {
        meta.client_name = value
      }
      if (!meta.client_number && CLIENT_NUMBER_LABELS.some(l => cell.includes(l))) {
        meta.client_number = value
      }
      if (!meta.date && DATE_LABELS.some(l => cell === l || cell.startsWith(l))) {
        meta.date = value
      }
    }

    // Also check for patterns like "Cliente: SMITH, John" in a single cell
    for (const cell of row) {
      const s = String(cell ?? '').trim()
      if (!meta.client_name) {
        const m = s.match(/^(?:cliente|client|titular|nombre)[:\s]+(.+)/i)
        if (m && m[1].trim().length > 2) meta.client_name = m[1].trim()
      }
      if (!meta.client_number) {
        const m = s.match(/^(?:cuenta|account|n[°º]?\s*cliente|client\s*number)[:\s#]+(.+)/i)
        if (m && m[1].trim().length > 1) meta.client_number = m[1].trim()
      }
    }

    if (meta.client_name && meta.client_number) break
  }

  return meta
}

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

export interface ParseResult {
  positions: RawPosition[]
  meta:      ClientMeta
}

export function parseCSV(text: string): ParseResult {
  const firstLine = text.split('\n')[0]
  const delimiter = firstLine.includes(';') ? ';' : ','

  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  if (lines.length < 2) return { positions: [], meta: {} }

  const allRows = lines.map(line =>
    line.split(delimiter).map(cell => cell.replace(/^"|"$/g, '').trim())
  )

  // Find the header row (first row with ≥2 recognizable columns)
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(15, allRows.length); i++) {
    if (allRows[i].filter(c => matchColumn(c)).length >= 2) { headerRowIdx = i; break }
  }

  const meta     = extractMetaFromRows(allRows.slice(0, headerRowIdx))
  const headers  = allRows[headerRowIdx]
  const dataRows = allRows.slice(headerRowIdx + 1)

  return { positions: fillWeights(rowsToPositions(headers, dataRows)), meta }
}

export function parseExcel(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  if (!data || data.length < 2) return { positions: [], meta: {} }

  // Find the header row — first row with recognizable column names
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i] as unknown[]
    const recognized = row.filter(cell => matchColumn(String(cell))).length
    if (recognized >= 2) { headerRowIdx = i; break }
  }

  // Scan pre-header rows for client metadata
  const meta    = extractMetaFromRows((data.slice(0, headerRowIdx) as unknown[][]))
  const headers = (data[headerRowIdx] as unknown[]).map(h => String(h))
  const rows    = (data.slice(headerRowIdx + 1) as unknown[][])

  return { positions: fillWeights(rowsToPositions(headers, rows)), meta }
}
