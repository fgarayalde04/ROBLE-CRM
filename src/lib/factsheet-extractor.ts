/**
 * Factsheet PDF extractor
 * Keyword-proximity extraction — works across different factsheet layouts.
 * No external AI API required.
 */

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface FieldAudit {
  page:         number | null
  keyword_used: string | null
  raw_value:    string | null
}

export interface FactsheetData {
  isin:              string | null
  issuer:            string | null   // kept for backward compat, always null
  fund_name:         string | null
  fund_class:        string | null
  return_1y:         number | null
  return_3y:         number | null
  return_5y:         number | null
  ytm_indicative:    number | null
  duration_years:    number | null
  extraction_notes:  string | null
  confidence:        'high' | 'medium' | 'low'
  campos_a_revisar:  string[]
  audit:             Record<string, FieldAudit>
}

// ─── Keyword dictionaries ─────────────────────────────────────────────────────

const KW = {
  isin: [
    'Share Class ISIN', 'Fund ISIN', 'ISIN Code', 'ISIN',
  ],
  fund_name: [
    'Fund Name', 'Nombre del fondo', 'Strategy', 'Portfolio Name',
  ],
  // Annual returns only — monthly/quarterly excluded intentionally
  return_1y: [
    'Since 1 Year',
    '1 Year Return', '1-Year Return',
    '1 Year', '1-Year', '1 Yr',
    '1 Año', '1 año',
    'Rentabilidad 1', 'Return 1 Year', 'Performance 1 Year',
    '1Y',
  ],
  return_3y: [
    '3 Years Return', '3-Year Return',
    '3 Years', '3-Year', '3 Yr',
    '3 Años', '3 años',
    'Rentabilidad 3', 'Return 3 Year', 'Performance 3 Year',
    '3Y',
  ],
  return_5y: [
    '5 Years Return', '5-Year Return',
    '5 Years', '5-Year', '5 Yr',
    '5 Años', '5 años',
    'Rentabilidad 5', 'Return 5 Year', 'Performance 5 Year',
    '5Y',
  ],
  ytm: [
    // English
    'Yield to Maturity', 'Current Yield', 'Distribution Yield',
    'Average Yield', 'Running Yield', 'SEC Yield', 'YTM',
    // Spanish — full label (may be split across lines, handled separately)
    'Rendimiento estimado hasta el vencimiento',
    'Rendimiento estimado',
    'Rendimiento al vencimiento',
    'Rendimiento del fondo',
    'hasta el vencimiento',
    'Distribución anualizada del rendimiento',
    // Portuguese/other
    'Yield',
  ],
  duration: [
    // Most specific first — prevents matching "Duración del Índice"
    'Duración efectiva',
    'Modified Duration', 'Effective Duration', 'Average Duration',
    'Interest Rate Duration', 'Duración Modificada',
    'Duration', 'Duración',
  ],
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface PageText {
  page:  number
  lines: string[]
  raw:   string
}

interface RawMatch {
  raw:     string
  page:    number
  keyword: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseNum(raw: string): number | null {
  const m = raw.match(/([+-]?\d{1,3}(?:[.,]\d{1,4})?)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(',', '.'))
  return isNaN(n) ? null : n
}

function hasNumber(s: string): boolean {
  return /[+-]?\d{1,3}[.,]\d/.test(s) || /\b\d{1,3}\s*%/.test(s)
}

function splitPages(text: string): PageText[] {
  const parts = text.split('\f')
  return parts.map((raw, idx) => ({
    page:  idx + 1,
    raw,
    lines: raw.split('\n').map(l => l.trim()).filter(l => l.length > 0),
  }))
}

// ─── Core extraction: keyword proximity ───────────────────────────────────────

/**
 * Search for keywords across pages. Handles three layouts:
 *  A) "Label: value"          — value on same line after keyword
 *  B) "Label\nvalue"          — value on next line(s)
 *  C) "Label part1\npart2\nvalue" — label split across lines (e.g. Spanish long labels)
 */
function findNearKeyword(
  pages: PageText[],
  kws: string[],
  wantNumber: boolean,
): RawMatch | null {
  const sorted = [...kws].sort((a, b) => b.length - a.length)

  for (const page of pages) {
    const lines = page.lines

    // Build "joined pairs" to detect keywords split across two lines
    const joinedLines: string[] = lines.map((l, i) =>
      i < lines.length - 1 ? `${l} ${lines[i + 1]}` : l
    )

    for (let i = 0; i < lines.length; i++) {
      // Check single line AND joined-with-next-line
      const candidates = [
        { text: lines[i],      baseIdx: i,     isJoined: false },
        { text: joinedLines[i], baseIdx: i,     isJoined: true  },
      ]

      for (const { text, baseIdx, isJoined } of candidates) {
        for (const kw of sorted) {
          const re = new RegExp(`(?:^|[\\s:,|])${escRe(kw)}(?:[\\s:,|⊕†*]|$)`, 'i')
          if (!re.test(text)) continue

          const kwIdx = text.toLowerCase().indexOf(kw.toLowerCase())
          const after = text.slice(kwIdx + kw.length).replace(/^[\s:–—|⊕†*()años]+/, '')

          // Value on same (or joined) line
          if (after.length > 0 && (!wantNumber || hasNumber(after))) {
            return { raw: after, page: page.page, keyword: kw }
          }

          // Value on next lines after the keyword line (up to 5 ahead for split labels like YTM)
          const startSearch = isJoined ? baseIdx + 2 : baseIdx + 1
          for (let j = startSearch; j <= Math.min(baseIdx + 5, lines.length - 1); j++) {
            const next = lines[j]
            if (!wantNumber) {
              if (next.length > 2 && !next.match(/^[─—=\-*]+$/)) {
                return { raw: next, page: page.page, keyword: kw }
              }
            } else if (hasNumber(next)) {
              return { raw: next, page: page.page, keyword: kw }
            }
          }

          // Value on the line BEFORE (column-header tables)
          if (baseIdx > 0 && wantNumber && hasNumber(lines[baseIdx - 1])) {
            return { raw: lines[baseIdx - 1], page: page.page, keyword: kw }
          }
        }
      }
    }
  }
  return null
}

// ─── Returns: table detection (handles 1M/3M/6M/YTD/1Y/3Y/5Y/SI) ────────────

/**
 * Detects horizontal performance tables. Tracks ALL period columns (including
 * monthly) so column positions map correctly to values.
 *
 * Example header:  1M   3M   6M   YTD   1Y   3Y   5Y   SI
 * Example values:  1.2  3.4  5.6  7.8   8.9  12.3  18.5  25.1
 */
function detectReturnTable(pages: PageText[]): Map<string, RawMatch> {
  // All known period tokens — ORDER MATTERS (longer/more specific first)
  // Must include ALL columns that can appear in a factsheet table
  // so column-index mapping stays correct even when some columns are not needed.
  // ⚠ No trailing \b — PDF headers are often concatenated without spaces
  // Use (?<!\d) lookbehind to avoid "1y" matching inside "10 años", etc.
  const ALL_PERIODS: Array<{ key: string; pats: string[] }> = [
    { key: 'si',  pats: ['Since Inception', 'Inception', 'S\\.I\\.', 'DL', 'SI'] },
    { key: 'ytd', pats: ['Year[- ]to[- ]Date', 'Año en curso', 'YTD'] },
    { key: '10y', pats: ['10\\s*años', '10\\s*[Yy]ears', '10Y'] },
    { key: '1y',  pats: ['(?<!\\d)1\\s*año(?!s)', '(?<!\\d)1\\s*[Yy]ear(?!s)', '(?<!\\d)1Y'] },
    { key: '3y',  pats: ['(?<!\\d)3\\s*años', '(?<!\\d)3\\s*[Yy]ears', '(?<!\\d)3Y'] },
    { key: '5y',  pats: ['(?<!\\d)5\\s*años', '(?<!\\d)5\\s*[Yy]ears', '(?<!\\d)5Y'] },
    { key: '6m',  pats: ['(?<!\\d)6\\s*meses', '(?<!\\d)6\\s*[Mm]onths', '(?<!\\d)6M'] },
    { key: '3m',  pats: ['(?<!\\d)3\\s*meses', '(?<!\\d)3\\s*[Mm]onths', '(?<!\\d)3M'] },
    { key: '1m',  pats: ['(?<!\\d)1\\s*mes(?!e)', '(?<!\\d)1\\s*[Mm]onth', '(?<!\\d)1M'] },
  ]

  const result = new Map<string, RawMatch>()

  for (const page of pages) {
    const lines = page.lines
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]

      // Find every period token present in this line, with its character position
      const foundPeriods: Array<{ key: string; pos: number }> = []
      for (const period of ALL_PERIODS) {
        for (const pat of period.pats) {
          const m = line.match(new RegExp(`(${pat})`, 'i'))
          if (m && m.index != null) {
            // Avoid duplicates
            if (!foundPeriods.find(p => p.key === period.key)) {
              foundPeriods.push({ key: period.key, pos: m.index })
            }
            break
          }
        }
      }

      // Need at least 2 period tokens to qualify as a table header
      if (foundPeriods.length < 2) continue

      // Sort by left-to-right position
      foundPeriods.sort((a, b) => a.pos - b.pos)

      // Look for a numeric data row within the next 4 lines
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
        const dataLine = lines[j]
        const nums = Array.from(dataLine.matchAll(/([+-]?\d{1,3}[.,]\d{1,4})\s*%?/g))

        // Data row must have as many numbers as (or more than) column headers
        if (nums.length < foundPeriods.length - 1) continue

        // Map each column header to its corresponding number by index order
        foundPeriods.forEach((period, idx) => {
          if (
            idx < nums.length &&
            ['1y', '3y', '5y'].includes(period.key) &&
            !result.has(period.key)
          ) {
            result.set(period.key, {
              raw:     nums[idx][1],
              page:    page.page,
              keyword: `tabla: ${line.trim()}`,
            })
          }
        })

        if (result.has('1y') || result.has('3y') || result.has('5y')) break
      }
      if (result.size > 0) break
    }
    if (result.size > 0) break
  }

  return result
}

// ─── ISIN extraction ──────────────────────────────────────────────────────────

function extractIsin(pages: PageText[]): RawMatch | null {
  // No trailing \b — ISINs can be concatenated in PDFs: "IE00B7KFL990IE00B8K7V925"
  const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}[0-9])/

  // Pass 1: lines that explicitly contain the word "ISIN"
  for (const page of pages) {
    for (const line of page.lines) {
      if (!/\bISIN\b/i.test(line)) continue
      const m = line.match(ISIN_RE)
      if (m) return { raw: m[1], page: page.page, keyword: 'ISIN' }

      // Value might be on the next line
      const idx = page.lines.indexOf(line)
      for (let k = idx + 1; k <= Math.min(idx + 2, page.lines.length - 1); k++) {
        const m2 = page.lines[k].match(ISIN_RE)
        if (m2) return { raw: m2[1], page: page.page, keyword: 'ISIN' }
      }
    }
  }

  // Pass 2: pattern-only — search all pages (ISIN can be in "Datos Básicos" on any page)
  for (const page of pages) {
    for (const line of page.lines) {
      const m = line.match(ISIN_RE)
      if (m) return { raw: m[1], page: page.page, keyword: 'pattern' }
    }
  }

  return null
}

// ─── Fund name heuristic ──────────────────────────────────────────────────────

function extractFundName(pages: PageText[]): RawMatch | null {
  const kwMatch = findNearKeyword(pages, KW.fund_name, false)
  if (kwMatch && kwMatch.raw.length > 5) return kwMatch

  const page1 = pages[0]
  if (!page1) return null
  for (const line of page1.lines) {
    if (
      line.length > 15 &&
      line.length < 120 &&
      !line.match(/^(page|página|date|fecha|\d{1,2}[\/\-]\d{1,2})/i) &&
      !line.match(/^(ISIN|WKN|Bloomberg|Factsheet|Report|www\.|http)/i) &&
      !line.match(/^\d{4}$/)
    ) {
      return { raw: line, page: 1, keyword: 'heuristic' }
    }
  }
  return null
}

function extractFundClass(fundName: string | null): string | null {
  if (!fundName) return null
  const m = fundName.match(/\b([A-Z])\s+(?:Acc|Inc|Dist|USD|EUR|GBP|Hdg|H)?$/i)
  return m ? m[1].toUpperCase() : null
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function extractFactsheetData(buffer: Buffer): Promise<FactsheetData> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
    require('pdf-parse/lib/pdf-parse.js')

  const parsed = await pdfParse(buffer)
  const pages  = splitPages(parsed.text)

  const audit: Record<string, FieldAudit> = {}
  const revisar: string[] = []

  // ── ISIN ──────────────────────────────────────────────────────────────────
  const isinMatch = extractIsin(pages)
  const isin      = isinMatch?.raw ?? null
  audit['isin']   = { page: isinMatch?.page ?? null, keyword_used: isinMatch?.keyword ?? null, raw_value: isin }
  if (!isin) revisar.push('ISIN')

  // ── Fund name ─────────────────────────────────────────────────────────────
  const nameMatch    = extractFundName(pages)
  const fund_name    = nameMatch ? cleanText(nameMatch.raw) : null
  audit['fund_name'] = { page: nameMatch?.page ?? null, keyword_used: nameMatch?.keyword ?? null, raw_value: nameMatch?.raw ?? null }
  if (!fund_name) revisar.push('Nombre del fondo')

  const fund_class = extractFundClass(fund_name)

  // ── Returns: table detection first, then keyword proximity ───────────────
  const returnTable = detectReturnTable(pages)

  const r1 = returnTable.get('1y') ?? findNearKeyword(pages, KW.return_1y, true)
  const r3 = returnTable.get('3y') ?? findNearKeyword(pages, KW.return_3y, true)
  const r5 = returnTable.get('5y') ?? findNearKeyword(pages, KW.return_5y, true)

  const return_1y = r1 ? parseNum(r1.raw) : null
  const return_3y = r3 ? parseNum(r3.raw) : null
  const return_5y = r5 ? parseNum(r5.raw) : null

  audit['return_1y'] = { page: r1?.page ?? null, keyword_used: r1?.keyword ?? null, raw_value: r1?.raw ?? null }
  audit['return_3y'] = { page: r3?.page ?? null, keyword_used: r3?.keyword ?? null, raw_value: r3?.raw ?? null }
  audit['return_5y'] = { page: r5?.page ?? null, keyword_used: r5?.keyword ?? null, raw_value: r5?.raw ?? null }

  if (!return_1y) revisar.push('Rentabilidad 1 año')
  if (!return_3y) revisar.push('Rentabilidad 3 años')
  if (!return_5y) revisar.push('Rentabilidad 5 años')

  // ── YTM ───────────────────────────────────────────────────────────────────
  const ytmMatch       = findNearKeyword(pages, KW.ytm, true)
  const ytm_indicative = ytmMatch ? parseNum(ytmMatch.raw) : null
  audit['ytm']         = { page: ytmMatch?.page ?? null, keyword_used: ytmMatch?.keyword ?? null, raw_value: ytmMatch?.raw ?? null }
  if (!ytm_indicative) revisar.push('YTM')

  // ── Duration ──────────────────────────────────────────────────────────────
  const durMatch       = findNearKeyword(pages, KW.duration, true)
  const duration_years = durMatch ? parseNum(durMatch.raw) : null
  audit['duration']    = { page: durMatch?.page ?? null, keyword_used: durMatch?.keyword ?? null, raw_value: durMatch?.raw ?? null }
  if (!duration_years) revisar.push('Duración')

  // ── Confidence ────────────────────────────────────────────────────────────
  const filled = [isin, fund_name, return_1y, ytm_indicative, duration_years]
    .filter(v => v != null).length
  const confidence: FactsheetData['confidence'] =
    filled >= 4 ? 'high' : filled >= 2 ? 'medium' : 'low'

  return {
    isin,
    issuer:           null,   // not extracted — user fills manually if needed
    fund_name,
    fund_class,
    return_1y,
    return_3y,
    return_5y,
    ytm_indicative,
    duration_years,
    extraction_notes: revisar.length ? `Revisar: ${revisar.join(', ')}` : null,
    confidence,
    campos_a_revisar: revisar,
    audit,
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function cleanText(s: string): string {
  return s
    .replace(/^[\s:–—|"']+/, '')
    .replace(/[\s:–—|"']+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
