'use client'

import Image from 'next/image'

// ─── Types ────────────────────────────────────────────────────────────────────

type Operacion = 'compra' | 'venta'

interface Fund {
  id: string
  isin: string | null
  issuer: string | null
  fund_name: string | null
  return_ytd: number | null
  return_1y: number | null
  return_3y: number | null
  return_5y: number | null
  ytm_indicative: number | null
  duration_years: number | null
  pct: number
  amount: number
  operacion: Operacion
  broker: string | null
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
  operacion: Operacion
  broker: string | null
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
  operacion: Operacion
  broker: string | null
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

// ─── Group items by broker/custodio, preserving first-seen order ─────────────

function uniqueBrokers(...lists: { broker: string | null }[][]): (string | null)[] {
  const seen = new Set<string | null>()
  const order: (string | null)[] = []
  for (const list of lists) {
    for (const item of list) {
      const key = item.broker?.trim() || null
      if (!seen.has(key)) { seen.add(key); order.push(key) }
    }
  }
  return order
}

// ─── Default disclaimer ───────────────────────────────────────────────────────

const DEFAULT_DISCLAIMER =
  'This was prepared for informational purposes only. It is not an official confirmation of terms. It is based on information generally available to the public from sources believed to be reliable. No representation is made that it is accurate or complete or that any returns indicated will be achieved. Changes to assumptions may have a material impact on returns. Past performance is not indicative of future results. Price/availability is subject to change without notice. Additional info is available on request. This is neither an offer to sell nor a solicitation of an offer to buy a new issue security. For further info on a new issue, including a prospectus, please contact Roble Capital Wealth Management. Any unauthorized copying, disclosure or distribution of the material in this e-mail is strictly forbidden. If you have received it by mistake please let us know by fax or e-mail immediately and destroy or delete it from your files or system; you should also not copy the message nor disclose its contents to anyone. Thank you.'

// ─── Table styles ──────────────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  backgroundColor: '#1B2E3C',
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: 9.5,
  textTransform: 'uppercase',
  padding: '6px 7px',
  textAlign: 'center',
  borderRight: '1px solid #2E4155',
  whiteSpace: 'nowrap',
  letterSpacing: '0.04em',
}

const TD_STYLE: React.CSSProperties = {
  fontSize: 10,
  padding: '4px 7px',
  textAlign: 'center',
  borderRight: '1px solid #E8ECF0',
  borderBottom: '1px solid #E8ECF0',
  color: '#1a1a1a',
  fontFamily: 'Arial, Helvetica, sans-serif',
}

const FOOTER_TD: React.CSSProperties = {
  backgroundColor: '#1B2E3C',
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: 10.5,
  padding: '5px 8px',
  textAlign: 'right',
  borderRight: '1px solid #2E4155',
}

function OperacionBadge({ value }: { value: Operacion }) {
  const isVenta = value === 'venta'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 9,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      color: isVenta ? '#B91C1C' : '#15803D',
    }}>
      {isVenta ? 'Venta' : 'Compra'}
    </span>
  )
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
  // Compras y ventas se muestran siempre por separado — sumarlas juntas
  // infla el total (ej: comprar $300 y vender $300 no es "$600").
  const allItems = [...funds, ...bonds, ...equities]
  const totalCompras = allItems.filter(i => i.operacion !== 'venta').reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalVentas  = allItems.filter(i => i.operacion === 'venta').reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalAssigned = totalCompras || totalAmount

  const displayDate = date ?? new Date().toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })

  // ── Grouping: if nobody tagged a broker/custodio, keep the classic flat layout ──
  const brokers = uniqueBrokers(funds, bonds, equities)
  const grouped = brokers.length > 1 || (brokers.length === 1 && brokers[0] !== null)

  function opCompras(list: { operacion: Operacion; amount: number | null }[]) {
    return list.filter(i => i.operacion !== 'venta').reduce((s, i) => s + (i.amount ?? 0), 0)
  }
  function opVentas(list: { operacion: Operacion; amount: number | null }[]) {
    return list.filter(i => i.operacion === 'venta').reduce((s, i) => s + (i.amount ?? 0), 0)
  }
  function opSubtotalLabel(list: { operacion: Operacion; amount: number | null }[]) {
    const v = opVentas(list)
    return v > 0 ? `Ventas: ${fmtAmt(v)}` : ''
  }

  function fundsTable(list: Fund[]) {
    if (list.length === 0) return null
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
        <thead>
          <tr>
            <th style={{ ...TH_STYLE, width: 60 }}>MONEDA</th>
            <th style={{ ...TH_STYLE, width: 60 }}>OPERACIÓN</th>
            <th style={{ ...TH_STYLE, textAlign: 'left' }}>FONDO DE INVERSIÓN</th>
            <th style={{ ...TH_STYLE, width: 48 }}>YTD</th>
            <th style={{ ...TH_STYLE, width: 48 }}>1 AÑO</th>
            <th style={{ ...TH_STYLE, width: 48 }}>3 AÑOS</th>
            <th style={{ ...TH_STYLE, width: 48 }}>5 AÑOS</th>
            <th style={{ ...TH_STYLE, width: 90, borderRight: 'none' }}>INVERSIÓN</th>
          </tr>
        </thead>
        <tbody>
          {list.map((f, i) => (
            <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
              <td style={TD_STYLE}>{currency}</td>
              <td style={TD_STYLE}><OperacionBadge value={f.operacion} /></td>
              <td style={{ ...TD_STYLE, textAlign: 'left', fontWeight: 600 }}>{f.fund_name?.toUpperCase() ?? '—'}</td>
              <td style={TD_STYLE}>{fmtNum(f.return_ytd)}%</td>
              <td style={TD_STYLE}>{fmtNum(f.return_1y)}%</td>
              <td style={TD_STYLE}>{fmtNum(f.return_3y)}%</td>
              <td style={TD_STYLE}>{fmtNum(f.return_5y)}%</td>
              <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>{fmtAmt(f.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7} style={{ ...FOOTER_TD, textAlign: 'left', fontSize: 9, opacity: 0.6, borderRight: 'none' }}>
              {opSubtotalLabel(list)}
            </td>
            <td style={{ ...FOOTER_TD, textAlign: 'right', borderRight: 'none' }}>{fmtAmt(opCompras(list))}</td>
          </tr>
        </tfoot>
      </table>
    )
  }

  function bondsTable(list: Bond[]) {
    if (list.length === 0) return null
    return (
      <div style={{ marginTop: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...TH_STYLE, width: 60 }}>MONEDA</th>
              <th style={{ ...TH_STYLE, width: 60 }}>OPERACIÓN</th>
              <th style={{ ...TH_STYLE, textAlign: 'left' }}>BONOS</th>
              <th style={{ ...TH_STYLE, width: 80 }}>VENCIMIENTO</th>
              <th style={{ ...TH_STYLE, width: 55 }}>CUPÓN</th>
              <th style={{ ...TH_STYLE, width: 65 }}>RENDIMIENTO</th>
              <th style={{ ...TH_STYLE, width: 65 }}>PRECIO (IND)</th>
              <th style={{ ...TH_STYLE, width: 90, borderRight: 'none' }}>INVERSIÓN</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b, i) => (
              <tr key={b.id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
                <td style={TD_STYLE}>{b.currency}</td>
                <td style={TD_STYLE}><OperacionBadge value={b.operacion} /></td>
                <td style={{ ...TD_STYLE, textAlign: 'left', fontWeight: 600 }}>{b.issuer?.toUpperCase() ?? '—'}</td>
                <td style={{ ...TD_STYLE, whiteSpace: 'nowrap' }}>{fmtDate(b.maturity_date)}</td>
                <td style={TD_STYLE}>{b.coupon != null ? fmtNum(b.coupon, 3).replace(/\.?0+$/, '') : '—'}</td>
                <td style={TD_STYLE}>{b.yield != null ? `${fmtNum(b.yield)}%` : '—'}</td>
                <td style={TD_STYLE}>{b.price != null ? fmtNum(b.price, 3) : '—'}</td>
                <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>{fmtAmt(b.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} style={{ ...FOOTER_TD, fontSize: 9, opacity: 0.6, borderRight: 'none' }}>
                {opSubtotalLabel(list)}
              </td>
              <td style={{ ...FOOTER_TD, textAlign: 'right', borderRight: 'none' }}>{fmtAmt(opCompras(list))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  function equitiesTable(list: Equity[]) {
    if (list.length === 0) return null
    return (
      <div style={{ marginTop: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...TH_STYLE, width: 60 }}>MONEDA</th>
              <th style={{ ...TH_STYLE, width: 60 }}>OPERACIÓN</th>
              <th style={{ ...TH_STYLE, width: 70 }}>TICKER</th>
              <th style={{ ...TH_STYLE, textAlign: 'left' }}>EMPRESA</th>
              <th style={{ ...TH_STYLE, textAlign: 'left' }}>SECTOR</th>
              <th style={{ ...TH_STYLE, textAlign: 'left' }}>PAÍS</th>
              <th style={{ ...TH_STYLE, width: 90, borderRight: 'none' }}>INVERSIÓN</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e, i) => (
              <tr key={e.id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
                <td style={TD_STYLE}>{e.currency}</td>
                <td style={TD_STYLE}><OperacionBadge value={e.operacion} /></td>
                <td style={{ ...TD_STYLE, fontWeight: 700 }}>{e.ticker ?? '—'}</td>
                <td style={{ ...TD_STYLE, textAlign: 'left', fontWeight: 600 }}>{e.company_name?.toUpperCase() ?? '—'}</td>
                <td style={{ ...TD_STYLE, textAlign: 'left' }}>{e.sector ?? '—'}</td>
                <td style={{ ...TD_STYLE, textAlign: 'left' }}>{e.country ?? '—'}</td>
                <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>{fmtAmt(e.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} style={{ ...FOOTER_TD, fontSize: 9, opacity: 0.6, borderRight: 'none' }}>
                {opSubtotalLabel(list)}
              </td>
              <td style={{ ...FOOTER_TD, textAlign: 'right', borderRight: 'none' }}>{fmtAmt(opCompras(list))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

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
      {/* ── Letterhead ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1B2E3C', paddingBottom: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#1B2E3C', letterSpacing: '0.01em' }}>Propuesta de Inversión</div>
          <div style={{ fontSize: 9.5, color: '#9ca3af', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Investment Proposal · Documento confidencial</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/download.png"
          alt="Roble Capital"
          style={{ height: 46, objectFit: 'contain' }}
        />
      </div>

      {/* ── Info bar: Cliente / Asesor / Fecha / Monto ── */}
      <div style={{ display: 'flex', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
        {[
          ['Cliente', clientName ?? '—', 1.5],
          ['Asesor', advisorName ?? '—', 1],
          ['Fecha', displayDate, 1],
          ['Compras', `${currency} ${fmtAmt(totalAssigned)}`.replace(`${currency} $`, `${currency} `), 1],
        ].map(([label, value, flex], i, arr) => (
          <div key={label as string} style={{
            flex: flex as number,
            padding: '8px 16px 10px',
            borderRight: i < arr.length - 1 ? '1px solid #E2E8F0' : 'none',
            backgroundColor: '#F7F9FB',
          }}>
            <div style={{ fontSize: 8.5, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, lineHeight: 1.4 }}>{label}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1B2E3C', lineHeight: 1.5 }}>{value}</div>
          </div>
        ))}
        {totalVentas > 0 && (
          <div style={{ flex: 1, padding: '8px 16px 10px', backgroundColor: '#F7F9FB' }}>
            <div style={{ fontSize: 8.5, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, lineHeight: 1.4 }}>Ventas</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1B2E3C', lineHeight: 1.5 }}>{`${currency} ${fmtAmt(totalVentas)}`.replace(`${currency} $`, `${currency} `)}</div>
          </div>
        )}
      </div>

      {grouped ? (
        // ══ Grouped by portafolio/custodio (ej. Pershing, Morgan) ═══════════════
        brokers.map(broker => {
          const bFunds    = funds.filter(f => (f.broker?.trim() || null) === broker)
          const bBonds    = bonds.filter(b => (b.broker?.trim() || null) === broker)
          const bEquities = equities.filter(e => (e.broker?.trim() || null) === broker)
          if (bFunds.length === 0 && bBonds.length === 0 && bEquities.length === 0) return null
          return (
            <div key={broker ?? '__general'} style={{ marginBottom: 12, border: '1px solid #1B2E3C', borderRadius: 3 }}>
              <div style={{
                display: 'inline-block',
                backgroundColor: '#FFFFFF',
                border: '1px solid #1B2E3C',
                borderBottom: 'none',
                borderRadius: '3px 3px 0 0',
                padding: '5px 14px',
                marginLeft: 10,
                marginTop: -1,
                position: 'relative',
                top: -1,
                fontSize: 11,
                fontWeight: 700,
                color: '#1B2E3C',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                Portafolio {broker ?? 'General'}
              </div>
              <div style={{ padding: '2px 14px 10px' }}>
                {fundsTable(bFunds)}
                {bondsTable(bBonds)}
                {equitiesTable(bEquities)}
              </div>
            </div>
          )
        })
      ) : (
        // ══ Flat layout (sin agrupar por custodio) ═══════════════════════════════
        <>
          {fundsTable(funds)}
          {bonds.length > 0 && (
            <div style={{ marginTop: funds.length > 0 ? 24 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1B2E3C', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bonos</div>
              {bondsTable(bonds)}
            </div>
          )}
          {equities.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1B2E3C', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acciones</div>
              {equitiesTable(equities)}
            </div>
          )}
        </>
      )}

      {/* ── Grand total (if multiple sections) ── */}
      {(bonds.length > 0 || equities.length > 0) && funds.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          {totalVentas > 0 && (
            <div style={{
              backgroundColor: '#6b7280', color: '#fff', fontWeight: 700, fontSize: 12,
              padding: '7px 16px', borderRadius: 4,
            }}>
              VENTAS: {fmtAmt(totalVentas)}
            </div>
          )}
          <div style={{
            backgroundColor: '#1B2E3C', color: '#fff', fontWeight: 700, fontSize: 12,
            padding: '7px 16px', borderRadius: 4,
          }}>
            COMPRAS: {fmtAmt(totalAssigned)}
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
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid #e5e7eb',
          flexWrap: 'wrap',
        }}>
          {gestoras.map(g => (
            <GestoraLogo key={g} name={g} />
          ))}
        </div>
      )}

      {/* ── Disclaimer — siempre presente, marcado para que el paginado del PDF
          nunca lo corte a la mitad ── */}
      <div data-pdf-keep-together style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px solid #e5e7eb',
        fontSize: 7.5,
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#6b7280',
        lineHeight: 1.55,
        textAlign: 'justify',
      }}>
        {disclaimer ?? DEFAULT_DISCLAIMER}
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop: 8,
        paddingTop: 6,
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: '#1B2E3C', letterSpacing: '0.04em' }}>ROBLE CAPITAL WEALTH MANAGEMENT</span>
        <span style={{ fontSize: 7.5, color: '#9ca3af' }}>Documento confidencial · Preparado exclusivamente para {clientName ?? 'el destinatario'}</span>
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
