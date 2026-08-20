'use client'
import { useState, useMemo } from 'react'
import type { PortfolioPositionRow } from '@/types/portfolio'
import { fmtUSD2, fmtPct, fmtDate } from './PortfolioAccountClient'
import { cleanDisplayName } from '@/lib/portfolio/theme'

const ASSET_CLASS_ES: Record<string, string> = {
  'Equity': 'Renta Variable',
  'ETF': 'Renta Variable (ETF)',
  'Fixed Income': 'Fondos de Renta Fija / Crédito',
  'Alternatives': 'Otros',
  'Real Estate': 'Otros',
  'Cash': 'Money Market / Liquidez',
}

type SortKey = 'name' | 'asset_class' | 'quantity' | 'price' | 'market_value' | 'weight_pct'

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-800 text-right">{value}</span>
    </div>
  )
}

export default function PositionsTab({ positions, totalValue }: { positions: PortfolioPositionRow[]; totalValue: number }) {
  const [q, setQ] = useState('')
  const [assetFilter, setAssetFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('market_value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<PortfolioPositionRow | null>(null)

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
      if (sortKey === 'name' || sortKey === 'asset_class') return a[sortKey].localeCompare(b[sortKey]) * dir
      const av = sortKey === 'weight_pct' ? a.recalcWeight : Number(a[sortKey] ?? 0)
      const bv = sortKey === 'weight_pct' ? b.recalcWeight : Number(b[sortKey] ?? 0)
      return (av - bv) * dir
    })
  }, [positions, totalValue, q, assetFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortKey(key); setSortDir('desc')
  }

  const cols: { key: SortKey; label: string; align?: 'right' }[] = [
    { key: 'name', label: 'Activo' },
    { key: 'asset_class', label: 'Clase' },
    { key: 'quantity', label: 'Cantidad', align: 'right' },
    { key: 'price', label: 'Precio', align: 'right' },
    { key: 'market_value', label: 'Market Value', align: 'right' },
    { key: 'weight_pct', label: '% Cartera', align: 'right' },
  ]

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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((p, i) => {
                const clean = cleanDisplayName(p.name, p.isin, p.cusip, p.coupon, p.maturity_date)
                return (
                  <tr key={p.id} onClick={() => setSelected(p)} className={`cursor-pointer transition hover:bg-emerald-50/40 ${i % 2 === 1 ? 'bg-gray-50/60' : ''}`}>
                    <td className="px-4 py-2.5 max-w-[260px]">
                      <div className="text-gray-800 font-medium truncate">{clean.name}</div>
                      {clean.detail && <div className="text-[10px] text-gray-400 truncate">{clean.detail}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{ASSET_CLASS_ES[p.asset_class] ?? p.asset_class}</td>
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
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-sm text-gray-400">Sin resultados</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#1B2E3C' }}>
                  <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-bold text-white/80">TOTAL</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold text-white">{fmtUSD2(rows.reduce((s, p) => s + Number(p.market_value), 0))}</td>
                  <td className="px-4 py-2.5" />
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
