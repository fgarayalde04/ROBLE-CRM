// Cheap structural sniff of an uploaded workbook's first sheet, used only to
// validate that a file lands in the right upload slot in the "Nuevo Reporte"
// wizard (e.g. catch a Morgan Stanley file dropped into the Pershing slot).
// Never used to choose which parser actually runs — each slot always calls
// its own fixed parser.
import * as XLSX from 'xlsx'

export type DetectedCustodianFormat = 'pershing' | 'morgan' | 'unknown'

export function detectCustodianFormat(buffer: ArrayBuffer): DetectedCustodianFormat {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  if (!raw || raw.length === 0) return 'unknown'

  const firstCell = String(raw[0]?.[0] ?? '').trim().toLowerCase()
  if (firstCell === 'positions' || firstCell === 'unrealized gain loss') return 'pershing'
  if (firstCell === 'view cost basis') return 'morgan'

  // Fall back to a header-row scan within the first 25 rows.
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const cells = (raw[i] as unknown[]).map(c => String(c).trim().toLowerCase())
    if (cells.includes('acquired') && cells.includes('adj. cost ($)')) return 'morgan'
    if (cells.includes('cusip') && cells.includes('security description') && cells.includes('gain/loss')) return 'pershing'
  }
  return 'unknown'
}
