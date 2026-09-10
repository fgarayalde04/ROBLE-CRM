'use client'
import { useState, useMemo, Fragment } from 'react'
import type { PortfolioPositionRow, PortfolioUnrealizedGainLossRow } from '@/types/portfolio'
import { fmtUSD2, fmtPct, fmtDate } from './PortfolioAccountClient'
import { cleanDisplayName } from '@/lib/portfolio/theme'
import { ASSET_CLASS_ES } from '@/lib/portfolio/engine'

type SortKey = 'name' | 'quantity' | 'price' | 'market_value' | 'weight_pct'

// Orden de los grupos por clase de activo en la tabla — acciones primero,
// liquidez y sin clasificar al final. Cualquier clase que no esté acá va
// después, ordenada por su subtotal.
const ASSET_CLASS_ORDER = ['Equity', 'ETF', 'Fund', 'Fixed Income', 'Alternatives', 'Real Estate', 'Cash', 'Sin clasificar']
function assetClassRank(ac: string) {
  const i = ASSET_CLASS_ORDER.indexOf(ac)
  return i === -1 ? ASSET_CLASS_ORDER.length : i
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-800 text-right">{value}</span>
    </div>
  )
}

const RECLASSIFY_OPTIONS = ['Cash', 'Fixed Income', 'Fund', 'Equity', 'ETF', 'Alternatives', 'Real Estate']

export default function PositionsTab({ positions, totalValue, glByCusip, onImport, onReclassified }: { positions: PortfolioPositionRow[]; totalValue: number; glByCusip: Map<string, PortfolioUnrealizedGainLossRow>; onImport?: () => void; onReclassified?: () => void }) {
  const hasGL = glByCusip.size > 0
  const [q, setQ] = useState('')
  const [assetFilter, setAssetFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('market_value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<PortfolioPositionRow | null>(null)
  const [reclassifying, setReclassifying] = useState(false)

  async function handleReclassify(positionId: string, assetClass: string) {
    setReclassifying(true)
    try {
      await fetch(`/api/portfolio/positions/${positionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset_class: assetClass }),
      })
      onReclassified?.()
    } finally {
      setReclassifying(false)
    }
  }

  const assetClasses = useMemo(() => Array.from(new Set(positions.map(p => p.asset_class))).sort(), [positions])

  const rows = useMemo(() => {
    // Weight recalculado sobre el total real de la cuenta, no el guardado en el snapshot.
    const withWeight = positions.map(p => ({ ...p, recalcWeight: totalValue > 0 ? (Number(p.market_value) / totalValue) * 100 : 0 }))
    const term = q.trim().toLowerCase()
    const filtered = withWeight.filter(p => {
      if (assetFilter && p.asset_class !== assetFilter) return false
      if (!term) return true
      return p.name.toLowerCase().includes(term) || (p.symbol ?? '').toLowerCase().includes(term) ||
        (p.isin ?? '').toLowerCase().includes(term) || (p.cusip ?? '').toLowerCase().includes(term)
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
      const av = sortKey === 'weight_pct' ? a.recalcWeight : Number(a[sortKey] ?? 0)
      const bv = sortKey === 'weight_pct' ? b.recalcWeight : Number(b[sortKey] ?? 0)
      return (av - bv) * dir
    })
  }, [positions, totalValue, q, assetFilter, sortKey, sortDir])

  // Agrupado por clase de activo, con subtotales. El orden interno de cada
  // grupo respeta el sort elegido (rows ya viene ordenado); los grupos van
  // en ASSET_CLASS_ORDER y, a igualdad, por subtotal descendente.
  type Row = typeof rows[number]
  const groups = useMemo(() => {
    const byClass = new Map<string, Row[]>()
    for (const r of rows) {
      const arr = byClass.get(r.asset_class) ?? []
      arr.push(r)
      byClass.set(r.asset_class, arr)
    }
    return Array.from(byClass.entries())
      .map(([assetClass, groupRows]) => {
        const subtotalValue = groupRows.reduce((s, p) => s + Number(p.market_value), 0)
        return {
          assetClass,
          label: ASSET_CLASS_ES[assetClass] ?? assetClass,
          rows: groupRows,
          subtotalValue,
          subtotalWeight: groupRows.reduce((s, p) => s + p.recalcWeight, 0),
        }
      })
      .sort((a, b) => {
        const rk = assetClassRank(a.assetClass) - assetClassRank(b.assetClass)
        return rk !== 0 ? rk : b.subtotalValue - a.subtotalValue
      })
  }, [rows])

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortKey(key); setSortDir('desc')
  }

  const cols: { key: SortKey; label: string; align?: 'right' }[] = [
    { key: 'name', label: 'Activo' },
    { key: 'quantity', label: 'Cantidad', align: 'right' },
    { key: 'price', label: 'Precio', align: 'right' },
    { key: 'market_value', label: 'Market Value', align: 'right' },
    { key: 'weight_pct', label: '% Cartera', align: 'right' },
  ]
  const totalColSpan = cols.length + (hasGL ? 2 : 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por nombre, símbolo, ISIN o CUSIP…"
          className="flex-1 min-w-[220px] text-sm border border-gray-200 rounded-lg px-3.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E7D52]/20 focus:border-[#2E7D52]/40"
        />
        <select
          value={assetFilter}
          onChange={e => setAssetFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E7D52]/20"
        >
          <option value="">Todas las clases</option>
          {assetClasses.map(ac => <option key={ac} value={ac}>{ASSET_CLASS_ES[ac] ?? ac}</option>)}
        </select>
        {onImport && (
          <button
            onClick={onImport}
            className="text-sm font-semibold text-white bg-[#2E7D52] hover:bg-[#256841] rounded-lg px-4 py-2 transition-colors shrink-0"
          >
            Actualizar posiciones (Excel)
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: '#1B2E3C' }}>
              <tr>
                {cols.map(c => (
                  <th key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`px-4 py-2.5 text-[11px] font-semibold text-white/90 uppercase tracking-wide cursor-pointer select-none hover:text-white ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                {hasGL && (
                  <>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-white/90 uppercase tracking-wide text-right">Costo Total</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-white/90 uppercase tracking-wide text-right">Unrealized G/L</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {groups.map(group => {
                const grpCost = group.rows.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.cost_basis) : 0), 0)
                const grpGL   = group.rows.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.gain_loss) : 0), 0)
                const grpGLPct = grpCost > 0 ? (grpGL / grpCost) * 100 : 0
                return (
                  <Fragment key={group.assetClass}>
                    <tr className="bg-[#EEF2F1] border-y border-[#D8E3DE]">
                      <td colSpan={totalColSpan} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-[#1B3A2B]">
                        {group.label}
                        <span className="ml-1.5 text-gray-400 font-medium normal-case">· {group.rows.length} {group.rows.length === 1 ? 'posición' : 'posiciones'}</span>
                      </td>
                    </tr>
                    {group.rows.map((p, i) => {
                      const clean = cleanDisplayName(p.name, p.isin, p.cusip, p.coupon, p.maturity_date)
                      const gl = p.cusip ? glByCusip.get(p.cusip) : undefined
                      return (
                        <tr key={p.id} onClick={() => setSelected(p)} className={`cursor-pointer transition hover:bg-emerald-50/40 ${i % 2 === 1 ? 'bg-gray-50/60' : ''}`}>
                          <td className="px-4 py-2.5 max-w-[260px]">
                            <div className="text-gray-800 font-medium truncate">{clean.name}</div>
                            {clean.detail && <div className="text-[10px] text-gray-400 truncate">{clean.detail}</div>}
                            {(p.purchase_date || gl?.purchase_date) && <div className="text-[10px] text-gray-400 truncate">Compra: {p.purchase_date ?? gl?.purchase_date}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700 font-mono">{p.quantity != null ? Number(p.quantity).toLocaleString('en-US') : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700 font-mono">{p.price != null ? fmtUSD2(Number(p.price)) : '—'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold font-mono" style={{ color: '#1B3A2B' }}>{fmtUSD2(Number(p.market_value))}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(p.recalcWeight, 100)}%`, background: '#2E7D52' }} />
                              </div>
                              <span className="text-gray-500 w-12 text-right shrink-0">{fmtPct(p.recalcWeight)}</span>
                            </div>
                          </td>
                          {hasGL && (
                            <>
                              <td className="px-4 py-2.5 text-right text-gray-700 font-mono">{gl ? fmtUSD2(Number(gl.cost_basis)) : '—'}</td>
                              <td className={`px-4 py-2.5 text-right font-mono font-semibold ${gl ? (Number(gl.gain_loss) >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400'}`}>
                                {gl ? `${Number(gl.gain_loss) >= 0 ? '+' : ''}${fmtUSD2(Number(gl.gain_loss))} (${Number(gl.gain_loss_pct) >= 0 ? '+' : ''}${Number(gl.gain_loss_pct).toFixed(2)}%)` : '—'}
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                    <tr className="bg-[#F7FAF9] border-b-2 border-[#D8E3DE]">
                      <td colSpan={3} className="px-4 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-gray-500">Subtotal {group.label}</td>
                      <td className="px-4 py-2 text-right text-xs font-bold font-mono text-[#1B3A2B]">{fmtUSD2(group.subtotalValue)}</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-gray-500">{fmtPct(group.subtotalWeight)}</td>
                      {hasGL && (
                        <>
                          <td className="px-4 py-2 text-right text-xs font-bold font-mono text-gray-500">{grpCost > 0 ? fmtUSD2(grpCost) : '—'}</td>
                          <td className={`px-4 py-2 text-right text-xs font-bold font-mono ${grpCost > 0 ? (grpGL >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400'}`}>
                            {grpCost > 0 ? `${grpGL >= 0 ? '+' : ''}${fmtUSD2(grpGL)} (${grpGLPct >= 0 ? '+' : ''}${grpGLPct.toFixed(2)}%)` : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  </Fragment>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={totalColSpan} className="px-4 py-10 text-center text-sm text-gray-400">Sin resultados</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#1B2E3C' }}>
                  <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-bold text-white/80">TOTAL</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold text-white">{fmtUSD2(rows.reduce((s, p) => s + Number(p.market_value), 0))}</td>
                  <td className="px-4 py-2.5" />
                  {hasGL && (
                    <>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-white">
                        {fmtUSD2(rows.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.cost_basis) : 0), 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-white">
                        {(() => {
                          const totalCost = rows.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.cost_basis) : 0), 0)
                          const total = rows.reduce((s, p) => s + (p.cusip && glByCusip.get(p.cusip) ? Number(glByCusip.get(p.cusip)!.gain_loss) : 0), 0)
                          const pct = totalCost > 0 ? (total / totalCost) * 100 : 0
                          return `${total >= 0 ? '+' : ''}${fmtUSD2(total)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`
                        })()}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-sm h-full overflow-y-auto shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{ASSET_CLASS_ES[selected.asset_class] ?? selected.asset_class}</p>
                <h3 className="text-base font-bold text-gray-900 mt-0.5">{cleanDisplayName(selected.name, selected.isin, selected.cusip, selected.coupon, selected.maturity_date).name}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{selected.name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className={`rounded-lg p-3 mb-4 border ${selected.asset_class === 'Sin clasificar' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-[11px] font-semibold mb-1.5 ${selected.asset_class === 'Sin clasificar' ? 'text-amber-800' : 'text-gray-500'}`}>
                {selected.asset_class === 'Sin clasificar' ? 'No se pudo clasificar automáticamente — elegí la clase correcta' : 'Clase de activo (podés reclasificarla si querés)'}
              </p>
              <select
                key={selected.id}
                disabled={reclassifying}
                defaultValue={selected.asset_class === 'Sin clasificar' ? '' : selected.asset_class}
                onChange={e => { if (e.target.value) { handleReclassify(selected.id, e.target.value); setSelected(null) } }}
                className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
              >
                <option value="" disabled>Elegir clase de activo…</option>
                {RECLASSIFY_OPTIONS.map(o => <option key={o} value={o}>{ASSET_CLASS_ES[o] ?? o}</option>)}
              </select>
            </div>

            <div className="bg-[#F3F4F6] rounded-lg p-3 mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Market Value</p>
                <p className="text-lg font-bold text-gray-900">{fmtUSD2(Number(selected.market_value))}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">% Cartera</p>
                <p className="text-lg font-bold text-gray-900">{fmtPct(totalValue > 0 ? (Number(selected.market_value) / totalValue) * 100 : 0)}</p>
              </div>
            </div>

            {selected.cusip && glByCusip.get(selected.cusip) && (() => {
              const gl = glByCusip.get(selected.cusip!)!
              const isGain = Number(gl.gain_loss) >= 0
              return (
                <div className={`rounded-lg p-3 mb-4 flex items-center justify-between ${isGain ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Costo Total</p>
                    <p className="text-sm font-bold text-gray-900">{fmtUSD2(Number(gl.cost_basis))}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Unrealized Gain/Loss</p>
                    <p className={`text-sm font-bold ${isGain ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isGain ? '+' : ''}{fmtUSD2(Number(gl.gain_loss))} ({isGain ? '+' : ''}{Number(gl.gain_loss_pct).toFixed(2)}%)
                    </p>
                  </div>
                </div>
              )
            })()}

            <div>
              <DetailRow label="Símbolo" value={selected.symbol} />
              <DetailRow label="Tipo de instrumento" value={selected.security_type} />
              <DetailRow label="Región" value={selected.region} />
              <DetailRow label="Sector" value={selected.sector} />
              <DetailRow label="Moneda" value={selected.currency} />
              <DetailRow label="Cantidad" value={selected.quantity != null ? Number(selected.quantity).toLocaleString('en-US') : null} />
              <DetailRow label="Precio" value={selected.price != null ? fmtUSD2(Number(selected.price)) : null} />
              <DetailRow label="ISIN" value={selected.isin} />
              <DetailRow label="CUSIP" value={selected.cusip} />
              <DetailRow label="Fecha de compra" value={selected.purchase_date ?? (selected.cusip ? glByCusip.get(selected.cusip)?.purchase_date : null) ?? null} />
              <DetailRow label="Vencimiento" value={selected.maturity_date ? fmtDate(selected.maturity_date) : null} />
              <DetailRow label="Cupón" value={selected.coupon != null ? `${Number(selected.coupon).toFixed(2)}%` : null} />
              <DetailRow label="Interés devengado" value={selected.accrued_interest != null ? fmtUSD2(Number(selected.accrued_interest)) : null} />
              <DetailRow label="Familia de fondo" value={selected.fund_family} />
              <DetailRow label="Política de dividendos" value={selected.dividend_policy} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
