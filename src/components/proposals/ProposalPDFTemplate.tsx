'use client'

import Image from 'next/image'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Fund {
  id: string
  isin: string | null
  issuer: string | null
  fund_name: string | null
  return_1y: number | null
  return_3y: number | null
  return_5y: number | null
  ytm_indicative: number | null
  duration_years: number | null
  pct: number
  amount: number
}

interface Bond {
  id: string
  isin: string | null
  issuer: string | null
  bond_type: string | null
  price: number | null
  maturity_date: string | null
  coupon: number | null
  yield: number | null
  duration: number | null
  rating: string | null
  pct: number
  amount: number
  currency: string
}

interface Equity {
  id: string
  ticker: string | null
  company_name: string | null
  sector: string | null
  country: string | null
  pct: number
  amount: number
  currency: string
}

interface ProposalPDFTemplateProps {
  clientName: string | null
  advisorName: string | null
  totalAmount: number
  currency: string
  funds: Fund[]
  bonds: Bond[]
  equities: Equity[]
  disclaimer?: string | null
  date?: string
}

// ─── Number formatter — Latin American style: $19.307,00 ─────────────────────

function fmtAmt(n: number) {
  if (!n && n !== 0) return '—'
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return `${n.toFixed(2)}%`
}

function fmtNum(n: number | null, decimals = 2) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  const mon = MONTHS_ES[parseInt(m, 10) - 1] ?? m
  return `${y} / ${mon} / ${d}`
}

// ─── Unique gestoras from funds ───────────────────────────────────────────────

function getGestoras(funds: Fund[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const f of funds) {
    const g = f.issuer?.trim()
    if (g && !seen.has(g)) { seen.add(g); result.push(g) }
  }
  return result
}

// ─── Default disclaimer ───────────────────────────────────────────────────────

const DEFAULT_DISCLAIMER =
  'This was prepared for informational purposes only. It is not an official confirmation of terms. It is based on information generally available to the public from sources believed to be reliable. No representation is made that it is accurate or complete or that any returns indicated will be achieved. Changes to assumptions may have a material impact on returns. Past performance is not indicative of future results. Price/availability is subject to change without notice. Additional info is available on request. This is neither an offer to sell nor a solicitation of an offer to buy a new issue security. For further info on a new issue, including a prospectus, please contact Roble Capital Wealth Management. Any unauthorized copying, disclosure or distribution of the material in this e-mail is strictly forbidden. If you have received it by mistake please let us know by fax or e-mail immediately and destroy or delete it from your files or system; you should also not copy the message nor disclose its contents to anyone. Thank you.'

// ─── Table header style ───────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  backgroundColor: '#1B2E3C',
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: 9,
  textTransform: 'uppercase',
  padding: '7px 6px',
  textAlign: 'center',
  borderRight: '1px solid #2E4155',
  whiteSpace: 'nowrap',
  letterSpacing: '0.03em',
}

const TD_STYLE: React.CSSProperties = {
  fontSize: 9.5,
  padding: '5px 6px',
  textAlign: 'center',
  borderRight: '1px solid #E8ECF0',
  borderBottom: '1px solid #E8ECF0',
  color: '#1a1a1a',
}

const FOOTER_TD: React.CSSProperties = {
  backgroundColor: '#1B2E3C',
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: 10,
  padding: '7px 8px',
  textAlign: 'right',
  borderRight: '1px solid #2E4155',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProposalPDFTemplate({
  clientName,
  advisorName,
  totalAmount,
  currency,
  funds,
  bonds,
  equities,
  disclaimer,
  date,
}: ProposalPDFTemplateProps) {
  const gestoras = getGestoras(funds)
  const totalAssigned = funds.reduce((s, f) => s + (f.amount ?? 0), 0)
    + bonds.reduce((s, b) => s + (b.amount ?? 0), 0)
    + equities.reduce((s, e) => s + (e.amount ?? 0), 0)

  const displayDate = date ?? new Date().toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })

  // Portfolio summary stats
  const fundsPct    = funds.reduce((s, f) => s + (f.pct ?? 0), 0)
  const bondsPct    = bonds.reduce((s, b) => s + (b.pct ?? 0), 0)
  const equitiesPct = equities.reduce((s, e) => s + (e.pct ?? 0), 0)
  const totalPct    = fundsPct + bondsPct + equitiesPct

  const fundsAmt    = funds.reduce((s, f) => s + (f.amount ?? 0), 0)
  const bondsAmt    = bonds.reduce((s, b) => s + (b.amount ?? 0), 0)
  const equitiesAmt = equities.reduce((s, e) => s + (e.amount ?? 0), 0)

  const yieldItems = [
    ...funds.filter(f => f.ytm_indicative != null && f.pct > 0).map(f => ({ pct: f.pct, y: f.ytm_indicative! })),
    ...bonds.filter(b => b.yield          != null && b.pct > 0).map(b => ({ pct: b.pct, y: b.yield! })),
  ]
  const yieldPctSum = yieldItems.reduce((s, i) => s + i.pct, 0)
  const avgYield    = yieldPctSum > 0 ? yieldItems.reduce((s, i) => s + i.y * i.pct, 0) / yieldPctSum : null

  const hasAssets = totalPct > 0

  return (
    <div
      className="pdf-page"
      style={{
        width: 1050,
        minHeight: 742,
        backgroundColor: '#FFFFFF',
        fontFamily: 'Arial, Helvetica, sans-serif',
        padding: '32px 40px 28px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* ── Header: Logo + Date ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/download.png"
            alt="Roble Capital"
            style={{ height: 48, objectFit: 'contain' }}
          />
          <span style={{ fontSize: 9, color: '#6b7280' }}>{displayDate}</span>
        </div>
      </div>

      {/* ── Cliente ── */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, textDecoration: 'underline', color: '#1a1a1a' }}>
          Cliente: {clientName ?? '—'}
        </span>
      </div>

      {/* ══ FONDOS ══════════════════════════════════════════════════════════════ */}
      {funds.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
          <thead>
            <tr>
              <th style={{ ...TH_STYLE, textAlign: 'left', width: 72 }}>ISIN</th>
              <th style={{ ...TH_STYLE, textAlign: 'left' }}>ACTIVO</th>
              <th style={{ ...TH_STYLE, width: 52 }}>1 AÑO</th>
              <th style={{ ...TH_STYLE, width: 52 }}>3 AÑOS</th>
              <th style={{ ...TH_STYLE, width: 52 }}>5 AÑOS</th>
              <th style={{ ...TH_STYLE, width: 72 }}>YTM{'\n'}INDICATIVO</th>
              <th style={{ ...TH_STYLE, width: 72 }}>DURACION{'\n'}(años)</th>
              <th style={{ ...TH_STYLE, width: 52 }}>%</th>
              <th style={{ ...TH_STYLE, width: 90, borderRight: 'none' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {funds.map((f, i) => (
              <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
                <td style={{ ...TD_STYLE, textAlign: 'left', fontFamily: 'monospace', fontSize: 9 }}>{f.isin ?? '—'}</td>
                <td style={{ ...TD_STYLE, textAlign: 'left' }}>{f.fund_name?.toUpperCase() ?? '—'}</td>
                <td style={{ ...TD_STYLE, color: f.return_1y != null && f.return_1y >= 0 ? '#1a1a1a' : '#dc2626' }}>
                  {fmtNum(f.return_1y)}%
                </td>
                <td style={{ ...TD_STYLE, color: f.return_3y != null && f.return_3y >= 0 ? '#1a1a1a' : '#dc2626' }}>
                  {fmtNum(f.return_3y)}%
                </td>
                <td style={{ ...TD_STYLE, color: f.return_5y != null && f.return_5y >= 0 ? '#1a1a1a' : '#dc2626' }}>
                  {fmtNum(f.return_5y)}%
                </td>
                <td style={TD_STYLE}>{fmtNum(f.ytm_indicative)}%</td>
                <td style={TD_STYLE}>{fmtNum(f.duration_years)}</td>
                <td style={{ ...TD_STYLE, fontWeight: 600 }}>{fmtNum(f.pct)}%</td>
                <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>
                  {fmtAmt(f.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Totals footer */}
          <tfoot>
            <tr>
              <td colSpan={7} style={{ ...FOOTER_TD, textAlign: 'left', fontSize: 9, opacity: 0.6, borderRight: 'none' }} />
              <td style={{ ...FOOTER_TD, textAlign: 'right' }}>
                {fmtNum(funds.reduce((s, f) => s + (f.pct ?? 0), 0))}%
              </td>
              <td style={{ ...FOOTER_TD, textAlign: 'right', borderRight: 'none' }}>
                {fmtAmt(funds.reduce((s, f) => s + (f.amount ?? 0), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* ══ BONOS ════════════════════════════════════════════════════════════════ */}
      {bonds.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1B2E3C', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Bonos
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Emisor','ISIN','Precio','Vencimiento','Cupón','Yield','Duración','Rating','%','Total'].map(h => (
                  <th key={h} style={{ ...TH_STYLE, textAlign: h === 'Total' || h === '%' || h === 'Precio' ? 'right' : 'left' }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bonds.map((b, i) => (
                <tr key={b.id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
                  <td style={{ ...TD_STYLE, textAlign: 'left', fontWeight: 600 }}>{b.issuer?.toUpperCase() ?? '—'}</td>
                  <td style={{ ...TD_STYLE, textAlign: 'left', fontFamily: 'monospace', fontSize: 9 }}>{b.isin ?? '—'}</td>
                  <td style={{ ...TD_STYLE, textAlign: 'right' }}>{b.price != null ? fmtNum(b.price) : '—'}</td>
                  <td style={{ ...TD_STYLE, textAlign: 'left', whiteSpace: 'nowrap' }}>{fmtDate(b.maturity_date)}</td>
                  <td style={TD_STYLE}>{b.coupon != null ? `${fmtNum(b.coupon)}%` : '—'}</td>
                  <td style={TD_STYLE}>{b.yield != null ? `${fmtNum(b.yield)}%` : '—'}</td>
                  <td style={TD_STYLE}>{fmtNum(b.duration)}</td>
                  <td style={TD_STYLE}>{b.rating ?? '—'}</td>
                  <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600 }}>{fmtNum(b.pct)}%</td>
                  <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>{fmtAmt(b.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8} style={{ ...FOOTER_TD, fontSize: 9, opacity: 0.6, borderRight: 'none' }} />
                <td style={{ ...FOOTER_TD, textAlign: 'right' }}>{fmtNum(bonds.reduce((s, b) => s + (b.pct ?? 0), 0))}%</td>
                <td style={{ ...FOOTER_TD, textAlign: 'right', borderRight: 'none' }}>{fmtAmt(bonds.reduce((s, b) => s + (b.amount ?? 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ══ ACCIONES ═════════════════════════════════════════════════════════════ */}
      {equities.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1B2E3C', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Acciones
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Ticker','Empresa','Sector','País','%','Total'].map(h => (
                  <th key={h} style={{ ...TH_STYLE, textAlign: h === 'Total' || h === '%' ? 'right' : 'left' }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equities.map((e, i) => (
                <tr key={e.id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
                  <td style={{ ...TD_STYLE, textAlign: 'left', fontFamily: 'monospace', fontWeight: 700 }}>{e.ticker ?? '—'}</td>
                  <td style={{ ...TD_STYLE, textAlign: 'left', fontWeight: 600 }}>{e.company_name?.toUpperCase() ?? '—'}</td>
                  <td style={{ ...TD_STYLE, textAlign: 'left' }}>{e.sector ?? '—'}</td>
                  <td style={{ ...TD_STYLE, textAlign: 'left' }}>{e.country ?? '—'}</td>
                  <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600 }}>{fmtNum(e.pct)}%</td>
                  <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>{fmtAmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ ...FOOTER_TD, fontSize: 9, opacity: 0.6, borderRight: 'none' }} />
                <td style={{ ...FOOTER_TD, textAlign: 'right' }}>{fmtNum(equities.reduce((s, e) => s + (e.pct ?? 0), 0))}%</td>
                <td style={{ ...FOOTER_TD, textAlign: 'right', borderRight: 'none' }}>{fmtAmt(equities.reduce((s, e) => s + (e.amount ?? 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Grand total (if multiple sections) ── */}
      {(bonds.length > 0 || equities.length > 0) && funds.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <div style={{
            backgroundColor: '#1B2E3C', color: '#fff', fontWeight: 700, fontSize: 11,
            padding: '6px 14px', borderRadius: 4,
          }}>
            TOTAL: {fmtAmt(totalAssigned)}
          </div>
        </div>
      )}

      {/* ── Resumen del Portafolio ── */}
      {hasAssets && (
        <div style={{
          marginTop: 28,
          backgroundColor: '#F7F9FB',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          padding: '18px 22px',
        }}>
          {/* Title row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1B2E3C', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Distribución del Portafolio
            </span>
            <span style={{ fontSize: 9, color: '#6b7280' }}>
              {currency} {totalAssigned.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>

          {/* Stacked bar */}
          <div style={{ width: '100%', height: 14, borderRadius: 7, overflow: 'hidden', display: 'flex', marginBottom: 14, backgroundColor: '#E2E8F0' }}>
            {fundsPct > 0 && (
              <div style={{ width: `${(fundsPct / Math.max(totalPct, 100)) * 100}%`, backgroundColor: '#60a5fa', height: '100%' }} />
            )}
            {bondsPct > 0 && (
              <div style={{ width: `${(bondsPct / Math.max(totalPct, 100)) * 100}%`, backgroundColor: '#fbbf24', height: '100%' }} />
            )}
            {equitiesPct > 0 && (
              <div style={{ width: `${(equitiesPct / Math.max(totalPct, 100)) * 100}%`, backgroundColor: '#34d399', height: '100%' }} />
            )}
          </div>

          {/* Breakdown + Yield */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
            {/* Asset breakdown */}
            <div style={{ flex: 1, display: 'flex', gap: 24 }}>
              {[
                { label: 'Fondos de Inversión', pct: fundsPct,    amt: fundsAmt,    color: '#60a5fa', show: fundsPct > 0 },
                { label: 'Bonos',               pct: bondsPct,    amt: bondsAmt,    color: '#fbbf24', show: bondsPct > 0 },
                { label: 'Acciones',             pct: equitiesPct, amt: equitiesAmt, color: '#34d399', show: equitiesPct > 0 },
              ].filter(r => r.show).map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 8.5, color: '#6b7280', marginBottom: 1 }}>{row.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2E3C' }}>{row.pct.toFixed(1)}%</div>
                    <div style={{ fontSize: 8, color: '#9ca3af', fontFamily: 'monospace' }}>
                      {currency} {row.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Yield promedio — highlighted box */}
            {avgYield != null && (
              <div style={{
                backgroundColor: '#1B2E3C',
                borderRadius: 6,
                padding: '10px 18px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 130,
              }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                  Yield Promedio
                </span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', fontFamily: 'monospace', lineHeight: 1.1 }}>
                  {avgYield.toFixed(2)}%
                </span>
                <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  ponderado por asignación
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Gestoras logos row ── */}
      {gestoras.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 40,
          marginTop: 28,
          paddingTop: 20,
          borderTop: '1px solid #e5e7eb',
          flexWrap: 'wrap',
        }}>
          {gestoras.map(g => (
            <GestoraLogo key={g} name={g} />
          ))}
        </div>
      )}

      {/* ── Disclaimer ── */}
      <div style={{
        marginTop: 22,
        paddingTop: 12,
        borderTop: '1px solid #e5e7eb',
        fontSize: 7.5,
        color: '#6b7280',
        lineHeight: 1.55,
        textAlign: 'justify',
      }}>
        {disclaimer ?? DEFAULT_DISCLAIMER}
      </div>
    </div>
  )
}

// ── Gestora logo placeholder ───────────────────────────────────────────────────
// Renders the fund manager name in a styled way that evokes their brand.

const GESTORA_STYLES: Record<string, React.CSSProperties> = {
  'PIMCO':              { fontWeight: 900, fontSize: 18, color: '#003087', letterSpacing: '0.08em', fontFamily: 'Arial Black, sans-serif' },
  'DNCA':               { fontWeight: 900, fontSize: 20, color: '#1a1a1a', letterSpacing: '0.12em', fontFamily: 'Arial Black, sans-serif' },
  'CREDICORP':          { fontWeight: 700, fontSize: 14, color: '#E4002B', fontFamily: 'Arial, sans-serif' },
  'CREDICORP CAPITAL':  { fontWeight: 700, fontSize: 14, color: '#E4002B', fontFamily: 'Arial, sans-serif' },
  'FRANKLIN TEMPLETON': { fontWeight: 700, fontSize: 13, color: '#003087', fontFamily: 'Arial, sans-serif' },
  'NEUBERGER BERMAN':   { fontWeight: 700, fontSize: 12, color: '#1a1a1a', letterSpacing: '0.04em', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase' },
  'BLACKROCK':          { fontWeight: 900, fontSize: 16, color: '#000000', fontFamily: 'Arial Black, sans-serif' },
  'VANGUARD':           { fontWeight: 700, fontSize: 15, color: '#c8102e', fontFamily: 'Arial, sans-serif' },
  'AMUNDI':             { fontWeight: 700, fontSize: 16, color: '#0057A8', fontFamily: 'Arial, sans-serif' },
  'FIDELITY':           { fontWeight: 700, fontSize: 15, color: '#008000', fontFamily: 'Arial, sans-serif' },
  'SCHRODERS':          { fontWeight: 700, fontSize: 15, color: '#2c3e8e', fontFamily: 'Arial, sans-serif' },
  'PICTET':             { fontWeight: 700, fontSize: 16, color: '#1B2E3C', letterSpacing: '0.1em', fontFamily: 'Georgia, serif' },
  'T. ROWE PRICE':      { fontWeight: 700, fontSize: 13, color: '#004B8D', fontFamily: 'Arial, sans-serif' },
  'JP MORGAN':          { fontWeight: 700, fontSize: 14, color: '#003087', fontFamily: 'Arial, sans-serif' },
  'MORGAN STANLEY':     { fontWeight: 700, fontSize: 13, color: '#001871', fontFamily: 'Arial, sans-serif' },
  'GOLDMAN SACHS':      { fontWeight: 700, fontSize: 14, color: '#1a1a1a', fontFamily: 'Arial, sans-serif', letterSpacing: '0.02em' },
}

function GestoraLogo({ name }: { name: string }) {
  const key = name.toUpperCase()
  const style = GESTORA_STYLES[key] ?? {
    fontWeight: 700, fontSize: 14, color: '#374151', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ ...style, userSelect: 'none' } as React.CSSProperties}>{name.toUpperCase()}</span>
      {key === 'DNCA' && (
        <span style={{ fontSize: 7, color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase' }}>INVESTMENTS</span>
      )}
      {(key === 'CREDICORP' || key === 'CREDICORP CAPITAL') && (
        <span style={{ fontSize: 7, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>CAPITAL</span>
      )}
    </div>
  )
}
