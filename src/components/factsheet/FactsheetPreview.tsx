'use client'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import type { FactsheetData, FactsheetPosition, AllocationItem } from '@/types/factsheet'

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

const fmtPct = (n: number | null | undefined, decimals = 1) =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`

const fmtScore = (n: number | null | undefined) =>
  n == null ? '—' : n.toFixed(1)

// ── Shared sub-components ─────────────────────────────────────────────────────

function PageDivider() {
  return <div style={{ pageBreakAfter: 'always', breakAfter: 'page' }} />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: C.darkGreen, letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
        {children}
      </h2>
      <div style={{ height: 2, background: `linear-gradient(to right, ${C.midGreen}, ${C.lightGreen})`, marginTop: 4, borderRadius: 1 }} />
    </div>
  )
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

function RiskBadge({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: C.gray500 }}>—</span>
  const color = score <= 3 ? '#16A34A' : score <= 6 ? '#D97706' : '#DC2626'
  const label = score <= 3 ? 'CONSERVADOR' : score <= 6 ? 'MODERADO' : 'AGRESIVO'
  return (
    <span style={{ background: color + '15', color, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
      {label} {fmtScore(score)}/10
    </span>
  )
}

// ── Cover Page ────────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: FactsheetData }) {
  const { meta, totalValue, performance } = data
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
      <div style={{ padding: '40px 36px 32px', borderBottom: `1px solid ${C.gray200}` }}>
        <div style={{ fontSize: 10, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Arial, sans-serif' }}>
          Prepared for
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, color: C.gray900, marginTop: 6, lineHeight: 1.2 }}>
          {meta.clientName || 'Client Name'}
        </div>
        {meta.accountNumber && (
          <div style={{ fontSize: 12, color: C.gray500, marginTop: 6, fontFamily: 'Arial, sans-serif' }}>
            Account: {meta.accountNumber}
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div style={{ padding: '28px 36px', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${performance.ytdReturn != null ? 3 : 2}, 1fr)`, gap: 12, marginBottom: 16 }}>
          <KpiCard label="Portfolio Value" value={fmtUSD(totalValue)} color={C.darkGreen} />
          <KpiCard label="Posiciones"      value={String(data.positions.length)} color={C.midGreen} />
          {performance.ytdReturn != null && (
            <KpiCard label="YTD Return" value={fmtPct(performance.ytdReturn)} color={performance.ytdReturn >= 0 ? C.midGreen : C.red} />
          )}
        </div>

        {/* Performance panel — only render if at least one value exists */}
        {[performance.return1y, performance.return3y, performance.return5y, performance.inceptionReturn].some(v => v != null) && (() => {
          const perfCards = [
            { label: '1 Año',     value: performance.return1y,        sub: 'Anualizado'   },
            { label: '3 Años',    value: performance.return3y,        sub: 'Anualizado'   },
            { label: '5 Años',    value: performance.return5y,        sub: 'Anualizado'   },
            { label: 'Acumulado', value: performance.inceptionReturn, sub: 'Desde inicio' },
          ].filter(c => c.value != null)
          return (
            <div style={{ background: C.offWhite, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.darkGreen, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'Arial, sans-serif', marginBottom: 10 }}>
                Performance
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perfCards.length}, 1fr)`, gap: 10 }}>
                {perfCards.map(c => (
                  <KpiCard key={c.label} label={c.label} value={fmtPct(c.value)} sub={c.sub}
                    color={c.value! >= 0 ? C.midGreen : C.red} />
                ))}
              </div>
            </div>
          )
        })()}

        {/* Allocation mini bar */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 10, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'Arial, sans-serif', fontWeight: 600 }}>
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
                <span style={{ fontSize: 10, color: C.gray700, fontFamily: 'Arial, sans-serif' }}>{a.name} {a.pct.toFixed(1)}%</span>
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

// ── Section 1: Overview ────────────────────────────────────────────────────────

function OverviewSection({ data }: { data: FactsheetData }) {
  const { positions, totalValue, allocation, performance } = data

  const cashPct = allocation.byAssetClass.find(a => a.name === 'Cash')?.pct ?? 0
  const fxPct   = allocation.byAssetClass.find(a => a.name === 'Fixed Income')?.pct ?? 0
  const totalGL = positions.reduce((s, p) => s + (p.unrealizedGL ?? 0), 0)

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Portfolio Overview</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        <KpiCard label="Valor Total"   value={fmtUSD(totalValue)} color={C.darkGreen} />
        <KpiCard label="Posiciones"    value={String(positions.length)} color={C.midGreen} />
        <KpiCard label="Unreal. G/L"   value={fmtUSD(totalGL)} color={totalGL >= 0 ? C.midGreen : C.red} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${performance.ytdReturn != null ? 2 : 1}, 1fr)`, gap: 10, marginBottom: 28 }}>
        <KpiCard label="Cash" value={`${cashPct.toFixed(1)}%`} />
        {performance.ytdReturn != null && (
          <KpiCard label="YTD Return" value={fmtPct(performance.ytdReturn)} color={performance.ytdReturn >= 0 ? C.midGreen : C.red} />
        )}
      </div>

      {/* Pie charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {[
          { title: 'Asset Class Allocation', data: allocation.byAssetClass },
          { title: 'Geographic Allocation',  data: allocation.byRegion },
        ].map(({ title, data }) => (
          <div key={title}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 4 }}>{title}</div>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart margin={{ top: 16, right: 24, bottom: 0, left: 24 }}>
                <Pie
                  data={data} dataKey="pct" cx="50%" cy="50%"
                  outerRadius={68} innerRadius={34}
                  labelLine={{ stroke: C.gray500, strokeWidth: 1 }}
                  label={({ cx, cy, midAngle, outerRadius: r, pct }: any) => {
                    if (pct < 6) return null
                    const RAD = Math.PI / 180
                    const x = cx + (r + 18) * Math.cos(-midAngle * RAD)
                    const y = cy + (r + 18) * Math.sin(-midAngle * RAD)
                    return (
                      <text x={x} y={y} fill={C.gray900} textAnchor={x > cx ? 'start' : 'end'}
                        dominantBaseline="central" fontSize={9} fontFamily="Arial, sans-serif" fontWeight={600}>
                        {`${pct.toFixed(0)}%`}
                      </text>
                    )
                  }}
                >
                  {data.map((a, i) => <Cell key={a.name} fill={a.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
              {data.map((a, i) => (
                <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

// ── Section 2: Asset Allocation Charts ────────────────────────────────────────

function AllocationSection({ data }: { data: FactsheetData }) {
  const { allocation } = data

  const barData = allocation.byAssetClass.map((a, i) => ({
    name: a.name.replace('Fixed Income', 'Fixed Inc.').replace('Mutual Fund', 'Mut. Fund').replace('Alternatives', 'Alts'),
    value: parseFloat(a.pct.toFixed(1)),
    fill: a.color || CHART_COLORS[i],
  }))

  const sectorData = allocation.bySector.slice(0, 8).map((a, i) => ({
    name: a.name,
    value: parseFloat(a.pct.toFixed(1)),
    fill: CHART_COLORS[i],
  }))

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Asset Allocation Analysis</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* By asset class bar */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 10 }}>By Asset Class</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: C.gray500 }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: C.gray700 }} width={70} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
              <Tooltip formatter={(v: any) => [`${v}%`, '']} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By sector bar */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 10 }}>By Sector</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sectorData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: C.gray500 }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: C.gray700 }} width={80} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {sectorData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
              <Tooltip formatter={(v: any) => [`${v}%`, '']} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By region */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 10 }}>By Region</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={allocation.byRegion.map((a, i) => ({ name: a.name, value: parseFloat(a.pct.toFixed(1)), fill: a.color || CHART_COLORS[i] }))} layout="vertical" margin={{ left: 0, right: 24 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: C.gray500 }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: C.gray700 }} width={90} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {allocation.byRegion.map((d, i) => <Cell key={i} fill={d.color || CHART_COLORS[i]} />)}
              </Bar>
              <Tooltip formatter={(v: any) => [`${v}%`, '']} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By currency */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 10 }}>By Currency</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={allocation.byCurrency} dataKey="pct" cx="50%" cy="50%" outerRadius={65} innerRadius={30}
                label={({ name, pct }: any) => `${name} ${(pct as number).toFixed(0)}%`} labelLine={false}>
                {allocation.byCurrency.map((a, i) => <Cell key={a.name} fill={CHART_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, '']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ── Section 3: Top Holdings ───────────────────────────────────────────────────

function TopHoldingsSection({ data }: { data: FactsheetData }) {
  const top10 = [...data.positions]
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 10)

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
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Top 10 Holdings</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 24 }}>#</th>
            <th style={thStyle}>Asset</th>
            <th style={thStyle}>Type</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Market Value</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>% Port.</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Unreal. G/L</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Return</th>
          </tr>
        </thead>
        <tbody>
          {top10.map((p, i) => {
            const gl = p.unrealizedGL
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
                <td style={{ ...tdStyle, color: C.gray500, fontWeight: 600 }}>{i + 1}</td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: C.gray900, fontSize: 10 }}>{p.name || p.symbol}</div>
                  <div style={{ color: C.gray500, fontSize: 9 }}>{p.symbol}</div>
                </td>
                <td style={{ ...tdStyle, fontSize: 9 }}>
                  <span style={{ background: C.lightGreen, color: C.darkGreen, borderRadius: 3, padding: '1px 5px', fontWeight: 600 }}>{p.assetClass}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(p.marketValue)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: C.midGreen }}>{p.weight.toFixed(1)}%</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: gl == null ? C.gray500 : gl >= 0 ? C.midGreen : C.red, fontWeight: gl != null ? 600 : 400 }}>
                  {gl != null ? fmtUSD(gl) : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: p.returnPct == null ? C.gray500 : p.returnPct >= 0 ? C.midGreen : C.red, fontWeight: p.returnPct != null ? 600 : 400 }}>
                  {fmtPct(p.returnPct)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Section 4: Full Positions ─────────────────────────────────────────────────

function FullPositionsSection({ data }: { data: FactsheetData }) {
  const sorted = [...data.positions].sort((a, b) => b.marketValue - a.marketValue)

  const thStyle: React.CSSProperties = {
    fontSize: 8, fontWeight: 700, color: C.gray500, textTransform: 'uppercase',
    letterSpacing: '0.04em', padding: '5px 6px', textAlign: 'left',
    background: C.gray100, borderBottom: `2px solid ${C.gray200}`,
  }
  const tdStyle: React.CSSProperties = {
    fontSize: 9, color: C.gray700, padding: '5px 6px',
    borderBottom: `1px solid ${C.gray100}`,
  }

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Full Portfolio Positions</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
        <thead>
          <tr>
            <th style={thStyle}>Symbol</th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Type</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Market Value</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>% Port.</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Cost Basis</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Unreal. G/L</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Return</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const gl = p.unrealizedGL
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
                <td style={{ ...tdStyle, fontWeight: 700, color: C.darkGreen }}>{p.symbol}</td>
                <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</td>
                <td style={{ ...tdStyle, fontSize: 8 }}>{p.securityType || p.assetClass}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtUSD(p.marketValue)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: C.midGreen }}>{p.weight.toFixed(1)}%</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{p.costBasis != null ? fmtUSD(p.costBasis) : '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: gl == null ? C.gray500 : gl >= 0 ? C.midGreen : C.red, fontWeight: gl != null ? 600 : 400 }}>
                  {gl != null ? fmtUSD(gl) : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: p.returnPct == null ? C.gray500 : p.returnPct >= 0 ? C.midGreen : C.red, fontWeight: p.returnPct != null ? 600 : 400 }}>
                  {fmtPct(p.returnPct)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: C.darkGreen }}>
            <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, color: C.white, background: C.darkGreen }}>TOTAL</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.white, background: C.darkGreen }}>
              {fmtUSD(data.totalValue)}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', color: C.white, background: C.darkGreen }}>100.0%</td>
            <td style={{ ...tdStyle, background: C.darkGreen }} />
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, background: C.darkGreen,
              color: sorted.reduce((s, p) => s + (p.unrealizedGL ?? 0), 0) >= 0 ? '#A5D6B7' : '#FCA5A5',
            }}>
              {fmtUSD(sorted.reduce((s, p) => s + (p.unrealizedGL ?? 0), 0))}
            </td>
            <td style={{ ...tdStyle, background: C.darkGreen }} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Section 5: Performance ────────────────────────────────────────────────────

function PerformanceSection({ data }: { data: FactsheetData }) {
  const { performance, meta } = data
  const hasHistory = performance.history && performance.history.length > 0

  return (
    <div style={{ padding: '16px 36px 28px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Performance</SectionTitle>

      {(() => {
        const cards = [
          { label: 'YTD',       value: performance.ytdReturn,        sub: 'Año en curso'  },
          { label: '1 Año',     value: performance.return1y,         sub: 'Anualizado'    },
          { label: '3 Años',    value: performance.return3y,         sub: 'Anualizado'    },
          { label: '5 Años',    value: performance.return5y,         sub: 'Anualizado'    },
          { label: 'Acumulado', value: performance.inceptionReturn,  sub: 'Desde inicio'  },
        ].filter(c => c.value != null)
        if (!cards.length) return null
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 10, marginBottom: 20 }}>
            {cards.map(c => (
              <KpiCard key={c.label} label={c.label} value={fmtPct(c.value)} sub={c.sub}
                color={c.value! >= 0 ? C.midGreen : C.red} />
            ))}
          </div>
        )
      })()}

      {hasHistory ? (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 10 }}>Return History</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={performance.history} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: C.gray500 }} />
              <YAxis tick={{ fontSize: 9, fill: C.gray500 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)}%`, '']} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="portfolio" stroke={C.midGreen} strokeWidth={2} dot={false} name="Portfolio" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ background: C.lightGreen, borderRadius: 8, padding: '16px 20px', color: C.darkGreen, fontSize: 12, textAlign: 'center' }}>
          Para mostrar el gráfico de performance histórica, ingresá los retornos mensuales en los campos de la izquierda.
        </div>
      )}
    </div>
  )
}

// ── Section 6: Risk Analysis ──────────────────────────────────────────────────

function RiskSection({ data }: { data: FactsheetData }) {
  const { positions, riskScore, riskProfile, allocation } = data

  const topRisk = [...positions].filter(p => p.riskScore != null).sort((a, b) => (b.riskScore ?? 0) * b.weight - (a.riskScore ?? 0) * a.weight).slice(0, 5)

  const emPct   = allocation.byRegion.find(r => r.name === 'LatAm' || r.name === 'Emerging Markets')
  const emTotal = (allocation.byRegion.filter(r => ['LatAm','Emerging Markets'].includes(r.name)).reduce((s,r) => s + r.pct, 0))
  const hyPct   = allocation.byAssetClass.find(a => a.name === 'Fixed Income')?.pct ?? 0
  const cashPct = allocation.byAssetClass.find(a => a.name === 'Cash')?.pct ?? 0

  const scoreColor = (s: number) => s > 6 ? C.red : s > 3 ? C.amber : '#16A34A'

  function ScoreMeter({ score }: { score: number | null }) {
    if (score == null) return <div style={{ color: C.gray500, fontSize: 12 }}>—</div>
    const pct = (score / 10) * 100
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: C.gray500, fontFamily: 'Arial, sans-serif' }}>Score Riesgo</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(score) }}>{score.toFixed(1)}/10</span>
        </div>
        <div style={{ height: 6, background: C.gray200, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: scoreColor(score), borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 8, color: C.gray500 }}>Conservador</span>
          <span style={{ fontSize: 8, color: C.gray500 }}>Moderado</span>
          <span style={{ fontSize: 8, color: C.gray500 }}>Agresivo</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'Arial, sans-serif' }}>
      <SectionTitle>Risk Analysis</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Risk score visual */}
        <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: 16 }}>
          <ScoreMeter score={riskScore} />
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 8 }}>Risk Indicators</div>
            {[
              { label: 'Liquidez (Cash)', value: cashPct, good: cashPct >= 5 },
              { label: 'Exposición EM/LatAm', value: emTotal, good: emTotal < 30 },
              { label: 'Concentración Top 3', value: [...positions].sort((a,b) => b.marketValue - a.marketValue).slice(0,3).reduce((s,p) => s + p.weight, 0), good: true },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.gray100}` }}>
                <span style={{ fontSize: 10, color: C.gray700 }}>{item.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.gray900 }}>{item.value.toFixed(1)}%</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.good ? '#16A34A' : C.amber }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top risk positions */}
        <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 10 }}>Posiciones de Mayor Riesgo</div>
          {topRisk.length === 0
            ? <div style={{ color: C.gray500, fontSize: 11, textAlign: 'center', padding: 16 }}>Sin datos de riesgo</div>
            : topRisk.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.gray100}` }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.gray900 }}>{p.symbol}</div>
                  <div style={{ fontSize: 9, color: C.gray500 }}>{p.weight.toFixed(1)}% del portafolio</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(p.riskScore!) }}>
                  {p.riskScore!.toFixed(1)}
                </span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

// ── Section 7: Commentary ─────────────────────────────────────────────────────

function CommentarySection({ data }: { data: FactsheetData }) {
  const { commentary, meta } = data
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

// ── Section 8: Disclaimer ─────────────────────────────────────────────────────

function DisclaimerSection({ data }: { data: FactsheetData }) {
  return (
    <div style={{ padding: '20px 36px 28px', fontFamily: 'Arial, sans-serif', borderTop: `1px solid ${C.gray200}` }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.gray500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Important Disclosures
      </div>
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

function A4Page({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      width: '210mm', minHeight: '297mm', background: C.white,
      margin: '0 auto 24px', boxShadow: '0 2px 20px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column',
      pageBreakAfter: 'always', breakAfter: 'page',
      ...style,
    }}>
      {/* Page header (except cover) */}
      {(style as any)?.['--no-header'] !== 'true' && (
        <div style={{ background: C.darkGreen, padding: '8px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#A5D6B7', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif', fontWeight: 600 }}>
            ROBLE CAPITAL · PORTFOLIO FACTSHEET
          </span>
          <span style={{ fontSize: 9, color: '#A5D6B7', fontFamily: 'Arial, sans-serif' }}>Confidencial</span>
        </div>
      )}
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function FactsheetPreview({ data }: { data: FactsheetData }) {
  const hasCommentary = Object.values(data.commentary).some(v => v?.trim())
  const manyPositions = data.positions.length > 15

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
        {/* P1: Cover */}
        <div style={{ width: '210mm', minHeight: '297mm', background: C.white, margin: '0 auto 24px', boxShadow: '0 2px 20px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', pageBreakAfter: 'always', breakAfter: 'page' }}>
          <CoverPage data={data} />
        </div>

        {/* P2: Overview */}
        <A4Page>
          <OverviewSection data={data} />
        </A4Page>

        {/* P3: Top Holdings */}
        <A4Page>
          <TopHoldingsSection data={data} />
        </A4Page>

        {/* P5: Full Positions (may be long) */}
        <A4Page>
          <FullPositionsSection data={data} />
        </A4Page>

        {/* P6: Commentary + Disclaimer */}
        <A4Page>
          {hasCommentary && <CommentarySection data={data} />}
          <DisclaimerSection data={data} />
        </A4Page>
      </div>
    </>
  )
}
