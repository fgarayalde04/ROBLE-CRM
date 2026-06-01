/**
 * Parse portfolio CSV / Excel files into a normalized list of positions.
 * Tries to be flexible with column names (multiple aliases per field).
 */

import * as XLSX from 'xlsx'

// ─── Client metadata extracted from document header rows ──────────────────────

export interface ClientMeta {
  client_name?:      string   // primary display name (= primary_holder if detected)
  primary_holder?:   string   // first account holder (detected from top-left zone)
  secondary_holder?: string   // second holder for joint accounts
  client_number?:    string
  account?:          string
  date?:             string
  advisor?:          string
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
  // ── Security Type from file column (e.g. 'Corporate Bond', 'Common Stock') ─
  // Used as a classification fallback when OpenFIGI returns no result.
  security_type?: string
  // ── Asset type from PDF section header (e.g. 'Corporate Bonds', 'Equities') ─
  pdf_asset_type?: string
  // ── Auto-classification override (set by Cash/MMF section parser) ─────────
  forced_risk_score?:  number
  forced_asset_class?: string
  forced_category?:    string
}

// ─── Column name aliases ───────────────────────────────────────────────────────

const ALIASES: Record<string, string[]> = {
  // security_identifier BEFORE name — prevents "Security Identifier" matching as name
  security_identifier: [
    'security identifier', 'security id', 'sec id', 'sec. id',
    'sec identifier', 'securityidentifier',
  ],
  // security_type BEFORE name — prevents "Security Type" matching as name
  security_type: [
    'security type', 'sec type', 'asset type', 'instrument type',
    'tipo activo', 'tipo instrumento', 'tipo',
  ],
  name: [
    'name', 'nombre', 'instrumento', 'instrument',
    'description', 'descripcion',
    'security description', 'sec description', 'sec desc',  // Pershing "Security Description"
    'security name', 'asset', 'asset name', 'denominacion',
  ],
  cusip:        ['cusip', 'id cusip', 'cusip id'],
  isin:         ['isin', 'id isin', 'isin code'],
  // 'symbol' = Pershing ticker column
  ticker:       ['ticker', 'symbol', 'simbolo', 'bbg ticker', 'bloomberg ticker'],
  quantity:     ['quantity', 'cantidad', 'shares', 'units', 'unidades', 'nominales', 'nominal', 'qty', 'participaciones'],
  market_value: ['market value', 'valor de mercado', 'market val', 'mv', 'fair value', 'precio de mercado', 'mkt value', 'valor mercado', 'valor', 'value'],
  // '% of Portfolio' is the exact Pershing/Insigneo Excel column name
  weight:       ['weight', 'peso', '% of portfolio', '% of port', 'pct of portfolio', '% cartera', 'allocation', '% portfolio', '% weight', 'porcentaje', 'pct'],
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

    // ── Identifier resolution (priority order) ────────────────────────────────
    // 1. Dedicated 'Security Identifier' column (Pershing/Insigneo Excel format)
    // 2. Explicit CUSIP / ISIN / ticker columns
    // 3. Auto-detect from name cell as last resort
    const secIdRaw = String(get('security_identifier') ?? '').trim()
    let cusip  = String(get('cusip')  ?? '').trim() || undefined
    let isin   = String(get('isin')   ?? '').trim() || undefined
    let ticker = String(get('ticker') ?? '').trim() || undefined

    let raw_identifier: string
    let identifier_type: RawPosition['identifier_type']

    if (secIdRaw) {
      // Detect the type from the value's format
      const detected = detectIdentifier(secIdRaw)
      raw_identifier  = detected.value
      identifier_type = detected.type
      // Populate the typed fields so downstream code (OpenFIGI) can use them
      if (detected.type === 'cusip')       cusip  = detected.value
      else if (detected.type === 'isin')   isin   = detected.value
      else if (detected.type === 'ticker') ticker = detected.value
    } else if (cusip)  { raw_identifier = cusip;  identifier_type = 'cusip'  }
    else if (isin)     { raw_identifier = isin;   identifier_type = 'isin'   }
    else if (ticker)   { raw_identifier = ticker; identifier_type = 'ticker' }
    else {
      // Last resort: try detecting from the name cell
      const detected = detectIdentifier(name)
      if (detected.type !== 'unknown') {
        raw_identifier  = detected.value
        identifier_type = detected.type
      } else {
        raw_identifier  = name
        identifier_type = 'unknown'
      }
    }

    const quantity     = parseNumber(get('quantity'))
    const market_value = parseNumber(get('market_value'))
    const weight       = parseNumber(get('weight'))

    // Security Type column — raw string kept for fallback classification
    const security_type = String(get('security_type') ?? '').trim() || undefined

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
      security_type,
    })
  }

  return positions
}

// ─── Normalize weight format (decimal vs percentage) ─────────────────────────
// The '% of Portfolio' column may arrive as:
//   • Already-percentage values: 5.2, 12.3, 0.8  (sum ≈ 100) → use as-is
//   • Decimal fractions:         0.052, 0.123     (sum ≈ 1.0) → multiply by 100
// We check the SUM of all weights to decide — never per-row (avoids converting
// small positions like 0.5% into 50%).

function normalizeWeightFormat(positions: RawPosition[]): RawPosition[] {
  const withWeight = positions.filter(p => (p.weight ?? 0) > 0)
  if (!withWeight.length) return positions

  const sum = withWeight.reduce((s, p) => s + (p.weight ?? 0), 0)

  // Sum ≈ 1 → decimal format (e.g. 0.052) → convert to percentage
  if (sum >= 0.5 && sum <= 1.5) {
    return positions.map(p =>
      p.weight != null ? { ...p, weight: Math.round(p.weight * 10000) / 100 } : p,
    )
  }

  // Sum ≈ 100 → already in percentage → use as-is
  return positions
}

// ─── Fill missing weights from market_value ───────────────────────────────────
// Per spec: if % of Portfolio is empty for a position that has Market Value,
// calculate weight = Market Value / total portfolio value.
// This runs even when OTHER positions already have weights.

function fillWeights(positions: RawPosition[]): RawPosition[] {
  const totalMV = positions.reduce((s, p) => s + (p.market_value ?? 0), 0)
  if (!totalMV) return positions

  return positions.map(p => {
    if ((p.weight ?? 0) > 0) return p          // already has a valid weight
    if ((p.market_value ?? 0) <= 0) return p   // no market value to derive from
    return { ...p, weight: (p.market_value! / totalMV) * 100 }
  })
}

// ─── Deduplicate positions by Security Identifier ─────────────────────────────
// If the same identifier appears more than once (e.g. from hidden/duplicate rows),
// consolidate into a single position by summing market_value, weight, and quantity.

function deduplicatePositions(positions: RawPosition[]): RawPosition[] {
  const map = new Map<string, RawPosition>()

  for (const p of positions) {
    const key = p.raw_identifier
    if (!map.has(key)) {
      map.set(key, { ...p })
    } else {
      const ex = map.get(key)!
      if (p.market_value != null) ex.market_value = (ex.market_value ?? 0) + p.market_value
      if (p.weight       != null) ex.weight        = (ex.weight       ?? 0) + p.weight
      if (p.quantity     != null) ex.quantity       = (ex.quantity     ?? 0) + p.quantity
    }
  }

  return Array.from(map.values())
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

  const positions = deduplicatePositions(normalizeWeightFormat(rowsToPositions(headers, dataRows)))
  return { positions: fillWeights(positions), meta }
}

export function parseExcel(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]

  // ── Filter out hidden columns ─────────────────────────────────────────────
  // xlsx stores column visibility in ws['!cols']. An entry with hidden:true
  // means that column is not visible in the spreadsheet and should be skipped.
  type ColInfo = { hidden?: boolean; width?: number } | null | undefined
  const colInfos = (ws['!cols'] ?? []) as ColInfo[]
  const isVisible = (ci: number): boolean => !colInfos[ci]?.hidden

  const allData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  if (!allData || allData.length < 2) return { positions: [], meta: {} }

  // Determine max number of columns across all rows
  const maxCols = Math.max(...allData.map(row => (row as unknown[]).length))
  // Visible column indices
  const visibleIdxs = Array.from({ length: maxCols }, (_, i) => i).filter(isVisible)

  // Remap every row to only visible columns
  const data = allData.map(row =>
    visibleIdxs.map(ci => (row as unknown[])[ci] ?? ''),
  )

  // Find the header row — first row with ≥2 recognizable column names
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const recognized = (data[i] as unknown[]).filter(cell => matchColumn(String(cell))).length
    if (recognized >= 2) { headerRowIdx = i; break }
  }

  const meta    = extractMetaFromRows(data.slice(0, headerRowIdx) as unknown[][])
  const headers = (data[headerRowIdx] as unknown[]).map(h => String(h))
  const rows    = data.slice(headerRowIdx + 1) as unknown[][]

  const positions = deduplicatePositions(normalizeWeightFormat(rowsToPositions(headers, rows)))
  return { positions: fillWeights(positions), meta }
}

// ─── PDF parser ───────────────────────────────────────────────────────────────

/**
 * Address-line detector — covers US, Spanish, and Uruguayan formats.
 *
 * Pershing / Insigneo statements for Uruguayan clients use:
 *   RBLA. GRAL. ARTIGAS  (Rambla General Artigas)
 *   EDIFICIO VARADERO AP. 104
 * which are NOT in standard US address dictionaries.
 */
const ADDRESS_STOP_RE = /\b(APT\.?|APTO\.?|AP\s|AP\.\s|APTDO\.?|PISO|SUITE|STE\.?|FLOOR|FL\.|PO\s*BOX|P\.O\.|STREET|ST\.|AVENUE|AVE\.?|ROAD|RD\.?|BOULEVARD|BLVD|DRIVE|DR\.|LANE|LN\.|CALLE|AVENIDA|BULEVAR|BLVR|RUTA|RBLA\.?|RAMBLA|EDIFICIO|PASAJE|APTAMENTO|DEPARTAMENTO)\b/i

// Words that indicate a company/institutional line, not a person
const COMPANY_WORDS_RE = /\b(LLC|INC\.?|CORP\.?|LTD\.?|SECURITIES|CAPITAL|FINANCIAL|BANK|TRUST|INVESTMENTS?|ADVISORS?|BROKERS?|PARTNERS?|GROUP|HOLDINGS?|FUND|MANAGEMENT|SERVICES?|WEALTH)\b/i

// Words that appear in financial table headers — not person names
const FINANCIAL_TERMS_RE = /\b(BEGINNING|ENDING|NET\s+CHANGE|PORTFOLIO\s+AT|ASSET\s+SUMMARY|ACCOUNT\s+VALUE|ESTIMATED\s+ANNUAL|ACCRUED|GAIN\/LOSS|UNREALIZED|REALIZED|BROKERAGE|STATEMENT)\b/i

// Lines to always skip when looking for person names (legal/account designations)
const NAME_SKIP_RE = /^(page|statement|account|period|date|from|dear|to:|re:|jt\s*ten|jtwros|tod\b|transfer\s+on|opening|closing|your\s+investment|investment\s+professional|pershing|insigneo|bnymell|bny\s*mellon|clearing|member\s+finra|finra|sipc|rated\s+excellent)/i

/**
 * Returns true if the line looks like a person name:
 * – All uppercase letters (with accents), spaces, hyphens, dots
 * – No digits
 * – At least 2 words
 * – Not a company, address, financial-term, or known-header line
 * – Pershing prints client names in ALL-CAPS
 */
function isLikelyPersonName(line: string): boolean {
  const t = line.trim()
  if (t.length < 4) return false
  if (/\d/.test(t)) return false                    // digits → not a name
  if (ADDRESS_STOP_RE.test(t)) return false         // address keyword
  if (COMPANY_WORDS_RE.test(t)) return false        // company / institution
  if (NAME_SKIP_RE.test(t)) return false            // known non-name header
  if (FINANCIAL_TERMS_RE.test(t)) return false      // financial table header
  // Only allow uppercase letters, spaces, hyphens, apostrophes, dots
  if (!/^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s'\.\-]+$/i.test(t)) return false
  if (t !== t.toUpperCase()) return false            // must be ALL-CAPS
  const words = t.split(/\s+/).filter(Boolean)
  return words.length >= 2
}

/**
 * Extract primary and secondary account holder names from the document header zone.
 *
 * Pershing / Insigneo statements place the client name(s) in the top-left:
 *
 *   MARTIN FERRES                    ← primary holder
 *   MARIA DELIA FERRES DELLE PIANE  ← secondary holder (joint account)
 *   JT TEN                           ← legal designation (skip)
 *   RBLA. GRAL. ARTIGAS              ← client address (stop marker)
 *   EDIFICIO VARADERO AP. 104
 *
 * IMPORTANT: The Insigneo company address ("1221 Brickell Avenue...") also
 * contains address keywords and appears BEFORE the client name.  We cannot
 * use the first address line as a "stop boundary" — we'd cut off too early.
 *
 * IMPORTANT: The advisor name (e.g. "FRANCISCO GARAYALDE") appears after the
 * "Your Investment Professional" label and must NOT be treated as a holder.
 * Pass knownAdvisor to exclude it explicitly.
 *
 * Algorithm:
 *   For each ALL-CAPS name-like line found in the first 120 lines, scan the
 *   next ~12 lines looking for an address line.  The first name whose forward
 *   window contains an address is the primary holder; any second name-like
 *   line found before the address is the secondary holder.
 */
function extractHoldersFromHeader(
  lines: string[],
  knownAdvisor?: string,
): { primary?: string; secondary?: string } {
  const header = lines.slice(0, 120)   // wider zone — some PDFs have long headers
  const advisorUpper = knownAdvisor?.trim().toUpperCase()

  // Build an index of all name-like lines in the header zone,
  // excluding the advisor name and names that follow advisor labels.
  const nameLocs: Array<{ t: string; i: number }> = []
  for (let i = 0; i < header.length; i++) {
    const t = header[i].trim()
    if (!isLikelyPersonName(t)) continue
    // Exclude known advisor
    if (advisorUpper && t.toUpperCase() === advisorUpper) continue
    // Exclude names that immediately follow an advisor / professional label
    const prev = i > 0 ? header[i - 1].trim() : ''
    if (/investment\s+professional|your\s+investment|asesor\b|advisor\b/i.test(prev)) continue
    nameLocs.push({ t, i })
  }

  if (!nameLocs.length) return {}

  // For each candidate, scan forward ~12 lines looking for an address.
  // The first confirmed cluster (name → optional second name → address) wins.
  for (const { t: first, i: startIdx } of nameLocs) {
    const holders = [first]

    for (let j = startIdx + 1; j < Math.min(startIdx + 12, header.length); j++) {
      const t = header[j].trim()
      if (!t) continue

      // Second name line within the cluster
      if (isLikelyPersonName(t) && holders.length < 2) {
        holders.push(t)
        continue
      }

      // Legal designation between names (JT TEN, JTWROS, TOD…) → skip
      if (NAME_SKIP_RE.test(t)) continue

      // Address line → confirms this is the client block
      if (ADDRESS_STOP_RE.test(t)) {
        return { primary: holders[0], secondary: holders[1] }
      }

      // Any other non-name line (dates, amounts, column headers) → keep scanning
      // but don't break — addresses may arrive a few lines later in interleaved PDFs
    }
    // No address found within 12 lines after this name → not the client block
    // (e.g. advisor name "FRANCISCO GARAYALDE" is followed by portfolio data)
    // Try the next candidate.
  }

  // Fallback: no address confirmation found anywhere.
  // Return the first 1–2 name-like lines as a best-effort guess.
  const fb = nameLocs.slice(0, 2)
  return { primary: fb[0]?.t, secondary: fb[1]?.t }
}

function extractMetaFromTextLines(lines: string[]): ClientMeta {
  const meta: ClientMeta = {}

  // ── Pass 0: advisor name detection ────────────────────────────────────────
  // Pershing puts "Your Investment Professional" on one line and the name on
  // the NEXT line.  Detect this first so we can exclude the advisor name from
  // the client holder detection below.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Inline: "Investment Professional: JOHN DOE"
    const inline = line.match(/(?:your\s+investment\s+professional|investment\s+professional|asesor|advisor)[:\s]+(.+)/i)
    if (inline && inline[1].trim().length > 2) {
      meta.advisor = inline[1].trim()
      break
    }
    // Next-line: label on this line, name on next
    if (/your\s+investment\s+professional|investment\s+professional/i.test(line)) {
      const next = lines[i + 1]?.trim() ?? ''
      if (next.length > 2 && /^[A-ZÁÉÍÓÚÜÑ\s'\.\-]+$/i.test(next)) {
        meta.advisor = next
      }
      break
    }
  }

  // ── Pass 1: label-based matching (generic labeled formats) ────────────────
  for (const line of lines) {
    if (!meta.client_name) {
      const m = line.match(/(?:cliente|client|titular|nombre|account\s*name)[:\s]+(.+)/i)
      if (m) meta.client_name = m[1].trim().replace(/[,;]\s*$/, '')
    }
    if (!meta.client_number) {
      const m = line.match(/(?:cuenta|account|n[°º.]?\s*cliente|client\s*(?:number|no\.?)|account\s*(?:number|no\.?))[:\s#.]+(\S+)/i)
      if (m) meta.client_number = m[1].trim()
    }
    if (!meta.date) {
      const m = line.match(/(?:fecha|date|al|as\s*of|period)[:\s]+(.+)/i)
      if (m) meta.date = m[1].trim()
    }
    if (meta.client_name && meta.client_number && meta.date) break
  }

  // ── Pass 2: Pershing / Insigneo top-left zone detection ───────────────────
  // If no labeled client_name was found, extract holder names from the header zone.
  // This is the PRIMARY method for Pershing statements where names appear in
  // ALL-CAPS in the top-left before the address, with no "Client:" label.
  if (!meta.client_name) {
    const { primary, secondary } = extractHoldersFromHeader(lines, meta.advisor)
    if (primary) {
      meta.primary_holder   = primary
      meta.secondary_holder = secondary
      meta.client_name      = primary   // primary holder is the canonical name
    }
  } else if (!meta.primary_holder) {
    // Label-based match found — still try zone detection for secondary holder
    const { primary, secondary } = extractHoldersFromHeader(lines, meta.advisor)
    if (primary) {
      meta.primary_holder   = primary
      meta.secondary_holder = secondary
    }
  }

  return meta
}

// ─── Generic ISIN/CUSIP fallback scanner ──────────────────────────────────────

const ISIN_RE  = /\b([A-Z]{2}[A-Z0-9]{10})\b/
const NUM_RE   = /\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\b/g

function extractPositionsFromPDFLines(lines: string[]): RawPosition[] {
  const positions: RawPosition[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isinMatch = line.match(ISIN_RE)
    if (!isinMatch) continue

    const identifier = isinMatch[1]
    if (seen.has(identifier)) continue
    seen.add(identifier)

    let name = line.substring(0, isinMatch.index!).trim().replace(/\s+/g, ' ')
    if (name.length < 3 && i > 0 && !/^\s*\d/.test(lines[i - 1])) name = lines[i - 1].trim()
    if (!name) name = identifier

    const searchText = line + ' ' + (lines[i + 1] ?? '')
    const nums: number[] = []
    NUM_RE.lastIndex = 0
    let numMatch: RegExpExecArray | null
    while ((numMatch = NUM_RE.exec(searchText)) !== null) {
      const n = parseNumber(numMatch[1])
      if (n != null && n > 0) nums.push(n)
    }

    let market_value: number | undefined
    let weight: number | undefined
    let quantity: number | undefined
    if (nums.length > 0) {
      const sorted = [...nums].sort((a, b) => b - a)
      market_value = sorted[0]
      const pcts = nums.filter(n => n > 0 && n <= 100 && n !== market_value)
      if (pcts.length > 0) weight = Math.min(...pcts)
      const qtys = nums.filter(n => n !== market_value && n !== weight)
      if (qtys.length > 0) quantity = qtys[0]
    }

    positions.push({ raw_name: name, raw_identifier: identifier, identifier_type: 'isin', isin: identifier, quantity, market_value, weight })
  }

  return positions
}

// ─── Cash / Money Market section parser ──────────────────────────────────────

/**
 * Parses the "Cash, Money Funds and Bank Deposits" section of a Pershing statement.
 *
 * This section appears on a dedicated page and lists money-market / sweep funds
 * with Opening Balance and Closing Balance per fund, followed by a section total.
 *
 * All positions extracted here get forced_risk_score=1 automatically — no
 * OpenFIGI or CUSIP lookup required.
 *
 * Returns positions (without weights — caller merges with other positions before
 * weight calculation so that cash is included in the portfolio total).
 */
function extractCashMMFSection(lines: string[]): RawPosition[] {
  // Section header variants
  const SECTION_START_RE  = /cash[,\s]+(money\s+funds?\s+and\s+bank\s+deposits?|money\s+fund)/i
  const NEXT_SECTION_RE   = /^(portfolio\s+holdings|fixed\s+income|equit|mutual\s+fund|annuiti|account\s+summary|performance\s+summary|important\s+information|page\s+\d)/i
  const CLOSING_BAL_RE    = /closing\s+balance/i
  const OPENING_BAL_RE    = /opening\s+balance/i
  const TOTAL_SECTION_RE  = /total\s+cash[,\s]+(money|bank)/i
  const COLUMN_HEADER_RE  = /\b(quantity|shares|interest|yield|rate|maturity)\b/i
  // Sweep / cash-balance alternative labels (single-line value)
  const CASH_LABEL_RE     = /\b(cash\s+balance|sweep|liquidity\s+fund|bank\s+deposit|fdic)/i

  const startIdx = lines.findIndex(l => SECTION_START_RE.test(l))
  if (startIdx === -1) return []

  // Scan up to next major section or 150 lines
  let endIdx = lines.findIndex((l, i) => i > startIdx + 3 && NEXT_SECTION_RE.test(l))
  if (endIdx === -1) endIdx = Math.min(startIdx + 150, lines.length)

  const cashLines = lines.slice(startIdx + 1, endIdx)
  const positions: RawPosition[] = []
  const seen      = new Set<string>()

  let currentName: string[] = []
  let awaitingClosing        = false   // we saw Closing Balance keyword, value on next line

  const pushCashPosition = (name: string, mv: number) => {
    const safeId = 'CASH_' + name.replace(/[^A-Z0-9]/gi, '_').toUpperCase().substring(0, 24)
    if (seen.has(safeId) || mv <= 0) return
    seen.add(safeId)
    positions.push({
      raw_name:            name || 'Cash / Money Market',
      raw_identifier:      safeId,
      identifier_type:     'unknown',
      market_value:        mv,
      forced_risk_score:   1,
      forced_asset_class:  'cash',
      forced_category:     'Money Market / Liquidez',
    })
  }

  for (let i = 0; i < cashLines.length; i++) {
    const line    = cashLines[i].trim()
    if (!line) { awaitingClosing = false; continue }

    // ── Stop at section total ──────────────────────────────────────────────
    if (TOTAL_SECTION_RE.test(line)) {
      if (positions.length === 0) {
        // No individual entries parsed yet → use section total as single position
        const combined   = cashLines.slice(i, i + 5).join(' ')
        const totalMatch = combined.match(/\$?([\d,]+\.\d{2})/)
        if (totalMatch) {
          const mv = parseNumber(totalMatch[1])
          if (mv) pushCashPosition('Cash / Money Market', mv)
        }
      }
      break
    }

    // ── Handle "Closing Balance" keyword ──────────────────────────────────
    if (CLOSING_BAL_RE.test(line)) {
      // Value might be inline: "Closing Balance  $1,234.56" or "Closing Balance1,234.56"
      const inline = line.replace(/closing\s+balance/i, '').replace(/[$,]/g, '').trim()
      const inlineVal = parseFloat(inline)
      if (!isNaN(inlineVal) && inlineVal > 0 && currentName.length > 0) {
        pushCashPosition(currentName.join(' '), inlineVal)
        currentName = []; awaitingClosing = false
      } else {
        awaitingClosing = true   // value expected on a following line
      }
      continue
    }

    // ── Value line while awaiting closing balance ──────────────────────────
    if (awaitingClosing) {
      const dollarMatch = line.match(/^\$?([\d,]+\.\d{2})$/)
      if (dollarMatch && currentName.length > 0) {
        const mv = parseNumber(dollarMatch[1])
        if (mv) pushCashPosition(currentName.join(' '), mv)
        currentName = []; awaitingClosing = false
        continue
      }
      // If the line is not a value, keep waiting (might have blank lines between)
      if (line && !/^[\d$,.]/.test(line)) awaitingClosing = false
    }

    // ── Skip opening balance, column headers ──────────────────────────────
    if (OPENING_BAL_RE.test(line)) continue
    if (COLUMN_HEADER_RE.test(line) && line.split(/\s+/).length >= 3) continue

    // ── Cash Balance / Sweep single-line entries ───────────────────────────
    // Pattern: "CASH BALANCE   $1,234.56"  or "SWEEP ACCOUNT   1,234.56"
    if (CASH_LABEL_RE.test(line)) {
      const valMatch = line.match(/\$?([\d,]+\.\d{2})/)
      if (valMatch) {
        const mv = parseNumber(valMatch[1])
        const name = line.replace(/\$[\d,]+\.\d{2}/, '').replace(/[$,]/g, '').trim()
        if (mv) pushCashPosition(name || 'Cash Balance', mv)
        currentName = []
        continue
      }
    }

    // ── Pure dollar / number line — skip unless awaiting (handled above) ──
    if (/^\$?[\d,]+\.?\d*$/.test(line)) continue

    // ── Fund name accumulation ─────────────────────────────────────────────
    // A non-numeric, non-header line inside the cash section is a fund name
    if (
      !/^\d{2}\/\d{2}\/\d{2}/.test(line) &&  // not a date
      !/^(page|account\s+number|statement|period|date)/i.test(line)
    ) {
      // Starting a new fund: flush previous if somehow we have a stale name
      if (currentName.length > 0 && awaitingClosing === false) {
        // Previous name had no closing balance — reset
        currentName = []
      }
      currentName.push(line)
    }
  }

  return positions
}

// ─── Pershing / BNY Mellon statement parser ───────────────────────────────────

// Asset-type block headers — these delimit sections in Portfolio Holdings
const ASSET_TYPE_RE = /^(Corporate\s+Bonds?|Municipal\s+Bonds?|Government\s+(?:Bonds?|Securities)?|Fixed\s+Income|Equit(?:ies|y)|Common\s+Stocks?|Preferred\s+Stocks?|ETFs?|Exchange[\s\-]Traded\s+Funds?|Mutual\s+Funds?|Money\s+Market|Cash\s+Equivalents?|Structured\s+Products?|Options?|Annuities|Limited\s+Partnerships?|Closed[\s\-]End\s+Funds?|Unit\s+Investment\s+Trusts?|UITs?|Variable\s+Annuities?)$/i

/**
 * Bond / fixed-income descriptions that appear inline on the FIRST name line
 * but should NOT be part of the instrument name.
 * Examples: "ECOPETROL SA 4.625% 11/02/31 B/E DTD 11/02/21..." → stop at "B/E DTD"
 */
const BOND_DESC_INLINE_RE = /\s+(B\/E\s+DTD|B\.E\s+DTD|DTD\s+\d|CALLABLE\b|FOREIGN\s+SECURITY|1ST\s+CPN|CPN\s+PMT|30\/360|360\/360|SEMI\s+ANNUAL|SEMI-ANNUAL|QUARTERLY|MONTHLY|ANNUALLY|Moody\s|S\s*&\s*P|S&P\s|RATING\s+[A-Z]|REE\s+DTD|CONVERTIBLE|SUBORDINAT|GUARANTEED\b|SENIOR\s+UNSECURED|ORIG\s+ISS)/i

/** Lines that are pure description / legal text — skip entirely when building names */
const DESC_LINE_RE = /^(B\/E\s+DTD|FOREIGN\s+SECURITY|1ST\s+CPN|CPN\s+PMT|ON\s+MAY|ON\s+NOV|ON\s+JAN|Moody\s+Rating|S\s*&\s*P\s+Rating|S&P\s+Rating|RATING\s+[A-Z]|SEMI\s+ANNUAL|REE\s+DTD|CALLABLE|DTE\s+\d|PMT\s+\w|30\/360|CONVERTIBLE|GUARANTEED|SUBORDINATED|SENIOR\s|IN\s+MATURITY|CUSIP:|IN\s+ALPHABETICAL|IN\s+COUPON)/i

/** Clean a raw first-line name by removing trailing bond-description text */
function cleanInstrumentName(raw: string): string {
  const m = raw.match(BOND_DESC_INLINE_RE)
  return m ? raw.substring(0, m.index).trim() : raw.trim()
}

/**
 * Structured parser for the "Portfolio Holdings" section of a Pershing/Insigneo
 * brokerage statement.
 *
 * Key design:
 *  – Tracks the current asset-type block (Corporate Bonds, Equities, etc.).
 *    Each flushed position carries pdf_asset_type for fallback risk classification.
 *  – Takes only the FIRST name line per security.  Subsequent lines before the
 *    Security Identifier are bond description / legal text and are discarded.
 *  – Truncates the first line at inline description keywords (B/E DTD, CALLABLE…).
 *  – Skips Total / subtotal lines, page-break headers, and ratings lines.
 */
function extractPershingPositions(lines: string[], cashSeenIds?: Set<string>): RawPosition[] {
  const positions: RawPosition[] = []
  // Pre-seed with cash identifiers so we don't double-count from Cash section
  const seen = new Set<string>(cashSeenIds ?? [])

  // ── Find Portfolio Holdings boundaries ────────────────────────────────────
  // The header may appear as "Portfolio Holdings" or "Portfolio Holdings (continued)"
  const holdingsStart = lines.findIndex(l => /^portfolio\s+holdings/i.test(l))
  if (holdingsStart === -1) return []
  const holdingsEnd = lines.findIndex((l, i) =>
    i > holdingsStart && /portfolio\s+holdings\s+disclosures?/i.test(l)
  )
  const holdingLines = lines.slice(holdingsStart, holdingsEnd === -1 ? lines.length : holdingsEnd)

  // ── Lines to skip entirely ────────────────────────────────────────────────
  // Includes: column headers, total/subtotal rows, page-break injected lines
  const SKIP_RE = /^(portfolio\s+holdings|date\s+acquired|current$|cost\s+basis|market\s+price|market\s+value|unrealized|accrued|estimated|30-day|yield$|income$|page\s+\d|account\s+number|a\d{7,}[a-z0-9\-]*|[a-z]{2,5}-\d{4,}|(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d|total\s+(corporate|municipal|government|money|cash|fixed|equity|equities|portfolio|mutual|preferred|structured|etf|option|annuit|limited|ueit|variable)|original\s+cost\s+basis$|gain\s*\/\s*loss|date\s+acquired.*quantity|quantity.*unit|cost\s+basis.*market|\w.*\(continued\)$|opening\s+(date|balance))/i

  // ── State machine variables ───────────────────────────────────────────────
  let currentAssetType = ''   // e.g. 'Corporate Bonds' — updated at block headers
  let nameLine         = ''   // first (and only) name line for current security
  let currentIsin: string | undefined
  let currentCusip: string | undefined
  let afterSecId       = false
  let nameComplete     = false
  let totalPortfolioMV = 0

  const flushPosition = (marketValue: number, quantity?: number) => {
    const identifier = currentIsin ?? currentCusip
    if (!identifier || seen.has(identifier)) return
    seen.add(identifier)
    const idType: RawPosition['identifier_type'] = currentIsin ? 'isin' : 'cusip'
    positions.push({
      raw_name:        nameLine || identifier,
      raw_identifier:  identifier,
      identifier_type: idType,
      isin:            currentIsin,
      cusip:           currentCusip,
      market_value:    marketValue,
      quantity,
      pdf_asset_type:  currentAssetType || undefined,
    })
  }

  const resetState = () => {
    nameLine     = ''
    currentIsin  = undefined
    currentCusip = undefined
    afterSecId   = false
    nameComplete = false
  }

  for (let i = 0; i < holdingLines.length; i++) {
    const line = holdingLines[i].trimEnd()  // keep leading spaces for indent detection

    // ── Skip column headers, totals, page-break injected content ─────────────
    if (SKIP_RE.test(line.trim())) continue
    if (/^\$[\d,]/.test(line.trim())) continue          // dollar total line
    if (/^[\d,]+\.?\d*$/.test(line.trim())) continue    // bare number line

    // ── Total Portfolio Holdings → capture total MV for weight calc ───────────
    if (/total\s+portfolio\s+holdings/i.test(line)) {
      const combined = holdingLines.slice(i, i + 3).join(' ')
      const mvMatch  = combined.match(/\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})/)
      if (mvMatch) totalPortfolioMV = parseNumber(mvMatch[2]) ?? 0
      continue
    }

    // ── Asset-type block header (Corporate Bonds, Equities, etc.) ─────────────
    // These appear as short standalone lines between security entries.
    // Also handle "FIXED INCOME X% of Portfolio" style overview lines.
    if (ASSET_TYPE_RE.test(line.trim())) {
      currentAssetType = line.trim()
      resetState()
      continue
    }
    // Overview line like "FIXED INCOME 93.00% of Portfolio ..."
    if (/^(fixed\s+income|equity|equities|cash|money\s+market)\s+[\d.]+%/i.test(line.trim())) {
      // Extract just the asset class name from the beginning
      const m = line.trim().match(/^(fixed\s+income|equity|equities|cash|money\s+market)/i)
      if (m) currentAssetType = m[1]
      continue
    }

    // ── Security Identifier: [CUSIP] ─────────────────────────────────────────
    const secIdMatch = line.trim().match(/^security\s+identifier:\s*([A-Z0-9]{8,9})/i)
    if (secIdMatch) {
      if (!currentIsin) currentCusip = secIdMatch[1]
      afterSecId   = true
      nameComplete = true
      continue
    }

    // ── Data line immediately after Security Identifier ───────────────────────
    // pdf-parse may collapse multiple spaces to one, so we can't rely on \s{3,}.
    // Strategy: find ALL decimal amounts on the line and take the largest as MV.
    if (afterSecId) {
      const allNums = Array.from(line.matchAll(/(\d[\d,]*\.\d{2})/g))
        .map(m => parseNumber(m[1]) ?? 0)
        .filter(n => n > 0)

      if (allNums.length > 0) {
        const mv = Math.max(...allNums)
        if (mv > 0) flushPosition(mv)
        resetState()
        continue
      }

      // Blank line while waiting — keep waiting (PDF may insert blank lines)
      if (!line.trim()) continue

      // Non-blank line with no numbers: data line never arrived.
      // Reset and fall through so this line can be re-evaluated as a name/header.
      resetState()
      // intentional fall-through
    }

    // ── ISIN# embedded in name line ───────────────────────────────────────────
    const isinMatch = line.match(/ISIN#([A-Z]{2}[A-Z0-9]{10})/i)
    if (isinMatch) {
      currentIsin = isinMatch[1].toUpperCase()
      const rawNamePart = line.substring(0, line.toUpperCase().indexOf('ISIN#')).trim()
      if (rawNamePart && !/^\d{2}\/\d{2}\/\d{2}/.test(rawNamePart) && rawNamePart.length > 3) {
        nameLine = cleanInstrumentName(rawNamePart)
      }
      nameComplete = true
      continue
    }

    // ── Cash / Money Market data line (no Security Identifier) ───────────────
    // Format: date + qty + N/A + end_date + opening_bal + closing_bal
    const cashMatch = line.trim().match(/^\d{2}\/\d{2}\/\d{2}([\d,]+\.\d+)N\/A\d{2}\/\d{2}\/\d{2}([\d,]+\.\d{2})([\d,]+\.\d{2})/)
    if (cashMatch && nameLine && !currentIsin && !currentCusip) {
      const closingBalance = parseNumber(cashMatch[3])
      const qty            = parseNumber(cashMatch[1])
      if (closingBalance && closingBalance > 0) {
        const id = 'CASH_' + nameLine.replace(/[^A-Z0-9]/gi, '_').toUpperCase().substring(0, 24)
        if (!seen.has(id)) {
          seen.add(id)
          positions.push({
            raw_name:           nameLine,
            raw_identifier:     id,
            identifier_type:    'unknown',
            market_value:       closingBalance,
            quantity:           qty,
            forced_risk_score:  1,
            forced_asset_class: 'cash',
            forced_category:    'Money Market / Liquidez',
          })
        }
      }
      resetState()
      continue
    }

    // ── Original Cost Basis line → discard current security state ─────────────
    if (/^original\s+cost\s+basis/i.test(line.trim())) {
      resetState()
      continue
    }

    // ── Skip pure description / legal text lines ──────────────────────────────
    // These appear AFTER the first name line but BEFORE Security Identifier.
    // Examples: "FOREIGN SECURITY 1ST CPN DTE ...", "Moody Rating Ba3 S & P Rating BB"
    if (nameComplete || DESC_LINE_RE.test(line.trim())) continue

    // ── Mutual fund / no-CUSIP data line ──────────────────────────────────────
    // Mutual funds (and some other instruments) don't have a "Security Identifier:"
    // line.  Their data line starts with a date (MM/DD/YY) + numeric columns.
    // Detect this here BEFORE the general date-skip below.
    if (nameLine && !currentIsin && !currentCusip && /^\d{2}\/\d{2}\/\d{2,4}/.test(line.trim())) {
      const allNums = Array.from(line.matchAll(/(\d[\d,]*\.\d{2})/g))
        .map(m => parseNumber(m[1]) ?? 0)
        .filter(n => n > 0)

      if (allNums.length >= 2) {
        const mv = Math.max(...allNums)
        if (mv > 100) {
          // Use the name as a synthetic identifier (no ISIN/CUSIP available)
          const safeId = 'POS_' + nameLine.replace(/[^A-Z0-9]/gi, '_').toUpperCase().substring(0, 28)
          if (!seen.has(safeId)) {
            seen.add(safeId)
            positions.push({
              raw_name:        nameLine,
              raw_identifier:  safeId,
              identifier_type: 'unknown',
              market_value:    mv,
              pdf_asset_type:  currentAssetType || undefined,
            })
          }
          resetState()
        }
      }
      continue   // skip general date-line check below regardless
    }

    // ── Skip date-format lines (transaction date at start of data row) ────────
    if (/^\d{2}\/\d{2}\/\d{2}/.test(line.trim())) continue

    // ── Skip lines that look like pure data (quantity, price columns) ─────────
    if (/^[\d$%,\.]+$/.test(line.trim())) continue

    // ── Accumulate the name — FIRST LINE ONLY ─────────────────────────────────
    // Subsequent lines before Security Identifier are bond description text.
    // We take exactly ONE line as the name and immediately lock nameComplete.
    if (!nameLine && line.trim().length > 4) {
      nameLine     = cleanInstrumentName(line.trim())
      nameComplete = false   // still allow Security Identifier to come later
      // After capturing the first name line, set nameComplete so subsequent
      // description lines are ignored (handled by the DESC_LINE_RE / nameComplete checks above)
      nameComplete = true
    }
  }

  // ── Calculate weights from total portfolio MV ─────────────────────────────
  const totalMV = totalPortfolioMV || positions.reduce((s, p) => s + (p.market_value ?? 0), 0)
  return positions.map(p => ({
    ...p,
    weight: p.market_value != null && totalMV > 0 ? (p.market_value / totalMV) * 100 : undefined,
  }))
}

export async function parsePDF(buffer: ArrayBuffer): Promise<ParseResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse')
    const data = await pdfParse(Buffer.from(buffer))
    const lines = data.text.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const meta  = extractMetaFromTextLines(lines.slice(0, 80))

    // Detect Pershing/BNY Mellon statement format
    const isPershing = lines.some((l: string) => /portfolio\s+holdings$/i.test(l)) &&
                       lines.some((l: string) => /security\s+identifier:/i.test(l))

    if (!isPershing) {
      return { positions: fillWeights(extractPositionsFromPDFLines(lines)), meta }
    }

    // ── Pershing: run Cash section parser FIRST ───────────────────────────────
    // The Cash section is authoritative for money-market / sweep balances.
    // Its identifiers are passed to the Portfolio Holdings parser so those
    // positions aren't double-counted.
    const cashPositions   = extractCashMMFSection(lines)
    const cashSeenIds     = new Set(cashPositions.map(p => p.raw_identifier))
    const holdingPositions = extractPershingPositions(lines, cashSeenIds)

    // Merge: cash first so they appear at the top
    const allPositions = [...cashPositions, ...holdingPositions]

    // Recalculate weights including cash so the portfolio score is accurate
    const totalMV = allPositions.reduce((s, p) => s + (p.market_value ?? 0), 0)
    const withWeights = allPositions.map(p => ({
      ...p,
      weight: p.market_value != null && totalMV > 0
        ? (p.market_value / totalMV) * 100
        : p.weight,
    }))

    return { positions: withWeights, meta }
  } catch (e) {
    console.error('[parsePDF]', e)
    return { positions: [], meta: {} }
  }
}
