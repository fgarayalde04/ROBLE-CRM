import type { PortfolioPositionRow, PortfolioImportRow, PortfolioAccountInfo, PortfolioCashProjectionRow, PortfolioCashProjectionsImportRow, PortfolioPerformanceRow, PortfolioUnrealizedGainLossRow } from '@/types/portfolio'
import { fmtUSD, fmtUSD2, fmtPct, fmtDate } from './PortfolioAccountClient'
import DonutChart from '@/components/portfolio/DonutChart'
import { COLORS, DONUT_COLORS, monthLabel } from '@/lib/portfolio/theme'

// Off-screen printable layout captured page-by-page (html2canvas + jsPDF) by
// PortfolioAccountClient's handleDownloadPDF — never shown to the user
// directly, mounted positioned off-screen so it still has real layout.
// Deliberately avoids recharts here: only plain SVG (DonutChart) and CSS
// div-bars, which paint synchronously and capture reliably in html2canvas —
// unlike animated/portal-based chart libraries.

const PAGE_STYLE: React.CSSProperties = { width: '210mm', minHeight: '297mm', background: '#fff', padding: '13mm', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', position: 'relative' }

// Long names are truncated here in JS rather than via CSS
// (overflow:hidden + text-overflow:ellipsis) — html2canvas doesn't always
// size a flex item's cross-axis to its text content correctly, which can
// clip the bottom of the glyphs instead of just cutting the string short.
function truncateName(s: string, maxChars: number): string {
  return s.length > maxChars ? s.slice(0, maxChars - 1).trimEnd() + '…' : s
}

function PdfLetterhead({ title, accountNumber, account, importRow }: { title: string; accountNumber: string; account: PortfolioAccountInfo | null; importRow: PortfolioImportRow }) {
  const today = new Date().toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })
  return (
    <div style={{ marginBottom: '5mm' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${COLORS.darkGreen}`, paddingBottom: '3mm', marginBottom: '3mm' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/download.png" alt="Roble Capital" style={{ height: '11mm', objectFit: 'contain' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.darkGreen }}>{title}</div>
          <div style={{ fontSize: 8, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 1 }}>Portfolio Report · Confidencial</div>
        </div>
      </div>
      <div style={{ display: 'flex', border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden' }}>
        {[
          ['Cliente', account?.clientName ?? accountNumber],
          ['Custodio', account?.custodian ?? '—'],
          ['Actualizado', fmtDate(importRow.snapshot_date)],
          ['Fecha del reporte', today],
        ].map(([label, val], i, arr) => (
          <div key={label} style={{ flex: 1, padding: '2mm 3mm', borderRight: i < arr.length - 1 ? `1px solid ${COLORS.border}` : 'none', background: COLORS.bgSoft }}>
            <div style={{ fontSize: 6.5, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.ink, marginTop: '0.8mm' }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PdfFooter({ clientName }: { clientName: string }) {
  return (
    <div style={{ position: 'absolute', bottom: '10mm', left: '13mm', right: '13mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${COLORS.border}`, paddingTop: '2mm' }}>
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

export default function AccountPdfReport({
  account, accountNumber, importRow, sortedByValue, assetAllocation, fixedIncomeBreakdown, currencyExposure,
  liquidity, maturityBuckets, nextMaturity, cashProjImport, cashProjRows, projectedIncome12m, nextPayment,
  cleanedNames, performance, unrealizedGLTotals, glByCusip,
}: {
  account: PortfolioAccountInfo | null
  accountNumber: string
  importRow: PortfolioImportRow
  sortedByValue: PortfolioPositionRow[]
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
}) {
  const totalValue = Number(importRow.total_market_value)
  const clientName = account?.clientName ?? accountNumber
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

  return (
    <div id="account-pdf-report" style={{ position: 'fixed', left: -10000, top: 0 }}>
      {/* ── Page 1: Overview ── */}
      <div className="pdf-page" style={PAGE_STYLE}>
        <PdfLetterhead title="Portfolio Report" accountNumber={accountNumber} account={account} importRow={importRow} />

        {performance && (
          <div data-pdf-keep-together style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm', marginBottom: '4mm' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.ink, marginBottom: '1mm' }}>Performance reportada por el custodio (TWRR)</div>
            <div style={{ display: 'flex', gap: '4mm', fontSize: 8 }}>
              {[
                ['YTD', performance.return_ytd], ['1 Año', performance.return_1y], ['Desde inicio', performance.return_since_inception],
              ].map(([label, val]) => (
                <div key={label as string}>
                  <span style={{ color: COLORS.mutedSlate }}>{label}: </span>
                  <span style={{ fontWeight: 700, color: val != null && Number(val) >= 0 ? COLORS.gain : COLORS.loss }}>
                    {val != null ? `${Number(val) >= 0 ? '+' : ''}${Number(val).toFixed(2)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderRadius: 10, padding: '5mm 6mm', color: '#fff', marginBottom: '4mm', background: `linear-gradient(135deg, ${COLORS.darkGreen}, ${COLORS.charcoal})` }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.65 }}>Valor del portafolio</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: '1mm' }}>{fmtUSD(totalValue)}</div>
        </div>

        <div data-pdf-keep-together style={{ display: 'flex', gap: '3mm', marginBottom: '4mm' }}>
          {[
            ['Posiciones', String(sortedByValue.length), null, COLORS.ink],
            ['Liquidez', fmtUSD(liquidity.value), fmtPct(liquidity.pct), COLORS.ink],
            unrealizedGLTotals
              ? ['Unrealized Gain/Loss', `${unrealizedGLTotals.gainLoss >= 0 ? '+' : ''}${fmtUSD(unrealizedGLTotals.gainLoss)}`, `${unrealizedGLTotals.gainLoss >= 0 ? '+' : ''}${unrealizedGLTotals.pct.toFixed(2)}%`, unrealizedGLTotals.gainLoss >= 0 ? COLORS.gain : COLORS.loss]
              : ['Unrealized Gain/Loss', 'No disponible', 'Sin costo base en el archivo', COLORS.mutedSlate],
            ['Income próx. 12 meses', cashProjImport ? fmtUSD(projectedIncome12m) : '—', null, COLORS.ink],
          ].map(([label, val, sub, color]) => (
            <div key={label as string} style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '2.5mm 3mm' }}>
              <div style={{ fontSize: 6.8, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: color as string, marginTop: '1mm' }}>{val}</div>
              {sub && <div style={{ fontSize: 6.3, color: COLORS.mutedSlate, marginTop: '0.5mm' }}>{sub}</div>}
            </div>
          ))}
        </div>

        <div data-pdf-keep-together style={{ display: 'flex', gap: '3mm', marginBottom: '4mm' }}>
          <PdfDonut title="Asset Allocation" data={assetAllocation.map(a => ({ label: a.label, value: a.value, pct: a.pct }))} />
          {fixedIncomeBreakdown.length > 0 && <PdfDonut title="Fixed Income Allocation" data={fixedIncomeBreakdown} />}
          <PdfDonut title="Currency Exposure" data={currencyExposure} />
        </div>

        <div data-pdf-keep-together style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm', marginBottom: '3mm' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.ink, marginBottom: '2.5mm' }}>Principales inversiones</div>
          {topHoldings.map(p => {
            const pct = p.weight_pct != null ? Number(p.weight_pct) : 0
            const mv = Number(p.market_value)
            const clean = cleanedNames.get(p.id)
            return (
              <div key={p.id} style={{ marginBottom: '4mm' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '4mm', fontSize: 7.5, lineHeight: 1.4, marginBottom: '1.2mm', fontFamily: 'Arial, sans-serif' }}>
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

        <PdfFooter clientName={clientName} />
      </div>

      {/* ── Page 2: Holdings ── */}
      <div className="pdf-page" style={PAGE_STYLE}>
        <PdfLetterhead title="Portfolio Holdings" accountNumber={accountNumber} account={account} importRow={importRow} />
        <table style={{ width: '100%', fontSize: 7.3, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: COLORS.charcoal }}>
              <th style={{ textAlign: 'left', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Investment</th>
              <th style={{ textAlign: 'left', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Asset Class</th>
              <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Quantity</th>
              <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Price</th>
              <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Market Value</th>
              <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Portfolio %</th>
              {hasGL && (
                <>
                  <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Cost Basis</th>
                  <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Unrealized G/L</th>
                </>
              )}
              {hasMaturityCols && <th style={{ textAlign: 'right', padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 }}>Maturity</th>}
            </tr>
          </thead>
          <tbody>
            {sortedByValue.map((p, i) => {
              const pct = p.weight_pct != null ? Number(p.weight_pct) : 0
              const clean = cleanedNames.get(p.id)
              const gl = p.cusip ? glByCusip.get(p.cusip) : undefined
              return (
                <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : COLORS.bgSofter }}>
                  <td style={{ padding: '2.2mm 1.5mm', maxWidth: '58mm' }}>
                    <div style={{ color: COLORS.ink, fontWeight: 600, lineHeight: 1.6, fontFamily: 'Arial, sans-serif' }}>{truncateName(clean?.name ?? p.name, 46)}</div>
                    {clean?.detail && <div style={{ fontSize: 6, lineHeight: 1.6, color: COLORS.mutedSlate, fontFamily: 'Arial, sans-serif' }}>{clean.detail}</div>}
                    {p.purchase_date && <div style={{ fontSize: 6, lineHeight: 1.6, color: COLORS.mutedSlate, fontFamily: 'Arial, sans-serif' }}>Compra: {p.purchase_date}</div>}
                  </td>
                  <td style={{ padding: '2.2mm 1.5mm', color: COLORS.slate }}>{p.asset_class}</td>
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
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: COLORS.charcoal }}>
              <td colSpan={4} style={{ padding: '2mm 1.5mm', color: '#fff', fontWeight: 700, textAlign: 'right' }}>TOTAL</td>
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
            </tr>
          </tfoot>
        </table>
        <PdfFooter clientName={clientName} />
      </div>

      {/* ── Page 3: Income & Cash Flow (only if cash projections were imported) ── */}
      {cashProjImport && cashProjRows.length > 0 && (
        <div className="pdf-page" style={PAGE_STYLE}>
          <PdfLetterhead title="Income & Cash Flow" accountNumber={accountNumber} account={account} importRow={importRow} />

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

          {maturityBuckets.length > 0 && (
            <div data-pdf-keep-together style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.ink, marginBottom: '1mm' }}>Bond Maturity Schedule</div>
              <CssBarChart data={maturityBuckets.map(b => ({ label: String(b.year), value: b.value }))} color={COLORS.darkGreen} />
              {nextMaturity && (
                <div style={{ marginTop: '2mm', paddingTop: '2mm', borderTop: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
                  <span style={{ color: COLORS.slate }}>Próximo: {cleanedNames.get(nextMaturity.id)?.name ?? nextMaturity.name}</span>
                  <span style={{ fontWeight: 700, color: COLORS.ink }}>{fmtDate(nextMaturity.maturity_date as string)} · {fmtUSD(Number(nextMaturity.market_value))}</span>
                </div>
              )}
            </div>
          )}

          <PdfFooter clientName={clientName} />
        </div>
      )}
    </div>
  )
}
