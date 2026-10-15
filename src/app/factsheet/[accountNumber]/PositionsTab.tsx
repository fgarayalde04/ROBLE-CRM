'use client'
import { useState, useMemo } from 'react'
import type { PortfolioPositionRow, PortfolioUnrealizedGainLossRow } from '@/types/portfolio'
import { fmtUSD2, fmtPct, fmtDate } from './PortfolioAccountClient'
import { cleanDisplayName } from '@/lib/portfolio/theme'
import { ASSET_CLASS_ES, assetClassRank } from '@/lib/portfolio/engine'
import { textoCompras } from './datosPdf'
import { identificador } from '@/lib/consolidado/calc'

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-800 text-right">{value}</span>
    </div>
  )
}

const RECLASSIFY_OPTIONS = ['Cash', 'Fixed Income', 'Fixed Income Fund', 'Fund', 'Equity', 'ETF', 'Alternatives', 'Real Estate']

// Mismos colores por clase que la Posición Consolidada.
const COLOR_CLASE: Record<string, string> = {
  Cash: '#94A3B8', 'Fixed Income': '#1B3A2B', 'Fixed Income Fund': '#2E7D52', Fund: '#2E7D52', ETF: '#4CAF72',
  Equity: '#1E40AF', Alternatives: '#7C3AED', 'Real Estate': '#B45309',
}
const COLOR_CUSTODIO: Record<string, string> = { Pershing: '#0369A1', 'Morgan Stanley': '#0F766E' }

const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const signo = (v: number) => (v > 0 ? '+' : '')
const colorResultado = (v: number | null) => (v == null ? 'text-gray-400' : v < 0 ? 'text-red-600' : v > 0 ? 'text-emerald-700' : 'text-gray-500')

function Barra({ peso, color }: { peso: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-100">
      <div className="h-1.5 rounded-full" style={{ width: `${Math.max(1.5, Math.min(100, peso * 100))}%`, background: color }} />
    </div>
  )
}

/** "Cupón 6.000% · Vto. 13/01/2035 · Compra 31/07/2026" */
function detalleTitulo(p: PortfolioPositionRow, gl: PortfolioUnrealizedGainLossRow | undefined) {
  const partes: string[] = []
  if (p.asset_class === 'Fixed Income') {
    const cupon = p.coupon != null && p.coupon !== '' ? Number(p.coupon) : null
    partes.push(cupon != null && isFinite(cupon) ? `Cupón ${cupon.toFixed(3)}%` : 'Cupón s/d')
    partes.push(p.maturity_date ? `Vto. ${fmtDate(p.maturity_date)}` : 'Vto. s/d')
  }
  if (p.asset_class === 'Equity' || p.asset_class === 'ETF') {
    const id = identificador(p.symbol, p.cusip, p.name, p.isin)
    if (id) partes.push(id)
  }
  const compras = textoCompras(p.purchase_date || gl?.purchase_date)
  if (compras) partes.push(compras)
  return partes.join(' · ')
}

/** "100,000 nominales a 101.288 · Costo 105,867.73" */
function lineaCantidad(p: PortfolioPositionRow, gl: PortfolioUnrealizedGainLossRow | undefined) {
  if (p.asset_class === 'Cash' || p.quantity == null) return ''
  const q = Number(p.quantity)
  const bono = p.asset_class === 'Fixed Income'
  const unidad = bono ? 'nominales' : ['Fund', 'Fixed Income Fund'].includes(p.asset_class) ? (q === 1 ? 'cuotaparte' : 'cuotapartes') : 'acciones'
  return [
    `${fmt(q, Number.isInteger(q) ? 0 : 3)} ${unidad}`,
    gl ? `Costo ${fmt(Number(gl.cost_basis))}` : null,
  ].filter(Boolean).join(' · ')
}

export default function PositionsTab({ positions, totalValue, glByCusip, custodianByPositionId, onImport, onReclassified }: {
  positions: PortfolioPositionRow[]
  totalValue: number
  glByCusip: Map<string, PortfolioUnrealizedGainLossRow>
  custodianByPositionId?: Map<string, string> | null
  onImport?: () => void
  onReclassified?: () => void
}) {
  const hasGL = glByCusip.size > 0
  const conCustodio = !!custodianByPositionId
  const [q, setQ] = useState('')
  const [assetFilter, setAssetFilter] = useState('')
  const [selected, setSelected] = useState<PortfolioPositionRow | null>(null)
  const [reclassifying, setReclassifying] = useState(false)
  const [savingPurchaseDate, setSavingPurchaseDate] = useState(false)
  const [savingDividend, setSavingDividend] = useState(false)

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

  async function handleEditPurchaseDate(positionId: string, purchaseDate: string) {
    setSavingPurchaseDate(true)
    try {
      const res = await fetch(`/api/portfolio/positions/${positionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchase_date: purchaseDate || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'No se pudo guardar la fecha de compra.')
        return
      }
      setSelected(s => s && s.id === positionId ? { ...s, purchase_date: purchaseDate || null } : s)
      onReclassified?.()
    } finally {
      setSavingPurchaseDate(false)
    }
  }

  async function handleEditDividendReceived(positionId: string, raw: string) {
    const amount = raw.trim() === '' ? null : Number(raw.replace(/,/g, ''))
    if (amount != null && !isFinite(amount)) return
    setSavingDividend(true)
    try {
      const res = await fetch(`/api/portfolio/positions/${positionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manual_dividend_received: amount }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'No se pudo guardar el dividendo recibido.')
        return
      }
      setSelected(s => s && s.id === positionId ? { ...s, manual_dividend_received: amount } : s)
      onReclassified?.()
    } finally {
      setSavingDividend(false)
    }
  }

  const assetClasses = useMemo(() => Array.from(new Set(positions.map(p => p.asset_class))).sort(), [positions])

  // Total de la cuenta (con cupón corrido) — base del % de cada posición.
  const totalConCorrido = useMemo(
    () => positions.reduce((s, p) => s + Number(p.market_value) + Number(p.accrued_interest ?? 0), 0) || totalValue,
    [positions, totalValue],
  )

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return positions
      .filter(p => {
        if (assetFilter && p.asset_class !== assetFilter) return false
        if (!term) return true
        return p.name.toLowerCase().includes(term) || (p.symbol ?? '').toLowerCase().includes(term) ||
          (p.isin ?? '').toLowerCase().includes(term) || (p.cusip ?? '').toLowerCase().includes(term)
      })
      .map(p => {
        const gl = p.cusip ? glByCusip.get(p.cusip) : undefined
        const corrido = Number(p.accrued_interest ?? 0)
        const total = Number(p.market_value) + corrido
        return { p, gl, corrido, total, peso: totalConCorrido > 0 ? total / totalConCorrido : 0 }
      })
      .sort((a, b) => b.total - a.total)
  }, [positions, q, assetFilter, glByCusip, totalConCorrido])

  type Row = typeof rows[number]
  // Agrupado por clase de activo (orden ASSET_CLASS_ORDER y, a igualdad, por valor).
  const groups = useMemo(() => {
    const byClass = new Map<string, Row[]>()
    for (const r of rows) byClass.set(r.p.asset_class, [...(byClass.get(r.p.asset_class) ?? []), r])
    return Array.from(byClass.entries())
      .map(([assetClass, gRows]) => {
        const conCosto = gRows.filter(r => r.gl)
        return {
          assetClass,
          label: ASSET_CLASS_ES[assetClass] ?? assetClass,
          rows: gRows,
          total: gRows.reduce((s, r) => s + r.total, 0),
          peso: gRows.reduce((s, r) => s + r.peso, 0),
          resultado: conCosto.length ? conCosto.reduce((s, r) => s + Number(r.gl!.gain_loss), 0) : null,
        }
      })
      .sort((a, b) => assetClassRank(a.assetClass) - assetClassRank(b.assetClass) || b.total - a.total)
  }, [rows])

  const maxPeso = Math.max(...rows.map(r => r.peso), 0.0001)
  const totMV = rows.reduce((s, r) => s + Number(r.p.market_value), 0)
  const totCorrido = rows.reduce((s, r) => s + r.corrido, 0)

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

      {rows.length === 0 && <p className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">Sin resultados</p>}

      {groups.map(g => {
        const color = COLOR_CLASE[g.assetClass] ?? '#9CA3AF'
        return (
          <div key={g.assetClass} className="overflow-hidden rounded-xl border border-gray-200 bg-white" style={{ borderLeft: `4px solid ${color}` }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-gray-800">{g.label} <span className="font-normal text-gray-400">· {g.rows.length} {g.rows.length === 1 ? 'posición' : 'posiciones'}</span></h3>
              <p className="text-xs tabular-nums text-gray-500">
                USD <b className="text-gray-800">{fmt(g.total)}</b> · {fmtPct(g.peso * 100)}
                {g.resultado != null && <span className={`ml-2 ${colorResultado(g.resultado)}`}>{signo(g.resultado)}{fmt(g.resultado)}</span>}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-fixed text-xs">
                <colgroup>
                  <col style={{ width: conCustodio ? '31%' : '39%' }} />
                  {conCustodio && <col style={{ width: '9%' }} />}
                  <col style={{ width: '8%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2 text-left font-medium">Instrumento</th>
                    {conCustodio && <th className="px-2 py-2 text-left font-medium">Custodio</th>}
                    <th className="px-2 py-2 text-right font-medium">Precio</th>
                    <th className="px-2 py-2 text-right font-medium">Valor de mercado</th>
                    <th className="px-2 py-2 text-right font-medium">Cupón corrido</th>
                    <th className="px-2 py-2 text-right font-medium">Total</th>
                    <th className="px-2 py-2 text-right font-medium">Resultado</th>
                    <th className="px-4 py-2 text-right font-medium">% cuenta</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(({ p, gl, corrido, total, peso }) => {
                    const clean = cleanDisplayName(p.name, p.isin, p.cusip, p.coupon, p.maturity_date)
                    const det = detalleTitulo(p, gl)
                    const cant = lineaCantidad(p, gl)
                    const custodio = custodianByPositionId?.get(p.id)
                    const resultado = gl ? Number(gl.gain_loss) : null
                    return (
                      <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer border-t border-gray-50 align-top hover:bg-emerald-50/40">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-gray-900 truncate" title={p.name}>{clean.name}</p>
                          {det && <p className="text-[11px] text-gray-500">{det}</p>}
                          {cant && <p className="text-[11px] text-gray-400">{cant}</p>}
                        </td>
                        {conCustodio && (
                          <td className="px-2 py-2.5">
                            {custodio && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: COLOR_CUSTODIO[custodio] ?? '#64748B' }}>{custodio}</span>}
                          </td>
                        )}
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{p.price == null || p.asset_class === 'Cash' ? <span className="text-gray-300">—</span> : fmt(Number(p.price), p.asset_class === 'Fixed Income' ? 3 : 2)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{fmt(Number(p.market_value))}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-amber-700">{corrido ? fmt(corrido) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{fmt(total)}</td>
                        <td className={`px-2 py-2.5 text-right tabular-nums ${colorResultado(resultado)}`}>
                          {resultado == null ? '—' : `${signo(resultado)}${fmt(resultado)}`}
                          {resultado != null && Number(gl!.cost_basis) ? <p className="text-[10px]">{signo(resultado)}{(resultado / Number(gl!.cost_basis) * 100).toFixed(2)}%</p> : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="mb-1 text-right tabular-nums text-gray-600">{fmtPct(peso * 100)}</p>
                          <Barra peso={peso / maxPeso} color={color} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#1B2A38] px-4 py-3 text-white">
          <span className="text-sm font-semibold">{q || assetFilter ? 'Total filtrado' : 'Total de la cuenta'}</span>
          <span className="text-xs tabular-nums text-slate-300">
            Valor de mercado <b className="text-white">{fmt(totMV)}</b> · Cupón corrido <b className="text-white">{fmt(totCorrido)}</b> · Total <b className="text-base text-white">USD {fmt(totMV + totCorrido)}</b>
            {hasGL && (() => {
              const conGl = rows.filter(r => r.gl)
              const res = conGl.reduce((s, r) => s + Number(r.gl!.gain_loss), 0)
              return <> · Resultado <b className={res < 0 ? 'text-red-300' : 'text-emerald-300'}>{signo(res)}{fmt(res)}</b></>
            })()}
          </span>
        </div>
      )}
      <p className="text-[11px] text-gray-400">Hacé clic en una posición para ver el detalle, cargar la fecha de compra o reclasificarla.</p>

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
              <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-50">
                <span className="text-xs text-gray-400">Fecha de compra</span>
                <input
                  key={selected.id}
                  type="date"
                  disabled={savingPurchaseDate}
                  defaultValue={selected.purchase_date ?? (selected.cusip ? glByCusip.get(selected.cusip)?.purchase_date : null) ?? ''}
                  onBlur={e => { if (e.target.value !== (selected.purchase_date ?? '')) handleEditPurchaseDate(selected.id, e.target.value) }}
                  className="text-xs font-semibold text-gray-800 text-right border border-transparent hover:border-gray-200 focus:border-[#2E7D52]/50 rounded px-1.5 py-0.5 outline-none"
                />
              </div>
              <DetailRow label="Vencimiento" value={selected.maturity_date ? fmtDate(selected.maturity_date) : null} />
              <DetailRow label="Cupón" value={selected.coupon != null ? `${Number(selected.coupon).toFixed(2)}%` : null} />
              <DetailRow label="Cupón corrido" value={selected.accrued_interest != null ? fmtUSD2(Number(selected.accrued_interest)) : null} />
              <DetailRow label="Familia de fondo" value={selected.fund_family} />
              <DetailRow label="Política de dividendos" value={selected.dividend_policy} />
              {['Fund', 'Fixed Income Fund'].includes(selected.asset_class) && (
                <>
                  <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-400">Interés/dividendo recibido</span>
                    <input
                      key={selected.id}
                      type="number"
                      step="0.01"
                      disabled={savingDividend}
                      defaultValue={selected.manual_dividend_received ?? ''}
                      placeholder="Cargar a mano"
                      onBlur={e => handleEditDividendReceived(selected.id, e.target.value)}
                      className="text-xs font-semibold text-gray-800 text-right border border-transparent hover:border-gray-200 focus:border-[#2E7D52]/50 rounded px-1.5 py-0.5 w-28 outline-none"
                    />
                  </div>
                  {selected.manual_dividend_received != null && Number(selected.market_value) > 0 && (
                    <DetailRow
                      label="Rendimiento sobre este dividendo"
                      value={`${((Number(selected.manual_dividend_received) / Number(selected.market_value)) * 100).toFixed(2)}% del market value`}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
