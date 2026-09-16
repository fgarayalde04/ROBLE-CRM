'use client'
import { useEffect, useState } from 'react'
import { fmtUSD2 } from './PortfolioAccountClient'

interface LedgerEntry {
  id: string
  account_number: string
  fund_name: string
  entry_type: 'compra' | 'dividendo'
  entry_date: string | null
  amount: string | null
  notes: string | null
}

// Planilla 100% manual — nunca se completa con datos de un import. El
// asesor la usa para llevar, fondo por fondo, qué compró y qué dividendos
// fue cobrando, y ver el rendimiento implícito (dividendos ÷ comprado).
export default function DividendosTab({ accountNumber }: { accountNumber: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [newFundName, setNewFundName] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/dividends`)
      const data = await res.json()
      setEntries(data.entries ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [accountNumber])

  async function addRow(fundName: string, entryType: 'compra' | 'dividendo') {
    const trimmed = fundName.trim()
    if (!trimmed) return
    const res = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/dividends`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fund_name: trimmed, entry_type: entryType }),
    })
    if (res.ok) {
      const data = await res.json()
      setEntries(prev => [...prev, data.entry])
    }
  }

  async function patchRow(id: string, patch: Record<string, unknown>) {
    setSaving(id)
    try {
      const res = await fetch(`/api/portfolio/dividends/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (res.ok) {
        const data = await res.json()
        setEntries(prev => prev.map(e => e.id === id ? data.entry : e))
      }
    } finally {
      setSaving(null)
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('¿Borrar esta fila?')) return
    await fetch(`/api/portfolio/dividends/${id}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  if (loading) return <div className="text-center py-16 text-sm text-gray-400">Cargando…</div>

  const fundNames = Array.from(new Set(entries.map(e => e.fund_name))).sort()

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
        Planilla 100% manual — no se completa con ningún import. Cargá cada compra y cada dividendo cobrado por fondo.
      </div>

      <div className="flex items-center gap-2">
        <input
          value={newFundName}
          onChange={e => setNewFundName(e.target.value)}
          placeholder="Nombre del fondo…"
          className="text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#2E7D52]/50 flex-1 max-w-xs"
        />
        <button
          onClick={async () => { await addRow(newFundName, 'compra'); setNewFundName('') }}
          disabled={!newFundName.trim()}
          className="text-xs font-semibold px-3 py-2 rounded-lg text-white bg-[#2E7D52] disabled:opacity-40"
        >
          + Agregar fondo
        </button>
      </div>

      {fundNames.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-400">Sin fondos cargados. Escribí un nombre arriba y agregalo.</p>
        </div>
      ) : (
        fundNames.map(fundName => {
          const rows = entries.filter(e => e.fund_name === fundName)
          const totalCompra = rows.filter(r => r.entry_type === 'compra').reduce((s, r) => s + Number(r.amount ?? 0), 0)
          const totalDividendo = rows.filter(r => r.entry_type === 'dividendo').reduce((s, r) => s + Number(r.amount ?? 0), 0)
          const rendimiento = totalCompra > 0 ? (totalDividendo / totalCompra) * 100 : null
          return (
            <div key={fundName} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-[#1B2E3C] flex items-center justify-between">
                <p className="text-sm font-bold text-white">{fundName}</p>
                <div className="flex items-center gap-3 text-[11px] text-white/70">
                  <span>Comprado: <strong className="text-white">{fmtUSD2(totalCompra)}</strong></span>
                  <span>Dividendos: <strong className="text-white">{fmtUSD2(totalDividendo)}</strong></span>
                  {rendimiento != null && <span>Rendimiento: <strong className="text-emerald-300">{rendimiento.toFixed(2)}%</strong></span>}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-400">
                    <th className="px-3 py-1.5 text-[10px] font-semibold uppercase w-28">Tipo</th>
                    <th className="px-3 py-1.5 text-[10px] font-semibold uppercase w-32">Fecha</th>
                    <th className="px-3 py-1.5 text-[10px] font-semibold uppercase w-32 text-right">Monto</th>
                    <th className="px-3 py-1.5 text-[10px] font-semibold uppercase">Notas</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-1.5">
                        <select
                          defaultValue={r.entry_type}
                          disabled={saving === r.id}
                          onChange={e => patchRow(r.id, { entry_type: e.target.value })}
                          className={`text-xs font-semibold rounded px-1.5 py-0.5 border-0 outline-none ${r.entry_type === 'compra' ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700'}`}
                        >
                          <option value="compra">Compra</option>
                          <option value="dividendo">Dividendo</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          key={r.id + (r.entry_date ?? '')}
                          type="date"
                          disabled={saving === r.id}
                          defaultValue={r.entry_date ?? ''}
                          onBlur={e => { if (e.target.value !== (r.entry_date ?? '')) patchRow(r.id, { entry_date: e.target.value || null }) }}
                          className="text-xs text-gray-700 border border-transparent hover:border-gray-200 focus:border-[#2E7D52]/50 rounded px-1 py-0.5 outline-none w-full"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          key={r.id + (r.amount ?? '')}
                          type="number"
                          step="0.01"
                          disabled={saving === r.id}
                          defaultValue={r.amount ?? ''}
                          placeholder="—"
                          onBlur={e => { const v = e.target.value.trim(); patchRow(r.id, { amount: v === '' ? null : Number(v) }) }}
                          className="text-xs font-semibold text-gray-800 text-right border border-transparent hover:border-gray-200 focus:border-[#2E7D52]/50 rounded px-1 py-0.5 outline-none w-full"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          key={r.id + (r.notes ?? '')}
                          type="text"
                          disabled={saving === r.id}
                          defaultValue={r.notes ?? ''}
                          placeholder="—"
                          onBlur={e => { if (e.target.value !== (r.notes ?? '')) patchRow(r.id, { notes: e.target.value }) }}
                          className="text-xs text-gray-600 border border-transparent hover:border-gray-200 focus:border-[#2E7D52]/50 rounded px-1 py-0.5 outline-none w-full"
                        />
                      </td>
                      <td className="px-1">
                        <button onClick={() => deleteRow(r.id)} title="Borrar fila" className="text-gray-300 hover:text-red-500 text-sm px-1">×</button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="px-3 py-1.5">
                      <div className="flex gap-2">
                        <button onClick={() => addRow(fundName, 'compra')} className="text-[11px] font-medium text-gray-500 hover:text-[#2E7D52]">+ compra</button>
                        <button onClick={() => addRow(fundName, 'dividendo')} className="text-[11px] font-medium text-gray-500 hover:text-[#2E7D52]">+ dividendo</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })
      )}
    </div>
  )
}
