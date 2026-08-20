import type { PortfolioPositionRow, PortfolioImportRow, PortfolioAccountInfo, PortfolioCashProjectionRow, PortfolioCashProjectionsImportRow } from '@/types/portfolio'
import { fmtUSD, fmtUSD2, fmtPct, fmtDate } from './PortfolioAccountClient'

const C = { darkGreen: '#1B3A2B', midGreen: '#2E7D52' }

// Off-screen printable layout captured page-by-page (html2canvas + jsPDF) by
// PortfolioAccountClient's handleDownloadPDF — never shown to the user
// directly, mounted positioned off-screen so it still has real layout.
export default function AccountPdfReport({
  account, accountNumber, importRow, sortedByValue, assetAllocation, concentration,
  liquidity, largestPosition, nextMaturity, cashProjImport, cashProjRows,
}: {
  account: PortfolioAccountInfo | null
  accountNumber: string
  importRow: PortfolioImportRow
  sortedByValue: PortfolioPositionRow[]
  assetAllocation: { assetClass: string; label: string; value: number; pct: number }[]
  concentration: { top1: number; top3: number; top5: number; top10: number }
  liquidity: { value: number; pct: number }
  largestPosition: PortfolioPositionRow | null
  nextMaturity: PortfolioPositionRow | null
  cashProjImport: PortfolioCashProjectionsImportRow | null
  cashProjRows: PortfolioCashProjectionRow[]
}) {
  const totalValue = Number(importRow.total_market_value)
  const today = new Date().toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div id="account-pdf-report" style={{ position: 'fixed', left: -10000, top: 0 }}>
      {/* ── Page 1: Resumen ── */}
      <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: '14mm', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${C.darkGreen}`, paddingBottom: '4mm', marginBottom: '6mm' }}>
          <div>
            <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, letterSpacing: 1 }}>ROBLE CAPITAL</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Portfolio Report</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#6B7280' }}>
            <div>{today}</div>
            <div>Actualizado al {fmtDate(importRow.snapshot_date)}</div>
          </div>
        </div>

        <div style={{ marginBottom: '6mm' }}>
          <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase' }}>Cliente</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{account?.clientName ?? accountNumber}</div>
          <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
            {accountNumber}{account?.clientNumber ? ` · Cliente #${account.clientNumber}` : ''}{account?.entity ? ` · ${account.entity === 'roble' ? 'Roble Capital' : account.entity}` : ''}
          </div>
        </div>

        <div style={{ background: '#F3F4F6', borderRadius: 8, padding: '5mm', marginBottom: '6mm' }}>
          <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase' }}>Valor del portafolio</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{fmtUSD(totalValue)}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4mm', marginBottom: '6mm' }}>
          {[
            ['Posiciones', String(sortedByValue.length)],
            ['Liquidez', `${fmtUSD(liquidity.value)} (${fmtPct(liquidity.pct)})`],
            ['Mayor posición', largestPosition ? fmtPct(largestPosition.weight_pct != null ? Number(largestPosition.weight_pct) : 0) : '—'],
            ['Top 5', fmtPct(concentration.top5)],
          ].map(([label, val]) => (
            <div key={label} style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '3mm' }}>
              <div style={{ fontSize: 8, color: '#9CA3AF', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '6mm' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: '2mm' }}>Distribución del portafolio</div>
          <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
            <tbody>
              {assetAllocation.map(a => (
                <tr key={a.assetClass} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '1.5mm 0', color: '#374151' }}>{a.label}</td>
                  <td style={{ padding: '1.5mm 0', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{fmtUSD(a.value)}</td>
                  <td style={{ padding: '1.5mm 0', textAlign: 'right', color: '#6B7280', width: '15mm' }}>{fmtPct(a.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginBottom: '6mm' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: '2mm' }}>Principales posiciones</div>
          <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
            <tbody>
              {sortedByValue.slice(0, 10).map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '1.5mm 0', color: '#374151', maxWidth: '110mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                  <td style={{ padding: '1.5mm 0', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{fmtUSD2(Number(p.market_value))}</td>
                  <td style={{ padding: '1.5mm 0', textAlign: 'right', color: '#6B7280', width: '15mm' }}>{fmtPct(p.weight_pct != null ? Number(p.weight_pct) : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6mm' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: '2mm' }}>Concentración</div>
            <table style={{ width: '100%', fontSize: 10 }}>
              <tbody>
                <tr><td style={{ color: '#6B7280' }}>Top 1</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtPct(concentration.top1)}</td></tr>
                <tr><td style={{ color: '#6B7280' }}>Top 3</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtPct(concentration.top3)}</td></tr>
                <tr><td style={{ color: '#6B7280' }}>Top 5</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtPct(concentration.top5)}</td></tr>
                <tr><td style={{ color: '#6B7280' }}>Top 10</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtPct(concentration.top10)}</td></tr>
              </tbody>
            </table>
          </div>
          {nextMaturity && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: '2mm' }}>Próximo vencimiento</div>
              <div style={{ fontSize: 10, color: '#374151' }}>{nextMaturity.name}</div>
              <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{fmtDate(nextMaturity.maturity_date as string)} · {fmtUSD(Number(nextMaturity.market_value))}</div>
            </div>
          )}
        </div>

        <div style={{ position: 'absolute', bottom: '10mm', left: '14mm', right: '14mm', fontSize: 8, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: '2mm' }}>
          Generado por Roble Capital CRM — Market Value informativo, no constituye asesoramiento de inversión.
        </div>
      </div>

      {/* ── Page 2: Posiciones ── */}
      <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: '14mm', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: '4mm' }}>Posiciones — {account?.clientName ?? accountNumber}</div>
        <table style={{ width: '100%', fontSize: 8.5, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F3F4F6' }}>
              <th style={{ textAlign: 'left', padding: '1.5mm', color: '#6B7280' }}>Activo</th>
              <th style={{ textAlign: 'left', padding: '1.5mm', color: '#6B7280' }}>Clase</th>
              <th style={{ textAlign: 'right', padding: '1.5mm', color: '#6B7280' }}>Cantidad</th>
              <th style={{ textAlign: 'right', padding: '1.5mm', color: '#6B7280' }}>Precio</th>
              <th style={{ textAlign: 'right', padding: '1.5mm', color: '#6B7280' }}>Market Value</th>
              <th style={{ textAlign: 'right', padding: '1.5mm', color: '#6B7280' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {sortedByValue.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '1.5mm', color: '#374151', maxWidth: '75mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                <td style={{ padding: '1.5mm', color: '#6B7280' }}>{p.asset_class}</td>
                <td style={{ padding: '1.5mm', textAlign: 'right', color: '#374151' }}>{p.quantity != null ? Number(p.quantity).toLocaleString('en-US') : '—'}</td>
                <td style={{ padding: '1.5mm', textAlign: 'right', color: '#374151' }}>{p.price != null ? fmtUSD2(Number(p.price)) : '—'}</td>
                <td style={{ padding: '1.5mm', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{fmtUSD2(Number(p.market_value))}</td>
                <td style={{ padding: '1.5mm', textAlign: 'right', color: '#6B7280' }}>{fmtPct(p.weight_pct != null ? Number(p.weight_pct) : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Page 3: Cash projections (only if available) ── */}
      {cashProjImport && cashProjRows.length > 0 && (
        <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: '14mm', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: '2mm' }}>Próximos flujos de caja proyectados</div>
          <div style={{ fontSize: 9, color: '#6B7280', marginBottom: '4mm' }}>
            Al {fmtDate(cashProjImport.as_of_date)}{cashProjImport.total_cash_flow != null ? ` · Total proyectado: ${fmtUSD2(Number(cashProjImport.total_cash_flow))}` : ''}
          </div>
          <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F3F4F6' }}>
                <th style={{ textAlign: 'left', padding: '1.5mm', color: '#6B7280' }}>Fecha de pago</th>
                <th style={{ textAlign: 'left', padding: '1.5mm', color: '#6B7280' }}>Instrumento</th>
                <th style={{ textAlign: 'left', padding: '1.5mm', color: '#6B7280' }}>Tipo</th>
                <th style={{ textAlign: 'right', padding: '1.5mm', color: '#6B7280' }}>Monto estimado</th>
              </tr>
            </thead>
            <tbody>
              {cashProjRows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '1.5mm', color: '#374151' }}>{fmtDate(r.pay_date)}</td>
                  <td style={{ padding: '1.5mm', color: '#374151', maxWidth: '85mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                  <td style={{ padding: '1.5mm', color: '#6B7280' }}>{r.distribution_type ?? '—'}</td>
                  <td style={{ padding: '1.5mm', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{r.estimated_amount != null ? fmtUSD2(Number(r.estimated_amount)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 8, color: '#9CA3AF', marginTop: '3mm' }}>Montos estimados a partir del cupón informado por el custodio — pueden variar frente al pago real.</div>
        </div>
      )}
    </div>
  )
}
