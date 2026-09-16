'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { fmtUSD2 } from './PortfolioAccountClient'
import { computeFundDividends, fundGroupKey, findFundPositionValue, type DividendTxn } from '@/lib/portfolio/dividendEngine'

interface LedgerEntry {
  id: string
  account_number: string
  fund_name: string
  entry_type: 'compra' | 'venta' | 'dividendo' | 'dividendo_total'
  entry_date: string | null
  amount: string | null
  notes: string | null
  isin: string | null
  currency: string | null
  quantity: string | null
  price: string | null
  custodian: string | null
}

interface PreviewRow {
  date: string | null
  fundName: string
  isin: string | null
  type: 'dividendo'
  amount: number | null
  quantity: number | null
  price: number | null
  currency: string | null
  custodian: string | null
  externalRef: string
  isDuplicate: boolean
}

interface PositionForValue { isin: string | null; name: string; market_value: string | number }

const fmtPct = (n: number | null) => n == null ? '—' : `${n.toFixed(2)}%`
const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Flujo fijo: el Activity solo aporta dividendos/distribuciones (se
// detectan y leen del archivo); las compras SIEMPRE se cargan a mano, con
// su fecha real. El sistema cruza esas fechas para saber qué capital
// generó cada dividendo, y de ahí saca la tasa anualizada. El cliente ve
// únicamente Fondo + Dividendos cobrados + Tasa anualizada — el detalle
// fecha por fecha queda oculto salvo que lo despliegue a propósito.
export default function DividendosTab({ accountNumber, positions }: { accountNumber: string; positions: PositionForValue[] }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [newFundName, setNewFundName] = useState('')
  const [newFundDate, setNewFundDate] = useState('')
  const [newFundAmount, setNewFundAmount] = useState('')
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [previewChecked, setPreviewChecked] = useState<boolean[]>([])
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([])
  const [previewNonDividendCount, setPreviewNonDividendCount] = useState(0)
  const [importError, setImportError] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function addRow(
    fundName: string,
    entryType: 'compra' | 'venta' | 'dividendo' | 'dividendo_total',
    extra?: { entry_date?: string | null; amount?: number | null }
  ): Promise<boolean> {
    const trimmed = fundName.trim()
    if (!trimmed) return false
    const res = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/dividends`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fund_name: trimmed, entry_type: entryType, ...extra }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'No se pudo agregar la fila.')
      return false
    }
    const data = await res.json()
    setEntries(prev => [...prev, data.entry])
    return true
  }

  async function patchRow(id: string, patch: Record<string, unknown>) {
    setSaving(id)
    try {
      const res = await fetch(`/api/portfolio/dividends/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'No se pudo guardar el cambio.')
        return
      }
      const data = await res.json()
      setEntries(prev => prev.map(e => e.id === id ? data.entry : e))
    } finally {
      setSaving(null)
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('¿Borrar esta fila?')) return
    const res = await fetch(`/api/portfolio/dividends/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('No se pudo borrar la fila.')
      return
    }
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function handleFileSelected(file: File) {
    setImportError('')
    setImporting(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/dividends/parse`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setImportError(data.error ?? 'No se pudo leer el archivo.'); return }
      setPreview(data.rows)
      setPreviewChecked((data.rows as PreviewRow[]).map(r => !r.isDuplicate))
      setPreviewWarnings(data.warnings ?? [])
      setPreviewNonDividendCount(data.nonDividendCount ?? 0)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function confirmImport() {
    if (!preview) return
    const toImport = preview.filter((_, i) => previewChecked[i])
    if (toImport.length === 0) { setPreview(null); return }
    setImporting(true)
    try {
      const res = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/dividends/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: toImport }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'No se pudo importar.'); return }
      setPreview(null)
      await load()
      alert(`Se importaron ${data.imported} dividendo(s).${data.skippedDuplicates > 0 ? ` ${data.skippedDuplicates} se saltearon por ser duplicados.` : ''}`)
    } finally {
      setImporting(false)
    }
  }

  const groups = useMemo(() => {
    // Una compra cargada a mano puede no tener ISIN; un dividendo importado
    // de Activity suele traerlo — sin cruzarlos por nombre quedarían en
    // grupos distintos (mismo fondo, pero el dividendo no encuentra la
    // compra para calcular su capital). Se aprende ISIN↔nombre de cualquier
    // fila que tenga los dos, y se reubican las que solo tienen el nombre.
    const nameToIsin = new Map<string, string>()
    for (const e of entries) {
      if (e.isin?.trim()) nameToIsin.set(e.fund_name.trim().toLowerCase(), e.isin.trim().toUpperCase())
    }
    const byKey = new Map<string, { key: string; label: string; isin: string | null; entries: LedgerEntry[] }>()
    for (const e of entries) {
      const isin = e.isin?.trim() || nameToIsin.get(e.fund_name.trim().toLowerCase()) || null
      const key = fundGroupKey(isin, e.fund_name)
      let g = byKey.get(key)
      if (!g) { g = { key, label: e.fund_name, isin, entries: [] }; byKey.set(key, g) }
      g.entries.push(e)
    }
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [entries])

  const results = useMemo(() => {
    return groups.map(g => {
      const txns: DividendTxn[] = g.entries.map(e => ({ id: e.id, date: e.entry_date, type: e.entry_type, amount: e.amount != null ? Number(e.amount) : null }))
      const result = computeFundDividends(txns)
      const fundValue = findFundPositionValue(g.isin, g.label, positions) ?? result.currentCapital
      return { group: g, result, fundValue }
    })
  }, [groups, positions])

  const editingGroup = results.find(r => r.group.key === editingGroupKey)

  if (loading) return <div className="text-center py-16 text-sm text-gray-400">Cargando…</div>

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Agregar fondo — fecha y monto de la primera compra</p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={newFundName}
            onChange={e => setNewFundName(e.target.value)}
            placeholder="Nombre del fondo…"
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#2E7D52]/50 flex-1 max-w-xs"
          />
          <input
            type="date"
            value={newFundDate}
            onChange={e => setNewFundDate(e.target.value)}
            title="Fecha de compra"
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#2E7D52]/50"
          />
          <input
            type="number"
            step="0.01"
            value={newFundAmount}
            onChange={e => setNewFundAmount(e.target.value)}
            placeholder="Monto comprado"
            title="Monto comprado"
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#2E7D52]/50 w-36"
          />
          <button
            onClick={async () => {
              const ok = await addRow(newFundName, 'compra', {
                entry_date: newFundDate || null,
                amount: newFundAmount.trim() === '' ? null : Number(newFundAmount),
              })
              if (ok) { setNewFundName(''); setNewFundDate(''); setNewFundAmount('') }
            }}
            disabled={!newFundName.trim()}
            className="text-xs font-semibold px-3 py-2 rounded-lg text-white bg-[#2E7D52] disabled:opacity-40"
          >
            + Agregar fondo
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f) }} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="text-xs font-semibold px-3 py-2 rounded-lg text-[#1B3A2B] border border-[#1B3A2B]/30 disabled:opacity-50"
          >
            {importing ? 'Leyendo…' : '📄 Importar Activity (dividendos)'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">El Activity solo trae dividendos/distribuciones — las compras se cargan a mano, con su fecha real.</p>
      </div>
      {importError && <p className="text-xs text-red-600">{importError}</p>}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-900 mb-1">Dividendos detectados</p>
            <p className="text-xs text-gray-400 mb-3">
              Revisá y corregí antes de confirmar. Las filas en gris ya parecen estar cargadas — no se van a importar salvo que las marques a mano.
              {previewNonDividendCount > 0 && ` El archivo tenía ${previewNonDividendCount} compra(s)/venta(s) — se ignoran, cargalas a mano.`}
            </p>
            {previewWarnings.map((w, i) => <p key={i} className="text-xs text-amber-700 mb-2">{w}</p>)}
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-400">
                  <th className="py-1 w-6" />
                  <th className="py-1">Fecha</th>
                  <th className="py-1">Fondo</th>
                  <th className="py-1 text-right">Monto</th>
                  <th className="py-1 w-14">Moneda</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${r.isDuplicate ? 'bg-gray-50 text-gray-400' : ''}`}>
                    <td className="py-1"><input type="checkbox" checked={previewChecked[i]} onChange={e => setPreviewChecked(prev => prev.map((v, j) => j === i ? e.target.checked : v))} /></td>
                    <td className="py-1">
                      <input type="date" defaultValue={r.date ?? ''} onBlur={e => setPreview(prev => prev!.map((row, j) => j === i ? { ...row, date: e.target.value || null } : row))}
                        className="border border-transparent hover:border-gray-200 rounded px-1 outline-none w-28" />
                    </td>
                    <td className="py-1">
                      <input defaultValue={r.fundName} onBlur={e => setPreview(prev => prev!.map((row, j) => j === i ? { ...row, fundName: e.target.value } : row))}
                        className="border border-transparent hover:border-gray-200 rounded px-1 outline-none w-full" />
                    </td>
                    <td className="py-1 text-right">
                      <input type="number" step="0.01" defaultValue={r.amount ?? ''} onBlur={e => setPreview(prev => prev!.map((row, j) => j === i ? { ...row, amount: e.target.value === '' ? null : Number(e.target.value) } : row))}
                        className="border border-transparent hover:border-gray-200 rounded px-1 outline-none w-24 text-right" />
                    </td>
                    <td className="py-1">{r.currency ?? '—'}</td>
                    <td className="py-1">
                      <button onClick={() => setPreview(prev => prev!.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setPreview(null)} className="text-xs font-semibold px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100">Cancelar</button>
              <button onClick={confirmImport} disabled={importing} className="text-xs font-semibold px-4 py-2 rounded-lg text-white bg-[#2E7D52] disabled:opacity-50">
                {importing ? 'Importando…' : `Confirmar importación (${previewChecked.filter(Boolean).length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vista predeterminada: UNA fila por fondo, nada más. El detalle
          fecha por fecha va oculto salvo que se despliegue a propósito. ── */}
      {results.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-400">Sin fondos cargados. Escribí un nombre arriba y agregalo, o importá el Activity del custodio.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1B2E3C] text-left">
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase text-white">Fondo</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase text-white text-right">Dividendos cobrados</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase text-white text-right">Tasa anualizada</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {results.map(({ group, result, fundValue }) => {
                const isOpen = expandedKey === group.key
                return (
                  <Fragment key={group.key}>
                    <tr
                      onClick={() => setExpandedKey(isOpen ? null : group.key)}
                      className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        <span className="inline-block w-3 text-gray-400">{isOpen ? '▾' : '▸'}</span> {group.label}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmtUSD2(result.totalCollected)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{fmtPct(result.annualizedYieldPct)}</td>
                      <td />
                    </tr>
                    {isOpen && (
                      <tr key={group.key + '-detail'} className="border-b border-gray-100 bg-gray-50/60">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Detalle por dividendo — control y auditoría</p>
                            <button onClick={e => { e.stopPropagation(); setEditingGroupKey(group.key) }} className="text-[11px] font-medium text-[#2E7D52] hover:underline">
                              Editar movimientos
                            </button>
                          </div>
                          {result.history.length === 0 ? (
                            <p className="text-xs text-gray-400">Sin dividendos cargados para este fondo. Valor del fondo (posición actual): {fmtUSD2(fundValue)}.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-gray-400 border-b border-gray-200">
                                  <th className="py-1">Fecha</th>
                                  <th className="py-1 text-right">Dividendo</th>
                                  <th className="py-1 text-right">Capital correspondiente</th>
                                  <th className="py-1 text-right">Yield</th>
                                </tr>
                              </thead>
                              <tbody>
                                {result.history.map(h => (
                                  <tr key={h.id} className="border-b border-gray-100">
                                    <td className="py-1 text-gray-600">{fmtDate(h.date)}</td>
                                    <td className="py-1 text-right font-semibold text-gray-800">{fmtUSD2(h.collected)}</td>
                                    <td className="py-1 text-right text-gray-500">{h.capitalAtPayment != null ? fmtUSD2(h.capitalAtPayment) : '—'}</td>
                                    <td className="py-1 text-right">
                                      {h.yieldPct != null ? <span className="font-semibold text-emerald-600">{fmtPct(h.yieldPct)}</span> : <span className="text-amber-600 text-[10px]">pendiente de revisar</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Editar movimientos: modal, solo se abre desde el detalle ── */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingGroupKey(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-900">Movimientos — {editingGroup.group.label}</p>
              <button onClick={() => setEditingGroupKey(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-400">
                  <th className="px-3 py-1.5 text-[10px] font-semibold uppercase w-40" title="Si esta fila quedó con el nombre tipeado distinto a las demás del mismo fondo, corregilo acá para que se agrupen juntas.">Fondo</th>
                  <th className="px-3 py-1.5 text-[10px] font-semibold uppercase w-28">Tipo</th>
                  <th className="px-3 py-1.5 text-[10px] font-semibold uppercase w-32">Fecha</th>
                  <th className="px-3 py-1.5 text-[10px] font-semibold uppercase w-32 text-right">Monto</th>
                  <th className="px-3 py-1.5 text-[10px] font-semibold uppercase">Notas</th>
                  <th className="px-3 py-1.5 text-[10px] font-semibold uppercase w-16">Origen</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {editingGroup.group.entries.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-1.5">
                      <input
                        key={r.id + r.fund_name}
                        type="text"
                        disabled={saving === r.id}
                        defaultValue={r.fund_name}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.fund_name) patchRow(r.id, { fund_name: v }) }}
                        className="text-xs text-gray-700 border border-transparent hover:border-gray-200 focus:border-[#2E7D52]/50 rounded px-1 py-0.5 outline-none w-full"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        defaultValue={r.entry_type}
                        disabled={saving === r.id}
                        onChange={e => patchRow(r.id, { entry_type: e.target.value })}
                        className={`text-xs font-semibold rounded px-1.5 py-0.5 border-0 outline-none ${
                          r.entry_type === 'compra' ? 'bg-gray-100 text-gray-600'
                          : r.entry_type === 'venta' ? 'bg-red-50 text-red-600'
                          : r.entry_type === 'dividendo_total' ? 'bg-blue-50 text-blue-700'
                          : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        <option value="compra">Compra</option>
                        <option value="venta">Venta</option>
                        <option value="dividendo">Dividendo</option>
                        <option value="dividendo_total">Total acumulado</option>
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
                    <td className="px-3 py-1.5 text-[10px] text-gray-400">{r.custodian ? `${r.custodian}` : ''}</td>
                    <td className="px-1">
                      <button onClick={() => deleteRow(r.id)} title="Borrar fila" className="text-gray-300 hover:text-red-500 text-sm px-1">×</button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={7} className="px-3 py-1.5">
                    <div className="flex gap-2">
                      <button onClick={() => addRow(editingGroup.group.label, 'compra')} className="text-[11px] font-medium text-gray-500 hover:text-[#2E7D52]">+ compra</button>
                      <button onClick={() => addRow(editingGroup.group.label, 'venta')} className="text-[11px] font-medium text-gray-500 hover:text-red-600">+ venta</button>
                      <button onClick={() => addRow(editingGroup.group.label, 'dividendo')} className="text-[11px] font-medium text-gray-500 hover:text-[#2E7D52]">+ dividendo</button>
                      {editingGroup.group.entries.every(r => r.entry_type !== 'dividendo_total') && (
                        <button onClick={() => addRow(editingGroup.group.label, 'dividendo_total')} className="text-[11px] font-medium text-gray-500 hover:text-blue-600" title="Cargar un solo monto acumulado en vez de fila por fila">
                          + total acumulado
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
