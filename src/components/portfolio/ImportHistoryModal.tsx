'use client'
import { useState, useEffect } from 'react'
import type { PortfolioImportRow } from '@/types/portfolio'

const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-UY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Historial de importaciones — solo lectura, no se puede borrar desde acá.
// Cada import queda como registro permanente aunque un snapshot más nuevo lo
// "reemplace" en la vista de detalle de cuenta.
export default function ImportHistoryModal({ accountNumber, onClose }: { accountNumber?: string; onClose: () => void }) {
  const [rows, setRows] = useState<PortfolioImportRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const qs = accountNumber ? `?account=${encodeURIComponent(accountNumber)}` : ''
      const res = await fetch(`/api/portfolio/imports${qs}`)
      if (!cancelled && res.ok) setRows(await res.json())
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [accountNumber])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Historial de importaciones</h3>
            {accountNumber && <p className="text-[11px] text-gray-400 mt-0.5">{accountNumber}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">Todavía no hay importaciones registradas</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Fecha snapshot</th>
                  {!accountNumber && <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cuenta</th>}
                  <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Posiciones</th>
                  <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Market Value</th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Importado por</th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cuándo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{r.snapshot_date}</td>
                    {!accountNumber && <td className="px-4 py-2.5 text-gray-600">{r.client_name ?? r.account_number}</td>}
                    <td className="px-4 py-2.5 text-right text-gray-700">{r.position_count}</td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-semibold">{fmtUSD(Number(r.total_market_value))}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.imported_by}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{fmtDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
