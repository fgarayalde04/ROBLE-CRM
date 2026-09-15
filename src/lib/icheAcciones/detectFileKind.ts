/**
 * Auto-detección de los 4 archivos de entrada de Iche Acciones por
 * contenido (no por nombre de archivo) — mismo espíritu que
 * `src/lib/portfolio/detectCustodianFormat.ts` pero distinguiendo 4 roles
 * en vez de 2. Nunca adivina: si nada matchea, devuelve 'unknown' y quien
 * llama debe avisar en vez de asumir.
 */
import * as XLSX from 'xlsx'
import type { IcheFileKind } from './types'

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

export function detectIcheFileKind(buffer: ArrayBuffer): IcheFileKind {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'array' })
  } catch {
    return 'unknown'
  }

  const sheetNames = wb.SheetNames.map(norm)

  // Pershing Unrealized: hoja "ExportExcel", headers con "Asset Category" y
  // "Trade Date" pero SIN columna "Symbol" (Pershing no trae ticker acá).
  if (sheetNames.includes('exportexcel')) {
    const ws = wb.Sheets[wb.SheetNames[sheetNames.indexOf('exportexcel')]]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      const cells = (raw[i] as unknown[]).map(norm)
      if (cells.includes('asset category') && cells.includes('trade date') && !cells.includes('symbol')) {
        return 'pershing_unrealized'
      }
    }
  }

  // Morgan Holdings: hoja "Holdings", headers con "Product Type" + "CUSIP".
  if (sheetNames.includes('holdings')) {
    const ws = wb.Sheets[wb.SheetNames[sheetNames.indexOf('holdings')]]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      const cells = (raw[i] as unknown[]).map(norm)
      if (cells.includes('product type') && cells.includes('cusip')) return 'morgan_holdings'
    }
  }

  // Activity: ambos tienen fecha + monto (cualquier hoja); se distinguen por
  // columnas propias de cada custodio — Morgan trae "Card Number"/"Tags",
  // Pershing no.
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      const cells = (raw[i] as unknown[]).map(norm)
      const hasDate = cells.some(c => /date/.test(c))
      const hasAmount = cells.some(c => /amount|amt/.test(c))
      if (!hasDate || !hasAmount) continue
      const isMorgan = cells.includes('card number') || cells.includes('tags') || cells.includes('running balance')
      const isPershingActivity = cells.includes('activity description') || cells.includes('ref number')
      if (isMorgan) return 'morgan_activity'
      if (isPershingActivity) return 'pershing_activity'
    }
  }

  return 'unknown'
}

export interface FileKindResult {
  fileName: string
  kind: IcheFileKind
}

export interface DetectAllResult {
  results: FileKindResult[]
  missing: IcheFileKind[]
  duplicated: IcheFileKind[]
}

const REQUIRED: IcheFileKind[] = ['pershing_unrealized', 'pershing_activity', 'morgan_holdings', 'morgan_activity']

export function detectAll(files: { fileName: string; buffer: ArrayBuffer }[]): DetectAllResult {
  const results = files.map(f => ({ fileName: f.fileName, kind: detectIcheFileKind(f.buffer) }))
  const byKind = new Map<IcheFileKind, number>()
  for (const r of results) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1)

  const missing = REQUIRED.filter(k => !byKind.get(k))
  const duplicated = REQUIRED.filter(k => (byKind.get(k) ?? 0) > 1)

  return { results, missing, duplicated }
}
