/**
 * Portfolio Performance PDF parser — reads the Pershing/Insigneo
 * "Portfolio Performance" report and extracts real TWRR (time-weighted
 * rate of return) figures, not calculated by us. Values that the report
 * marks as unavailable ("--", partial-period footnote) are left null —
 * never filled in or estimated.
 *
 * Layout (verified against a real report, text extracted via pdf-parse):
 *   "Portfolio PerformanceXXXXX2303"      — masked account, last digits visible
 *   "Prepared for:" / "<Client Name>"
 *   "Period: 5/20/26 - 8/19/26"
 *   Column headers: SELECTED PERIOD / YEAR TO DATE / 1 YEAR TRAILING /
 *     3 YEAR TRAILING / 5 YEAR TRAILING / SINCE START DATE <inception date>
 *   Rows: Beginning Value, Net Contribution, Change In Value, Ending Value,
 *     Return — each followed by 6 value tokens (or "--" + footnote digit
 *     when a period doesn't apply, e.g. account younger than 3/5 years).
 *   Later: "Benchmark Performance" section with the same 6-period columns,
 *     one row per benchmark index.
 */

export interface PeriodReturns {
  selected:        number | null
  ytd:             number | null
  oneYear:         number | null
  threeYear:       number | null
  fiveYear:        number | null
  sinceInception:  number | null
}

export interface BenchmarkPerformance extends PeriodReturns {
  name: string
}

export interface ParsedPerformanceReport {
  accountLast4:     string | null
  clientName:       string | null
  reportDate:       string | null   // YYYY-MM-DD — "Created on"
  periodStart:      string | null
  periodEnd:        string | null
  inceptionDate:    string | null
  endingValue:      number | null
  returns:          PeriodReturns
  benchmarks:       BenchmarkPerformance[]
  warnings:         string[]
}

function splitLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}

// US-format date, 2-digit year assumed 20xx (these reports only span recent years).
function parseUsDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  const [, mo, d, yRaw] = m
  const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)
  const date = new Date(Date.UTC(y, Number(mo) - 1, Number(d)))
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

// Reads exactly 6 period-value tokens starting at `startIdx`. A missing
// period appears as a "--" line, sometimes followed by a lone footnote
// digit line (e.g. superscript "6") which is swallowed, not counted.
function readPeriodRow(lines: string[], startIdx: number): { values: (number | null)[]; nextIdx: number } {
  const values: (number | null)[] = []
  let i = startIdx
  while (values.length < 6 && i < lines.length) {
    const line = lines[i]
    if (line === '--') {
      values.push(null)
      i++
      if (i < lines.length && /^\d{1,2}$/.test(lines[i])) i++ // footnote marker
      continue
    }
    const m = line.match(/^[+-]?[\d,]+(?:\.\d+)?%?$/)
    if (!m) break
    values.push(parseFloat(line.replace(/[,%]/g, '')))
    i++
  }
  return { values, nextIdx: i }
}

function toPeriodReturns(values: (number | null)[]): PeriodReturns {
  return {
    selected:       values[0] ?? null,
    ytd:            values[1] ?? null,
    oneYear:        values[2] ?? null,
    threeYear:      values[3] ?? null,
    fiveYear:       values[4] ?? null,
    sinceInception: values[5] ?? null,
  }
}

export async function parsePerformancePdf(buffer: Buffer): Promise<ParsedPerformanceReport> {
  const warnings: string[] = []

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js')
  const parsed = await pdfParse(buffer)
  const lines = splitLines(parsed.text)

  const accountMatch = parsed.text.match(/Portfolio Performance\s*X*(\d{2,6})/i)
  const accountLast4 = accountMatch ? accountMatch[1] : null
  if (!accountLast4) warnings.push('No se pudo detectar la cuenta en el reporte')

  const preparedForIdx = lines.findIndex(l => /^prepared for:?$/i.test(l))
  const clientName = preparedForIdx >= 0 ? lines[preparedForIdx + 1] ?? null : null

  const periodLine = lines.find(l => /^period:/i.test(l))
  const periodMatch = periodLine?.match(/period:\s*([\d/]+)\s*-\s*([\d/]+)/i)
  const periodStart = periodMatch ? parseUsDate(periodMatch[1]) : null
  const periodEnd   = periodMatch ? parseUsDate(periodMatch[2]) : null

  const createdIdx = lines.findIndex(l => /^created on:/i.test(l))
  const reportDate = createdIdx >= 0 ? parseUsDate(lines[createdIdx]) : null

  // Inception date sits alone on a line right after the "SINCE START DATE ($)" header.
  const sinceHeaderIdx = lines.findIndex(l => /since start date/i.test(l))
  let inceptionDate: string | null = null
  if (sinceHeaderIdx >= 0) {
    for (let i = sinceHeaderIdx; i < Math.min(sinceHeaderIdx + 3, lines.length); i++) {
      const d = parseUsDate(lines[i])
      if (d) { inceptionDate = d; break }
    }
  }
  if (!inceptionDate) warnings.push('No se pudo detectar la fecha de inicio (Since Start Date)')

  // Portfolio ending value — "XXXXX2303 $2,074,705" summary line on page 2.
  const summaryLine = lines.find(l => /^X{3,}\d+\s+\$[\d,.]+$/.test(l))
  const endingValueMatch = summaryLine?.match(/\$([\d,.]+)/)
  const endingValue = endingValueMatch ? parseFloat(endingValueMatch[1].replace(/,/g, '')) : null

  // Return row — one per report, right before the embedded 2-benchmark preview.
  const returnIdx = lines.findIndex(l => l === 'Return')
  let returns: PeriodReturns = { selected: null, ytd: null, oneYear: null, threeYear: null, fiveYear: null, sinceInception: null }
  if (returnIdx >= 0) {
    const { values } = readPeriodRow(lines, returnIdx + 1)
    if (values.length === 6) returns = toPeriodReturns(values)
    else warnings.push('No se pudieron leer los 6 períodos de rentabilidad')
  } else {
    warnings.push('No se encontró la fila de Return en el reporte')
  }
  if (returns.ytd == null && returns.oneYear == null && returns.sinceInception == null) {
    warnings.push('El reporte no trae rentabilidad utilizable (YTD/1A/desde inicio vacíos)')
  }

  // Benchmark Performance table — 6-period rows, name-then-values, until a
  // non-benchmark line breaks the pattern (2 consecutive misses = end of table).
  const benchmarks: BenchmarkPerformance[] = []
  const benchHeaderIdx = lines.findIndex(l => /^benchmark performance$/i.test(l))
  if (benchHeaderIdx >= 0) {
    const windowEnd = Math.min(benchHeaderIdx + 80, lines.length)
    let i = benchHeaderIdx + 1
    while (i < windowEnd && benchmarks.length < 10) {
      const nameLine = lines[i]
      if (/^prepared by$/i.test(nameLine)) break
      const looksLikeHeaderOrValue = /^[+-]?[\d,.%-]+$/.test(nameLine) || /period \(%\)|^benchmarks$|since start date/i.test(nameLine)
      if (looksLikeHeaderOrValue) { i++; continue }
      const { values, nextIdx } = readPeriodRow(lines, i + 1)
      if (values.length === 6) {
        benchmarks.push({ name: nameLine, ...toPeriodReturns(values) })
        i = nextIdx
      } else {
        i++
      }
    }
  }
  if (!benchmarks.length) warnings.push('No se encontraron benchmarks en el reporte')

  return {
    accountLast4, clientName, reportDate, periodStart, periodEnd, inceptionDate,
    endingValue, returns, benchmarks, warnings,
  }
}
