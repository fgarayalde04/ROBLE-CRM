'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import type { Instrument } from '@/app/api/instruments/route'

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_OPTIONS = [
  { value: 'fondo',  label: 'Fondo' },
  { value: 'bono',   label: 'Bono' },
  { value: 'accion', label: 'Acción' },
]

const TIPO_STYLE: Record<string, { bg: string; text: string }> = {
  fondo:  { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  bono:   { bg: 'bg-amber-50',   text: 'text-amber-700' },
  accion: { bg: 'bg-blue-50',    text: 'text-blue-700' },
}

const inputCls  = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition placeholder-gray-300'
const selectCls = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition'
const labelCls  = 'block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1'

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = () => ({
  tipo_activo: 'fondo' as const,
  nombre: '', isin: '', cusip: '', ticker: '', moneda: 'USD', emisor: '', categoria: '',
})

// ─── Component ────────────────────────────────────────────────────────────────

export default function InstrumentsManager() {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [tipoFilter, setTipoFilter]   = useState('')

  // Modal state
  const [modal, setModal]   = useState<'add' | 'edit' | 'import' | null>(null)
  const [editing, setEditing] = useState<Instrument | null>(null)
  const [form, setForm]     = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Import state
  const [importRows, setImportRows]     = useState<any[]>([])
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; errors: string[] } | null>(null)
  const [importing, setImporting]       = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ all: 'true' })
      if (tipoFilter) params.set('tipo', tipoFilter)
      if (search)     params.set('q', search)
      const res  = await fetch(`/api/instruments?${params}`)
      const data = await res.json()
      setInstruments(data.instruments ?? [])
    } catch { setInstruments([]) }
    finally { setLoading(false) }
  }, [search, tipoFilter])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Add / Edit ────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null); setForm(emptyForm()); setFormError(''); setModal('add')
  }

  function openEdit(inst: Instrument) {
    setEditing(inst)
    setForm({
      tipo_activo: inst.tipo_activo as any,
      nombre:    inst.nombre    ?? '',
      isin:      inst.isin      ?? '',
      cusip:     inst.cusip     ?? '',
      ticker:    inst.ticker    ?? '',
      moneda:    inst.moneda    ?? 'USD',
      emisor:    inst.emisor    ?? '',
      categoria: inst.categoria ?? '',
    })
    setFormError('')
    setModal('edit')
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError('')
    try {
      const res = editing
        ? await fetch(`/api/instruments/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
        : await fetch('/api/instruments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })

      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'Error al guardar'); return }

      setModal(null)
      fetchAll()
    } catch (e: any) {
      setFormError(e.message)
    } finally { setSaving(false) }
  }

  async function handleDeactivate(inst: Instrument) {
    if (!confirm(`¿Desactivar "${inst.nombre}"?`)) return
    await fetch(`/api/instruments/${inst.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: false }),
    })
    fetchAll()
  }

  async function handleReactivate(inst: Instrument) {
    await fetch(`/api/instruments/${inst.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: true }),
    })
    fetchAll()
  }

  // ── Excel import ──────────────────────────────────────────────────────────────

  function parseExcel(json: any[]): any[] {
    if (json.length === 0) return []

    const firstRow = json[0]
    const firstKey = Object.keys(firstRow)[0] ?? ''
    const firstVal = String(firstRow[firstKey] ?? '').trim()

    // ── Formato "Consolidated position Roble": secciones por tipo de activo ──
    const isConsolidated =
      firstVal === 'ASSET TYPE' ||
      firstVal === 'Consolidated Positions' ||
      Object.values(firstRow).some((v) => String(v).trim() === 'ASSET TYPE')

    if (isConsolidated) {
      const rows: any[] = []
      let currentType = ''
      for (const r of json) {
        const cols   = Object.values(r).map((v) => String(v ?? '').trim())
        const first  = cols[0]

        // Section header
        if (first === 'Mutual Funds' || first === 'Fixed Income Securities') {
          currentType = first; continue
        }
        // Skip header rows and empty rows
        if (!currentType) continue
        if (cols.some((v) => v === 'ASSET TYPE' || v === 'DESCRIPTION')) continue

        // Columns: [tipo, symbol, cusip, isin, description]
        const cusip = cols[2] || null
        const isin  = cols[3] || null
        const nombre = cols[4] || ''
        if (!nombre || nombre === 'DESCRIPTION') continue

        rows.push({
          tipo_activo: currentType === 'Mutual Funds' ? 'fondo' : 'bono',
          nombre,
          cusip:  cusip || null,
          isin:   isin  || null,
          moneda: 'USD',
        })
      }
      return rows
    }

    // ── Formato estándar: columnas con nombre ──
    return json.map((row) => {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(row)) {
        const key = k.toLowerCase()
          .replace(/\s+/g, '_')
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
        out[key] = String(v ?? '').trim()
      }
      if (!out.nombre      && out.name)        out.nombre      = out.name
      if (!out.tipo_activo && out.tipo)        out.tipo_activo = out.tipo
      if (!out.tipo_activo && out.asset_type)  out.tipo_activo = out.asset_type
      if (!out.tipo_activo && out.type)        out.tipo_activo = out.type
      if (!out.emisor      && out.issuer)      out.emisor      = out.issuer
      if (!out.categoria   && out.category)    out.categoria   = out.category
      return out
    }).filter((r) => r.nombre)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]

        const normalized = parseExcel(json)

        setImportRows(normalized)
        setImportResult(null)
      } catch (err) {
        alert('Error al leer el archivo. Asegurate de que sea .xlsx o .xls.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (importRows.length === 0) return
    setImporting(true)
    try {
      const res  = await fetch('/api/instruments/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importRows }),
      })
      const data = await res.json()
      setImportResult(data)
      setImportRows([])
      if (fileRef.current) fileRef.current.value = ''
      fetchAll()
    } catch (e: any) {
      alert('Error al importar: ' + e.message)
    } finally { setImporting(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const allTipos = Array.from(new Set(instruments.map(i => i.tipo_activo)))

  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#2D3F52]">Base de Instrumentos</span>
            {!loading && (
              <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {instruments.length} instrumentos
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setImportRows([]); setImportResult(null); setModal('import') }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="hidden sm:inline">Importar Excel</span>
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#2D3F52] rounded-lg hover:bg-[#3a4f64] transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Agregar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 md:px-5 py-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2D3F52] placeholder-gray-300"
              placeholder="Nombre, ISIN, CUSIP, emisor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2D3F52] text-gray-600 bg-white"
          >
            <option value="">Todos los tipos</option>
            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 text-center">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-400">Cargando instrumentos…</p>
          </div>
        ) : instruments.length === 0 ? (
          <div className="py-14 text-center">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
            <p className="text-sm text-gray-400">No hay instrumentos registrados.</p>
            <button onClick={openAdd} className="mt-2 text-xs text-blue-500 hover:underline">Agregar el primero</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="pl-4 pr-2 py-2.5 text-left w-[70px]"><ColH>Tipo</ColH></th>
                  <th className="px-2 py-2.5 text-left"><ColH>Nombre</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[130px]"><ColH>ISIN</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[110px]"><ColH>CUSIP</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[80px]"><ColH>Moneda</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[120px]"><ColH>Emisor</ColH></th>
                  <th className="px-2 py-2.5 pr-4 text-right w-[100px]"><ColH>Acciones</ColH></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {instruments.map((inst) => {
                  const s = TIPO_STYLE[inst.tipo_activo] ?? TIPO_STYLE.fondo
                  return (
                    <tr key={inst.id} className={`group hover:bg-gray-50/60 transition-colors ${!inst.activo ? 'opacity-40' : ''}`}>
                      <td className="pl-4 pr-2 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>
                          {inst.tipo_activo.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-2 py-3 max-w-[280px]">
                        <p className="text-sm font-semibold text-[#2D3F52] truncate">{inst.nombre}</p>
                        {inst.categoria && <p className="text-[10px] text-gray-400 truncate">{inst.categoria}</p>}
                      </td>
                      <td className="px-2 py-3">
                        <span className="text-[11px] font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                          {inst.isin || <span className="text-gray-300">—</span>}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <span className="text-[11px] font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                          {inst.cusip || <span className="text-gray-300">—</span>}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-[12px] text-gray-600">{inst.moneda ?? '—'}</td>
                      <td className="px-2 py-3 max-w-[120px]">
                        <span className="text-[11px] text-gray-500 truncate block">{inst.emisor ?? '—'}</span>
                      </td>
                      <td className="px-2 py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(inst)}
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition"
                          >
                            Editar
                          </button>
                          {inst.activo ? (
                            <button
                              onClick={() => handleDeactivate(inst)}
                              className="text-[11px] font-semibold text-gray-400 hover:text-red-500 transition"
                            >
                              Desactivar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(inst)}
                              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 transition"
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="text-[14px] font-bold text-[#2D3F52]">
                {modal === 'add' ? 'Agregar instrumento' : 'Editar instrumento'}
              </span>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tipo de activo *</label>
                  <select className={selectCls} value={form.tipo_activo} onChange={e => setForm(f => ({ ...f, tipo_activo: e.target.value as any }))}>
                    {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Moneda</label>
                  <select className={selectCls} value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="UYU">UYU</option>
                    <option value="ARS">ARS</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Nombre completo *</label>
                <input className={inputCls} placeholder="Ej: BlackRock Strategic Income Opportunities" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>ISIN</label>
                  <input className={inputCls} placeholder="Ej: LU1681045370" value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>CUSIP</label>
                  <input className={inputCls} placeholder="Ej: 46625H100" value={form.cusip} onChange={e => setForm(f => ({ ...f, cusip: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Ticker</label>
                  <input className={inputCls} placeholder="Ej: BSIIX" value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Emisor</label>
                  <input className={inputCls} placeholder="Ej: BlackRock" value={form.emisor} onChange={e => setForm(f => ({ ...f, emisor: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Categoría</label>
                <input className={inputCls} placeholder="Ej: Renta Fija Global, Renta Variable, etc." value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 text-sm font-bold text-white bg-[#2D3F52] rounded-lg hover:bg-[#3a4f64] disabled:opacity-40 transition"
              >
                {saving ? 'Guardando…' : modal === 'add' ? 'Agregar instrumento' : 'Guardar cambios'}
              </button>
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {modal === 'import' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="text-[14px] font-bold text-[#2D3F52]">Importar desde Excel</span>
              <button onClick={() => { setModal(null); setImportRows([]); setImportResult(null) }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-[12px] text-blue-700 space-y-1">
                <p className="font-bold">Columnas esperadas en el Excel:</p>
                <div className="grid grid-cols-2 gap-x-4 font-mono text-[11px] mt-1">
                  <span>nombre <span className="text-blue-400">(requerido)</span></span>
                  <span>tipo_activo <span className="text-blue-400">(fondo/bono/accion)</span></span>
                  <span>isin</span>
                  <span>cusip</span>
                  <span>ticker</span>
                  <span>moneda</span>
                  <span>emisor</span>
                  <span>categoria</span>
                </div>
                <p className="text-[11px] text-blue-500 mt-1">Si ya existe un ISIN o CUSIP igual, el registro se actualiza.</p>
              </div>

              {/* File picker */}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="import-file"
                />
                <label
                  htmlFor="import-file"
                  className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition text-sm text-gray-500 font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Seleccionar archivo .xlsx / .xls
                </label>
              </div>

              {/* Preview */}
              {importRows.length > 0 && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      Vista previa — {importRows.length} filas
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="pl-3 pr-2 py-1.5 text-left text-gray-500 font-semibold">Nombre</th>
                          <th className="px-2 py-1.5 text-left text-gray-500 font-semibold">Tipo</th>
                          <th className="px-2 py-1.5 text-left text-gray-500 font-semibold">ISIN</th>
                          <th className="px-2 py-1.5 pr-3 text-left text-gray-500 font-semibold">CUSIP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {importRows.slice(0, 8).map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="pl-3 pr-2 py-1.5 font-medium text-[#2D3F52] truncate max-w-[180px]">{row.nombre || <span className="text-red-400">—</span>}</td>
                            <td className="px-2 py-1.5 text-gray-600">{row.tipo_activo || '—'}</td>
                            <td className="px-2 py-1.5 font-mono text-gray-500">{row.isin || '—'}</td>
                            <td className="px-2 py-1.5 pr-3 font-mono text-gray-500">{row.cusip || '—'}</td>
                          </tr>
                        ))}
                        {importRows.length > 8 && (
                          <tr><td colSpan={4} className="pl-3 py-1.5 text-gray-400 italic">…y {importRows.length - 8} más</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import result */}
              {importResult && (
                <div className={`rounded-lg px-4 py-3 text-[12px] space-y-1 ${importResult.errors.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <p className={`font-bold ${importResult.errors.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    Importación completada
                  </p>
                  <div className="flex gap-4 text-[11px]">
                    <span className="text-emerald-700 font-semibold">✓ {importResult.inserted} nuevos</span>
                    <span className="text-blue-600 font-semibold">↻ {importResult.updated} actualizados</span>
                    {importResult.skipped > 0 && <span className="text-amber-600">⚠ {importResult.skipped} ignorados</span>}
                  </div>
                  {importResult.errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {importResult.errors.slice(0, 5).map((e, i) => (
                        <li key={i} className="text-amber-600 text-[10px]">{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              {importRows.length > 0 && !importResult && (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1 py-2 text-sm font-bold text-white bg-[#2D3F52] rounded-lg hover:bg-[#3a4f64] disabled:opacity-40 transition"
                >
                  {importing ? 'Importando…' : `Importar ${importRows.length} instrumentos`}
                </button>
              )}
              <button
                onClick={() => { setModal(null); setImportRows([]); setImportResult(null) }}
                className="flex-1 py-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                {importResult ? 'Cerrar' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ColH({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{children}</span>
}
