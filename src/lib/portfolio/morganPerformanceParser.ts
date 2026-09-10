/**
 * Morgan Stanley "Custom Report — Time Weighted Performance Summary" parser.
 * Normaliza el PDF de performance de Morgan a la MISMA forma
 * (`ParsedPerformanceReport`) que produce el parser de Pershing, para que
 * fluya por el mismo `createPerformanceImport()` y el mismo render (pestaña
 * Rendimiento + PDF). Solo cambia de dónde salen los datos.
 *
 * Layout (verificado contra un reporte real, texto extraído CON coordenadas
 * porque el cuadro es una grilla y pdf-parse lo aplasta sin separadores):
 *
 *   Página 1 ("Account(s) Included in this Report"):
 *     "<Cliente>    •    442-XXX628    •    AAA"   ← nombre + cuenta enmascarada + tipo
 *     "<fecha> ... <Perf Inception Date> ... <Perf (%) Incept - MM/DD/YY> <Total Value ($)> ..."
 *
 *   Página con "Time Weighted Performance Summary":
 *     Fila de rangos:  MM/DD/YY - MM/DD/YY  (×7: MTD, QTD, YTD, L12M, L3Y, L5Y, Perf Inception)
 *     "Data as of <Month D, YYYY>"
 *     Filas (una etiqueta + 7 celdas, un "-" cuando el período no aplica):
 *       Beginning Total Value ($)
 *       Net Contributions/Withdrawals ($)
 *       Investment Earnings ($)        ← equivalente en plata del TWRR (changeInValue)
 *       Ending Total Value ($)
 *       Return % (Net of Fees)
 *
 * Mapeo de períodos (Morgan tiene 7, el esquema tiene 6 — se descarta QTD):
 *   MTD → selected · YTD → ytd · L12M → oneYear · L3Y → threeYear ·
 *   L5Y → fiveYear · Perf Inception → sinceInception
 */
import type { ParsedPerformanceReport, PeriodReturns } from './performancePdfParser'

interface PositionedItem { x: number; str: string }
interface PositionedLine { page: number; y: number; items: PositionedItem[] }

async function extractPositionedLines(buffer: Buffer): Promise<PositionedLine[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js')
  const data = new Uint8Array(buffer)
  const doc = await pdfjs.getDocument({ data }).promise
  const out: PositionedLine[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const byY = new Map<number, PositionedItem[]>()
    for (const it of tc.items as { transform: number[]; str: string }[]) {
      if (!it.str.trim()) continue
      const x = Math.round(it.transform[4])
      const y = Math.round(it.transform[5])
      // agrupar líneas con y a ±1 (a veces difieren por subpíxel)
      const key = [...byY.keys()].find(k => Math.abs(k - y) <= 1) ?? y
      if (!byY.has(key)) byY.set(key, [])
      byY.get(key)!.push({ x, str: it.str })
    }
    for (const [y, items] of byY) {
      out.push({ page: p, y, items: items.sort((a, b) => a.x - b.x) })
    }
  }
  return out
}

// Une fragmentos contiguos ("Quar" + "ter to Date") y devuelve el x del
// primer fragmento de cada grupo.
function joinFragments(items: PositionedItem[], gap = 30): { x: number; text: string }[] {
  const groups: { x: number; text: string }[] = []
  for (const it of items) {
    const last = groups[groups.length - 1]
    if (last && it.x - (last.x + last.text.length * 5) < gap && !/\s{2,}$/.test(last.text)) {
      last.text += it.str
    } else {
      groups.push({ x: it.x, text: it.str })
    }
  }
  return groups.map(g => ({ x: g.x, text: g.text.trim() }))
}

const MONEY_RE = /^\(?-?\$?[\d,]+(?:\.\d+)?\)?$/
function parseCell(s: string): number | null {
  const t = s.trim()
  if (t === '' || t === '-' || t === '--') return null
  if (!MONEY_RE.test(t)) return null
  const neg = t.startsWith('(') || t.startsWith('-')
  const n = parseFloat(t.replace(/[$,()\-]/g, ''))
  return isNaN(n) ? null : (neg ? -n : n)
}

// Asigna, en orden de columna, la celda numérica/"-" más cercana a cada
// ancla de columna que todavía no fue tomada. Maneja tanto celdas faltantes
// (columna → null) como el "-" de "no aplica".
function mapRowToColumns(cells: PositionedItem[], anchors: number[]): (number | null)[] {
  const used = new Set<number>()
  const out: (number | null)[] = []
  for (const ax of anchors) {
    let bestIdx = -1, bestDist = Infinity
    cells.forEach((c, i) => {
      if (used.has(i)) return
      const d = Math.abs(c.x - ax)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    })
    if (bestIdx === -1 || bestDist > 90) { out.push(null); continue }
    used.add(bestIdx)
    out.push(parseCell(cells[bestIdx].str))
  }
  return out
}

// "07/31/26 - 08/20/26" → { start, end } en YYYY-MM-DD
function parseUsRange(s: string): { start: string | null; end: string | null } {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return { start: null, end: null }
  const iso = (mo: string, d: string, y: string) => {
    const yr = y.length === 2 ? 2000 + Number(y) : Number(y)
    const dt = new Date(Date.UTC(yr, Number(mo) - 1, Number(d)))
    return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10)
  }
  return { start: iso(m[1], m[2], m[3]), end: iso(m[4], m[5], m[6]) }
}

function parseUsDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const dt = new Date(Date.UTC(yr, Number(m[1]) - 1, Number(m[2])))
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10)
}

function parseLongDate(s: string): string | null {
  const m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/)
  if (!m) return null
  const dt = new Date(`${m[1]} ${m[2]}, ${m[3]} UTC`)
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10)
}

// Morgan tiene 7 columnas; el esquema tiene 6. Se descarta "Quarter to Date".
// cols = [MTD, QTD, YTD, L12M, L3Y, L5Y, PerfInception]
function toPeriodReturns(cols: (number | null)[]): PeriodReturns {
  return {
    selected:       cols[0] ?? null,
    ytd:            cols[2] ?? null,
    oneYear:        cols[3] ?? null,
    threeYear:      cols[4] ?? null,
    fiveYear:       cols[5] ?? null,
    sinceInception: cols[6] ?? null,
  }
}

const ROW_LABELS: Record<string, keyof RowBucket> = {
  'beginning total value': 'beginning',
  'net contributions/withdrawals': 'netContrib',
  'net contributions / withdrawals': 'netContrib',
  'investment earnings': 'earnings',
  'ending total value': 'ending',
  'return % (net of fees)': 'ret',
}
interface RowBucket {
  beginning?: (number | null)[]
  netContrib?: (number | null)[]
  earnings?: (number | null)[]
  ending?: (number | null)[]
  ret?: (number | null)[]
}

export async function parseMorganPerformancePdf(buffer: Buffer): Promise<ParsedPerformanceReport> {
  const warnings: string[] = []
  const lines = await extractPositionedLines(buffer)
  const allText = lines.map(l => l.items.map(i => i.str).join(' ')).join('\n')

  // ── Metadata ──────────────────────────────────────────────────────────
  const headerLine = allText.split('\n').find(l => /•\s*\d{2,4}-?[X\d]{3,}\s*•/.test(l))
    ?? allText.split('\n').find(l => /Estela|Mydlarski|Dorfman/i.test(l)) // (fallback tolerante)
  let clientName: string | null = null
  let accountLast4: string | null = null
  const metaLine = allText.split('\n').find(l => /\s•\s.*\d.*\s•\s/.test(l) && !/data as of/i.test(l))
  if (metaLine) {
    const parts = metaLine.split(/\s*•\s*/).map(s => s.trim()).filter(Boolean)
    if (parts.length >= 2) {
      clientName = parts[0] || null
      // "442-XXX628" → los dígitos visibles del final ("628"), no el prefijo
      const tail = parts[1].match(/(\d+)\s*$/)
      accountLast4 = tail ? tail[1] : null
    }
  }
  void headerLine

  const asOfLine = allText.split('\n').find(l => /data as of/i.test(l))
  const periodEnd = asOfLine ? parseLongDate(asOfLine) : null

  const reportDateLine = allText.split('\n').find(l => /custom report\s*•/i.test(l))
  const reportDate = reportDateLine ? parseLongDate(reportDateLine) : periodEnd

  // Perf Inception Date — aparece en la página 1, en formato MM/DD/YYYY,
  // cerca del texto "Perf Inception Date".
  let inceptionDate: string | null = null
  {
    const idx = lines.findIndex(l => /perf inception date/i.test(l.items.map(i => i.str).join(' ')))
    if (idx >= 0) {
      for (let k = idx; k < Math.min(idx + 8, lines.length); k++) {
        const cand = lines[k].items.map(i => i.str).join(' ').match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)
        if (cand) { inceptionDate = parseUsDate(cand[1]); break }
      }
    }
  }

  // ── Grilla de la página "Time Weighted Performance Summary" ────────────
  // Se ubica por las etiquetas de fila (limpias) y no por el título (que en
  // este PDF viene con los caracteres duplicados y sin espacios).
  const lineText = (l: PositionedLine) => l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()
  const perfPage = lines.find(l => /return % \(net of fees\)/i.test(lineText(l)))?.page
    ?? lines.find(l => /beginning total value/i.test(lineText(l)) && l.items.some(i => MONEY_RE.test(i.str.trim())))?.page
  if (perfPage == null) {
    warnings.push('No se encontró el cuadro "Time Weighted Performance Summary"')
    return emptyReport({ clientName, accountLast4, reportDate, periodEnd, inceptionDate, warnings })
  }
  const pageLines = lines.filter(l => l.page === perfPage).sort((a, b) => b.y - a.y)

  // Fila de rangos de fecha (7 rangos "MM/DD/YY - MM/DD/YY", cada uno un item)
  const RANGE_RE = /\d{1,2}\/\d{1,2}\/\d{2,4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{2,4}/
  const rangeLine = pageLines.find(l => l.items.filter(i => RANGE_RE.test(i.str)).length >= 5)
  let anchors: number[] = []
  let periodStart: string | null = null
  if (rangeLine) {
    const ranges = rangeLine.items.filter(i => RANGE_RE.test(i.str)).sort((a, b) => a.x - b.x)
    anchors = ranges.map(r => r.x)
    periodStart = parseUsRange(ranges[0]?.str ?? '').start
  }
  if (anchors.length < 6) {
    warnings.push('No se pudo ubicar la grilla de períodos del cuadro de performance')
    return emptyReport({ clientName, accountLast4, reportDate, periodStart, periodEnd, inceptionDate, warnings })
  }
  anchors = anchors.slice(0, 7)

  const bucket: RowBucket = {}
  for (const line of pageLines) {
    const joined = joinFragments(line.items)
    // La etiqueta es el/los primeros fragmento(s) de texto no numérico
    const labelText = joined
      .filter(g => !/^\(?-?\$?[\d,]+/.test(g.text) && g.text !== '-')
      .map(g => g.text).join(' ')
      .toLowerCase().replace(/\s+/g, ' ').trim()
    const key = ROW_LABELS[labelText] ?? ROW_LABELS[labelText.replace(/\s*\(\$\)$/, '').trim()]
      ?? (labelText.startsWith('beginning total value') ? 'beginning'
        : labelText.startsWith('net contributions') ? 'netContrib'
        : labelText.startsWith('investment earnings') ? 'earnings'
        : labelText.startsWith('ending total value') ? 'ending'
        : labelText.startsWith('return %') ? 'ret'
        : undefined)
    if (!key) continue
    const cells = line.items.filter(i => i.str.trim() === '-' || MONEY_RE.test(i.str.trim()))
    if (cells.length < 3) continue
    bucket[key] = mapRowToColumns(cells, anchors)
  }

  if (!bucket.ret) warnings.push('No se pudo leer la fila "Return % (Net of Fees)"')

  const returns = bucket.ret ? toPeriodReturns(bucket.ret) : emptyPeriods()
  const beginningValue = bucket.beginning ? toPeriodReturns(bucket.beginning) : null
  const netContribution = bucket.netContrib ? toPeriodReturns(bucket.netContrib) : null
  const changeInValue = bucket.earnings ? toPeriodReturns(bucket.earnings) : null
  // Ending Total Value: cualquier columna sirve (son todas iguales salvo la
  // de "Perf Inception", que también es el valor final actual).
  const endingValue = bucket.ending
    ? (bucket.ending.find(v => v != null) ?? null)
    : null

  // Chequeo de consistencia: Ending = Beginning + NetContrib + Earnings
  if (bucket.beginning && bucket.netContrib && bucket.earnings && bucket.ending) {
    for (let i = 0; i < anchors.length; i++) {
      const b = bucket.beginning[i], n = bucket.netContrib[i], e = bucket.earnings[i], end = bucket.ending[i]
      if (b != null && n != null && e != null && end != null && Math.abs(b + n + e - end) > 1) {
        warnings.push(`Columna ${i + 1}: los montos no cierran (${b} + ${n} + ${e} ≠ ${end}) — revisar el PDF`)
      }
    }
  }

  if (returns.ytd == null && returns.oneYear == null && returns.sinceInception == null) {
    warnings.push('El reporte no trae rentabilidad utilizable (YTD/1A/desde inicio vacíos)')
  }

  return {
    accountLast4, clientName, reportDate, periodStart, periodEnd, inceptionDate,
    endingValue, returns, beginningValue, netContribution, changeInValue,
    benchmarks: [], warnings, custodian: 'morgan',
  }
}

function emptyPeriods(): PeriodReturns {
  return { selected: null, ytd: null, oneYear: null, threeYear: null, fiveYear: null, sinceInception: null }
}
function emptyReport(meta: Partial<ParsedPerformanceReport> & { warnings: string[] }): ParsedPerformanceReport {
  return {
    accountLast4: null, clientName: null, reportDate: null, periodStart: null, periodEnd: null,
    inceptionDate: null, endingValue: null, returns: emptyPeriods(),
    beginningValue: null, netContribution: null, changeInValue: null,
    benchmarks: [], custodian: 'morgan', ...meta,
  }
}
