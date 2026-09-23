'use client'

import Image from 'next/image'
import { type CouponFrequency, type DayCountConvention, calculateBondAccrual } from '@/lib/proposals/bondCalculations'
import { ROBLE_DISCLAIMER } from '@/lib/disclaimers'

// ─── Types ────────────────────────────────────────────────────────────────────

type Operacion = 'compra' | 'venta' | 'aumentar' | 'reducir' | 'mantener'

// Mismo criterio que en el editor: 'aumentar' cuenta como compra y
// 'reducir' como venta; 'mantener' no mueve dinero.
function isCompraSide(op: Operacion) { return op === 'compra' || op === 'aumentar' }
function isVentaSide(op: Operacion) { return op === 'venta' || op === 'reducir' }

type FundCategory = 'acciones' | 'balanceado' | 'bonos'
const FUND_CATEGORY_LABEL: Record<FundCategory, string> = { acciones: 'Acciones', balanceado: 'Balanceado', bonos: 'Bonos' }

interface Fund {
  id: string
  isin: string | null
  issuer: string | null
  fund_name: string | null
  fund_category: FundCategory | null
  return_ytd: number | null
  return_1y: number | null
  return_3y: number | null
  return_5y: number | null
  return_2025: number | null
  return_2024: number | null
  return_2023: number | null
  return_2022: number | null
  return_2021: number | null
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
  quantity: number | null
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
  frequency: CouponFrequency | null
  day_count_convention: DayCountConvention | null
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
  settlementDate?: string | null
  // Columnas opcionales a ocultar del reporte, con clave "tabla.columna"
  // (ej. "funds.ytd", "bonds.rating") — las columnas núcleo (operación,
  // nombre del instrumento, moneda del total) nunca están en esta lista
  // porque no se ofrecen como ocultables.
  hiddenColumns?: Set<string>
}

// ─── Number formatter — Latin American style: $19.307,00 ─────────────────────

function fmtAmt(n: number) {
  if (!n && n !== 0) return '—'
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Verde para rendimientos positivos, rojo para negativos — mismo criterio
// que ya usa el editor para estas columnas.
function pctColor(n: number | null): string {
  if (n == null) return '#1a1a1a'
  return n >= 0 ? '#15803D' : '#B91C1C'
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

const DEFAULT_DISCLAIMER = ROBLE_DISCLAIMER

// ─── Table styles ──────────────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  backgroundColor: '#1B2E3C',
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: 9,
  textTransform: 'uppercase',
  padding: '4px 6px',
  textAlign: 'center',
  verticalAlign: 'middle',
  borderRight: '1px solid #2E4155',
  whiteSpace: 'nowrap',
  letterSpacing: '0.04em',
}

const TD_STYLE: React.CSSProperties = {
  fontSize: 9.5,
  padding: '3px 7px',
  lineHeight: 1.3,
  textAlign: 'center',
  // 'top', no 'middle': cuando una fila tiene una celda de varias líneas
  // (emisor de bono largo, o fondo + su ISIN debajo), centrar verticalmente
  // empuja el resto de las celdas de esa fila hacia abajo, corridas
  // respecto a la primera línea de la celda más alta — exactamente el "los
  // valores quedan por debajo" que se reportó. Alineando arriba, todas las
  // celdas de una fila arrancan a la misma altura sin importar cuántas
  // líneas tenga la más alta.
  verticalAlign: 'top',
  borderRight: '1px solid #E8ECF0',
  borderBottom: '1px solid #E8ECF0',
  color: '#1a1a1a',
  fontFamily: 'Arial, Helvetica, sans-serif',
}

const FOOTER_TD: React.CSSProperties = {
  backgroundColor: '#1B2E3C',
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: 9,
  padding: '3px 7px',
  textAlign: 'right',
  borderRight: '1px solid #2E4155',
}

const OPERACION_BADGE: Record<Operacion, { label: string; color: string }> = {
  compra:   { label: 'Compra',   color: '#15803D' },
  aumentar: { label: 'Aumentar', color: '#0F766E' },
  venta:    { label: 'Venta',    color: '#B91C1C' },
  reducir:  { label: 'Reducir',  color: '#B45309' },
  mantener: { label: 'Mantener', color: '#6B7280' },
}

function OperacionBadge({ value }: { value: Operacion }) {
  const { label, color } = OPERACION_BADGE[value]
  return (
    <span style={{
      display: 'inline-block',
      verticalAlign: 'middle',
      fontSize: 9,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      color,
    }}>
      {label}
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
  settlementDate,
  hiddenColumns,
}: ProposalPDFTemplateProps) {
  const isHidden = (key: string) => hiddenColumns?.has(key) ?? false
  const gestoras = getGestoras(funds)
  // Compras y ventas se muestran siempre por separado — sumarlas juntas
  // infla el total (ej: comprar $300 y vender $300 no es "$600").
  const allItems = [...funds, ...bonds, ...equities]
  const totalCompras = allItems.filter(i => isCompraSide(i.operacion)).reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalVentas  = allItems.filter(i => isVentaSide(i.operacion)).reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalAssigned = totalCompras || totalAmount

  // Cupón corrido / desembolso estimado — solo bonos en compra, mismo
  // criterio que el resto del PDF.
  const bondAccruals = bonds.filter(b => isCompraSide(b.operacion)).map(b => calculateBondAccrual(b, settlementDate ?? null))
  const totalAccruedInterest = bondAccruals.reduce((s, a) => s + a.accruedInterest, 0)
  const totalEstimatedCash   = bondAccruals.reduce((s, a) => s + a.estimatedCashRequired, 0)

  const displayDate = date ?? new Date().toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })

  // ── Grouping: if nobody tagged a broker/custodio, keep the classic flat layout ──
  const brokers = uniqueBrokers(funds, bonds, equities)
  const grouped = brokers.length > 1 || (brokers.length === 1 && brokers[0] !== null)

  function opCompras(list: { operacion: Operacion; amount: number | null }[]) {
    return list.filter(i => isCompraSide(i.operacion)).reduce((s, i) => s + (i.amount ?? 0), 0)
  }
  function opVentas(list: { operacion: Operacion; amount: number | null }[]) {
    return list.filter(i => isVentaSide(i.operacion)).reduce((s, i) => s + (i.amount ?? 0), 0)
  }
  function opSubtotalLabel(list: { operacion: Operacion; amount: number | null }[]) {
    const v = opVentas(list)
    return v > 0 ? `Ventas: ${fmtAmt(v)}` : ''
  }

  function fundsTable(list: Fund[]) {
    if (list.length === 0) return null
    const show = {
      moneda:   !isHidden('funds.moneda'),
      categoria:!isHidden('funds.categoria'),
      ytd:      !isHidden('funds.ytd'),
      y1:       !isHidden('funds.1y'),
      y3:       !isHidden('funds.3y'),
      y5:       !isHidden('funds.5y'),
      y2025:    !isHidden('funds.y2025'),
      y2024:    !isHidden('funds.y2024'),
      y2023:    !isHidden('funds.y2023'),
      y2022:    !isHidden('funds.y2022'),
      y2021:    !isHidden('funds.y2021'),
      ytm:      !isHidden('funds.ytm'),
      duration: !isHidden('funds.duration'),
    }
    // colSpan de la fila de subtotal = todas las columnas visibles menos la
    // última (INVERSIÓN, que muestra su propio total) — moneda, operación,
    // fondo y categoría/métricas opcionales que estén visibles.
    const labelColSpan = 2 + Object.values(show).filter(Boolean).length
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
        <thead>
          <tr data-pdf-keep-together>
            {show.moneda && <th style={{ ...TH_STYLE, width: 60 }}>MONEDA</th>}
            <th style={{ ...TH_STYLE, width: 60 }}>OPERACIÓN</th>
            <th style={{ ...TH_STYLE, textAlign: 'left', whiteSpace: 'nowrap', color: '#FFFFFF' }}>FONDO DE INVERSIÓN</th>
            {show.categoria && <th style={{ ...TH_STYLE, width: 64 }}>CATEGORÍA</th>}
            {show.ytd && <th style={{ ...TH_STYLE, width: 48 }}>YTD</th>}
            {show.y1 && <th style={{ ...TH_STYLE, width: 48 }}>1 AÑO</th>}
            {show.y3 && <th style={{ ...TH_STYLE, width: 48 }}>3 AÑOS</th>}
            {show.y5 && <th style={{ ...TH_STYLE, width: 48 }}>5 AÑOS</th>}
            {show.y2025 && <th style={{ ...TH_STYLE, width: 42 }}>2025</th>}
            {show.y2024 && <th style={{ ...TH_STYLE, width: 42 }}>2024</th>}
            {show.y2023 && <th style={{ ...TH_STYLE, width: 42 }}>2023</th>}
            {show.y2022 && <th style={{ ...TH_STYLE, width: 42 }}>2022</th>}
            {show.y2021 && <th style={{ ...TH_STYLE, width: 42 }}>2021</th>}
            {show.ytm && <th style={{ ...TH_STYLE, width: 52 }}>YTM IND.</th>}
            {show.duration && <th style={{ ...TH_STYLE, width: 48 }}>DUR. (A)</th>}
            <th style={{ ...TH_STYLE, width: 90, borderRight: 'none' }}>INVERSIÓN</th>
          </tr>
        </thead>
        <tbody>
          {list.map((f, i) => (
            <tr key={f.id} data-pdf-keep-together style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
              {show.moneda && <td style={TD_STYLE}>{currency}</td>}
              <td style={TD_STYLE}><OperacionBadge value={f.operacion} /></td>
              <td style={{ ...TD_STYLE, textAlign: 'left', fontWeight: 600 }}>
                {f.fund_name?.toUpperCase() ?? '—'}
                {f.isin && <div style={{ fontSize: 6.5, fontWeight: 400, color: '#9ca3af', lineHeight: 1.3, marginTop: 1 }}>ISIN: {f.isin}</div>}
              </td>
              {show.categoria && <td style={TD_STYLE}>{f.fund_category ? FUND_CATEGORY_LABEL[f.fund_category] : '—'}</td>}
              {show.ytd && <td style={{ ...TD_STYLE, color: pctColor(f.return_ytd), fontWeight: 600 }}>{fmtNum(f.return_ytd)}%</td>}
              {show.y1 && <td style={{ ...TD_STYLE, color: pctColor(f.return_1y), fontWeight: 600 }}>{fmtNum(f.return_1y)}%</td>}
              {show.y3 && <td style={{ ...TD_STYLE, color: pctColor(f.return_3y), fontWeight: 600 }}>{fmtNum(f.return_3y)}%</td>}
              {show.y5 && <td style={{ ...TD_STYLE, color: pctColor(f.return_5y), fontWeight: 600 }}>{fmtNum(f.return_5y)}%</td>}
              {show.y2025 && <td style={{ ...TD_STYLE, color: pctColor(f.return_2025), fontWeight: 600 }}>{fmtNum(f.return_2025)}%</td>}
              {show.y2024 && <td style={{ ...TD_STYLE, color: pctColor(f.return_2024), fontWeight: 600 }}>{fmtNum(f.return_2024)}%</td>}
              {show.y2023 && <td style={{ ...TD_STYLE, color: pctColor(f.return_2023), fontWeight: 600 }}>{fmtNum(f.return_2023)}%</td>}
              {show.y2022 && <td style={{ ...TD_STYLE, color: pctColor(f.return_2022), fontWeight: 600 }}>{fmtNum(f.return_2022)}%</td>}
              {show.y2021 && <td style={{ ...TD_STYLE, color: pctColor(f.return_2021), fontWeight: 600 }}>{fmtNum(f.return_2021)}%</td>}
              {show.ytm && <td style={TD_STYLE}>{f.ytm_indicative != null ? `${fmtNum(f.ytm_indicative)}%` : '—'}</td>}
              {show.duration && <td style={TD_STYLE}>{f.duration_years != null ? fmtNum(f.duration_years, 1) : '—'}</td>}
              <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>{fmtAmt(f.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr data-pdf-keep-together>
            <td colSpan={labelColSpan} style={{ ...FOOTER_TD, textAlign: 'left', fontSize: 9, opacity: 0.6, borderRight: 'none' }}>
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
    const accrualsByRow = new Map(list.map(b => [b.id, calculateBondAccrual(b, settlementDate ?? null)]))
    const listAccruedInterest = list.filter(b => isCompraSide(b.operacion)).reduce((s, b) => s + (accrualsByRow.get(b.id)?.accruedInterest ?? 0), 0)
    const listEstimatedCash   = list.filter(b => isCompraSide(b.operacion)).reduce((s, b) => s + (accrualsByRow.get(b.id)?.estimatedCashRequired ?? 0), 0)
    const show = {
      moneda:      !isHidden('bonds.moneda'),
      vencimiento: !isHidden('bonds.vencimiento'),
      cupon:       !isHidden('bonds.cupon'),
      rendimiento: !isHidden('bonds.rendimiento'),
      duration:    !isHidden('bonds.duration'),
      rating:      !isHidden('bonds.rating'),
      precio:      !isHidden('bonds.precio'),
    }
    const labelColSpan = 2 + Object.values(show).filter(Boolean).length
    // Misma letra, tamaño y alineado que fondos/acciones — solo el padding
    // horizontal se recorta un poco para que las hasta 12 columnas de
    // bonos entren, sin tocar fuente ni alto de fila.
    const bondTh: React.CSSProperties = { ...TH_STYLE, padding: '4px 4px' }
    const bondTd: React.CSSProperties = { ...TD_STYLE, padding: '3px 4px' }
    return (
      <div style={{ marginTop: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr data-pdf-keep-together>
              {show.moneda && <th style={{ ...bondTh, width: 55 }}>MONEDA</th>}
              <th style={{ ...bondTh, width: 55 }}>OPERACIÓN</th>
              <th style={{ ...bondTh, textAlign: 'left' }}>BONOS</th>
              {show.vencimiento && <th style={{ ...bondTh, width: 72 }}>VENCIMIENTO</th>}
              {show.cupon && <th style={{ ...bondTh, width: 48 }}>CUPÓN</th>}
              {show.rendimiento && <th style={{ ...bondTh, width: 58 }}>RENDIMIENTO</th>}
              {show.duration && <th style={{ ...bondTh, width: 42 }}>DUR. (A)</th>}
              {show.rating && <th style={{ ...bondTh, width: 44 }}>RATING</th>}
              {show.precio && <th style={{ ...bondTh, width: 58 }}>PRECIO (IND)</th>}
              <th style={{ ...bondTh, width: 72 }}>VALOR COMPRA</th>
              <th style={{ ...bondTh, width: 72 }}>CUPÓN CORRIDO</th>
              <th style={{ ...bondTh, width: 80, borderRight: 'none' }}>DESEMBOLSO EST.</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b, i) => {
              const accrual = accrualsByRow.get(b.id)!
              return (
              <tr key={b.id} data-pdf-keep-together style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
                {show.moneda && <td style={bondTd}>{b.currency}</td>}
                <td style={bondTd}><OperacionBadge value={b.operacion} /></td>
                <td style={{ ...bondTd, textAlign: 'left', fontWeight: 600 }}>
                  {b.issuer?.toUpperCase() ?? '—'}
                </td>
                {show.vencimiento && <td style={{ ...bondTd, whiteSpace: 'nowrap' }}>{fmtDate(b.maturity_date)}</td>}
                {show.cupon && <td style={bondTd}>{b.coupon != null ? fmtNum(b.coupon, 3).replace(/\.?0+$/, '') : '—'}</td>}
                {show.rendimiento && <td style={bondTd}>{b.yield != null ? `${fmtNum(b.yield)}%` : '—'}</td>}
                {show.duration && <td style={bondTd}>{b.duration != null ? fmtNum(b.duration, 1) : '—'}</td>}
                {show.rating && <td style={bondTd}>{b.rating ?? '—'}</td>}
                {show.precio && <td style={bondTd}>{b.price != null ? fmtNum(b.price, 3) : '—'}</td>}
                <td style={{ ...bondTd, textAlign: 'right', fontWeight: 600 }}>{fmtAmt(b.amount)}</td>
                <td style={{ ...bondTd, textAlign: 'right', fontWeight: 700, backgroundColor: '#FEF3C7' }}>{accrual.accruedInterest > 0 ? fmtAmt(accrual.accruedInterest) : '—'}</td>
                <td style={{ ...bondTd, textAlign: 'right', fontWeight: 700, borderRight: 'none' }}>{fmtAmt(accrual.estimatedCashRequired)}</td>
              </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr data-pdf-keep-together>
              <td colSpan={labelColSpan} style={{ ...FOOTER_TD, fontSize: 9, opacity: 0.6, borderRight: 'none' }}>
                {opSubtotalLabel(list)}
              </td>
              <td style={{ ...FOOTER_TD, textAlign: 'right' }}>{fmtAmt(opCompras(list))}</td>
              <td style={{ ...FOOTER_TD, textAlign: 'right' }}>{listAccruedInterest > 0 ? fmtAmt(listAccruedInterest) : '—'}</td>
              <td style={{ ...FOOTER_TD, textAlign: 'right', borderRight: 'none' }}>{fmtAmt(listEstimatedCash)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  function equitiesTable(list: Equity[]) {
    if (list.length === 0) return null
    const show = {
      moneda: !isHidden('equities.moneda'),
      ticker: !isHidden('equities.ticker'),
      sector: !isHidden('equities.sector'),
      pais:   !isHidden('equities.pais'),
    }
    const labelColSpan = 2 + Object.values(show).filter(Boolean).length
    return (
      <div style={{ marginTop: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr data-pdf-keep-together>
              {show.moneda && <th style={{ ...TH_STYLE, width: 60 }}>MONEDA</th>}
              <th style={{ ...TH_STYLE, width: 60 }}>OPERACIÓN</th>
              {show.ticker && <th style={{ ...TH_STYLE, width: 70 }}>TICKER</th>}
              <th style={{ ...TH_STYLE, textAlign: 'left' }}>EMPRESA</th>
              {show.sector && <th style={{ ...TH_STYLE, textAlign: 'left' }}>SECTOR</th>}
              {show.pais && <th style={{ ...TH_STYLE, textAlign: 'left' }}>PAÍS</th>}
              <th style={{ ...TH_STYLE, width: 90, borderRight: 'none' }}>INVERSIÓN</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e, i) => (
              <tr key={e.id} data-pdf-keep-together style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F7F9FB' }}>
                {show.moneda && <td style={TD_STYLE}>{e.currency}</td>}
                <td style={TD_STYLE}><OperacionBadge value={e.operacion} /></td>
                {show.ticker && <td style={{ ...TD_STYLE, fontWeight: 700 }}>{e.ticker ?? '—'}</td>}
                <td style={{ ...TD_STYLE, textAlign: 'left', fontWeight: 600 }}>{e.company_name?.toUpperCase() ?? '—'}</td>
                {show.sector && <td style={{ ...TD_STYLE, textAlign: 'left' }}>{e.sector ?? '—'}</td>}
                {show.pais && <td style={{ ...TD_STYLE, textAlign: 'left' }}>{e.country ?? '—'}</td>}
                <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>{fmtAmt(e.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-pdf-keep-together>
              <td colSpan={labelColSpan} style={{ ...FOOTER_TD, fontSize: 9, opacity: 0.6, borderRight: 'none' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1B2E3C', paddingBottom: 5, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1B2E3C', letterSpacing: '0.01em' }}>Propuesta de Inversión</div>
          <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Investment Proposal · Documento confidencial</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/download.png"
          alt="Roble Capital"
          style={{ height: 26, objectFit: 'contain' }}
        />
      </div>

      {/* ── Info bar: Cliente / Asesor / Fecha / Monto — una sola línea por
          campo (etiqueta + valor lado a lado), no dos líneas apiladas como
          antes. */}
      <div style={{ display: 'flex', border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        {[
          ['Cliente', clientName ?? '—', 1.5],
          ['Asesor', advisorName ?? '—', 1],
          ['Fecha', displayDate, 1],
          ['Compras', `${currency} ${fmtAmt(totalAssigned)}`.replace(`${currency} $`, `${currency} `), 1],
        ].map(([label, value, flex], i, arr) => (
          <div key={label as string} style={{
            flex: flex as number,
            padding: '5px 12px',
            borderRight: i < arr.length - 1 ? '1px solid #E2E8F0' : 'none',
            backgroundColor: '#F7F9FB',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            <span style={{ fontSize: 7.5, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}: </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#1B2E3C' }}>{value}</span>
          </div>
        ))}
        {totalVentas > 0 && (
          <div style={{ flex: 1, padding: '5px 12px', backgroundColor: '#F7F9FB', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 7.5, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ventas: </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#1B2E3C' }}>{`${currency} ${fmtAmt(totalVentas)}`.replace(`${currency} $`, `${currency} `)}</span>
          </div>
        )}
        {totalAccruedInterest > 0 && (
          <div style={{ flex: 1, padding: '5px 12px', backgroundColor: '#F7F9FB', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 7.5, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cupón Corrido: </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#1B2E3C' }}>{`${currency} ${fmtAmt(totalAccruedInterest)}`.replace(`${currency} $`, `${currency} `)}</span>
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
            // data-pdf-keep-together acá: si el título "Bonos" + su tabla
            // entran enteros en una hoja, viajan juntos — nunca queda el
            // título solo al pie de una página y la tabla arrancando en la
            // siguiente. Si no entran enteros, esta marca se ignora y el
            // corte cae en los puntos protegidos de más abajo (encabezado
            // de columnas, cada fila).
            <div data-pdf-keep-together style={{ marginTop: funds.length > 0 ? 10 : 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#1B2E3C', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bonos</div>
              {bondsTable(bonds)}
            </div>
          )}
          {equities.length > 0 && (
            <div data-pdf-keep-together style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#1B2E3C', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acciones</div>
              {equitiesTable(equities)}
            </div>
          )}
        </>
      )}

      {/* ── Grand total (if multiple sections) ── */}
      {(bonds.length > 0 || equities.length > 0) && funds.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 3 }}>
          {totalVentas > 0 && (
            <div style={{
              backgroundColor: '#6b7280', color: '#fff', fontWeight: 700, fontSize: 9,
              padding: '4px 10px', borderRadius: 3,
            }}>
              VENTAS: {fmtAmt(totalVentas)}
            </div>
          )}
          {bonds.length > 0 && totalEstimatedCash > totalAssigned && (
            <div style={{
              backgroundColor: '#1B2E3C', color: '#fff', fontWeight: 700, fontSize: 9,
              padding: '4px 10px', borderRadius: 3, opacity: 0.85,
            }}>
              DESEMBOLSO ESTIMADO: {fmtAmt(totalEstimatedCash)}
            </div>
          )}
          <div style={{
            backgroundColor: '#1B2E3C', color: '#fff', fontWeight: 700, fontSize: 9,
            padding: '4px 10px', borderRadius: 3,
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
