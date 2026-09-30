'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import type { Instrument } from '@/app/api/instruments/route'
import { RISK_GROUPS, RISK_GROUP_ORDER, perfilFromPuntaje, type RiskGroup } from '@/lib/riskGroups'
import type { DavinciJobState } from '@/lib/riskDavinci'
import type { YahooJobState } from '@/lib/riskYahoo'

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

const PERFIL_STYLE: Record<string, string> = {
  conservador: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  moderado:    'bg-amber-50 text-amber-700 border-amber-200',
  agresivo:    'bg-red-50 text-red-700 border-red-200',
}

const FUENTE_LABEL: Record<string, string> = {
  monitor: 'por categoría del Monitor', categoria: 'por la categoría cargada', nombre: 'por el nombre',
  rating: 'por el rating', pais: 'por el país del ISIN', sector: 'por sector y país', manual: 'ajuste manual', sin_clasificar: 'sin clasificar',
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
  const [riesgoFilter, setRiesgoFilter] = useState('')

  // Ajuste manual del riesgo
  const [riskEditing, setRiskEditing] = useState<Instrument | null>(null)
  const [riskGrupo, setRiskGrupo]     = useState<RiskGroup | ''>('')
  const [riskMotivo, setRiskMotivo]   = useState('')
  const [riskError, setRiskError]     = useState('')
  const [riskSaving, setRiskSaving]   = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [davinci, setDavinci] = useState<DavinciJobState | null>(null)
  const [yahoo, setYahoo] = useState<YahooJobState | null>(null)

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

  // ── Riesgo ──────────────────────────────────────────────────────────────────

  function openRisk(inst: Instrument) {
    setRiskEditing(inst)
    setRiskGrupo(inst.riesgo_grupo ?? '')
    setRiskMotivo(inst.riesgo_fuente === 'manual' ? inst.riesgo_motivo ?? '' : '')
    setRiskError('')
  }

  async function saveRisk(grupo: RiskGroup | null) {
    if (!riskEditing) return
    if (grupo && !riskMotivo.trim()) { setRiskError('Escribí el motivo del ajuste.'); return }
    setRiskSaving(true); setRiskError('')
    try {
      const res = await fetch(`/api/instruments/${riskEditing.id}/riesgo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupo, motivo: riskMotivo }),
      })
      const data = await res.json()
      if (!res.ok) { setRiskError(data.error ?? 'Error al guardar'); return }
      setRiskEditing(null)
      fetchAll()
    } catch (e: any) {
      setRiskError(e.message)
    } finally { setRiskSaving(false) }
  }

  async function recalcularRiesgo() {
    setRecalculando(true)
    try {
      const res = await fetch('/api/instruments/riesgo', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? 'Error al recalcular')
      fetchAll()
    } finally { setRecalculando(false) }
  }

  // Búsqueda de categorías en Davinci (segundo plano): se consulta el progreso
  // mientras corre y al terminar se recarga la tabla.
  useEffect(() => {
    fetch('/api/instruments/riesgo/davinci').then(r => r.ok ? r.json() : null).then(d => d && setDavinci(d)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!davinci?.running) return
    const t = setInterval(async () => {
      try {
        const d: DavinciJobState = await (await fetch('/api/instruments/riesgo/davinci')).json()
        setDavinci(d)
        if (!d.running) fetchAll()
      } catch { /* reintenta en el próximo tick */ }
    }, 3000)
    return () => clearInterval(t)
  }, [davinci?.running, fetchAll])

  // Sector y país de las acciones (Yahoo): arranca solo al listar instrumentos.
  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/instruments/riesgo/yahoo').then(r => r.ok ? r.json() : null).then(d => d && setYahoo(d)).catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!yahoo?.running) return
    const t = setInterval(async () => {
      try {
        const d: YahooJobState = await (await fetch('/api/instruments/riesgo/yahoo')).json()
        setYahoo(d)
        if (!d.running) fetchAll()
      } catch { /* reintenta en el próximo tick */ }
    }, 3000)
    return () => clearInterval(t)
  }, [yahoo?.running, fetchAll])

  async function buscarEnDavinci() {
    const res = await fetch('/api/instruments/riesgo/davinci', { method: 'POST' })
    const d = await res.json()
    if (!res.ok) { alert(d.error ?? 'No se pudo iniciar la búsqueda'); return }
    setDavinci(d)
  }

  // ── Excel import ──────────────────────────────────────────────────────────────

  // ── Formato "Pershing NetX360 Consolidated Positions" (export real de Pershing) ──
  // La hoja trae 3-4 filas de metadata (título, IBD/OFF/IP #, Asset Type) antes
  // del header real, que puede estar en cualquier fila — no siempre la primera.
  // Secciones por tipo de activo (Equities, Mutual Funds, Fixed Income Securities,
  // Options, Cash, etc.) identificadas por filas con ASSET TYPE + Market Value
  // numérico pero sin symbol/cusip/description (son subtotales, no posiciones).
  function parsePershingConsolidated(rawRows: any[][]): any[] | null {
    let headerIdx = -1
    for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
      if (String(rawRows[i]?.[0] ?? '').trim().toUpperCase() === 'ASSET TYPE') { headerIdx = i; break }
    }
    if (headerIdx === -1) return null

    // Solo importamos tipos que el sistema soporta (fondo/bono/accion).
    // Options, Cash/Money Fund, Annuities, Others y Non Traditional se omiten.
    const TYPE_MAP: Record<string, string> = {
      'equities':                'accion',
      'mutual funds':            'fondo',
      'fixed income securities': 'bono',
    }

    const out: any[] = []
    let currentType = ''
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const r       = rawRows[i] ?? []
      const assetType = String(r[0] ?? '').trim()
      const symbol    = String(r[1] ?? '').trim()
      const cusip     = String(r[2] ?? '').trim()
      const isin      = String(r[3] ?? '').trim()
      const nombre    = String(r[4] ?? '').trim()
      const marketVal = r[5]

      // Fila de sección/subtotal: tiene ASSET TYPE y un Market Value numérico,
      // pero no symbol/cusip/description — marca el tipo de las filas siguientes.
      if (assetType && !symbol && !cusip && !nombre) {
        if (typeof marketVal === 'number') currentType = assetType.toLowerCase()
        continue
      }
      if (!nombre) continue // fila vacía o de pie de página (disclosures)

      const tipo = TYPE_MAP[currentType]
      if (!tipo) continue // sección no soportada (Options, Cash, Annuities, Others, Non Traditional)

      out.push({
        tipo_activo: tipo,
        nombre,
        isin:   isin   || null,
        cusip:  cusip  || null,
        ticker: symbol || null,
        moneda: 'USD',
      })
    }
    return out
  }

  function parseExcel(json: any[], rawRows?: any[][]): any[] {
    if (json.length === 0) return []

    if (rawRows) {
      const pershing = parsePershingConsolidated(rawRows)
      if (pershing && pershing.length > 0) return pershing
    }

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
      if (!out.nombre      && out.name)          out.nombre      = out.name
      if (!out.nombre      && out.description)   out.nombre      = out.description
      if (!out.nombre      && out.security_name) out.nombre      = out.security_name
      if (!out.tipo_activo && out.tipo)          out.tipo_activo = out.tipo
      if (!out.tipo_activo && out.asset_type)    out.tipo_activo = out.asset_type
      if (!out.tipo_activo && out.security_type) out.tipo_activo = out.security_type
      if (!out.tipo_activo && out.type)          out.tipo_activo = out.type
      if (!out.emisor      && out.issuer)        out.emisor      = out.issuer
      if (!out.categoria   && out.category)      out.categoria   = out.category
      return out
    }).filter((r) => r.nombre)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb      = XLSX.read(ev.target?.result, { type: 'array' })
        const ws      = wb.Sheets[wb.SheetNames[0]]
        const json    = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 }) as any[][]

        if (json.length === 0) {
          alert('El archivo no tiene filas de datos (¿está vacía la primera hoja?).')
          return
        }

        const normalized = parseExcel(json, rawRows)

        if (normalized.length === 0) {
          const detectedCols = Object.keys(json[0] ?? {}).join(', ') || '(ninguna)'
          alert(
            'No se encontraron filas válidas para importar.\n\n' +
            `Columnas detectadas en el archivo: ${detectedCols}\n\n` +
            'Asegurate de que el Excel tenga una columna "nombre" (o "name"/"description") con el nombre del instrumento.'
          )
        }

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

  const aRevisar = instruments.filter(i => i.activo && i.riesgo_revisar).length
  const visibles = instruments.filter(i => {
    if (!riesgoFilter) return true
    if (riesgoFilter === 'revisar') return !!i.riesgo_revisar
    if (riesgoFilter === 'sin_clasificar') return !i.riesgo_grupo
    if (riesgoFilter === 'manual') return i.riesgo_fuente === 'manual'
    return i.riesgo_puntaje != null && perfilFromPuntaje(i.riesgo_puntaje) === riesgoFilter
  })

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
              onClick={buscarEnDavinci}
              disabled={!!davinci?.running}
              title="Busca en Davinci la categoría de los fondos sin clasificar o clasificados solo por el nombre, la guarda y recalcula el riesgo"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
            >
              <span className="hidden sm:inline">{davinci?.running ? `Davinci ${davinci.procesados}/${davinci.total}…` : 'Categorías de Davinci'}</span>
              <span className="sm:hidden">DV</span>
            </button>
            <button
              onClick={recalcularRiesgo}
              disabled={recalculando}
              title="Vuelve a calcular el puntaje de riesgo de todos los instrumentos (respeta los ajustes manuales)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
            >
              <span className="hidden sm:inline">{recalculando ? 'Recalculando…' : 'Recalcular riesgo'}</span>
              <span className="sm:hidden">↻</span>
            </button>
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

        {davinci && (davinci.running || davinci.finishedAt) && (
          <div className="px-4 md:px-5 py-2 border-b border-gray-100 text-[12px] text-gray-500">
            {davinci.running
              ? <>Buscando categorías en Davinci: {davinci.procesados} de {davinci.total} fondos — {davinci.encontrados} encontradas…</>
              : davinci.error
                ? <span className="text-red-600">Davinci: {davinci.error}</span>
                : davinci.total === 0
                  ? <>Davinci: no hay fondos pendientes de buscar.</>
                  : <>Davinci: {davinci.encontrados} de {davinci.total} fondos con categoría, {davinci.clasificados} quedaron clasificados{davinci.errores ? `, ${davinci.errores} con error (se reintentan en la próxima corrida)` : ''}. Los que no están en Davinci se asignan a mano.</>}
          </div>
        )}

        {yahoo?.running && (
          <div className="px-4 md:px-5 py-2 border-b border-gray-100 text-[12px] text-gray-500">
            Buscando sector y país de las acciones en Yahoo: {yahoo.procesados} de {yahoo.total}…
          </div>
        )}

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
          <select
            value={riesgoFilter}
            onChange={(e) => setRiesgoFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2D3F52] text-gray-600 bg-white"
          >
            <option value="">Todo el riesgo</option>
            <option value="revisar">A revisar{aRevisar ? ` (${aRevisar})` : ''}</option>
            <option value="sin_clasificar">Sin clasificar</option>
            <option value="manual">Ajuste manual</option>
            <option value="conservador">Conservador (1-3)</option>
            <option value="moderado">Moderado (4-6)</option>
            <option value="agresivo">Agresivo (7-10)</option>
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
        ) : visibles.length === 0 && instruments.length > 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">Ningún instrumento con ese filtro.</div>
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
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="pl-4 pr-2 py-2.5 text-left w-[70px]"><ColH>Tipo</ColH></th>
                  <th className="px-2 py-2.5 text-left"><ColH>Nombre</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[150px]"><ColH>Riesgo</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[130px]"><ColH>ISIN</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[110px]"><ColH>CUSIP</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[80px]"><ColH>Moneda</ColH></th>
                  <th className="px-2 py-2.5 text-left w-[120px]"><ColH>Emisor</ColH></th>
                  <th className="px-2 py-2.5 pr-4 text-right w-[100px]"><ColH>Acciones</ColH></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibles.map((inst) => {
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
                        <RiskBadge inst={inst} onClick={() => openRisk(inst)} />
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

      {/* ── Riesgo Modal ── */}
      {riskEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#2D3F52]">Riesgo del instrumento</p>
                <p className="text-[11px] text-gray-400 truncate">{riskEditing.nombre}</p>
              </div>
              <button onClick={() => setRiskEditing(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <p className="text-[12px] text-gray-500">
                Actual: <b className="text-[#2D3F52]">{riskEditing.riesgo_grupo ? `${RISK_GROUPS[riskEditing.riesgo_grupo].label} (${riskEditing.riesgo_puntaje})` : 'Sin clasificar'}</b>
                {riskEditing.riesgo_fuente && <> — {FUENTE_LABEL[riskEditing.riesgo_fuente] ?? riskEditing.riesgo_fuente}</>}
                {riskEditing.riesgo_fuente === 'manual' && riskEditing.riesgo_updated_by && <> por {riskEditing.riesgo_updated_by}</>}
              </p>
              {riskError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{riskError}</div>
              )}
              <div className="space-y-1.5">
                {RISK_GROUP_ORDER.map(g => {
                  const info = RISK_GROUPS[g]
                  const perfil = perfilFromPuntaje(info.puntaje)
                  return (
                    <label key={g} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition ${riskGrupo === g ? 'border-[#2D3F52] bg-gray-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="riesgo" className="mt-1" checked={riskGrupo === g} onChange={() => setRiskGrupo(g)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#2D3F52]">{info.label}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PERFIL_STYLE[perfil]}`}>{info.puntaje} · {perfil}</span>
                        </div>
                        <p className="text-[11px] text-gray-400">{info.incluye}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div>
                <label className={labelCls}>Motivo del ajuste *</label>
                <textarea className={inputCls} rows={2} placeholder="Ej: fondo de bonos high yield aunque el nombre no lo dice" value={riskMotivo} onChange={e => setRiskMotivo(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => riskGrupo && saveRisk(riskGrupo)}
                disabled={riskSaving || !riskGrupo}
                className="flex-1 py-2 text-sm font-bold text-white bg-[#2D3F52] rounded-lg hover:bg-[#3a4f64] disabled:opacity-40 transition"
              >
                {riskSaving ? 'Guardando…' : 'Guardar ajuste'}
              </button>
              {riskEditing.riesgo_fuente === 'manual' && (
                <button
                  onClick={() => saveRisk(null)}
                  disabled={riskSaving}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
                >
                  Volver al automático
                </button>
              )}
              <button
                onClick={() => setRiskEditing(null)}
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

function RiskBadge({ inst, onClick }: { inst: Instrument; onClick: () => void }) {
  if (!inst.riesgo_grupo || inst.riesgo_puntaje == null) {
    return (
      <button onClick={onClick} className="text-[10px] font-bold px-2 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition">
        Sin clasificar
      </button>
    )
  }
  const perfil = perfilFromPuntaje(inst.riesgo_puntaje)
  const titulo = [
    `${RISK_GROUPS[inst.riesgo_grupo].label} — ${perfil}`,
    inst.tipo_activo === 'accion' && (inst.sector || inst.pais) ? [inst.sector, inst.industria, inst.pais].filter(Boolean).join(' · ') : '',
    FUENTE_LABEL[inst.riesgo_fuente ?? ''] ?? '',
    inst.riesgo_fuente === 'manual' && inst.riesgo_motivo ? `Motivo: ${inst.riesgo_motivo}` : '',
    inst.riesgo_revisar ? 'A revisar' : '',
  ].filter(Boolean).join('\n')
  return (
    <button onClick={onClick} title={titulo} className="flex items-center gap-1 text-left max-w-full">
      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${PERFIL_STYLE[perfil]}`}>{inst.riesgo_puntaje}</span>
      <span className="text-[11px] text-gray-600 truncate">{RISK_GROUPS[inst.riesgo_grupo].label}</span>
      {inst.riesgo_revisar && <span className="shrink-0 text-[10px] text-amber-600" aria-label="A revisar">⚠</span>}
      {inst.riesgo_fuente === 'manual' && <span className="shrink-0 text-[9px] font-bold text-gray-400">M</span>}
    </button>
  )
}
