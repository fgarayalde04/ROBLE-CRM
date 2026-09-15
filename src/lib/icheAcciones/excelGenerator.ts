/**
 * Arma el workbook "Iche Acciones" COMPLETO de cero con exceljs, a partir
 * del estado en `iche_open_positions` / `iche_closed_positions` — nunca
 * parte de un .xlsx anterior (exceljs no puede leer un archivo con imágenes
 * escritas por otra librería, ver plan). Colores, logo y layout siguen
 * `planilla excel/.claude/skills/iche-acciones-mensual/references/diseno.md`
 * y `formulas.md` al pie de la letra.
 */
import ExcelJS from 'exceljs'
import { ROBLE_LOGO_BASE64 } from './logoBase64'
import type { Analyst, ClosedPosition, OpenPosition, PreviewRow, PreviewSummaryRow } from './types'

// Paleta verde (estándar desde set-2026, ver diseno.md — inspirada en el
// reporte "Bonos & Renta Fija" ROJ900877 que ya usa la firma).
const DARK_GREEN = 'FF1B4332'
const LIGHT_GREEN = 'FFDCE9D8'
const GREEN_TEXT = 'FF1B4332'
const GRAY_TEXT = 'FF6B7280'
const RED_TEXT = 'FF8C1D1D'
const BAND_FILL = 'FFF7FAF7'
const BORDER_COLOR = 'FFD9D9D9'
const FONT_NAME = 'Arial'
const MONEY_FMT = '$#,##0.00;[RED]-$#,##0.00'
const PCT_FMT = '0.00%'

const hairBottom = { bottom: { style: 'hair' as const, color: { argb: BORDER_COLOR } } }

function addSubtitleAndLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, lastCol: number) {
  const subCol = Math.max(1, lastCol - 2)
  ws.mergeCells(1, subCol, 1, lastCol)
  const sub = ws.getCell(1, subCol)
  const monthLabel = new Date().toLocaleDateString('es-UY', { month: 'long', year: 'numeric' })
  sub.value = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)}  |  Roble Capital Wealth Management`
  sub.font = { name: FONT_NAME, size: 9, italic: true, color: { argb: GRAY_TEXT } }
  sub.alignment = { horizontal: 'right', vertical: 'bottom' }
  ws.getRow(1).height = 16
  ws.getRow(2).height = 18

  const imageId = wb.addImage({ base64: `data:image/png;base64,${ROBLE_LOGO_BASE64}`, extension: 'png' } as any)
  ws.addImage(imageId, { tl: { col: subCol - 1, row: 1 } as any, ext: { width: 110, height: 30 } })
}

function plainTitle(ws: ExcelJS.Worksheet, row: number, text: string) {
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: 'FF000000' } }
  ws.getRow(row).height = 24
}

function headerRow(ws: ExcelJS.Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    if (!h) return
    const cell = ws.getCell(row, i + 1)
    cell.value = h
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_GREEN } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  ws.getRow(row).height = 26
}

function styleDataCell(cell: ExcelJS.Cell, band: boolean, numFmt?: string, muted?: boolean) {
  cell.font = { name: FONT_NAME, size: 10, color: { argb: muted ? GRAY_TEXT : 'FF000000' } }
  cell.border = hairBottom
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: band ? BAND_FILL : 'FFFFFFFF' } }
  if (numFmt) cell.numFmt = numFmt
}

function styleTotalCell(cell: ExcelJS.Cell, numFmt?: string) {
  cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: GREEN_TEXT } }
  cell.border = { top: { style: 'thin', color: { argb: DARK_GREEN } } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GREEN } }
  if (numFmt) cell.numFmt = numFmt
}

function resetView(ws: ExcelJS.Worksheet) {
  // El workbook siempre se arma de cero (nunca releyendo un .xlsx anterior),
  // así que una hoja recién creada ya arranca en A1 sin scroll ni panes
  // heredados — alcanza con fijar el estado 'normal'. topLeftCell no es una
  // propiedad válida para ese estado en los tipos de exceljs (solo existe en
  // las variantes 'frozen'/'split'), por eso tiraba error de compilación.
  ws.views = [{ state: 'normal' }]
}

interface RenderedRow {
  ticker: string
  description: string
  quantity: number
  unitCost: number
  tradeDateLabel: string // fecha real formateada o "Multiple"
  lastPrice: number | null
  isTopLevel: boolean // true = cuenta en el total; false = fila de desglose
}

function buildRenderedRows(positions: OpenPosition[]): RenderedRow[] {
  const rows: RenderedRow[] = []
  for (const pos of positions) {
    if (pos.lots.length === 1) {
      rows.push({
        ticker: pos.ticker,
        description: pos.description,
        quantity: pos.lots[0].quantity,
        unitCost: pos.lots[0].unitCost,
        tradeDateLabel: pos.lots[0].tradeDate ?? '',
        lastPrice: pos.lastPrice,
        isTopLevel: true,
      })
      continue
    }
    const totalQty = pos.lots.reduce((s, l) => s + l.quantity, 0)
    const totalCost = pos.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    rows.push({
      ticker: pos.ticker,
      description: pos.description,
      quantity: totalQty,
      unitCost: totalQty > 0 ? totalCost / totalQty : 0,
      tradeDateLabel: 'Multiple',
      lastPrice: pos.lastPrice,
      isTopLevel: true,
    })
    for (const lot of pos.lots) {
      rows.push({
        ticker: pos.ticker,
        description: pos.description,
        quantity: lot.quantity,
        unitCost: lot.unitCost,
        tradeDateLabel: lot.tradeDate ?? '',
        lastPrice: null, // las filas de desglose no llevan Last Price (no suman en el total)
        isTopLevel: false,
      })
    }
  }
  return rows
}

function buildAbiertasSheet(wb: ExcelJS.Workbook, analyst: Analyst, positions: OpenPosition[]): { totalCost: number; totalValue: number; rows: PreviewRow[] } {
  const isIndio = analyst === 'INDIO'
  const ws = wb.addWorksheet(`Abiertas 2026 ${analyst}`)
  const lastCol = isIndio ? 10 : 11 // J o K
  addSubtitleAndLogo(wb, ws, lastCol)
  plainTitle(ws, 3, `ABIERTAS 2026 ${analyst}`)

  // INDIO: A Ticker, B Qty, C Desc, D Fecha, E Costo Unit, F Last, G CostoTotal, H MV, I G/L, J G/L%
  // CHINO: A Ticker, (B vacío), C Qty, D Desc, E Fecha, F Costo Unit, G Last, H CostoTotal, I MV, J G/L, K G/L%
  const headers = isIndio
    ? ['Security Identifier', 'Quantity', 'Security Description', 'Trade Date', 'Unit Cost', 'Last Price', 'Original Total Cost', 'Market Value', 'Gain/Loss', 'Gain/Loss %']
    : ['Security Identifier', '', 'Quantity', 'Security Description', 'Trade Date', 'Unit Cost', 'Last Price', 'Original Total Cost', 'Market Value', 'Gain/Loss', 'Gain/Loss %']
  headerRow(ws, 5, headers)

  const qtyCol = isIndio ? 2 : 3
  const descCol = isIndio ? 3 : 4
  const dateCol = isIndio ? 4 : 5
  const costCol = isIndio ? 5 : 6
  const lastCol_ = isIndio ? 6 : 7
  const origCostCol = isIndio ? 7 : 8
  const mvCol = isIndio ? 8 : 9
  const glCol = isIndio ? 9 : 10
  const glPctCol = isIndio ? 10 : 11

  const rendered = buildRenderedRows(positions)
  let r = 6
  const topRowsForTotal: number[] = []
  const previewRows: PreviewRow[] = []

  for (const row of rendered) {
    const band = (r - 6) % 2 === 1
    ws.getCell(r, 1).value = row.ticker
    styleDataCell(ws.getCell(r, 1), band)
    ws.getCell(r, 1).alignment = { horizontal: 'center' }

    ws.getCell(r, qtyCol).value = row.quantity
    styleDataCell(ws.getCell(r, qtyCol), band)

    ws.getCell(r, descCol).value = row.description
    styleDataCell(ws.getCell(r, descCol), band)

    ws.getCell(r, dateCol).value = row.tradeDateLabel
    styleDataCell(ws.getCell(r, dateCol), band)

    ws.getCell(r, costCol).value = row.unitCost
    styleDataCell(ws.getCell(r, costCol), band)

    if (row.lastPrice != null) {
      ws.getCell(r, lastCol_).value = row.lastPrice
      styleDataCell(ws.getCell(r, lastCol_), band)
    } else {
      styleDataCell(ws.getCell(r, lastCol_), band)
    }

    const origCostFormula = `${colLetter(qtyCol)}${r}*${colLetter(costCol)}${r}`
    const origCostResult = row.quantity * row.unitCost
    ws.getCell(r, origCostCol).value = { formula: origCostFormula, result: origCostResult } as any
    styleDataCell(ws.getCell(r, origCostCol), band, MONEY_FMT)

    const mvFormula = `${colLetter(qtyCol)}${r}*${colLetter(lastCol_)}${r}`
    const mvResult = row.lastPrice != null ? row.quantity * row.lastPrice : 0
    ws.getCell(r, mvCol).value = { formula: mvFormula, result: mvResult } as any
    styleDataCell(ws.getCell(r, mvCol), band, MONEY_FMT)

    const glFormula = `${colLetter(mvCol)}${r}-${colLetter(origCostCol)}${r}`
    const glResult = mvResult - origCostResult
    ws.getCell(r, glCol).value = { formula: glFormula, result: glResult } as any
    styleDataCell(ws.getCell(r, glCol), band, MONEY_FMT)

    const glPctFormula = `${colLetter(glCol)}${r}/${colLetter(origCostCol)}${r}`
    const glPctResult = origCostResult !== 0 ? glResult / origCostResult : 0
    ws.getCell(r, glPctCol).value = { formula: glPctFormula, result: glPctResult } as any
    styleDataCell(ws.getCell(r, glPctCol), band, PCT_FMT)

    if (row.isTopLevel) {
      topRowsForTotal.push(r)
      previewRows.push({
        ticker: row.ticker,
        description: row.description,
        quantity: row.quantity,
        originalTotalCost: origCostResult,
        marketValue: mvResult,
        gainLoss: glResult,
        gainLossPct: glPctResult,
      })
    }
    r += 1
  }

  const totalRow = r
  const origCostTotalFormula = topRowsForTotal.map(tr => `${colLetter(origCostCol)}${tr}`).join('+')
  const mvTotalFormula = topRowsForTotal.map(tr => `${colLetter(mvCol)}${tr}`).join('+')
  const totalCost = previewRows.reduce((s, p) => s + p.originalTotalCost, 0)
  const totalValue = previewRows.reduce((s, p) => s + p.marketValue, 0)

  ws.getCell(totalRow, origCostCol).value = { formula: `+${origCostTotalFormula}`, result: totalCost } as any
  styleTotalCell(ws.getCell(totalRow, origCostCol), MONEY_FMT)
  ws.getCell(totalRow, mvCol).value = { formula: `+${mvTotalFormula}`, result: totalValue } as any
  styleTotalCell(ws.getCell(totalRow, mvCol), MONEY_FMT)
  const glTotalResult = totalValue - totalCost
  ws.getCell(totalRow, glCol).value = { formula: `+${colLetter(mvCol)}${totalRow}-${colLetter(origCostCol)}${totalRow}`, result: glTotalResult } as any
  styleTotalCell(ws.getCell(totalRow, glCol), MONEY_FMT)
  const glPctTotalResult = totalCost !== 0 ? glTotalResult / totalCost : 0
  ws.getCell(totalRow, glPctCol).value = { formula: `+${colLetter(glCol)}${totalRow}/${colLetter(origCostCol)}${totalRow}`, result: glPctTotalResult } as any
  styleTotalCell(ws.getCell(totalRow, glPctCol), PCT_FMT)

  const widths = [12, 12, 34, 14, 13, 13, 14, 14, 13, 12, 12]
  widths.slice(0, lastCol).forEach((w, i) => { ws.getColumn(i + 1).width = w })

  resetView(ws)
  ;(ws as any)._icheTotalRow = totalRow
  ;(ws as any)._icheOrigCostCol = origCostCol
  ;(ws as any)._icheMvCol = mvCol

  return { totalCost, totalValue, rows: previewRows }
}

function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function buildCerradasSheet(wb: ExcelJS.Workbook, analyst: Analyst, year: number, positions: ClosedPosition[]): { totalCost: number; totalVenta: number } {
  const ws = wb.addWorksheet(`Cerradas ${year} ${analyst}`)
  addSubtitleAndLogo(wb, ws, 11)
  plainTitle(ws, 3, `CERRADAS ${year} ${analyst}`)
  headerRow(ws, 5, ['Security Identifier', 'Security Description', 'Opening Date', 'Cost Basis', 'Closing Date', 'Quantity', 'Venta', 'Gain/Loss', 'Gain/Loss %', 'Cost price', 'Final price'])

  let r = 6
  const topRows: number[] = []
  let totalCost = 0
  let totalVenta = 0

  for (const pos of positions) {
    const band = (r - 6) % 2 === 1
    ws.getCell(r, 1).value = pos.ticker
    styleDataCell(ws.getCell(r, 1), band)
    ws.getCell(r, 2).value = pos.description
    styleDataCell(ws.getCell(r, 2), band)
    ws.getCell(r, 3).value = pos.openingDate
    styleDataCell(ws.getCell(r, 3), band)
    ws.getCell(r, 4).value = pos.costBasis
    styleDataCell(ws.getCell(r, 4), band, MONEY_FMT)
    ws.getCell(r, 5).value = pos.closingDate
    styleDataCell(ws.getCell(r, 5), band)
    ws.getCell(r, 6).value = pos.quantity
    styleDataCell(ws.getCell(r, 6), band)
    ws.getCell(r, 7).value = pos.saleProceeds
    styleDataCell(ws.getCell(r, 7), band, MONEY_FMT)

    const gl = pos.saleProceeds - pos.costBasis
    ws.getCell(r, 8).value = { formula: `G${r}-D${r}`, result: gl } as any
    styleDataCell(ws.getCell(r, 8), band, MONEY_FMT)
    const glPct = pos.costBasis !== 0 ? gl / pos.costBasis : 0
    ws.getCell(r, 9).value = { formula: `H${r}/D${r}`, result: glPct } as any
    styleDataCell(ws.getCell(r, 9), band, PCT_FMT)
    const costPrice = pos.quantity !== 0 ? pos.costBasis / pos.quantity : 0
    ws.getCell(r, 10).value = { formula: `+D${r}/F${r}`, result: costPrice } as any
    styleDataCell(ws.getCell(r, 10), band)
    const finalPrice = pos.quantity !== 0 ? pos.saleProceeds / pos.quantity : 0
    ws.getCell(r, 11).value = { formula: `+G${r}/F${r}`, result: finalPrice } as any
    styleDataCell(ws.getCell(r, 11), band)

    topRows.push(r)
    totalCost += pos.costBasis
    totalVenta += pos.saleProceeds
    r += 1
  }

  const totalRow = r
  ws.getCell(totalRow, 4).value = { formula: `+${topRows.map(tr => `D${tr}`).join('+')}`, result: totalCost } as any
  styleTotalCell(ws.getCell(totalRow, 4), MONEY_FMT)
  ws.getCell(totalRow, 7).value = { formula: `+${topRows.map(tr => `G${tr}`).join('+')}`, result: totalVenta } as any
  styleTotalCell(ws.getCell(totalRow, 7), MONEY_FMT)
  const glTotal = totalVenta - totalCost
  ws.getCell(totalRow, 8).value = { formula: `+G${totalRow}-D${totalRow}`, result: glTotal } as any
  styleTotalCell(ws.getCell(totalRow, 8), MONEY_FMT)
  const glPctTotal = totalCost !== 0 ? glTotal / totalCost : 0
  ws.getCell(totalRow, 9).value = { formula: `+H${totalRow}/D${totalRow}`, result: glPctTotal } as any
  styleTotalCell(ws.getCell(totalRow, 9), PCT_FMT)

  ;[12, 34, 12, 14, 12, 10, 14, 14, 12, 11, 11].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  resetView(ws)
  ;(ws as any)._icheTotalRow = totalRow

  return { totalCost, totalVenta }
}

function buildResumenSheet(
  wb: ExcelJS.Workbook,
  cerradasTotals: Record<string, { totalCost: number; totalVenta: number }>,
  abiertasTotals: Record<Analyst, { totalCost: number; totalValue: number }>
): PreviewSummaryRow[] {
  const ws = wb.addWorksheet('RESUMEN')
  addSubtitleAndLogo(wb, ws, 6)
  plainTitle(ws, 2, 'RESUMEN — Cartera de Acciones ICHE')

  const preview: PreviewSummaryRow[] = []
  const HIGHLIGHT_LABELS = new Set(['Actuales CHINO', 'Actuales INDIO'])

  interface Line { label: string; cost: number; venta: number }
  const lines: Line[] = [
    { label: 'Cerradas CHINO 2025', ...toCV(cerradasTotals['CHINO_2025']) },
    { label: 'Cerradas CHINO 2026', ...toCV(cerradasTotals['CHINO_2026']) },
    { label: 'Cerradas Indio 2025', ...toCV(cerradasTotals['INDIO_2025']) },
    { label: 'Cerradas Indio 2026', ...toCV(cerradasTotals['INDIO_2026']) },
    { label: 'Actuales CHINO', cost: abiertasTotals.CHINO.totalCost, venta: abiertasTotals.CHINO.totalValue },
    { label: 'Actuales INDIO', cost: abiertasTotals.INDIO.totalCost, venta: abiertasTotals.INDIO.totalValue },
  ]

  let row = 4
  for (const line of lines) {
    const highlight = HIGHLIGHT_LABELS.has(line.label)
    const gl = line.venta - line.cost
    const glPct = line.cost !== 0 ? gl / line.cost : null
    const border = { bottom: { style: 'hair' as const, color: { argb: BORDER_COLOR } } }
    const highlightFill = highlight ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: LIGHT_GREEN } } : undefined

    const label = ws.getCell(row, 2)
    label.value = line.label
    label.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: highlight ? GREEN_TEXT : 'FF000000' } }
    label.border = border
    if (highlightFill) label.fill = highlightFill

    for (const entry of [{ col: 3, val: line.cost }, { col: 4, val: line.venta }]) {
      const c = ws.getCell(row, entry.col)
      c.value = entry.val
      c.numFmt = MONEY_FMT
      c.border = border
      c.font = { name: FONT_NAME, size: 10, bold: highlight, color: { argb: highlight ? GREEN_TEXT : 'FF000000' } }
      if (highlightFill) c.fill = highlightFill
    }

    const glCell = ws.getCell(row, 5)
    glCell.value = gl
    glCell.numFmt = MONEY_FMT
    glCell.border = border
    glCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: gl >= 0 ? GREEN_TEXT : RED_TEXT } }
    if (highlightFill) glCell.fill = highlightFill

    if (glPct != null) {
      const pctCell = ws.getCell(row, 6)
      pctCell.value = glPct
      pctCell.numFmt = PCT_FMT
      pctCell.border = border
      pctCell.font = { name: FONT_NAME, size: 10, bold: highlight, color: { argb: highlight ? GREEN_TEXT : 'FF000000' } }
      if (highlightFill) pctCell.fill = highlightFill
    }

    preview.push({ label: line.label, cost: line.cost, value: line.venta, gainLoss: gl, gainLossPct: glPct })
    row += 1
  }

  ws.getColumn(1).width = 3
  ws.getColumn(2).width = 22
  ;[3, 4, 5, 6].forEach(c => { ws.getColumn(c).width = 16 })
  resetView(ws)

  return preview

  function toCV(t: { totalCost: number; totalVenta: number } | undefined) {
    return { cost: t?.totalCost ?? 0, venta: t?.totalVenta ?? 0 }
  }
}

export interface GeneratedWorkbook {
  buffer: Buffer
  preview: {
    resumen: PreviewSummaryRow[]
    abiertasIndio: PreviewRow[]
    abiertasChino: PreviewRow[]
  }
}

export async function generateWorkbook(openPositions: OpenPosition[], closedPositions: ClosedPosition[]): Promise<GeneratedWorkbook> {
  const wb = new ExcelJS.Workbook()

  const cerradasTotals: Record<string, { totalCost: number; totalVenta: number }> = {}
  for (const analyst of ['INDIO', 'CHINO'] as Analyst[]) {
    for (const year of [2025, 2026]) {
      const positions = closedPositions.filter(p => p.analyst === analyst && p.year === year)
      cerradasTotals[`${analyst}_${year}`] = buildCerradasSheet(wb, analyst, year, positions)
    }
  }

  const abiertasResults: Record<Analyst, { totalCost: number; totalValue: number; rows: PreviewRow[] }> = {} as any
  for (const analyst of ['INDIO', 'CHINO'] as Analyst[]) {
    const positions = openPositions.filter(p => p.analyst === analyst)
    abiertasResults[analyst] = buildAbiertasSheet(wb, analyst, positions)
  }

  const resumenPreview = buildResumenSheet(wb, cerradasTotals, {
    INDIO: abiertasResults.INDIO,
    CHINO: abiertasResults.CHINO,
  })

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    preview: {
      resumen: resumenPreview,
      abiertasIndio: abiertasResults.INDIO.rows,
      abiertasChino: abiertasResults.CHINO.rows,
    },
  }
}
