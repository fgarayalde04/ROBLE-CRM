/**
 * Arma el workbook "Analisis Albojer" COMPLETO de cero con exceljs, a partir
 * de `albojer_open_positions` / `albojer_closed_positions` (nunca relee un
 * .xlsx anterior, mismo criterio que Iche). Respeta la estructura de la
 * planilla que se llevaba a mano — Vigentes / Cerradas por analista (sin
 * partir por año) + RESUMEN por estrategia — con el estilo de Roble que usa
 * Iche Acciones.
 */
import ExcelJS from 'exceljs'
import {
  BORDER_COLOR,
  FONT_NAME,
  GREEN_TEXT,
  LIGHT_GREEN,
  MONEY_FMT,
  PCT_FMT,
  RED_TEXT,
  addSubtitleAndLogo,
  headerRow,
  plainTitle,
  resetView,
  styleDataCell,
  styleTotalCell,
} from '@/lib/icheAcciones/excelGenerator'
import type { GeneratedWorkbook } from '@/lib/icheAcciones/excelGenerator'
import type { Analyst, ClosedPosition, OpenPosition, PreviewRow, PreviewSummaryRow } from '@/lib/icheAcciones/types'

const DATE_FMT = 'dd/mm/yyyy'
const QTY_FMT = '#,##0.####'
const PRICE_FMT = '#,##0.0000'

const ANALYST_LABEL: Record<Analyst, string> = { INDIO: 'Indio', CHINO: 'Chino' }

// Fecha ISO -> Date de Excel; "Multiple" u otro texto queda como texto.
function dateCell(v: string | null): Date | string {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }
  return v ?? ''
}

function setTotalsLabels(ws: ExcelJS.Worksheet, row: number, labels: [number, string][]) {
  for (const [col, text] of labels) {
    const c = ws.getCell(row, col)
    c.value = text
    c.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: GREEN_TEXT } }
    c.alignment = { horizontal: 'center', wrapText: true }
  }
}

interface SheetTotals { cost: number; value: number; totalRow: number }

function buildVigentesSheet(wb: ExcelJS.Workbook, analyst: Analyst, positions: OpenPosition[], asOf: Date): SheetTotals & { rows: PreviewRow[] } {
  const ws = wb.addWorksheet(`Vigentes ${ANALYST_LABEL[analyst]}`)
  addSubtitleAndLogo(wb, ws, 10)
  plainTitle(ws, 3, `POSICIONES ACTUALES ${analyst}`)
  const dateTitle = ws.getCell(3, 4)
  dateTitle.value = asOf
  dateTitle.numFmt = DATE_FMT
  dateTitle.font = { name: FONT_NAME, size: 11, bold: true }
  headerRow(ws, 5, ['DESCRIPCION', 'SIMBOLO', 'CANTIDAD', 'FECHA COMPRA', 'PRECIO COMPRA', 'VALOR TOTAL COMPRA', 'PRECIO ACTUAL', 'VALOR ACTUAL', 'PERDIDA O GANANCIA NO REALIZADA', '%'])

  const sorted = [...positions].sort((a, b) => a.ticker.localeCompare(b.ticker))
  const previewRows: PreviewRow[] = []
  let r = 6
  for (const pos of sorted) {
    const band = (r - 6) % 2 === 1
    const qty = pos.lots.reduce((s, l) => s + l.quantity, 0)
    const cost = pos.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    const tradeDate = pos.lots.length === 1 ? pos.lots[0].tradeDate : 'Multiple'
    const mv = pos.lastPrice != null ? qty * pos.lastPrice : 0
    const gl = mv - cost
    const glPct = cost !== 0 ? gl / cost : 0

    const cells: [number, ExcelJS.CellValue, string | undefined][] = [
      [1, pos.description, undefined],
      [2, pos.ticker, undefined],
      [3, qty, QTY_FMT],
      [4, dateCell(tradeDate), DATE_FMT],
      [5, qty > 0 ? cost / qty : 0, PRICE_FMT],
      [6, cost, MONEY_FMT],
      [7, pos.lastPrice ?? null, PRICE_FMT],
      [8, { formula: `C${r}*G${r}`, result: mv } as ExcelJS.CellFormulaValue, MONEY_FMT],
      [9, { formula: `H${r}-F${r}`, result: gl } as ExcelJS.CellFormulaValue, MONEY_FMT],
      [10, { formula: `IF(F${r}=0,0,I${r}/F${r})`, result: glPct } as ExcelJS.CellFormulaValue, PCT_FMT],
    ]
    for (const [col, value, fmt] of cells) {
      const c = ws.getCell(r, col)
      c.value = value
      styleDataCell(c, band, fmt)
    }
    ws.getCell(r, 2).alignment = { horizontal: 'center' }
    ws.getCell(r, 4).alignment = { horizontal: 'center' }

    previewRows.push({ ticker: pos.ticker, description: pos.description, quantity: qty, originalTotalCost: cost, marketValue: mv, gainLoss: gl, gainLossPct: glPct })
    r += 1
  }

  const last = r - 1
  const totalRow = r + 2
  const cost = previewRows.reduce((s, p) => s + p.originalTotalCost, 0)
  const value = previewRows.reduce((s, p) => s + p.marketValue, 0)
  setTotalsLabels(ws, totalRow - 1, [[6, 'Costo Compras Vigentes'], [8, 'Valor actual'], [9, 'G/P no realizada'], [10, '%']])
  const label = ws.getCell(totalRow, 3)
  label.value = `Portafolio ${ANALYST_LABEL[analyst]} actual`
  label.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: GREEN_TEXT } }
  const sum = (col: string) => (last >= 6 ? `SUM(${col}6:${col}${last})` : '0')
  ws.getCell(totalRow, 6).value = { formula: sum('F'), result: cost }
  ws.getCell(totalRow, 8).value = { formula: sum('H'), result: value }
  ws.getCell(totalRow, 9).value = { formula: `H${totalRow}-F${totalRow}`, result: value - cost }
  ws.getCell(totalRow, 10).value = { formula: `IF(F${totalRow}=0,0,I${totalRow}/F${totalRow})`, result: cost ? (value - cost) / cost : 0 }
  for (const col of [6, 8, 9]) styleTotalCell(ws.getCell(totalRow, col), MONEY_FMT)
  styleTotalCell(ws.getCell(totalRow, 10), PCT_FMT)

  ;[44, 11, 11, 13, 13, 16, 13, 16, 17, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.getRow(5).height = 32
  resetView(ws)
  return { cost, value, totalRow, rows: previewRows }
}

function buildCerradasSheet(wb: ExcelJS.Workbook, analyst: Analyst, positions: ClosedPosition[]): SheetTotals {
  const ws = wb.addWorksheet(`Cerradas ${ANALYST_LABEL[analyst]}`)
  addSubtitleAndLogo(wb, ws, 11)
  plainTitle(ws, 3, `POSICIONES CERRADAS ${analyst}`)
  headerRow(ws, 5, ['DESCRIPCION', 'SIMBOLO', 'CANTIDAD', 'FECHA COMPRA', 'PRECIO COMPRA', 'VALOR TOTAL COMPRA', 'FECHA VENTA', 'PRECIO VENTA', 'VALOR TOTAL VENTA', 'PERDIDA O GANANCIA REALIZADA', '%'])

  // Orden cronológico por fecha de venta (las que no tienen fecha real, al final).
  const key = (c: ClosedPosition) => (/^\d{4}-\d{2}-\d{2}$/.test(c.closingDate) ? c.closingDate : `${c.year}-99`)
  const sorted = [...positions].sort((a, b) => key(a).localeCompare(key(b)))

  let r = 6
  let cost = 0
  let value = 0
  for (const pos of sorted) {
    const band = (r - 6) % 2 === 1
    const gl = pos.saleProceeds - pos.costBasis
    const cells: [number, ExcelJS.CellValue, string | undefined][] = [
      [1, pos.description, undefined],
      [2, pos.ticker, undefined],
      [3, pos.quantity, QTY_FMT],
      [4, dateCell(pos.openingDate), DATE_FMT],
      [5, { formula: `IF(C${r}=0,0,F${r}/C${r})`, result: pos.quantity ? pos.costBasis / pos.quantity : 0 } as ExcelJS.CellFormulaValue, PRICE_FMT],
      [6, pos.costBasis, MONEY_FMT],
      [7, dateCell(pos.closingDate), DATE_FMT],
      [8, { formula: `IF(C${r}=0,0,I${r}/C${r})`, result: pos.quantity ? pos.saleProceeds / pos.quantity : 0 } as ExcelJS.CellFormulaValue, PRICE_FMT],
      [9, pos.saleProceeds, MONEY_FMT],
      [10, { formula: `I${r}-F${r}`, result: gl } as ExcelJS.CellFormulaValue, MONEY_FMT],
      [11, { formula: `IF(F${r}=0,0,J${r}/F${r})`, result: pos.costBasis ? gl / pos.costBasis : 0 } as ExcelJS.CellFormulaValue, PCT_FMT],
    ]
    for (const [col, v, fmt] of cells) {
      const c = ws.getCell(r, col)
      c.value = v
      styleDataCell(c, band, fmt)
    }
    for (const col of [2, 4, 7]) ws.getCell(r, col).alignment = { horizontal: 'center' }
    cost += pos.costBasis
    value += pos.saleProceeds
    r += 1
  }

  const last = r - 1
  const totalRow = r + 2
  setTotalsLabels(ws, totalRow - 1, [[6, 'Costo Compras'], [9, 'Valor de venta'], [10, 'G/P Realizados'], [11, '%']])
  const label = ws.getCell(totalRow, 3)
  label.value = `Operaciones cerradas ${ANALYST_LABEL[analyst]}`
  label.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: GREEN_TEXT } }
  const sum = (col: string) => (last >= 6 ? `SUM(${col}6:${col}${last})` : '0')
  ws.getCell(totalRow, 6).value = { formula: sum('F'), result: cost }
  ws.getCell(totalRow, 9).value = { formula: sum('I'), result: value }
  ws.getCell(totalRow, 10).value = { formula: `I${totalRow}-F${totalRow}`, result: value - cost }
  ws.getCell(totalRow, 11).value = { formula: `IF(F${totalRow}=0,0,J${totalRow}/F${totalRow})`, result: cost ? (value - cost) / cost : 0 }
  for (const col of [6, 9, 10]) styleTotalCell(ws.getCell(totalRow, col), MONEY_FMT)
  styleTotalCell(ws.getCell(totalRow, 11), PCT_FMT)

  ;[44, 11, 11, 13, 13, 16, 13, 13, 16, 17, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.getRow(5).height = 32
  resetView(ws)
  return { cost, value, totalRow }
}

function buildResumenSheet(
  wb: ExcelJS.Workbook,
  asOf: Date,
  totals: Record<Analyst, { vigentes: SheetTotals; cerradas: SheetTotals }>
): PreviewSummaryRow[] {
  const ws = wb.addWorksheet('RESUMEN')
  addSubtitleAndLogo(wb, ws, 6)
  plainTitle(ws, 2, 'RESUMEN — Cartera de Acciones ALBOJER')
  const border = { bottom: { style: 'hair' as const, color: { argb: BORDER_COLOR } } }

  let row = 4
  for (const analyst of ['INDIO', 'CHINO'] as Analyst[]) {
    const { vigentes, cerradas } = totals[analyst]
    const title = ws.getCell(row, 2)
    title.value = `ANALISIS ESTRATEGIA ${analyst}`
    title.font = { name: FONT_NAME, size: 11, bold: true }
    const d = ws.getCell(row, 3)
    d.value = asOf
    d.numFmt = DATE_FMT
    d.font = { name: FONT_NAME, size: 10, color: { argb: 'FF6B7280' } }
    headerRow(ws, row + 1, ['', '', 'Valor Compras', 'Valor actual (o el vendido)', 'Ganancias o Pérdidas', '%'])

    const vig = `'Vigentes ${ANALYST_LABEL[analyst]}'`
    const cer = `'Cerradas ${ANALYST_LABEL[analyst]}'`
    const lines = [
      { label: 'Posiciones actuales abiertas', costF: `${vig}!F${vigentes.totalRow}`, valF: `${vig}!H${vigentes.totalRow}`, cost: vigentes.cost, value: vigentes.value, total: false },
      { label: 'Posiciones ya cerradas', costF: `${cer}!F${cerradas.totalRow}`, valF: `${cer}!I${cerradas.totalRow}`, cost: cerradas.cost, value: cerradas.value, total: false },
    ]
    const first = row + 2
    const all = [...lines, { label: 'TOTAL', costF: `C${first}+C${first + 1}`, valF: `D${first}+D${first + 1}`, cost: vigentes.cost + cerradas.cost, value: vigentes.value + cerradas.value, total: true }]
    all.forEach((line, i) => {
      const r = first + i
      const gl = line.value - line.cost
      const fill = line.total ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: LIGHT_GREEN } } : undefined
      const lc = ws.getCell(r, 2)
      lc.value = line.label
      lc.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: line.total ? GREEN_TEXT : 'FF000000' } }
      lc.border = border
      if (fill) lc.fill = fill
      const vals: [number, ExcelJS.CellFormulaValue, string][] = [
        [3, { formula: line.costF, result: line.cost }, MONEY_FMT],
        [4, { formula: line.valF, result: line.value }, MONEY_FMT],
        [5, { formula: `D${r}-C${r}`, result: gl }, MONEY_FMT],
        [6, { formula: `IF(C${r}=0,0,E${r}/C${r})`, result: line.cost ? gl / line.cost : 0 }, PCT_FMT],
      ]
      for (const [col, v, fmt] of vals) {
        const c = ws.getCell(r, col)
        c.value = v
        c.numFmt = fmt
        c.border = border
        c.font = { name: FONT_NAME, size: 10, bold: line.total || col === 5, color: { argb: col === 5 ? (gl >= 0 ? GREEN_TEXT : RED_TEXT) : line.total ? GREEN_TEXT : 'FF000000' } }
        if (fill) c.fill = fill
      }
    })
    row = first + all.length + 2
  }

  ws.getColumn(1).width = 3
  ws.getColumn(2).width = 30
  ;[3, 4, 5].forEach(c => { ws.getColumn(c).width = 18 })
  ws.getColumn(6).width = 11
  resetView(ws)

  const summary = (label: string, cost: number, value: number): PreviewSummaryRow => ({
    label, cost, value, gainLoss: value - cost, gainLossPct: cost !== 0 ? (value - cost) / cost : null,
  })
  return [
    summary('Cerradas INDIO', totals.INDIO.cerradas.cost, totals.INDIO.cerradas.value),
    summary('Cerradas CHINO', totals.CHINO.cerradas.cost, totals.CHINO.cerradas.value),
    summary('Actuales INDIO', totals.INDIO.vigentes.cost, totals.INDIO.vigentes.value),
    summary('Actuales CHINO', totals.CHINO.vigentes.cost, totals.CHINO.vigentes.value),
  ]
}

// "Analisis Albojer 12 Octubre 2026.xlsx", como se venían nombrando a mano.
export function albojerFileName(d: Date): string {
  const month = d.toLocaleDateString('es-UY', { month: 'long' })
  return `Analisis Albojer ${d.getDate()} ${month.charAt(0).toUpperCase()}${month.slice(1)} ${d.getFullYear()}.xlsx`
}

export async function generateAlbojerWorkbook(openPositions: OpenPosition[], closedPositions: ClosedPosition[], asOf = new Date()): Promise<GeneratedWorkbook> {
  const wb = new ExcelJS.Workbook()
  const totals = {} as Record<Analyst, { vigentes: SheetTotals & { rows: PreviewRow[] }; cerradas: SheetTotals }>
  for (const analyst of ['INDIO', 'CHINO'] as Analyst[]) {
    const vigentes = buildVigentesSheet(wb, analyst, openPositions.filter(p => p.analyst === analyst), asOf)
    const cerradas = buildCerradasSheet(wb, analyst, closedPositions.filter(p => p.analyst === analyst))
    totals[analyst] = { vigentes, cerradas }
  }
  const resumen = buildResumenSheet(wb, asOf, totals)

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    preview: {
      resumen,
      abiertasIndio: totals.INDIO.vigentes.rows,
      abiertasChino: totals.CHINO.vigentes.rows,
    },
  }
}
