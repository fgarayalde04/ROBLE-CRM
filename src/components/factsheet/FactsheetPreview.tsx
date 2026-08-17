'use client'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import type { FactsheetData, FactsheetPosition } from '@/types/factsheet'

// ── Brand ────────────────────────────────────────────────────────────────────

const C = {
  darkGreen:  '#1B3A2B',
  midGreen:   '#2E7D52',
  accent:     '#4CAF72',
  lightGreen: '#E8F5E9',
  white:      '#FFFFFF',
  offWhite:   '#F8FAF8',
  gray100:    '#F3F4F6',
  gray200:    '#E5E7EB',
  gray500:    '#6B7280',
  gray700:    '#374151',
  gray900:    '#111827',
  red:        '#DC2626',
  amber:      '#D97706',
}

const CHART_COLORS = ['#1B3A2B','#2E7D52','#4CAF72','#81C995','#A5D6B7','#C8E6C9','#6B7280','#9CA3AF','#D1FAE5','#F0FFF4']

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtUSD2 = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtPct = (n: number | null | undefined, decimals = 1) =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`

const fmtPctPlain = (n: number | null | undefined, decimals = 1) =>
  n == null ? '—' : `${n.toFixed(decimals)}%`

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtScore = (n: number | null | undefined) =>
  n == null ? '—' : n.toFixed(1)

// ── Domain helpers (concentration / maturity / yield / cash) ─────────────────

function computeCash(positions: FactsheetPosition[]): number {
  return positions.filter(p => p.assetClass === 'Cash').reduce((s, p) => s + p.marketValue, 0)
}

// Weighted-average yield — same formula the Propuestas module already uses
// (ProposalPDFTemplate.tsx): sum(yield * weight) / sum(weight), over
// positions where an advisor has entered a yield by hand.
function computeWeightedYield(positions: FactsheetPosition[]): number | null {
  const items = positions.filter(p => p.yield != null && p.weight > 0)
  if (!items.length) return null
  const wSum = items.reduce((s, p) => s + p.weight, 0)
  if (wSum <= 0) return null
  return items.reduce((s, p) => s + (p.yield as number) * p.weight, 0) / wSum
}

function computeConcentration(positions: FactsheetPosition[]) {
  const sorted = [...positions].sort((a, b) => b.weight - a.weight)
  return {
    largest: sorted[0] ?? null,
    top3: sorted.slice(0, 3).reduce((s, p) => s + p.weight, 0),
    top5: sorted.slice(0, 5).reduce((s, p) => s + p.weight, 0),
  }
}

function computeGroupConcentration(positions: FactsheetPosition[], key: 'fundFamily' | 'currency' | 'assetClass', max = 5) {
  const map = new Map<string, number>()
  for (const p of positions) {
    const k = p[key]
    if (!k) continue
    map.set(String(k), (map.get(String(k)) ?? 0) + p.weight)
  }
  return Array.from(map.entries())
    .map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max)
}

const MATURITY_BUCKETS = ['< 1 año', '1–3 años', '3–5 años', '5–10 años', '+10 años']

function maturityBucket(years: number): string {
  if (years < 1) return MATURITY_BUCKETS[0]
  if (years < 3) return MATURITY_BUCKETS[1]
  if (years < 5) return MATURITY_BUCKETS[2]
  if (years < 10) return MATURITY_BUCKETS[3]
  return MATURITY_BUCKETS[4]
}

function computeMaturityProfile(positions: FactsheetPosition[]) {
  const withMaturity = positions.filter(p => p.maturityDate)
  const now = Date.now()
  const totals: Record<string, number> = {}
  for (const b of MATURITY_BUCKETS) totals[b] = 0
  for (const p of withMaturity) {
    const t = new Date(p.maturityDate as string).getTime()
    if (isNaN(t)) continue
    const years = (t - now) / (365.25 * 86400000)
    totals[maturityBucket(Math.max(years, 0))] += p.marketValue
  }
  const total = withMaturity.reduce((s, p) => s + p.marketValue, 0)
  return { totals, total, count: withMaturity.length }
}

function upcomingMaturities(positions: FactsheetPosition[]) {
  return positions
    .filter(p => p.maturityDate)
    .sort((a, b) => (a.maturityDate as string).localeCompare(b.maturityDate as string))
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function PageDivider() {
  return <div style={{ pageBreakAfter: 'always', breakAfter: 'page' }} />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: C.darkGreen, letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
        {children}
      </h2>
      <div style={{ height: 2, background: `linear-gradient(to right, ${C.midGreen}, ${C.lightGreen})`, marginTop: 4, borderRadius: 1 }} />
    </div>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: C.darkGreen, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{children}</div>
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 8, padding: '12px 14px',
      borderLeft: `3px solid ${color ?? C.midGreen}`,
    }}>
      <div style={{ fontSize: 10, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.gray900, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.gray500, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// small pill used for "additional info" cells that differ by instrument type
function InfoPill({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 9, color: C.gray500 }}>{children}</span>
}

// ── Cover Page / Account Snapshot ─────────────────────────────────────────────

function CoverPage({ data }: { data: FactsheetData }) {
  const { meta, totalValue, performance, positions } = data
  const cash = computeCash(positions)
  const cashPct = totalValue > 0 ? (cash / totalValue) * 100 : 0
  const weightedYield = computeWeightedYield(positions)

  return (
    <div style={{
      width: '210mm', minHeight: '297mm', background: C.white,
      display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif',
    }}>
      {/* Header band */}
      <div style={{ background: C.darkGreen, padding: '28px 36px 24px', color: C.white }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#A5D6B7', fontFamily: 'Arial, sans-serif', fontWeight: 600 }}>
              ROBLE CAPITAL
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-0.01em' }}>
              Portfolio Factsheet
            </div>
          </div>
          <img src="/download.png" alt="Roble Capital" style={{ height: 44, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#C8E6C9' }}>
          {meta.quarter || 'Portfolio Report'} &nbsp;·&nbsp; {meta.reportDate || new Date().toLocaleDateString('es-UY')}
        </div>
      </div>

      {/* Client name hero */}
      <div style={{ padding: '36px 36px 28px', borderBottom: `1px solid ${C.gray200}` }}>
        <div style={{ fontSize: 10, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Arial, sans-serif' }}>
          Prepared for
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, color: C.gray900, marginTop: 6, lineHeight: 1.2 }}>
          {meta.clientName || 'Client Name'}
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 8, fontFamily: 'Arial, sans-serif' }}>
          {meta.accountNumber && (
            <div style={{ fontSize: 12, color: C.gray500 }}>Account: <span style={{ color: C.gray700, fontWeight: 600 }}>{meta.accountNumber}</span></div>
          )}
          <div style={{ fontSize: 12, color: C.gray500 }}>Base Currency: <span style={{ color: C.gray700, fontWeight: 600 }}>{meta.currency || 'USD'}</span></div>
          <div style={{ fontSize: 12, color: C.gray500 }}>Valuation Date: <span style={{ color: C.gray700, fontWeight: 600 }}>{meta.reportDate || '—'}</span></div>
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ padding: '24px 36px', flex: 1, fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weightedYield != null ? 4 : 3}, 1fr)`, gap: 12, marginBottom: 16 }}>
          <KpiCard label="Portfolio Value" value={fmtUSD(totalValue)} color={C.darkGreen} />
          <KpiCard label="Positions" value={String(positions.length)} color={C.midGreen} />
          <KpiCard label="Cash" value={fmtUSD(cash)} sub={`${cashPct.toFixed(1)}%`} />
          {weightedYield != null && <KpiCard label="Yield" value={fmtPctPlain(weightedYield, 2)} color={C.midGreen} />}
        </div>

        {/* Performance panel — only render if at least one value exists */}
        {[performance.ytdReturn, performance.return1y, performance.return3y, performance.return5y].some(v => v != null) && (() => {
          const perfCards = [
            { label: 'YTD',    value: performance.ytdReturn },
            { label: '1 Year', value: performance.return1y },
            { label: '3 Years', value: performance.return3y },
            { label: '5 Years', value: performance.return5y },
          ].filter(c => c.value != null)
          return (
            <div style={{ background: C.offWhite, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.darkGreen, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Performance
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perfCards.length}, 1fr)`, gap: 10 }}>
                {perfCards.map(c => (
                  <KpiCard key={c.label} label={c.label} value={fmtPct(c.value)} color={c.value! >= 0 ? C.midGreen : C.red} />
                ))}
              </div>
            </div>
          )
        })()}

        {/* Allocation mini bar */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 600 }}>
            Asset Allocation
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: C.gray200 }}>
            {data.allocation.byAssetClass.map((a, i) => (
              <div key={a.name} style={{ width: `${a.pct}%`, background: a.color || CHART_COLORS[i % CHART_COLORS.length] }} title={`${a.name}: ${a.pct.toFixed(1)}%`} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
            {data.allocation.byAssetClass.map((a, i) => (
              <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: a.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                <span style={{ fontSize: 10, color: C.gray700 }}>{a.name} {a.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Advisor + footer */}
      <div style={{ background: C.offWhite, borderTop: `1px solid ${C.gray200}`, padding: '16px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Arial, sans-serif' }}>
          <div style={{ fontSize: 10, color: C.gray500 }}>Asesor de Inversiones</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gray900 }}>{meta.advisor || '—'}</div>
        </div>
        <div style={{ fontSize: 9, color: C.gray500, textAlign: 'right', maxWidth: 280, fontFamily: 'Arial, sans-serif', lineHeight: 1.4 }}>
          Documento confidencial · Roble Capital · {meta.reportDate || ''}
        </div>
      </div>
    </div>
  )
}

// ── Page 2: Performance & Allocation ──────────────────────────────────────────

function PerformanceAllocationPage({ data }: { data: FactsheetData }) {
  const { performance, allocation } = data
  const perfCards = [
    { label: 'YTD',    value: performance.ytdReturn },
    { label: '1 Year', value: performance.return1y },
    { label: '3 Years', value: performance.return3y },
    { label: '5 Years', value: performance.return5y },
  ].filter(c => c.value != null)

  const hasGeo = allocation.byRegion.length > 1 || (allocation.byRegion.length === 1 && allocation.byRegion[0].name !== 'USA')

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Performance</SectionTitle>

      {perfCards.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perfCards.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
          {perfCards.map(c => (
            <KpiCard key={c.label} label={c.label} value={fmtPct(c.value)} color={c.value! >= 0 ? C.midGreen : C.red} />
          ))}
        </div>
      ) : (
        <div style={{ background: C.offWhite, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: '12px 16px', color: C.gray500, fontSize: 11, marginBottom: 16 }}>
          Sin datos de performance disponibles para este período.
        </div>
      )}

      {performance.history && performance.history.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={performance.history} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: C.gray500 }} />
              <YAxis tick={{ fontSize: 9, fill: C.gray500 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)}%`, '']} />
              <Line type="monotone" dataKey="portfolio" stroke={C.midGreen} strokeWidth={2} dot={false} name="Portfolio" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <SectionTitle>Portfolio Allocation</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: hasGeo ? '1fr 1fr 1fr' : '1fr 1fr', gap: 20 }}>
        {[
          { title: 'Asset Class', items: allocation.byAssetClass },
          { title: 'Currency', items: allocation.byCurrency },
          ...(hasGeo ? [{ title: 'Geographic', items: allocation.byRegion }] : []),
        ].map(({ title, items }) => (
          <div key={title}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 6 }}>{title}</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={items} dataKey="pct" cx="50%" cy="50%" outerRadius={58} innerRadius={28}>
                  {items.map((a, i) => <Cell key={a.name} fill={a.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
              {items.slice(0, 6).map((a, i) => (
                <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: a.color || CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: C.gray700 }}>{a.name} {a.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page 3: Portfolio Analysis (Concentration + Fixed Income + Maturity) ─────

function ConcentrationSection({ data }: { data: FactsheetData }) {
  const { positions } = data
  const conc = computeConcentration(positions)
  const byFamily = computeGroupConcentration(positions, 'fundFamily', 3)
  const byCurrency = computeGroupConcentration(positions, 'currency', 3)
  const byAssetClass = computeGroupConcentration(positions, 'assetClass', 3)

  return (
    <div style={{ marginBottom: 24 }}>
      <SubTitle>Portfolio Concentration</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <KpiCard label="Largest Position" value={conc.largest ? `${conc.largest.weight.toFixed(1)}%` : '—'} sub={conc.largest?.name?.slice(0, 26)} />
        <KpiCard label="Top 3 Concentration" value={fmtPctPlain(conc.top3)} />
        <KpiCard label="Top 5 Concentration" value={fmtPctPlain(conc.top5)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {[
          { title: 'By Fund Family', rows: byFamily },
          { title: 'By Currency', rows: byCurrency },
          { title: 'By Asset Type', rows: byAssetClass },
        ].filter(g => g.rows.length > 0).map(g => (
          <div key={g.title}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.gray700, marginBottom: 6 }}>{g.title}</div>
            {g.rows.map(r => (
              <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${C.gray100}` }}>
                <span style={{ fontSize: 9, color: C.gray700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{r.name}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: C.gray900 }}>{r.weight.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function FixedIncomeOverviewSection({ data }: { data: FactsheetData }) {
  const fi = data.positions.filter(p => p.assetClass === 'Fixed Income')
  if (!fi.length) return null

  const totalMV = fi.reduce((s, p) => s + p.marketValue, 0)
  const totalAccrued = fi.reduce((s, p) => s + (p.accruedInterest ?? 0), 0)
  const weightedYield = computeWeightedYield(fi)
  const withCoupon = fi.filter(p => p.coupon != null)
  const avgCoupon = withCoupon.length ? withCoupon.reduce((s, p) => s + (p.coupon as number) * p.marketValue, 0) / withCoupon.reduce((s, p) => s + p.marketValue, 0) : null

  const thStyle: React.CSSProperties = { fontSize: 8, fontWeight: 700, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '5px 6px', textAlign: 'left', background: C.gray100, borderBottom: `2px solid ${C.gray200}` }
  const tdStyle: React.CSSProperties = { fontSize: 9, color: C.gray700, padding: '5px 6px', borderBottom: `1px solid ${C.gray100}` }

  return (
    <div style={{ marginBottom: 24 }}>
      <SubTitle>Fixed Income Overview</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
        <KpiCard label="Market Value" value={fmtUSD(totalMV)} />
        {weightedYield != null && <KpiCard label="Yield" value={fmtPctPlain(weightedYield, 2)} color={C.midGreen} />}
        {avgCoupon != null && <KpiCard label="Avg. Coupon" value={fmtPctPlain(avgCoupon, 2)} />}
        <KpiCard label="Accrued Interest" value={fmtUSD(totalAccrued)} />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Coupon</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Maturity</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Nominal</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Market Value</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Yield</th>
          </tr>
        </thead>
        <tbody>
          {[...fi].sort((a, b) => b.marketValue - a.marketValue).slice(0, 10).map((p, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
              <td style={{ ...tdStyle, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{p.coupon != null ? `${p.coupon.toFixed(2)}%` : '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtDate(p.maturityDate)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{p.quantity != null ? p.quantity.toLocaleString('en-US') : '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{p.price != null ? p.price.toFixed(2) : '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(p.marketValue)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: p.yield != null ? C.midGreen : C.gray500, fontWeight: p.yield != null ? 600 : 400 }}>{p.yield != null ? `${p.yield.toFixed(2)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MaturityProfileSection({ data }: { data: FactsheetData }) {
  const profile = computeMaturityProfile(data.positions)
  if (profile.count === 0) return null

  const barData = MATURITY_BUCKETS.map((b, i) => ({
    name: b,
    value: profile.total > 0 ? parseFloat(((profile.totals[b] / profile.total) * 100).toFixed(1)) : 0,
    fill: CHART_COLORS[i],
  }))

  return (
    <div>
      <SubTitle>Maturity Profile</SubTitle>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={barData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.gray500 }} />
          <YAxis tick={{ fontSize: 9, fill: C.gray500 }} tickFormatter={v => `${v}%`} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
          <Tooltip formatter={(v: any) => [`${v}%`, '']} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function PortfolioAnalysisPage({ data }: { data: FactsheetData }) {
  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Portfolio Analysis</SectionTitle>
      <ConcentrationSection data={data} />
      <FixedIncomeOverviewSection data={data} />
      <MaturityProfileSection data={data} />
    </div>
  )
}

// ── Page 4: Upcoming Maturities + Top Holdings ────────────────────────────────

function UpcomingMaturitiesSection({ data }: { data: FactsheetData }) {
  const rows = upcomingMaturities(data.positions)
  if (!rows.length) return null

  const thStyle: React.CSSProperties = { fontSize: 8, fontWeight: 700, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '5px 6px', textAlign: 'left', background: C.gray100, borderBottom: `2px solid ${C.gray200}` }
  const tdStyle: React.CSSProperties = { fontSize: 9, color: C.gray700, padding: '5px 6px', borderBottom: `1px solid ${C.gray100}` }

  return (
    <div style={{ marginBottom: 24 }}>
      <SubTitle>Upcoming Maturities</SubTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Instrument</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Coupon</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Maturity</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Nominal</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Market Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
              <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{p.coupon != null ? `${p.coupon.toFixed(2)}%` : '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtDate(p.maturityDate)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{p.quantity != null ? p.quantity.toLocaleString('en-US') : '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(p.marketValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function additionalInfo(p: FactsheetPosition): string {
  if (p.assetClass === 'Fixed Income' && p.maturityDate) return `Venc. ${fmtDate(p.maturityDate)}${p.coupon != null ? ` · ${p.coupon.toFixed(2)}%` : ''}`
  if (p.fundFamily) return p.fundFamily
  if (p.isin) return `ISIN ${p.isin}`
  return p.securityType || '—'
}

function TopHoldingsSection({ data }: { data: FactsheetData }) {
  const top10 = [...data.positions].sort((a, b) => b.marketValue - a.marketValue).slice(0, 10)

  const thStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: C.gray500, textTransform: 'uppercase',
    letterSpacing: '0.05em', padding: '6px 8px', textAlign: 'left',
    background: C.gray100, borderBottom: `2px solid ${C.gray200}`,
  }
  const tdStyle: React.CSSProperties = {
    fontSize: 10, color: C.gray700, padding: '7px 8px',
    borderBottom: `1px solid ${C.gray100}`, verticalAlign: 'middle',
  }

  return (
    <div>
      <SubTitle>Top 10 Holdings</SubTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 24 }}>#</th>
            <th style={thStyle}>Asset</th>
            <th style={thStyle}>Type</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Market Value</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>% Port.</th>
            <th style={thStyle}>Additional Info</th>
          </tr>
        </thead>
        <tbody>
          {top10.map((p, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
              <td style={{ ...tdStyle, color: C.gray500, fontWeight: 600 }}>{i + 1}</td>
              <td style={tdStyle}>
                <div style={{ fontWeight: 600, color: C.gray900, fontSize: 10 }}>{p.name || p.symbol}</div>
              </td>
              <td style={{ ...tdStyle, fontSize: 9 }}>
                <span style={{ background: C.lightGreen, color: C.darkGreen, borderRadius: 3, padding: '1px 5px', fontWeight: 600 }}>{p.assetClass}</span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(p.marketValue)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: C.midGreen }}>{p.weight.toFixed(1)}%</td>
              <td style={tdStyle}><InfoPill>{additionalInfo(p)}</InfoPill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UpcomingAndHoldingsPage({ data }: { data: FactsheetData }) {
  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Upcoming Maturities & Top Holdings</SectionTitle>
      <UpcomingMaturitiesSection data={data} />
      <TopHoldingsSection data={data} />
    </div>
  )
}

// ── Page 5+: Full Portfolio Positions, split by instrument type ─────────────

const th8: React.CSSProperties = { fontSize: 8, fontWeight: 700, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '5px 6px', textAlign: 'left', background: C.gray100, borderBottom: `2px solid ${C.gray200}` }
const td9: React.CSSProperties = { fontSize: 9, color: C.gray700, padding: '5px 6px', borderBottom: `1px solid ${C.gray100}` }

function BondsTable({ rows }: { rows: FactsheetPosition[] }) {
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <SubTitle>Bonds</SubTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th8}>Name</th>
            <th style={th8}>ISIN / CUSIP</th>
            <th style={th8}>Ccy</th>
            <th style={{ ...th8, textAlign: 'right' }}>Coupon</th>
            <th style={{ ...th8, textAlign: 'right' }}>Maturity</th>
            <th style={{ ...th8, textAlign: 'right' }}>Nominal</th>
            <th style={{ ...th8, textAlign: 'right' }}>Price</th>
            <th style={{ ...th8, textAlign: 'right' }}>Accrued Int.</th>
            <th style={{ ...th8, textAlign: 'right' }}>Market Value</th>
            <th style={{ ...th8, textAlign: 'right' }}>% Port.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
              <td style={{ ...td9, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</td>
              <td style={{ ...td9, fontSize: 8 }}>{p.isin || p.cusip || '—'}</td>
              <td style={td9}>{p.currency}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{p.coupon != null ? `${p.coupon.toFixed(2)}%` : '—'}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{fmtDate(p.maturityDate)}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{p.quantity != null ? p.quantity.toLocaleString('en-US') : '—'}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{p.price != null ? p.price.toFixed(2) : '—'}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{p.accruedInterest != null ? fmtUSD2(p.accruedInterest) : '—'}</td>
              <td style={{ ...td9, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(p.marketValue)}</td>
              <td style={{ ...td9, textAlign: 'right', color: C.midGreen }}>{p.weight.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FundsTable({ rows }: { rows: FactsheetPosition[] }) {
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <SubTitle>Funds</SubTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th8}>Fund</th>
            <th style={th8}>Fund Family</th>
            <th style={th8}>Ccy</th>
            <th style={{ ...th8, textAlign: 'right' }}>Quantity</th>
            <th style={{ ...th8, textAlign: 'right' }}>Price</th>
            <th style={{ ...th8, textAlign: 'right' }}>Market Value</th>
            <th style={{ ...th8, textAlign: 'right' }}>% Port.</th>
            <th style={th8}>Dividend Policy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
              <td style={{ ...td9, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</td>
              <td style={{ ...td9, fontSize: 8 }}>{p.fundFamily || '—'}</td>
              <td style={td9}>{p.currency}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{p.quantity != null ? p.quantity.toLocaleString('en-US') : '—'}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{p.price != null ? p.price.toFixed(2) : '—'}</td>
              <td style={{ ...td9, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(p.marketValue)}</td>
              <td style={{ ...td9, textAlign: 'right', color: C.midGreen }}>{p.weight.toFixed(1)}%</td>
              <td style={{ ...td9, fontSize: 8 }}>{p.dividendPolicy || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EquityTable({ rows }: { rows: FactsheetPosition[] }) {
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <SubTitle>Equity / ETF</SubTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th8}>Ticker</th>
            <th style={th8}>Name</th>
            <th style={th8}>Ccy</th>
            <th style={{ ...th8, textAlign: 'right' }}>Quantity</th>
            <th style={{ ...th8, textAlign: 'right' }}>Price</th>
            <th style={{ ...th8, textAlign: 'right' }}>Market Value</th>
            <th style={{ ...th8, textAlign: 'right' }}>% Port.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
              <td style={{ ...td9, fontWeight: 700, color: C.darkGreen }}>{p.symbol}</td>
              <td style={{ ...td9, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</td>
              <td style={td9}>{p.currency}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{p.quantity != null ? p.quantity.toLocaleString('en-US') : '—'}</td>
              <td style={{ ...td9, textAlign: 'right' }}>{p.price != null ? p.price.toFixed(2) : '—'}</td>
              <td style={{ ...td9, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(p.marketValue)}</td>
              <td style={{ ...td9, textAlign: 'right', color: C.midGreen }}>{p.weight.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CashTable({ rows }: { rows: FactsheetPosition[] }) {
  if (!rows.length) return null
  const byCurrency = new Map<string, number>()
  for (const p of rows) byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + p.marketValue)
  return (
    <div style={{ marginBottom: 20 }}>
      <SubTitle>Cash</SubTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', maxWidth: 320 }}>
        <thead>
          <tr>
            <th style={th8}>Currency</th>
            <th style={{ ...th8, textAlign: 'right' }}>Market Value</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(byCurrency.entries()).map(([ccy, mv], i) => (
            <tr key={ccy} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
              <td style={td9}>{ccy}</td>
              <td style={{ ...td9, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(mv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FullPositionsPages({ data }: { data: FactsheetData }) {
  const bonds  = data.positions.filter(p => p.assetClass === 'Fixed Income')
  const funds  = data.positions.filter(p => ['Alternatives', 'Real Estate'].includes(p.assetClass) || (p.securityType || '').toLowerCase().includes('fund'))
    .filter(p => !bonds.includes(p))
  const equity = data.positions.filter(p => ['Equity', 'ETF'].includes(p.assetClass))
  const cash   = data.positions.filter(p => p.assetClass === 'Cash')
  // anything not captured above still needs to show up somewhere
  const classified = new Set([...bonds, ...funds, ...equity, ...cash])
  const other = data.positions.filter(p => !classified.has(p))

  const totalGL = data.positions.reduce((s, p) => s + (p.unrealizedGL ?? 0), 0)

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Full Portfolio Positions</SectionTitle>
      <BondsTable rows={[...bonds].sort((a, b) => b.marketValue - a.marketValue)} />
      <FundsTable rows={[...funds, ...other].sort((a, b) => b.marketValue - a.marketValue)} />
      <EquityTable rows={[...equity].sort((a, b) => b.marketValue - a.marketValue)} />
      <CashTable rows={cash} />

      <div style={{ background: C.darkGreen, borderRadius: 8, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.white }}>TOTAL PORTFOLIO</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{fmtUSD(data.totalValue)}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: totalGL >= 0 ? '#A5D6B7' : '#FCA5A5' }}>{fmtUSD(totalGL)} unreal. G/L</span>
      </div>
    </div>
  )
}

// ── Commentary ─────────────────────────────────────────────────────────────────

function CommentarySection({ data }: { data: FactsheetData }) {
  const { commentary } = data
  const blocks = [
    { title: 'Market Commentary', text: commentary.marketCommentary },
    { title: 'Outlook',          text: commentary.outlook },
    { title: 'Strategy',         text: commentary.strategy },
    { title: 'Portfolio Changes', text: commentary.portfolioChanges },
    { title: 'Recommendations',  text: commentary.recommendations },
  ].filter(b => b.text?.trim())

  if (!blocks.length) return null

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Advisor Commentary</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: blocks.length >= 4 ? '1fr 1fr' : '1fr', gap: 16 }}>
        {blocks.map(b => (
          <div key={b.title} style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: 16, borderLeft: `3px solid ${C.midGreen}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.darkGreen, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              {b.title}
            </div>
            <p style={{ fontSize: 11, color: C.gray700, lineHeight: 1.6, margin: 0 }}>{b.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Disclaimer ─────────────────────────────────────────────────────────────────

function DisclaimerSection({ data }: { data: FactsheetData }) {
  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Important Disclosures</SectionTitle>
      <p style={{ fontSize: 9, color: C.gray500, lineHeight: 1.5, margin: 0 }}>{data.disclaimer}</p>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: C.darkGreen, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: C.white, fontSize: 7, fontWeight: 700 }}>RC</span>
          </div>
          <span style={{ fontSize: 9, color: C.gray500, fontWeight: 600 }}>ROBLE CAPITAL</span>
        </div>
        <span style={{ fontSize: 9, color: C.gray500 }}>{data.meta.reportDate || new Date().toLocaleDateString('es-UY')}</span>
      </div>
    </div>
  )
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

function A4Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '210mm', minHeight: '297mm', background: C.white,
      margin: '0 auto 24px', boxShadow: '0 2px 20px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column',
      pageBreakAfter: 'always', breakAfter: 'page',
    }}>
      <div style={{ background: C.darkGreen, padding: '8px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: '#A5D6B7', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif', fontWeight: 600 }}>
          ROBLE CAPITAL · PORTFOLIO FACTSHEET
        </span>
        <span style={{ fontSize: 9, color: '#A5D6B7', fontFamily: 'Arial, sans-serif' }}>Confidencial</span>
      </div>
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

// ── Main export — dynamic: sections with nothing to show are simply skipped ──

export default function FactsheetPreview({ data }: { data: FactsheetData }) {
  const hasCommentary = Object.values(data.commentary).some(v => v?.trim())
  const hasFixedIncome = data.positions.some(p => p.assetClass === 'Fixed Income')
  const hasMaturities = data.positions.some(p => p.maturityDate)
  const showPage3 = true // concentration always applies when there's ≥1 position
  const hasPositions = data.positions.length > 0

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .factsheet-wrapper > div {
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: always !important;
          }
        }
        @page { size: A4; margin: 0; }
      `}</style>

      <div className="factsheet-wrapper" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* P1: Cover / Account Snapshot */}
        <div style={{ width: '210mm', minHeight: '297mm', background: C.white, margin: '0 auto 24px', boxShadow: '0 2px 20px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', pageBreakAfter: 'always', breakAfter: 'page' }}>
          <CoverPage data={data} />
        </div>

        {/* P2: Performance & Allocation */}
        <A4Page>
          <PerformanceAllocationPage data={data} />
        </A4Page>

        {/* P3: Portfolio Analysis — concentration always shown; Fixed Income /
            Maturity sections self-omit when there's nothing to show */}
        {hasPositions && (
          <A4Page>
            <PortfolioAnalysisPage data={data} />
          </A4Page>
        )}

        {/* P4: Upcoming Maturities (only if any) + Top Holdings */}
        {hasPositions && (
          <A4Page>
            <UpcomingAndHoldingsPage data={data} />
          </A4Page>
        )}

        {/* P5+: Full Positions, split by instrument type */}
        {hasPositions && (
          <A4Page>
            <FullPositionsPages data={data} />
          </A4Page>
        )}

        {/* Last: Commentary (if any) + Disclosures */}
        {hasCommentary && (
          <A4Page>
            <CommentarySection data={data} />
          </A4Page>
        )}
        <A4Page>
          <DisclaimerSection data={data} />
        </A4Page>
      </div>
    </>
  )
}
