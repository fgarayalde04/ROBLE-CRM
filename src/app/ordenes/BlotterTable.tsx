'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { BlotterRow } from '@/app/api/ordenes/blotter/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Kpis {
  recibidas_hoy: number
  pendientes_autorizacion: number
  pendientes_ejecutar: number
  ejecutadas_hoy: number
  canceladas: number
}

interface Filters {
  q: string
  dateFrom: string
  dateTo: string
  asesor: string
  estado: string
  tipo: string
  operacion: string
  vigencia: string
}

interface EjecutarModal {
  itemId: string
  instrumento: string
  precio: string
  valor: string
}

interface CancelarModal {
  itemId: string
  instrumento: string
  motivo: string
}

interface HistorialModal {
  itemId: string
  instrumento: string
  eventos: any[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTADOS: Record<string, { label: string; color: string; dot: string }> = {
  pendiente_autorizacion: { label: 'Pend. Autorización', color: 'bg-amber-100 text-amber-800 border-amber-200',     dot: 'bg-amber-400' },
  autorizada:             { label: 'Autorizada',          color: 'bg-blue-100 text-blue-800 border-blue-200',        dot: 'bg-blue-500'  },
  en_mercado:             { label: 'En Mercado',          color: 'bg-purple-100 text-purple-800 border-purple-200',  dot: 'bg-purple-500'},
  ejecutada:              { label: 'Ejecutada',           color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  cancelada:              { label: 'Cancelada',           color: 'bg-red-100 text-red-800 border-red-200',           dot: 'bg-red-400'   },
  vencida:                { label: 'Vencida',             color: 'bg-gray-100 text-gray-500 border-gray-200',        dot: 'bg-gray-400'  },
}

const TIPO_LABEL: Record<string, string> = {
  acciones: 'Acción', fondos: 'Fondo', bonos: 'Bono',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
}
function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex flex-col gap-1 min-w-[130px]">
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-xs text-gray-500 leading-tight">{label}</span>
    </div>
  )
}

// ─── Estado Badge ──────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] ?? { label: estado, color: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Checkbox Cell ─────────────────────────────────────────────────────────────

function CheckCell({
  value, onChange, disabled, title
}: { value: boolean; onChange?: () => void; disabled?: boolean; title?: string }) {
  return (
    <div className="flex items-center justify-center">
      <button
        onClick={onChange}
        disabled={disabled || !onChange}
        title={title}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          value
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        } ${disabled || !onChange ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
      >
        {value && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ─── Historial Modal ───────────────────────────────────────────────────────────

function HistorialModal({ modal, onClose }: { modal: HistorialModal; onClose: () => void }) {
  const TIPO_ICONS: Record<string, { icon: string; color: string }> = {
    orden_creada:            { icon: '📋', color: 'bg-blue-100' },
    mail_respondido:         { icon: '✅', color: 'bg-green-100' },
    mail_respondido_revertido: { icon: '↩️', color: 'bg-yellow-100' },
    en_mercado:              { icon: '📈', color: 'bg-purple-100' },
    ejecutada:               { icon: '💰', color: 'bg-emerald-100' },
    cancelada:               { icon: '❌', color: 'bg-red-100' },
    editado:                 { icon: '✏️', color: 'bg-gray-100' },
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Historial de eventos</h3>
            <p className="text-xs text-gray-500 mt-0.5">{modal.instrumento}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-6 py-4 max-h-[420px] overflow-y-auto">
          {modal.eventos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin eventos registrados</p>
          ) : (
            <div className="relative">
              <div className="absolute left-[22px] top-0 bottom-0 w-px bg-gray-200" />
              <div className="space-y-4">
                {modal.eventos.map((ev, i) => {
                  const cfg = TIPO_ICONS[ev.tipo] ?? { icon: '•', color: 'bg-gray-100' }
                  return (
                    <div key={i} className="flex gap-4 relative">
                      <div className={`w-11 h-11 rounded-full ${cfg.color} flex items-center justify-center text-lg flex-shrink-0 z-10 border-2 border-white`}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 pt-1.5">
                        <p className="text-sm font-medium text-gray-800">{ev.descripcion}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmtDate(ev.created_at)} · {fmtTime(ev.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main BlotterTable Component ──────────────────────────────────────────────

interface Props {
  isAdmin: boolean
  userName: string
  soloHoy?: boolean
}

export default function BlotterTable({ isAdmin, userName, soloHoy = false }: Props) {
  const [rows, setRows]       = useState<BlotterRow[]>([])
  const [kpis, setKpis]       = useState<Kpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>({
    q: '', dateFrom: '', dateTo: '', asesor: '', estado: '', tipo: '', operacion: '', vigencia: '',
  })
  const [ejecutarModal, setEjecutarModal] = useState<EjecutarModal | null>(null)
  const [cancelarModal, setCancelarModal] = useState<CancelarModal | null>(null)
  const [historialModal, setHistorialModal] = useState<HistorialModal | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const abortRef = useRef<AbortController | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    const sp = new URLSearchParams()
    if (soloHoy)            sp.set('hoy', '1')
    if (filters.dateFrom)   sp.set('dateFrom',  filters.dateFrom)
    if (filters.dateTo)     sp.set('dateTo',    filters.dateTo)
    if (filters.asesor)     sp.set('asesor',    filters.asesor)
    if (filters.estado)     sp.set('estado',    filters.estado)
    if (filters.tipo)       sp.set('tipo',      filters.tipo)
    if (filters.operacion)  sp.set('operacion', filters.operacion)
    if (filters.vigencia)   sp.set('vigencia',  filters.vigencia)
    if (filters.q)          sp.set('q',         filters.q)

    try {
      const res = await fetch(`/api/ordenes/blotter?${sp}`, { signal: ctrl.signal })
      if (!res.ok) return
      const data = await res.json()
      setRows(data.rows ?? [])
      setKpis(data.kpis ?? null)
    } catch {
      // aborted
    } finally {
      setLoading(false)
    }
  }, [filters, soloHoy])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Actions ──────────────────────────────────────────────────────
  const patch = useCallback(async (id: string, body: object) => {
    setPendingIds(p => new Set(p).add(id))
    try {
      const res = await fetch(`/api/ordenes/blotter/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error'); return false }
      await fetchData()
      return true
    } finally {
      setPendingIds(p => { const s = new Set(p); s.delete(id); return s })
    }
  }, [fetchData])

  const toggleMailRespondido = (row: BlotterRow) => {
    if (row.estado === 'cancelada' || row.estado === 'ejecutada') return
    patch(row.id, { accion: 'mail_respondido', value: !row.mail_respondido })
  }

  const marcarEnMercado = (row: BlotterRow) => {
    if (!row.mail_respondido) { alert('La orden necesita autorización del cliente primero'); return }
    patch(row.id, { accion: 'en_mercado' })
  }

  const abrirEjecutar = (row: BlotterRow) => {
    setEjecutarModal({ itemId: row.id, instrumento: row.instrument_name ?? row.symbol ?? '—', precio: '', valor: '' })
  }

  const confirmarEjecutar = async () => {
    if (!ejecutarModal) return
    const ok = await patch(ejecutarModal.itemId, {
      accion: 'ejecutar',
      precio_ejecutado: ejecutarModal.precio || null,
      valor_efectivo:   ejecutarModal.valor  || null,
    })
    if (ok) setEjecutarModal(null)
  }

  const abrirCancelar = (row: BlotterRow) => {
    setCancelarModal({ itemId: row.id, instrumento: row.instrument_name ?? row.symbol ?? '—', motivo: '' })
  }

  const confirmarCancelar = async () => {
    if (!cancelarModal) return
    const ok = await patch(cancelarModal.itemId, { accion: 'cancelar', motivo: cancelarModal.motivo })
    if (ok) setCancelarModal(null)
  }

  const verHistorial = async (row: BlotterRow) => {
    const res = await fetch(`/api/ordenes/blotter/${row.id}`)
    const data = await res.json()
    setHistorialModal({
      itemId: row.id,
      instrumento: row.instrument_name ?? row.symbol ?? '—',
      eventos: data.eventos ?? [],
    })
  }

  // ── Filter helpers ────────────────────────────────────────────────
  const setFilter = (key: keyof Filters, val: string) =>
    setFilters(f => ({ ...f, [key]: val }))

  const activeFiltersCount = Object.values(filters).filter(Boolean).length

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ── KPI Bar ── */}
      {kpis && (
        <div className="flex gap-3 flex-wrap">
          <KpiCard label="Recibidas hoy"          value={kpis.recibidas_hoy}           color="text-gray-900" />
          <KpiCard label="Pend. autorización"      value={kpis.pendientes_autorizacion} color="text-amber-600" />
          <KpiCard label="Pend. ejecutar"          value={kpis.pendientes_ejecutar}     color="text-blue-600" />
          <KpiCard label="Ejecutadas hoy"          value={kpis.ejecutadas_hoy}          color="text-emerald-600" />
          <KpiCard label="Canceladas"              value={kpis.canceladas}              color="text-red-500" />
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
        <div className="flex flex-wrap gap-2 items-end">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input
              type="text" placeholder="Cliente, instrumento, N° orden…"
              value={filters.q} onChange={e => setFilter('q', e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52] bg-gray-50"
            />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52] bg-gray-50" />
            <span className="text-xs text-gray-400">→</span>
            <input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52] bg-gray-50" />
          </div>

          {isAdmin && (
            <input type="text" placeholder="Asesor" value={filters.asesor}
              onChange={e => setFilter('asesor', e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52] bg-gray-50 w-32" />
          )}

          <select value={filters.estado} onChange={e => setFilter('estado', e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52] bg-gray-50">
            <option value="">Todo estado</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select value={filters.tipo} onChange={e => setFilter('tipo', e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52] bg-gray-50">
            <option value="">Todo tipo</option>
            <option value="acciones">Acción</option>
            <option value="fondos">Fondo</option>
            <option value="bonos">Bono</option>
          </select>

          <select value={filters.operacion} onChange={e => setFilter('operacion', e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52] bg-gray-50">
            <option value="">C / V</option>
            <option value="compra">Compra</option>
            <option value="venta">Venta</option>
          </select>

          <select value={filters.vigencia} onChange={e => setFilter('vigencia', e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52] bg-gray-50">
            <option value="">Vigencia</option>
            <option value="DIA">DAY</option>
            <option value="GTC">GTC</option>
          </select>

          {activeFiltersCount > 0 && (
            <button onClick={() => setFilters({ q:'',dateFrom:'',dateTo:'',asesor:'',estado:'',tipo:'',operacion:'',vigencia:'' })}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              Limpiar ({activeFiltersCount})
            </button>
          )}

          <button onClick={fetchData}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#2D3F52] text-white rounded-lg hover:bg-opacity-90 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Count bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/70">
          <span className="text-xs font-medium text-gray-500">
            {loading ? 'Cargando…' : `${rows.length} orden${rows.length !== 1 ? 'es' : ''}`}
          </span>
          {loading && <span className="w-4 h-4 border-2 border-[#2D3F52] border-t-transparent rounded-full animate-spin" />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: '1600px' }}>
            {/* Header */}
            <thead>
              <tr className="bg-[#1a2535] text-white">
                {[
                  { label: 'Fecha Blotter', w: '90px' },
                  { label: 'Hora',          w: '52px' },
                  { label: 'Vigencia',      w: '56px' },
                  { label: 'N° Interno',    w: '100px' },
                  { label: 'Asesor',        w: '110px' },
                  { label: 'Cliente',       w: '140px' },
                  { label: 'Ficha',         w: '70px' },
                  { label: 'Fecha Orden',   w: '82px' },
                  { label: 'Operación',     w: '72px' },
                  { label: 'Tipo',          w: '60px' },
                  { label: 'Instrumento',   w: '160px' },
                  { label: 'Cupón',         w: '62px' },
                  { label: 'Maturity',      w: '80px' },
                  { label: 'VN / Qty',      w: '80px' },
                  { label: 'Px Solicitado', w: '90px' },
                  { label: 'Mail ✓',        w: '56px', center: true },
                  { label: 'Ejecutada',     w: '60px', center: true },
                  { label: 'Px Ejecutado',  w: '90px' },
                  { label: 'Val. Efectivo', w: '90px' },
                  { label: 'Estado',        w: '140px' },
                  { label: 'Obs.',          w: '120px' },
                  { label: '',              w: '80px', center: true },
                ].map((col, i) => (
                  <th key={i}
                    className="px-2 py-2.5 text-left font-semibold text-[10px] tracking-wide uppercase whitespace-nowrap border-r border-white/10 last:border-0"
                    style={{ width: col.w, minWidth: col.w, textAlign: col.center ? 'center' : 'left' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={22} className="py-16 text-center text-gray-400 text-sm">
                    Sin órdenes en este rango
                  </td>
                </tr>
              )}

              {rows.map((row, i) => {
                const isPending   = pendingIds.has(row.id)
                const canEdit     = isAdmin && row.estado !== 'ejecutada' && row.estado !== 'cancelada'
                const isEjecutada = row.estado === 'ejecutada'
                const isCancelada = row.estado === 'cancelada'

                return (
                  <tr key={row.id}
                    className={`border-b border-gray-100 transition-colors
                      ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
                      ${isPending ? 'opacity-60' : 'hover:bg-blue-50/30'}
                      ${isCancelada ? 'opacity-60' : ''}
                    `}
                  >
                    {/* Fecha Blotter */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-600 font-mono">
                      {fmtDate(row.order_created_at)}
                    </td>
                    {/* Hora */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-400 font-mono">
                      {fmtTime(row.order_created_at)}
                    </td>
                    {/* Vigencia */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        row.vigencia === 'GTC'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>{row.vigencia ?? '—'}</span>
                    </td>
                    {/* N° Interno */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-700 font-mono font-medium">
                      {row.orden_id ?? '—'}
                    </td>
                    {/* Asesor */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-700 truncate max-w-[110px]" title={row.user_name ?? ''}>
                      {row.user_name ?? '—'}
                    </td>
                    {/* Cliente */}
                    <td className="px-2 py-2 whitespace-nowrap font-medium text-gray-900 truncate max-w-[140px]" title={row.client_name ?? ''}>
                      {row.client_name ?? '—'}
                    </td>
                    {/* Ficha */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-500 font-mono">
                      {row.client_number ?? '—'}
                    </td>
                    {/* Fecha Orden */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-600 font-mono">
                      {row.order_date ?? '—'}
                    </td>
                    {/* Operación */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        row.operation_type === 'compra'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {row.operation_type === 'compra' ? 'COMPRA' : 'VENTA'}
                      </span>
                    </td>
                    {/* Tipo */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                      {TIPO_LABEL[row.order_type] ?? row.order_type}
                    </td>
                    {/* Instrumento */}
                    <td className="px-2 py-2 font-medium text-gray-900 truncate max-w-[160px]" title={row.instrument_name ?? row.symbol ?? ''}>
                      <div className="flex flex-col">
                        <span>{row.instrument_name ?? '—'}</span>
                        {row.symbol && <span className="text-[10px] text-gray-400 font-mono">{row.symbol}</span>}
                      </div>
                    </td>
                    {/* Cupón */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-500 font-mono">
                      {row.cupon ?? '—'}
                    </td>
                    {/* Maturity */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-500 font-mono">
                      {row.maturity ?? '—'}
                    </td>
                    {/* VN / Qty */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-700 font-mono tabular-nums text-right pr-3">
                      {row.quantity ?? '—'}
                      {row.moneda && <span className="text-gray-400 ml-1">{row.moneda}</span>}
                    </td>
                    {/* Px Solicitado */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-600 font-mono tabular-nums text-right pr-3">
                      {row.price === 'mercado' || !row.price ? (
                        <span className="text-gray-400 italic">Mercado</span>
                      ) : row.price}
                    </td>
                    {/* Mail Respondido */}
                    <td className="px-2 py-2">
                      <CheckCell
                        value={row.mail_respondido}
                        onChange={isAdmin && canEdit ? () => toggleMailRespondido(row) : undefined}
                        disabled={isPending || isCancelada}
                        title={row.mail_respondido_by ? `Registrado por ${row.mail_respondido_by} a las ${fmtTime(row.mail_respondido_at)}` : 'Sin respuesta aún'}
                      />
                    </td>
                    {/* Orden Ejecutada */}
                    <td className="px-2 py-2">
                      <CheckCell
                        value={row.done}
                        onChange={isAdmin && row.mail_respondido && !row.done && !isCancelada
                          ? () => abrirEjecutar(row)
                          : undefined}
                        disabled={isPending || !row.mail_respondido || isCancelada}
                        title={!row.mail_respondido ? 'Requiere mail respondido' : row.done ? `Ejecutada por ${row.ejecutado_by}` : 'Marcar como ejecutada'}
                      />
                    </td>
                    {/* Precio Ejecutado */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-700 font-mono tabular-nums text-right pr-3">
                      {fmtNum(row.precio_ejecutado)}
                    </td>
                    {/* Valor Efectivo */}
                    <td className="px-2 py-2 whitespace-nowrap text-gray-700 font-mono tabular-nums text-right pr-3">
                      {fmtNum(row.valor_efectivo)}
                    </td>
                    {/* Estado */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <EstadoBadge estado={row.estado} />
                    </td>
                    {/* Observaciones */}
                    <td className="px-2 py-2 text-gray-500 truncate max-w-[120px]" title={row.notes ?? ''}>
                      {row.notes ?? '—'}
                    </td>
                    {/* Acciones */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1 justify-center">
                        {/* Historial */}
                        <button onClick={() => verHistorial(row)}
                          title="Ver historial"
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                        </button>
                        {/* En mercado */}
                        {isAdmin && row.mail_respondido && !row.done && !isCancelada && !row.en_mercado_at && (
                          <button onClick={() => marcarEnMercado(row)}
                            title="Enviar al mercado"
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-purple-100 text-purple-400 hover:text-purple-700 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                            </svg>
                          </button>
                        )}
                        {/* Cancelar */}
                        {!isEjecutada && !isCancelada && (isAdmin || row.user_name === userName) && (
                          <button onClick={() => abrirCancelar(row)}
                            title="Cancelar orden"
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
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
      </div>

      {/* ── Ejecutar Modal ── */}
      {ejecutarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setEjecutarModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 text-base mb-1">Marcar como ejecutada</h3>
            <p className="text-sm text-gray-500 mb-5">{ejecutarModal.instrumento}</p>
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Precio ejecutado</label>
                <input type="number" step="0.0001" placeholder="Ej: 98.75"
                  value={ejecutarModal.precio}
                  onChange={e => setEjecutarModal(m => m ? { ...m, precio: e.target.value } : null)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Valor efectivo</label>
                <input type="number" step="0.01" placeholder="Ej: 50000"
                  value={ejecutarModal.valor}
                  onChange={e => setEjecutarModal(m => m ? { ...m, valor: e.target.value } : null)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D3F52]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEjecutarModal(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarEjecutar}
                className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium">
                Confirmar ejecución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancelar Modal ── */}
      {cancelarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setCancelarModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 text-base mb-1">Cancelar orden</h3>
            <p className="text-sm text-gray-500 mb-4">{cancelarModal.instrumento}</p>
            <div className="mb-5">
              <label className="text-xs font-medium text-gray-600 block mb-1">Motivo (opcional)</label>
              <textarea rows={2} placeholder="Instrucciones del cliente, vencimiento, etc."
                value={cancelarModal.motivo}
                onChange={e => setCancelarModal(m => m ? { ...m, motivo: e.target.value } : null)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-400 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCancelarModal(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Volver
              </button>
              <button onClick={confirmarCancelar}
                className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">
                Cancelar orden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Historial Modal ── */}
      {historialModal && (
        <HistorialModal modal={historialModal} onClose={() => setHistorialModal(null)} />
      )}
    </div>
  )
}
