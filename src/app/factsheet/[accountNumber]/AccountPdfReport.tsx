import type { PortfolioPositionRow, PortfolioImportRow, PortfolioAccountInfo, PortfolioCashProjectionRow, PortfolioCashProjectionsImportRow, PortfolioPerformanceRow, PortfolioUnrealizedGainLossRow } from '@/types/portfolio'
import { fmtUSD, fmtUSD2, fmtPct, fmtDate } from './PortfolioAccountClient'
import DonutChart from '@/components/portfolio/DonutChart'
import { COLORS, DONUT_COLORS, monthLabel } from '@/lib/portfolio/theme'
import { ASSET_CLASS_ES, assetClassRank, computePerfValueSeries, computeInitialAccountValue } from '@/lib/portfolio/engine'
import { ROBLE_DISCLAIMER } from '@/lib/disclaimers'

// Off-screen printable layout captured page-by-page (html2canvas + jsPDF) by
// PortfolioAccountClient's handleDownloadPDF — never shown to the user
// directly, mounted positioned off-screen so it still has real layout.
// Deliberately avoids recharts here: only plain SVG (DonutChart, PdfPerfBarChart)
// and CSS div-bars, which paint synchronously and capture reliably in
// html2canvas — unlike animated/portal-based chart libraries.

// A4 apaisado. El paginado (PortfolioAccountClient.handleDownloadPDF) usa
// orientation: 'landscape' — este ancho/alto tiene que coincidir.
const PAGE_PAD_MM = 14
const PAGE_STYLE: React.CSSProperties = { width: '297mm', minHeight: '210mm', background: '#fff', padding: `${PAGE_PAD_MM}mm`, fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', position: 'relative' }

// Logo del custodio para la carátula. Si existe public/bny-logo.png, poner
// BNY_LOGO_READY = true para usar la imagen; si no, se dibuja un lockup de
// texto con la misma marca ("BNY MELLON | PERSHING").
const BNY_LOGO_READY = true
const BNY_LOGO_SRC = '/bny-logo.webp'
const BNY_GREY = '#585858'
const BNY_GOLD = '#A9861F'

function BnyLogo({ height = 10 }: { height?: number }) {
  if (BNY_LOGO_READY) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={BNY_LOGO_SRC} alt="BNY Mellon | Pershing" style={{ height: `${height}mm`, objectFit: 'contain' }} />
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: `${height * 0.35}mm`, fontFamily: 'Georgia, "Times New Roman", serif' }}>
      <span style={{ fontSize: height * 2.1, fontWeight: 700, color: BNY_GREY, letterSpacing: 1 }}>BNY&nbsp;MELLON</span>
      <span style={{ width: 1, height: `${height * 1.3}mm`, background: COLORS.mutedSlate }} />
      <span style={{ fontSize: height * 2.1, fontWeight: 700, color: BNY_GOLD, letterSpacing: 1 }}>PERSHING</span>
    </div>
  )
}

// Long names are truncated here in JS rather than via CSS
// (overflow:hidden + text-overflow:ellipsis) — html2canvas doesn't always
// size a flex item's cross-axis to its text content correctly, which can
// clip the bottom of the glyphs instead of just cutting the string short.
function truncateName(s: string, maxChars: number): string {
  return s.length > maxChars ? s.slice(0, maxChars - 1).trimEnd() + '…' : s
}

// Encabezado de cada hoja: logo Roble a la izquierda, título de la sección a
// la derecha. Sin recuadro de datos (ese se sacó del reporte).
function PdfHeader({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `2px solid ${COLORS.darkGreen}`, paddingBottom: '2.5mm', marginBottom: '5mm' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/download.png" alt="Roble Capital" style={{ height: '9mm', objectFit: 'contain' }} />
      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.darkGreen }}>{title}</div>
    </div>
  )
}

// Tarjeta de estadística reutilizable (institucional, prolija).
function StatTile({ label, value, sub, color, big }: { label: string; value: string; sub?: string | null; color?: string; big?: boolean }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: big ? '4mm 5mm' : '2.8mm 3.2mm' }}>
      <div style={{ fontSize: big ? 8 : 6.8, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: big ? 20 : 12, fontWeight: 800, color: color ?? COLORS.ink, marginTop: '1.2mm' }}>{value}</div>
      {sub && <div style={{ fontSize: big ? 7 : 6.3, color: COLORS.mutedSlate, marginTop: '0.6mm' }}>{sub}</div>}
    </div>
  )
}

function PdfFooter({ clientName }: { clientName: string }) {
  return (
    <div style={{ position: 'absolute', bottom: `${PAGE_PAD_MM - 4}mm`, left: `${PAGE_PAD_MM}mm`, right: `${PAGE_PAD_MM}mm`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${COLORS.border}`, paddingTop: '2mm' }}>
      <span style={{ fontSize: 7, fontWeight: 700, color: COLORS.darkGreen }}>ROBLE CAPITAL WEALTH MANAGEMENT</span>
      <span style={{ fontSize: 6.5, color: COLORS.mutedSlate }}>Documento confidencial · Preparado exclusivamente para {clientName}</span>
    </div>
  )
}

function PdfDonut({ title, data }: { title: string; data: { label: string; value: number; pct: number }[] }) {
  if (data.length === 0) return null
  const total = data.reduce((s, d) => s + d.value, 0)
  const segments = data.map((d, i) => ({ label: d.label, value: d.value, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
  return (
    <div style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 3mm 5mm' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: COLORS.ink, marginBottom: '2mm', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>{title}</div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DonutChart segments={segments} size={92} thickness={16} centerLabel={fmtUSD(total)} centerSub="" />
      </div>
      <div style={{ marginTop: '3mm' }}>
        {data.map((d, i) => (
          <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '4mm', fontSize: 6.8, lineHeight: 1.4, padding: '1mm 0', fontFamily: 'Arial, sans-serif' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '1mm', color: COLORS.slate, minWidth: 0 }}>
              <span style={{ width: 5, height: 5, borderRadius: 5, background: DONUT_COLORS[i % DONUT_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
              <span>{truncateName(d.label, 26)}</span>
            </span>
            <span style={{ fontWeight: 700, color: COLORS.ink, flexShrink: 0, marginLeft: '2mm' }}>{fmtPct(d.pct)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CssBarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2mm', height: '36mm', paddingTop: '4mm' }}>
      {data.map(d => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 6.2, color: COLORS.ink, fontWeight: 700, lineHeight: 1.6, marginBottom: '1mm', fontFamily: 'Arial, sans-serif' }}>{d.value > 0 ? fmtUSD(d.value) : ''}</div>
          <div style={{ width: '70%', height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0)}%`, background: color, borderRadius: '1mm 1mm 0 0' }} />
          <div style={{ fontSize: 6.5, color: COLORS.slate, lineHeight: 1.6, marginTop: '1.5mm', fontFamily: 'Arial, sans-serif' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// Gráfico de línea/área de la evolución del valor de la cuenta — SVG plano
// (se captura bien en html2canvas), igual que la pestaña Rendimiento.
function PdfAreaChart({ points, height = 46 }: { points: { date: string; value: number }[]; height?: number }) {
  const W = 1000, H = 260, padL = 8, padR = 8, padT = 12, padB = 24
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const n = points.length
  const x = (i: number) => padL + (i / Math.max(n - 1, 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(n - 1).toFixed(1)} ${(H - padB).toFixed(1)} L ${x(0).toFixed(1)} ${(H - padB).toFixed(1)} Z`
  const first = points[0], last = points[n - 1]
  // Etiqueta de valor arriba del punto salvo que esté muy cerca del techo
  // del gráfico, en cuyo caso va abajo — evita que se corte o se superponga
  // con el borde. Con solo 2 etiquetas (primer y último punto), en extremos
  // opuestos del eje x, no llegan a pisarse entre sí.
  const labelY = (v: number) => (y(v) < padT + 24 ? y(v) + 20 : y(v) - 10)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: `${height}mm`, display: 'block' }} preserveAspectRatio="none">
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={COLORS.border} strokeWidth={1} />
      <path d={area} fill={COLORS.mintGreen} opacity={0.55} />
      <path d={line} fill="none" stroke={COLORS.midGreen} strokeWidth={2.5} />
      <circle cx={x(0)} cy={y(first.value)} r={4} fill={COLORS.slate} />
      <circle cx={x(n - 1)} cy={y(last.value)} r={4} fill={COLORS.darkGreen} />
      <text x={x(0)} y={labelY(first.value)} fontSize={14} fontWeight={700} fill={COLORS.slate} textAnchor="start">{fmtUSD(first.value)}</text>
      <text x={x(n - 1)} y={labelY(last.value)} fontSize={14} fontWeight={700} fill={COLORS.ink} textAnchor="end">{fmtUSD(last.value)}</text>
      <text x={padL} y={H - 6} fontSize={13} fill={COLORS.mutedSlate}>{fmtDate(first.date)}</text>
      <text x={W - padR} y={H - 6} fontSize={13} fill={COLORS.mutedSlate} textAnchor="end">{fmtDate(last.date)}</text>
    </svg>
  )
}

// Gráfico de barras de rentabilidad por período — el mismo que trae el PDF
// de performance del custodio (return % por período). SVG plano.
function PdfPerfBarChart({ series, height = 58 }: { series: { label: string; value: number | null }[]; height?: number }) {
  const vals = series.map(s => s.value).filter((v): v is number => v != null)
  if (vals.length === 0) return null
  const maxV = Math.max(...vals, 0)
  const minV = Math.min(...vals, 0)
  const range = (maxV - minV) || 1
  const W = 1000, H = 320, padT = 26, padB = 34
  const plotH = H - padT - padB
  const zeroY = padT + (maxV / range) * plotH
  const bw = W / series.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: `${height}mm`, display: 'block' }}>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke={COLORS.mutedSlate} strokeWidth={1.5} />
      {series.map((s, i) => {
        if (s.value == null) {
          return <text key={s.label} x={i * bw + bw / 2} y={H - 10} fontSize={15} fill={COLORS.slate} textAnchor="middle">{s.label}</text>
        }
        const pos = s.value >= 0
        const h = Math.max(Math.abs(s.value / range) * plotH, 2)
        const y = pos ? zeroY - h : zeroY
        const x = i * bw + bw * 0.24
        return (
          <g key={s.label}>
            <rect x={x} y={y} width={bw * 0.52} height={h} rx={3} fill={pos ? COLORS.midGreen : COLORS.loss} />
            <text x={i * bw + bw / 2} y={pos ? y - 8 : y + h + 20} fontSize={17} fontWeight={700}
              fill={pos ? COLORS.gain : COLORS.loss} textAnchor="middle">
              {s.value >= 0 ? '+' : ''}{s.value.toFixed(2)}%
            </text>
            <text x={i * bw + bw / 2} y={H - 10} fontSize={15} fill={COLORS.slate} textAnchor="middle">{s.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// Disclosure fijado al pie de la hoja (arriba del footer institucional).
// Va en el flujo normal, al final del contenido de la hoja (arriba del
// footer). data-pdf-keep-together evita que el paginado lo parta al medio.
function PdfDisclosure() {
  return (
    <div data-pdf-keep-together style={{ marginTop: '6mm', marginBottom: '8mm', paddingTop: '3mm', borderTop: `1px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 7, fontWeight: 700, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: '1.5mm' }}>Disclosures</div>
      <div style={{ fontSize: 6.4, color: COLORS.slate, lineHeight: 1.45, textAlign: 'justify' }}>{ROBLE_DISCLAIMER}</div>
    </div>
  )
}

export default function AccountPdfReport({
  account, accountNumber, importRow, sortedByValue, history, sections, assetAllocation, fixedIncomeBreakdown, currencyExposure,
  liquidity, maturityBuckets, nextMaturity, cashProjImport, cashProjRows, projectedIncome12m, nextPayment,
  cleanedNames, performance, unrealizedGLTotals, glByCusip,
  isConsolidated, custodianByPositionId, custodianBreakdown,
}: {
  account: PortfolioAccountInfo | null
  accountNumber: string
  importRow: PortfolioImportRow
  sortedByValue: PortfolioPositionRow[]
  history: { snapshot_date: string; total_market_value: string }[]
  sections?: { performance: boolean; composicion: boolean; holdings: boolean; income: boolean }
  assetAllocation: { assetClass: string; label: string; value: number; pct: number }[]
  fixedIncomeBreakdown: { label: string; value: number; pct: number }[]
  currencyExposure: { label: string; value: number; pct: number }[]
  liquidity: { value: number; pct: number }
  maturityBuckets: { year: number; value: number; count: number }[]
  nextMaturity: PortfolioPositionRow | null
  cashProjImport: PortfolioCashProjectionsImportRow | null
  cashProjRows: PortfolioCashProjectionRow[]
  projectedIncome12m: number
  nextPayment: PortfolioCashProjectionRow | null
  cleanedNames: Map<string, { name: string; detail: string | null }>
  performance: PortfolioPerformanceRow | null
  unrealizedGLTotals: { costBasis: number; gainLoss: number; pct: number; matched: number; total: number } | null
  glByCusip: Map<string, PortfolioUnrealizedGainLossRow>
  isConsolidated?: boolean
  custodianByPositionId?: Map<string, string> | null
  custodianBreakdown?: { label: string; value: number; pct: number }[]
}) {
  const totalValue = Number(importRow.total_market_value)
  const clientName = account?.clientName || account?.accountName || accountNumber
  const topHoldings = sortedByValue.slice(0, 6)
  const maxHoldingValue = topHoldings[0] ? Number(topHoldings[0].market_value) : 1

  const monthlyIncome = (() => {
    const map = new Map<string, number>()
    for (const r of cashProjRows) {
      const key = r.pay_date.slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + (r.estimated_amount != null ? Number(r.estimated_amount) : 0))
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(0, 8).map(([key, value]) => ({ label: monthLabel(key), value }))
  })()

  const hasMaturityCols = sortedByValue.some(p => p.maturity_date)
  const hasGL = glByCusip.size > 0
  const totalCostBasis = sortedByValue.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.cost_basis) : 0), 0)
  const totalGainLoss = sortedByValue.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.gain_loss) : 0), 0)
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0

  // Holdings agrupados por clase de activo (mismo orden y subtotales que la
  // vista en pantalla). El % de cada fila se recalcula sobre el total real
  // en modo consolidado.
  const rowPct = (p: PortfolioPositionRow) =>
    isConsolidated ? (totalValue > 0 ? (Number(p.market_value) / totalValue) * 100 : 0) : (p.weight_pct != null ? Number(p.weight_pct) : 0)
  const holdingGroups = (() => {
    const byClass = new Map<string, PortfolioPositionRow[]>()
    for (const p of sortedByValue) {
      const arr = byClass.get(p.asset_class) ?? []
      arr.push(p)
      byClass.set(p.asset_class, arr)
    }
    return Array.from(byClass.entries())
      .map(([assetClass, rows]) => {
        const subtotalValue = rows.reduce((s, p) => s + Number(p.market_value), 0)
        return {
          assetClass,
          label: ASSET_CLASS_ES[assetClass] ?? assetClass,
          rows,
          subtotalValue,
          subtotalPct: rows.reduce((s, p) => s + rowPct(p), 0),
          subtotalCost: rows.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.cost_basis) : 0), 0),
          subtotalGL: rows.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.gain_loss) : 0), 0),
        }
      })
      .sort((a, b) => {
        const rk = assetClassRank(a.assetClass) - assetClassRank(b.assetClass)
        return rk !== 0 ? rk : b.subtotalValue - a.subtotalValue
      })
  })()
  const holdingColSpan = 5 + (hasGL ? 2 : 0) + (hasMaturityCols ? 1 : 0) + (isConsolidated ? 1 : 0)

  const sec = { performance: true, composicion: true, holdings: true, income: true, ...(sections ?? {}) }
  const hasIncomePage = sec.income && !!cashProjImport && cashProjRows.length > 0
  // El disclosure va al pie de la última hoja de contenido que se muestre.
  const disclosureOn = hasIncomePage ? 'income' : sec.holdings ? 'holdings' : sec.composicion ? 'composicion' : 'performance'
  // Preferimos la serie reconstruida del reporte de performance (arranque,
  // valores intermedios y valor actual) — no necesita historial de
  // snapshots. Si no hay performance, caemos al historial de importaciones.
  const perfSeries = computePerfValueSeries(performance)
  const growthPoints = perfSeries.length >= 2
    ? perfSeries.map(p => ({ date: p.date, value: p.value }))
    : [...history]
        .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
        .map(h => ({ date: h.snapshot_date, value: Number(h.total_market_value) }))
  const sinceMoney = performance?.change_in_value?.sinceInception ?? null
  const sincePct = performance?.return_since_inception != null ? Number(performance.return_since_inception) : null
  const reportDate = new Date().toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })

  // Rendimiento estimado del Projected Income: income proyectado a 12 meses
  // dividido el market value de las posiciones que efectivamente generan
  // renta (bonos con cupón, liquidez, fondos y las que pagan dividendo).
  const incomeProducingMV = sortedByValue.reduce((s, p) => {
    const pays = (p.coupon != null && Number(p.coupon) > 0) ||
      !!p.dividend_policy ||
      ['Fixed Income', 'Cash', 'Fund'].includes(p.asset_class)
    return pays ? s + Number(p.market_value) : s
  }, 0)
  const incomeYield = hasIncomePage && incomeProducingMV > 0 ? (projectedIncome12m / incomeProducingMV) * 100 : null

  return (
    <div id="account-pdf-report" style={{ position: 'fixed', left: -10000, top: 0 }}>
      {/* ── Página 1: Portada ── */}
      <div className="pdf-page" style={PAGE_STYLE}>
        <div style={{ position: 'absolute', inset: `${PAGE_PAD_MM}mm`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/download.png" alt="Roble Capital" style={{ height: '15mm', objectFit: 'contain' }} />
            <BnyLogo height={16} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: COLORS.midGreen, textTransform: 'uppercase', letterSpacing: 8, fontWeight: 700 }}>Portfolio Report</div>
            <div style={{ width: '42mm', height: '2.5px', background: COLORS.darkGreen, margin: '6mm auto' }} />
            <div style={{ fontSize: 34, fontWeight: 800, color: COLORS.ink, letterSpacing: 0.3 }}>{clientName}</div>
            <div style={{ fontSize: 11, color: COLORS.slate, marginTop: '3mm', letterSpacing: 1 }}>Reporte generado el {reportDate}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5mm', paddingTop: '5mm', borderTop: `1px solid ${COLORS.border}`, fontSize: 8, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Documento confidencial · Preparado exclusivamente para {clientName}
          </div>
        </div>
      </div>

      {/* ── Página 2: Performance ── */}
      {sec.performance && (
      <div className="pdf-page" style={PAGE_STYLE}>
        <PdfHeader title="Performance" />

        <div style={{ display: 'flex', gap: '4mm', marginBottom: '7mm' }}>
          <div style={{ flex: '0 0 38%', borderRadius: 10, padding: '6mm', color: '#fff', background: `linear-gradient(135deg, ${COLORS.darkGreen}, ${COLORS.charcoal})` }}>
            <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7 }}>Valor de la cuenta</div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: '3mm' }}>{fmtUSD(totalValue)}</div>
            {(() => {
              const initial = computeInitialAccountValue(performance)
              if (initial == null) return null
              return (
                <div style={{ fontSize: 8.5, marginTop: '3mm', opacity: 0.85 }}>
                  Valor inicial{performance?.inception_date ? ` (${fmtDate(performance.inception_date)})` : ''}: <span style={{ fontWeight: 700 }}>{fmtUSD(initial)}</span>
                </div>
              )
            })()}
            {sinceMoney != null && (
              <div style={{ fontSize: 9, marginTop: '2mm', opacity: 0.9 }}>
                Crecimiento desde inicio:{' '}
                <span style={{ fontWeight: 800 }}>{sinceMoney >= 0 ? '+' : ''}{fmtUSD(sinceMoney)}{sincePct != null ? ` (${sincePct >= 0 ? '+' : ''}${sincePct.toFixed(2)}%)` : ''}</span>
              </div>
            )}
          </div>
          <div style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '5mm' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: '3.5mm' }}>
              Rentabilidad real (TWRR){performance ? '' : ' — sin reporte importado'}
            </div>
            {performance ? (
              <div style={{ display: 'flex', gap: '3mm' }}>
                {[
                  ['YTD', performance.return_ytd], ['1 Año', performance.return_1y], ['3 Años', performance.return_3y],
                  ['5 Años', performance.return_5y], ['Desde inicio', performance.return_since_inception],
                ].map(([label, val]) => (
                  <div key={label as string} style={{ flex: 1, textAlign: 'center', background: COLORS.bgSofter, borderRadius: 8, padding: '4mm 1mm' }}>
                    <div style={{ fontSize: 7.5, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, marginTop: '2mm', color: val == null ? COLORS.mutedSlate : Number(val) >= 0 ? COLORS.gain : COLORS.loss }}>
                      {val == null ? '—' : `${Number(val) >= 0 ? '+' : ''}${Number(val).toFixed(2)}%`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 8.5, color: COLORS.mutedSlate }}>Subí el PDF de performance del custodio (Pershing o Morgan Stanley) para ver la rentabilidad real de la cuenta.</div>
            )}
            {performance?.change_in_value && (() => {
              const civ = performance.change_in_value!
              const cells: [string, number | null][] = [
                ['YTD', civ.ytd], ['1 Año', civ.oneYear], ['3 Años', civ.threeYear], ['5 Años', civ.fiveYear], ['Desde inicio', civ.sinceInception],
              ]
              if (cells.every(([, v]) => v == null)) return null
              return (
                <>
                  <div style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: '4.5mm', marginBottom: '1.5mm' }}>Cuánto creció en dinero</div>
                  <div style={{ display: 'flex', gap: '4mm', fontSize: 8.5 }}>
                    {cells.map(([label, val]) => (
                      <div key={label} style={{ flex: 1 }}>
                        <span style={{ color: COLORS.mutedSlate }}>{label}: </span>
                        <span style={{ fontWeight: 700, color: val == null ? COLORS.mutedSlate : val >= 0 ? COLORS.gain : COLORS.loss }}>{val == null ? '—' : `${val >= 0 ? '+' : ''}${fmtUSD(val)}`}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {growthPoints.length >= 2 && (
          <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '5mm 6mm', marginBottom: '5mm' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: COLORS.ink, marginBottom: '2mm' }}>Evolución del valor de la cuenta</div>
            <PdfAreaChart points={growthPoints} height={50} />
            <div style={{ fontSize: 6.4, color: COLORS.mutedSlate, marginTop: '2mm' }}>
              Valor de mercado en cada importación. Puede incluir aportes, retiros u operaciones — no representa rentabilidad por sí solo.
            </div>
          </div>
        )}

        {performance && (
          <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '5mm 6mm' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: COLORS.ink, marginBottom: '3mm' }}>Rentabilidad por período (Net of Fees)</div>
            <PdfPerfBarChart series={[
              { label: 'YTD', value: performance.return_ytd != null ? Number(performance.return_ytd) : null },
              { label: '1 Año', value: performance.return_1y != null ? Number(performance.return_1y) : null },
              { label: '3 Años', value: performance.return_3y != null ? Number(performance.return_3y) : null },
              { label: '5 Años', value: performance.return_5y != null ? Number(performance.return_5y) : null },
              { label: 'Desde inicio', value: performance.return_since_inception != null ? Number(performance.return_since_inception) : null },
            ]} />
            <div style={{ fontSize: 6.4, color: COLORS.mutedSlate, marginTop: '2mm' }}>
              Rentabilidad time-weighted reportada por el custodio — no calculada por el sistema. Los períodos mayores a un año están anualizados.
            </div>
          </div>
        )}

        {disclosureOn === 'performance' && <PdfDisclosure />}
        <PdfFooter clientName={clientName} />
      </div>
      )}

      {/* ── Página 3: Composición y renta ── */}
      {sec.composicion && (
      <div className="pdf-page" style={PAGE_STYLE}>
        <PdfHeader title="Composición y renta" />

        <div data-pdf-keep-together style={{ display: 'flex', gap: '3mm', marginBottom: '5mm' }}>
          <PdfDonut title="Asset Allocation" data={assetAllocation.map(a => ({ label: a.label, value: a.value, pct: a.pct }))} />
          {fixedIncomeBreakdown.length > 0 && <PdfDonut title="Fixed Income Allocation" data={fixedIncomeBreakdown} />}
          <PdfDonut title="Currency Exposure" data={currencyExposure} />
        </div>

        <div data-pdf-keep-together style={{ display: 'flex', gap: '3mm', marginBottom: '5mm' }}>
          <StatTile label="Liquidez" value={fmtUSD(liquidity.value)} sub={`${fmtPct(liquidity.pct)} del portafolio`} />
          <StatTile label="Projected Income · próx. 12 meses" value={hasIncomePage ? fmtUSD(projectedIncome12m) : '—'} sub={hasIncomePage ? 'Cupones y dividendos estimados' : 'Sin archivo importado'} />
          <StatTile
            label="Rendimiento estimado del income"
            value={incomeYield != null ? `${incomeYield.toFixed(2)}%` : '—'}
            sub={incomeYield != null ? `Income 12m ÷ ${fmtUSD(incomeProducingMV)} en posiciones que generan renta` : 'Requiere Projected Income'}
            color={COLORS.darkGreen}
          />
          <StatTile
            label="Unrealized Gain/Loss"
            value={unrealizedGLTotals ? `${unrealizedGLTotals.gainLoss >= 0 ? '+' : ''}${fmtUSD(unrealizedGLTotals.gainLoss)}` : 'No disponible'}
            sub={unrealizedGLTotals ? `${unrealizedGLTotals.gainLoss >= 0 ? '+' : ''}${unrealizedGLTotals.pct.toFixed(2)}% sobre costo` : 'Sin costo base en el archivo'}
            color={unrealizedGLTotals ? (unrealizedGLTotals.gainLoss >= 0 ? COLORS.gain : COLORS.loss) : COLORS.mutedSlate}
          />
        </div>

        {custodianBreakdown && custodianBreakdown.length > 0 && (
          <div data-pdf-keep-together style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm', marginBottom: '4mm' }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: COLORS.ink, marginBottom: '2mm' }}>Portfolio por custodio</div>
            <div style={{ display: 'flex', gap: '4mm' }}>
              {custodianBreakdown.map(c => (
                <div key={c.label} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, marginBottom: '1mm' }}>
                    <span style={{ color: COLORS.slate }}>{c.label}</span>
                    <span style={{ fontWeight: 700, color: COLORS.ink }}>{fmtUSD(c.value)} · {fmtPct(c.pct)}</span>
                  </div>
                  <div style={{ height: '2mm', background: COLORS.bgSofter, borderRadius: '1mm', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(c.pct, 2)}%`, background: `linear-gradient(90deg, ${COLORS.darkGreen}, ${COLORS.midGreen})` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div data-pdf-keep-together style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.ink, marginBottom: '2.5mm' }}>Principales inversiones</div>
          {topHoldings.map(p => {
            const pct = p.weight_pct != null ? Number(p.weight_pct) : 0
            const mv = Number(p.market_value)
            const clean = cleanedNames.get(p.id)
            return (
              <div key={p.id} style={{ marginBottom: '3.5mm' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '4mm', fontSize: 7.5, lineHeight: 1.4, marginBottom: '1.2mm' }}>
                  <span style={{ color: COLORS.ink, fontWeight: 600 }}>{truncateName(clean?.name ?? p.name, 78)}</span>
                  <span style={{ color: COLORS.ink, fontWeight: 700, flexShrink: 0, marginLeft: '2mm' }}>{fmtUSD(mv)} · {fmtPct(pct)}</span>
                </div>
                <div style={{ height: '2mm', background: COLORS.bgSofter, borderRadius: '1mm', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max((mv / maxHoldingValue) * 100, 3)}%`, background: `linear-gradient(90deg, ${COLORS.darkGreen}, ${COLORS.midGreen})` }} />
                </div>
              </div>
            )
          })}
        </div>

        {disclosureOn === 'composicion' && <PdfDisclosure />}
        <PdfFooter clientName={clientName} />
      </div>
      )}

      {/* ── Página 4: Holdings ── */}
      {sec.holdings && (
      <div className="pdf-page" style={PAGE_STYLE}>
        <PdfHeader title="Portfolio Holdings" />
        <table style={{ width: '100%', fontSize: 7.3, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: COLORS.charcoal }}>
              <th style={{ textAlign: 'left', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Investment</th>
              <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Quantity</th>
              <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Price</th>
              <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Market Value</th>
              <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Portfolio %</th>
              {hasGL && (
                <>
                  <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Costo Total</th>
                  <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Unrealized G/L</th>
                </>
              )}
              {hasMaturityCols && <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Maturity</th>}
              {isConsolidated && <th style={{ textAlign: 'left', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Custodian</th>}
            </tr>
          </thead>
          {holdingGroups.map(group => (
              <tbody data-pdf-keep-together key={group.assetClass}>
                <tr style={{ background: COLORS.bgSofter }}>
                  <td colSpan={holdingColSpan} style={{ padding: '1.8mm 1.5mm', fontWeight: 700, color: COLORS.ink, textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 6.8 }}>
                    {group.label} · {group.rows.length} {group.rows.length === 1 ? 'posición' : 'posiciones'}
                  </td>
                </tr>
                {group.rows.map((p, i) => {
                  const pct = rowPct(p)
                  const clean = cleanedNames.get(p.id)
                  const gl = p.cusip ? glByCusip.get(p.cusip) : undefined
                  return (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : COLORS.bgSofter }}>
                      <td style={{ padding: '2.2mm 1.5mm', maxWidth: '58mm' }}>
                        <div style={{ color: COLORS.ink, fontWeight: 600, lineHeight: 1.6, fontFamily: 'Arial, sans-serif' }}>{truncateName(clean?.name ?? p.name, 46)}</div>
                        {clean?.detail && <div style={{ fontSize: 6, lineHeight: 1.6, color: COLORS.mutedSlate, fontFamily: 'Arial, sans-serif' }}>{clean.detail}</div>}
                        {(p.purchase_date || gl?.purchase_date) && <div style={{ fontSize: 6, lineHeight: 1.6, color: COLORS.mutedSlate, fontFamily: 'Arial, sans-serif' }}>Compra: {p.purchase_date ?? gl?.purchase_date}</div>}
                      </td>
                      <td style={{ padding: '2.2mm 1.5mm', textAlign: 'right', color: COLORS.slate }}>{p.quantity != null ? Number(p.quantity).toLocaleString('en-US') : '—'}</td>
                      <td style={{ padding: '2.2mm 1.5mm', textAlign: 'right', color: COLORS.slate }}>{p.price != null ? fmtUSD2(Number(p.price)) : '—'}</td>
                      <td style={{ padding: '2.2mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.ink }}>{fmtUSD2(Number(p.market_value))}</td>
                      <td style={{ padding: '2.2mm 1.5mm', textAlign: 'right', color: COLORS.slate }}>{fmtPct(pct)}</td>
                      {hasGL && (
                        <>
                          <td style={{ padding: '2.2mm 1.5mm', textAlign: 'right', color: COLORS.slate }}>{gl ? fmtUSD2(Number(gl.cost_basis)) : '—'}</td>
                          <td style={{ padding: '2.2mm 1.5mm', textAlign: 'right', fontWeight: 700, color: gl ? (Number(gl.gain_loss) >= 0 ? COLORS.gain : COLORS.loss) : COLORS.mutedSlate }}>
                            {gl ? `${Number(gl.gain_loss) >= 0 ? '+' : ''}${fmtUSD2(Number(gl.gain_loss))} (${Number(gl.gain_loss_pct) >= 0 ? '+' : ''}${Number(gl.gain_loss_pct).toFixed(2)}%)` : '—'}
                          </td>
                        </>
                      )}
                      {hasMaturityCols && <td style={{ padding: '2.2mm 1.5mm', textAlign: 'right', color: COLORS.slate }}>{p.maturity_date ? fmtDate(p.maturity_date) : '—'}</td>}
                      {isConsolidated && <td style={{ padding: '2.2mm 1.5mm', color: COLORS.slate }}>{custodianByPositionId?.get(p.id) ?? '—'}</td>}
                    </tr>
                  )
                })}
                {(() => {
                  const glPct = group.subtotalCost > 0 ? (group.subtotalGL / group.subtotalCost) * 100 : 0
                  return (
                    <tr style={{ background: '#EEF2F1', borderBottom: `1.5px solid ${COLORS.border}` }}>
                      <td colSpan={3} style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.slate, fontSize: 6.8 }}>Subtotal {group.label}</td>
                      <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.ink }}>{fmtUSD2(group.subtotalValue)}</td>
                      <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.slate }}>{fmtPct(group.subtotalPct)}</td>
                      {hasGL && (
                        <>
                          <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.slate }}>{group.subtotalCost > 0 ? fmtUSD2(group.subtotalCost) : '—'}</td>
                          <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: group.subtotalCost > 0 ? (group.subtotalGL >= 0 ? COLORS.gain : COLORS.loss) : COLORS.mutedSlate }}>
                            {group.subtotalCost > 0 ? `${group.subtotalGL >= 0 ? '+' : ''}${fmtUSD2(group.subtotalGL)} (${glPct >= 0 ? '+' : ''}${glPct.toFixed(2)}%)` : '—'}
                          </td>
                        </>
                      )}
                      {hasMaturityCols && <td style={{ padding: '1.8mm 1.5mm' }} />}
                      {isConsolidated && <td style={{ padding: '1.8mm 1.5mm' }} />}
                    </tr>
                  )
                })()}
              </tbody>
            ))}
          <tfoot>
            <tr style={{ background: COLORS.charcoal }}>
              <td colSpan={3} style={{ padding: '2mm 1.5mm', color: '#fff', fontWeight: 700, textAlign: 'right' }}>TOTAL</td>
              <td style={{ padding: '2mm 1.5mm', color: '#fff', fontWeight: 700, textAlign: 'right' }}>{fmtUSD2(totalValue)}</td>
              <td style={{ padding: '2mm 1.5mm' }} />
              {hasGL && (
                <>
                  <td style={{ padding: '2mm 1.5mm', color: '#fff', fontWeight: 700, textAlign: 'right' }}>{fmtUSD2(totalCostBasis)}</td>
                  <td style={{ padding: '2mm 1.5mm', color: '#fff', fontWeight: 700, textAlign: 'right' }}>
                    {totalGainLoss >= 0 ? '+' : ''}{fmtUSD2(totalGainLoss)} ({totalGainLossPct >= 0 ? '+' : ''}{totalGainLossPct.toFixed(2)}%)
                  </td>
                </>
              )}
              {hasMaturityCols && <td style={{ padding: '2mm 1.5mm' }} />}
              {isConsolidated && <td style={{ padding: '2mm 1.5mm' }} />}
            </tr>
          </tfoot>
        </table>
        {disclosureOn === 'holdings' && <PdfDisclosure />}
        <PdfFooter clientName={clientName} />
      </div>
      )}

      {/* ── Página 5: Income & Cash Flow (solo si se importaron proyecciones) ── */}
      {hasIncomePage && (
        <div className="pdf-page" style={PAGE_STYLE}>
          <PdfHeader title="Income & Cash Flow" />

          <div data-pdf-keep-together style={{ display: 'flex', gap: '3mm', marginBottom: '4mm' }}>
            <div style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm' }}>
              <div style={{ fontSize: 7, color: COLORS.mutedSlate, textTransform: 'uppercase' }}>Projected Income — próximos 12 meses</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.darkGreen, marginTop: '1mm' }}>{fmtUSD(projectedIncome12m)}</div>
            </div>
            {nextPayment && (
              <div style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm' }}>
                <div style={{ fontSize: 7, color: COLORS.mutedSlate, textTransform: 'uppercase' }}>Next Payment</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.ink, marginTop: '1mm' }}>{fmtDate(nextPayment.pay_date)}</div>
                <div style={{ fontSize: 7, color: COLORS.slate }}>{cleanedNames.get(nextPayment.id)?.name ?? nextPayment.description}</div>
                <div style={{ fontSize: 8, fontWeight: 700, color: COLORS.darkGreen }}>{nextPayment.estimated_amount != null ? fmtUSD(Number(nextPayment.estimated_amount)) : '—'}</div>
              </div>
            )}
          </div>

          {monthlyIncome.length > 1 && (
            <div data-pdf-keep-together style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm', marginBottom: '4mm' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.ink, marginBottom: '1mm' }}>Expected Portfolio Income</div>
              <CssBarChart data={monthlyIncome} color={COLORS.midGreen} />
            </div>
          )}

          <div style={{ marginBottom: '4mm' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.ink, marginBottom: '2mm' }}>Próximos flujos de caja proyectados</div>
            <table style={{ width: '100%', fontSize: 7.3, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: COLORS.bgSofter }}>
                  <th style={{ textAlign: 'left', padding: '1.5mm', color: COLORS.slate }}>Fecha</th>
                  <th style={{ textAlign: 'left', padding: '1.5mm', color: COLORS.slate }}>Instrumento</th>
                  <th style={{ textAlign: 'left', padding: '1.5mm', color: COLORS.slate }}>Tipo</th>
                  <th style={{ textAlign: 'right', padding: '1.5mm', color: COLORS.slate }}>Monto estimado</th>
                </tr>
              </thead>
              <tbody>
                {cashProjRows.slice(0, 14).map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.bgSofter}` }}>
                    <td style={{ padding: '1.4mm 1.5mm', color: COLORS.ink }}>{fmtDate(r.pay_date)}</td>
                    <td style={{ padding: '1.4mm 1.5mm', color: COLORS.slate, maxWidth: '80mm' }}>{truncateName(cleanedNames.get(r.id)?.name ?? r.description, 60)}</td>
                    <td style={{ padding: '1.4mm 1.5mm', color: COLORS.slate }}>{r.distribution_type ?? '—'}</td>
                    <td style={{ padding: '1.4mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.ink }}>{r.estimated_amount != null ? fmtUSD2(Number(r.estimated_amount)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bond Maturity Schedule — sacado por ahora a pedido. */}

          <PdfDisclosure />
          <PdfFooter clientName={clientName} />
        </div>
      )}
    </div>
  )
}
