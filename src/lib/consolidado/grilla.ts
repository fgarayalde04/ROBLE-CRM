// .xlsx → grilla de celdas (primera hoja). Las fechas quedan como Date.
import * as XLSX from 'xlsx'

export function grillaDeExcel(buf: ArrayBuffer | Buffer): unknown[][] {
  const wb = XLSX.read(buf, { type: buf instanceof ArrayBuffer ? 'array' : 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: true }) as unknown[][]
}
