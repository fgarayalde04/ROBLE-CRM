/**
 * Calendario de Cupones en Excel: una hoja con el mismo diseño que el PDF y
 * fórmulas vivas (grilla mensual, totales, % y resumen). Cupón, nominal y meses
 * de pago (columnas ocultas U:AF) son inputs en azul: si se cambian, todo se
 * recalcula. exceljs no escribe gráficos, así que el de barras se agrega
 * después editando el .xlsx (ver addChart).
 */
import ExcelJS from 'exceljs'
import PizZip from 'pizzip'
import { ROBLE_LOGO_BASE64 } from '@/lib/icheAcciones/logoBase64'
import {
  DISCLAIMER, FOOTER_LEFT, MAX_BONDS_ONE_PAGE, MESES, bondSubline, footerRight, longDate, maturityLabel,
  nextPaymentLabel, notesText, payDatesLabel, summarize,
} from './calc'
import type { CouponCalendar } from './types'

const SHEET = 'Calendario de Cupones'
const NAVY = 'FF1B2A38'
const GRAY = 'FF8A949E'
const GRAY_DARK = 'FF4A5560'
const TEXT = 'FF1F2933'
const BLUE = 'FF0000FF'
const STRIP = 'FFF5F7F9'
const ALT = 'FFFAFBFC'
const YELLOW = 'FFFDF3C7'
const YELLOW_DARK = 'FFF4D96B'
const TOTAL_LABEL = 'FF78848E'
const LINE = 'FFE3E7EB'
const FONT = 'Arial'
const MONEY = '"$ "#,##0.00;"($ "#,##0.00);"-"'
const PCT1 = '0.0%;-0.0%;"-"'

const FIRST_BOND_ROW = 10
const MONTH_COL = 7 // G = enero
const TOTAL_COL = 19 // S
const INPUT_COL = 21 // U..AF: meses de pago
const LAST_PRINT_COL = 'T'

const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
const col = (n: number) => {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export async function buildCalendarXlsx(cal: CouponCalendar): Promise<Buffer> {
  const s = summarize(cal)
  const n = cal.bonds.length
  const lastBond = FIRST_BOND_ROW + n - 1
  const totalRow = lastBond + 2
  const pctRow = totalRow + 1
  const resTitle = pctRow + 2
  const resFirst = resTitle + 1
  const notesRow = resFirst + 7
  const discRow = notesRow + 2
  const footRow = discRow + 2
  const ccy = cal.baseCcy || 'USD'
  const T = `$S$${totalRow}`
  const F = `$F$${totalRow}`

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Roble Capital'
  const ws = wb.addWorksheet(SHEET, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 9, topLeftCell: 'C10', showGridLines: false, activeCell: 'C10' }],
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1,
      fitToHeight: n > MAX_BONDS_ONE_PAGE ? 0 : 1,
      printArea: `A1:${LAST_PRINT_COL}${footRow}`,
      printTitlesRow: n > MAX_BONDS_ONE_PAGE ? '9:9' : undefined,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
    },
  })

  const widths = [2, 44, 13, 8, 16, 14, ...Array(12).fill(11.5), 14, 2, ...Array(12).fill(5)]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  for (let c = INPUT_COL; c < INPUT_COL + 12; c++) ws.getColumn(c).hidden = true

  const put = (addr: string, value: ExcelJS.CellValue, font: Partial<ExcelJS.Font>, extra: Partial<ExcelJS.Style> = {}) => {
    const cell = ws.getCell(addr)
    cell.value = value
    cell.font = { name: FONT, ...font }
    Object.assign(cell, extra)
    return cell
  }

  // ── Encabezado ──
  put('B2', 'Calendario de Cupones', { size: 18, bold: true, color: { argb: NAVY } })
  ws.getRow(2).height = 23
  put('B3', 'CASH FLOW PROJECTION · DOCUMENTO CONFIDENCIAL', { size: 7, color: { argb: GRAY } })
  ws.getRow(4).height = 6
  for (let c = 2; c <= TOTAL_COL; c++) ws.getCell(4, c).border = { bottom: { style: 'thick', color: { argb: NAVY } } }
  const logo = wb.addImage({ base64: `data:image/png;base64,${ROBLE_LOGO_BASE64}`, extension: 'png' } as any)
  ws.addImage(logo, { tl: { col: 16.6, row: 0.6 } as any, ext: { width: 190, height: 53 } })

  // ── Franja de datos ──
  ws.getRow(5).height = 25.5
  for (let c = 2; c <= TOTAL_COL; c++) ws.getCell(5, c).fill = fill(STRIP)
  const label = (addr: string, text: string) =>
    put(addr, text, { size: 7, color: { argb: GRAY } }, { alignment: { horizontal: 'right', vertical: 'middle' } })
  const value = (range: string, v: ExcelJS.CellValue, numFmt?: string) => {
    ws.mergeCells(range)
    const c = put(range.split(':')[0], v, { size: 9, bold: true, color: { argb: NAVY } }, { alignment: { horizontal: 'left', vertical: 'middle' } })
    if (numFmt) c.numFmt = numFmt
  }
  put('B5', `CLIENTE:  ${cal.clientName}`, { size: 9, bold: true, color: { argb: NAVY } }, { alignment: { vertical: 'middle' } })
  label('C5', 'ASESOR:'); value('D5:F5', cal.advisor)
  label('G5', 'FECHA:'); value('H5:J5', longDate(cal.docDate))
  label('K5', 'NOMINAL:'); value('L5:M5', { formula: F, result: s.nominal }, MONEY)
  label('N5', 'RENTA ANUAL:'); value('O5:P5', { formula: T, result: s.annual }, MONEY)
  label('Q5', 'RTO. CORRIENTE:'); value('R5:S5', { formula: `IF(${F}=0,0,${T}/${F})`, result: s.currentYield }, '0.00%')

  // ── Tabla ──
  put('B7', `BONOS · FLUJO DE CUPONES (${ccy})`, { size: 8, bold: true, color: { argb: NAVY } })
  const head = ['BONO', 'VENCIMIENTO', 'CUPÓN', 'FECHAS DE PAGO', 'VALOR NOMINAL', ...MESES.map((m) => m.toUpperCase()), 'TOTAL ANUAL']
  head.forEach((h, i) => {
    put(`${col(i + 2)}9`, h, { size: 8, bold: true, color: { argb: 'FFFFFFFF' } }, {
      fill: fill(NAVY),
      alignment: { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true },
      border: { right: { style: 'thin', color: { argb: 'FFFFFFFF' } } },
    })
  })
  ws.getRow(9).height = 21.75
  for (let i = 0; i < 12; i++) put(`${col(INPUT_COL + i)}9`, `M${i + 1}`, { size: 7, color: { argb: GRAY } })

  cal.bonds.forEach((b, i) => {
    const r = FIRST_BOND_ROW + i
    const bg = fill(i % 2 ? ALT : 'FFFFFFFF')
    const border = { bottom: { style: 'thin' as const, color: { argb: LINE } } }
    const base = { fill: bg, border }
    const txt = { size: 8, color: { argb: TEXT } }
    ws.getRow(r).height = 30

    put(`B${r}`, {
      richText: [
        { text: `${b.issuer}\n`, font: { name: FONT, size: 8, bold: true, color: { argb: NAVY } } },
        { text: bondSubline(b), font: { name: FONT, size: 7, bold: true, color: { argb: GRAY_DARK } } },
      ],
    }, txt, { ...base, alignment: { vertical: 'middle', wrapText: true } })
    put(`C${r}`, maturityLabel(b), txt, { ...base, alignment: { horizontal: 'center', vertical: 'middle' } })
    put(`D${r}`, b.couponRate, { size: 8, color: { argb: BLUE } }, { ...base, numFmt: '0.000%', alignment: { horizontal: 'center', vertical: 'middle' } })
    put(`E${r}`, payDatesLabel(b), txt, { ...base, alignment: { horizontal: 'center', vertical: 'middle' } })
    put(`F${r}`, b.nominal, { size: 8, bold: true, color: { argb: BLUE } }, { ...base, numFmt: MONEY, alignment: { horizontal: 'right', vertical: 'middle' } })

    const months = `$${col(INPUT_COL)}${r}:$${col(INPUT_COL + 11)}${r}`
    s.rows[i].forEach((v, m) => {
      put(`${col(MONTH_COL + m)}${r}`, {
        formula: `IF(COUNTIF(${months},COLUMN()-${MONTH_COL - 1})>0,$F${r}*$D${r}/COUNT(${months}),0)`,
        result: v,
      }, txt, { ...base, numFmt: MONEY, alignment: { horizontal: 'right', vertical: 'middle' } })
    })
    put(`S${r}`, { formula: `SUM(G${r}:R${r})`, result: s.rows[i].reduce((t, v) => t + v, 0) },
      { size: 8, bold: true, color: { argb: NAVY } }, { fill: fill(YELLOW), border, numFmt: MONEY, alignment: { horizontal: 'right', vertical: 'middle' } })
    b.payMonths.forEach((m, k) => put(`${col(INPUT_COL + k)}${r}`, m, { size: 8, color: { argb: BLUE } }))
  })

  ws.getCell(`D${FIRST_BOND_ROW}`).note =
    'Tasas, nominales y meses de pago (columnas ocultas U:AF) son inputs en azul. Los flujos se calculan como Nominal × Cupón ÷ pagos por año (cantidad de meses de pago) en cada mes de pago.'

  // ── Totales ──
  ws.getRow(lastBond + 1).height = 6
  ws.getRow(totalRow).height = 21.75
  const totFont = { size: 8, bold: true, color: { argb: 'FFFFFFFF' } }
  for (let c = 2; c <= 5; c++) put(`${col(c)}${totalRow}`, c === 2 ? 'TOTAL' : null, totFont, { fill: fill(TOTAL_LABEL), alignment: { vertical: 'middle' } })
  for (let c = 6; c <= TOTAL_COL; c++) {
    const L = col(c)
    const result = c === 6 ? s.nominal : c === TOTAL_COL ? s.annual : s.monthTotals[c - MONTH_COL]
    put(`${L}${totalRow}`, { formula: `SUM(${L}${FIRST_BOND_ROW}:${L}${lastBond})`, result },
      c === TOTAL_COL ? { ...totFont, color: { argb: NAVY } } : totFont,
      { fill: fill(c === TOTAL_COL ? YELLOW_DARK : NAVY), numFmt: MONEY, alignment: { horizontal: 'right', vertical: 'middle' } })
  }
  put(`B${pctRow}`, '% de la renta anual', { size: 7, italic: true, color: { argb: GRAY } })
  for (let c = MONTH_COL; c <= TOTAL_COL; c++) {
    const L = col(c)
    const v = c === TOTAL_COL ? s.annual : s.monthTotals[c - MONTH_COL]
    put(`${L}${pctRow}`, { formula: `IF(${T}=0,0,${L}${totalRow}/${T})`, result: s.annual ? v / s.annual : 0 },
      { size: 7, italic: true, color: { argb: GRAY } }, { numFmt: PCT1, alignment: { horizontal: 'right' } })
  }

  // ── Resumen ──
  put(`B${resTitle}`, 'RESUMEN', { size: 8, bold: true, color: { argb: NAVY } })
  const months = `G${totalRow}:R${totalRow}`
  const resumen: [string, ExcelJS.CellValue, string | undefined][] = [
    ['Renta anual estimada', { formula: T, result: s.annual }, MONEY],
    ['Promedio mensual', { formula: `${T}/12`, result: s.monthlyAverage }, MONEY],
    ['Rendimiento corriente sobre nominal', { formula: `IF(${F}=0,0,${T}/${F})`, result: s.currentYield }, '0.00%'],
    ['Meses con cobro', { formula: `COUNTIF(${months},">0")`, result: s.monthsWithPayment }, '0'],
    ['Mayor cobro mensual', { formula: `MAX(${months})`, result: s.maxMonth }, MONEY],
    ['Próximo cobro', nextPaymentLabel(s.next, ccy), undefined],
  ]
  const thin = { style: 'thin' as const, color: { argb: LINE } }
  const box = { top: thin, bottom: thin, left: thin, right: thin }
  resumen.forEach(([k, v, fmt], i) => {
    const r = resFirst + i
    put(`B${r}`, k, { size: 8, color: { argb: GRAY_DARK } }, { fill: fill(STRIP), border: box })
    ws.mergeCells(`C${r}:F${r}`)
    const c = put(`C${r}`, v, { size: 8, bold: true, color: { argb: NAVY } }, { border: box, alignment: { horizontal: 'right' } })
    if (fmt) c.numFmt = fmt
  })

  // ── Notas, disclaimer y pie ──
  const paragraph = (r: number, text: string, size: number, color: string, height: number) => {
    ws.mergeCells(`B${r}:S${r}`)
    put(`B${r}`, text, { size, color: { argb: color } }, { alignment: { wrapText: true, vertical: 'top' } })
    ws.getRow(r).height = height
  }
  const notes = notesText(cal)
  paragraph(notesRow, notes, 7, GRAY_DARK, 12 * Math.max(2, Math.ceil(notes.length / 260)))
  paragraph(discRow, DISCLAIMER, 6, GRAY, 26)
  for (let c = 2; c <= TOTAL_COL; c++) ws.getCell(footRow, c).border = { top: { style: 'thin', color: { argb: 'FFD5DAE0' } } }
  put(`B${footRow}`, FOOTER_LEFT, { size: 7, bold: true, color: { argb: NAVY } })
  put(`S${footRow}`, footerRight(cal.clientName), { size: 6, color: { argb: GRAY } }, { alignment: { horizontal: 'right' } })

  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  return addChart(buf, {
    title: `Flujo mensual de cupones (${ccy})`,
    cats: `'${SHEET}'!$G$9:$R$9`,
    vals: `'${SHEET}'!$G$${totalRow}:$R$${totalRow}`,
    values: s.monthTotals,
    from: { col: 7, row: resTitle - 1 },
    to: { col: 18, row: resFirst + 6 },
  })
}

// ─── Gráfico nativo de Excel ────────────────────────────────────────────────

interface ChartSpec {
  title: string
  cats: string
  vals: string
  values: number[]
  from: { col: number; row: number } // 0-based
  to: { col: number; row: number }
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function chartXml(c: ChartSpec) {
  const navy = NAVY.slice(2)
  const txPr = (sz: number, color: string, bold = false) =>
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="es-UY"/></a:p></c:txPr>`
  const cat = MESES.map((m, i) => `<c:pt idx="${i}"><c:v>${m.toUpperCase()}</c:v></c:pt>`).join('')
  const val = c.values.map((v, i) => `<c:pt idx="${i}"><c:v>${Math.round(v * 100) / 100}</c:v></c:pt>`).join('')
  const noLine = '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"><a:solidFill><a:srgbClr val="${navy}"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:r><a:rPr lang="es-UY" sz="900" b="1"><a:solidFill><a:srgbClr val="${navy}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${xmlEsc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
<c:ser><c:idx val="0"/><c:order val="0"/>
<c:spPr><a:solidFill><a:srgbClr val="${navy}"/></a:solidFill></c:spPr>
<c:invertIfNegative val="0"/>
<c:dLbls><c:numFmt formatCode="#,##0;;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(700, navy, true)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>
<c:cat><c:strRef><c:f>${xmlEsc(c.cats)}</c:f><c:strCache><c:ptCount val="12"/>${cat}</c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:f>${xmlEsc(c.vals)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="12"/>${val}</c:numCache></c:numRef></c:val>
</c:ser>
<c:gapWidth val="60"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>
<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D5DAE0"/></a:solidFill></a:ln></c:spPr>${txPr(700, GRAY.slice(2))}<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E3E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${noLine}${txPr(700, GRAY.slice(2))}<c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
</c:plotArea>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
</c:chartSpace>`
}

/** Agrega el gráfico al dibujo que exceljs ya creó para el logo. */
function addChart(xlsx: Buffer, c: ChartSpec): Buffer {
  const zip = new PizZip(xlsx)
  const drawingPath = Object.keys(zip.files).find((f) => /^xl\/drawings\/drawing\d+\.xml$/.test(f))
  if (!drawingPath) return xlsx
  const relsPath = drawingPath.replace('drawings/', 'drawings/_rels/') + '.rels'
  const rId = 'rIdCuponesChart'

  zip.file('xl/charts/chart1.xml', chartXml(c))

  const rels = zip.file(relsPath)?.asText() ??
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  zip.file(relsPath, rels.replace('</Relationships>',
    `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`))

  const anchor = `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${c.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="1001" name="Flujo mensual"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
  const drawing = zip.file(drawingPath)!.asText()
  zip.file(drawingPath, drawing.replace(/<\/xdr:wsDr>\s*$/, `${anchor}</xdr:wsDr>`))

  const ct = zip.file('[Content_Types].xml')!.asText()
  zip.file('[Content_Types].xml', ct.replace('</Types>',
    '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>'))

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
}
