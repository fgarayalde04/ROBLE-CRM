// Pershing "Unrealized Gain Loss": un solo archivo trae las posiciones, el
// costo y la fecha de compra de cada lote. Al importarlo como posiciones se
// completa todo lo demás desde el mismo archivo, así no hace falta subir
// también el Excel "Positions":
//   - costo / resultado / fechas de compra (se guardan como import de G/L),
//   - cupón y vencimiento de los bonos (de la descripción),
//   - cupón corrido estimado con tasa y vencimiento (cupón semestral, 30/360),
//     el mismo cálculo que usa la Posición Consolidada sin calendario.
import * as XLSX from 'xlsx'
import type { ParsedPortfolioImport } from './parser'
import { parseUnrealizedGainLossExcel, type ParsedUnrealizedGainLoss } from './unrealizedGainLossParser'
import { parseDescription } from '@/lib/cupones/parse'
import { corridoEstimado } from '@/lib/consolidado/calc'
import { grillaDeExcel } from '@/lib/consolidado/grilla'
import { leerArchivo } from '@/lib/consolidado/leer'
import type { Clase } from '@/lib/consolidado/types'

// La clase es la que da el propio Unrealized (su grupo principal: Cash,
// Equities, Fixed Income, Investment Funds…), igual que en la Posición
// Consolidada. No se deduce nada del nombre.
const CLASE_PORTAFOLIO: Record<Clase, ((nombre: string) => string) | null> = {
  Efectivo: () => 'Cash',
  'Renta fija': () => 'Fixed Income',
  Fondos: () => 'Fund',
  ETF: () => 'ETF',
  Acciones: () => 'Equity',
  Otros: () => 'Alternatives',
}

export type ParsedPortfolioConGL = ParsedPortfolioImport & { unrealizedGL?: ParsedUnrealizedGainLoss }

/** Mismo criterio que parsePortfolioExcel: la primera celda dice "Unrealized Gain Loss". */
export function esUnrealizedPershing(buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: 'array', sheetRows: 1 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return String(ws?.A1?.v ?? '').trim().toLowerCase() === 'unrealized gain loss'
}

export function completarDesdeUnrealized(buffer: ArrayBuffer, parsed: ParsedPortfolioImport): ParsedPortfolioConGL {
  let unrealizedGL: ParsedUnrealizedGainLoss | undefined
  try {
    const gl = parseUnrealizedGainLossExcel(buffer)
    if (gl.rows.length) unrealizedGL = gl
  } catch {
    // Si no se puede leer el costo, se importan igual las posiciones.
  }

  try {
    const a = leerArchivo(grillaDeExcel(buffer), 'unrealized.xlsx')
    if (a.tipo === 'posiciones') {
      const clasePorCusip = new Map(a.posiciones.map(p => [p.cusip, p.clase]))
      for (const p of parsed.positions) {
        const clase = p.cusip ? clasePorCusip.get(p.cusip) : undefined
        const f = clase ? CLASE_PORTAFOLIO[clase] : null
        if (f) p.assetClass = f(p.name)
      }
    }
  } catch {
    // Se queda la clasificación por nombre.
  }

  const fecha = parsed.snapshotDate
  let estimados = 0
  for (const p of parsed.positions) {
    if (p.assetClass !== 'Fixed Income') continue
    const info = parseDescription(p.name)
    if (p.coupon == null && info.rate != null) p.coupon = Math.round(info.rate * 1e6) / 1e4
    if (!p.maturityDate && info.maturity) p.maturityDate = info.maturity
    if (p.accruedInterest == null && fecha) {
      const c = corridoEstimado(p.quantity, info.rate, p.maturityDate, fecha)
      if (c != null) { p.accruedInterest = Math.round(c * 100) / 100; if (c) estimados++ }
    }
  }

  const positionsValue = parsed.positions.reduce((s, p) => s + p.marketValue, 0)
  const totalAccruedInterest = parsed.positions.reduce((s, p) => s + (p.accruedInterest ?? 0), 0)
  const warnings = [...parsed.warnings]
  if (estimados) warnings.push(`Cupón corrido estimado para ${estimados} bonos con tasa y vencimiento (cupón semestral, 30/360) — el Unrealized no lo trae.`)
  if (!unrealizedGL) warnings.push('No se pudo leer el costo de las posiciones en el Unrealized.')

  return {
    ...parsed,
    totalAccruedInterest,
    totalMarketValue: positionsValue + totalAccruedInterest,
    warnings,
    unrealizedGL,
  }
}
