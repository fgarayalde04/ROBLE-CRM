'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string
  user_name: string | null
  user_id: string | null
  client_name: string | null
  client_number: string | null
  to_email: string | null
  subject: string | null
  status: string
  order_count: number
  instruments: string[]
  created_at: string
  sent_at: string | null
}

interface HistoryItem {
  id: string
  order_type: string
  operation_type: string
  instrument_name: string | null
  symbol: string | null
  cusip: string | null
  quantity: string | null
  value_amount: string | null
  price: string | null
  moneda: string | null
  order_date: string | null
  notes: string | null
}

interface DetailEntry extends HistoryEntry {
  body: string | null
  items: HistoryItem[]
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  enviado:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  borrador:  'bg-blue-50 text-blue-700 border-blue-200',
  copiado:   'bg-gray-100 text-gray-600 border-gray-200',
  error:     'bg-red-50 text-red-600 border-red-200',
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
}
const STATUS_LABEL: Record<string, string> = {
  enviado: 'Enviado', borrador: 'Borrador', copiado: 'Copiado', error: 'Error', pendiente: 'Pendiente',
}
const INSTRUMENT_STYLE: Record<string, string> = {
  acciones: 'bg-blue-50 text-blue-700',
  fondos:   'bg-emerald-50 text-emerald-700',
  bonos:    'bg-amber-50 text-amber-700',
}
const INSTRUMENT_LABEL: Record<string, string> = {
  acciones: 'Acciones', fondos: 'Fondos', bonos: 'Bonos',
}
const OP_STYLE: Record<string, string> = {
  compra: 'bg-green-50 text-green-700',
  venta:  'bg-red-50 text-red-600',
}
const ORDER_TYPE_LABEL: Record<string, string> = {
  acciones: 'Renta Variable', fondos: 'Fondo', bonos: 'Renta Fija',
}

// ─── Quick date filters ───────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: 'Hoy',    value: 'today' },
  { label: 'Semana', value: 'week' },
  { label: 'Mes',    value: 'month' },
  { label: 'Todo',   value: '' },
]

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const toDate = now.toISOString().split('T')[0]
  if (preset === 'today') return { from: toDate, to: toDate }
  if (preset === 'week') {
    const from = new Date(now.getTime() - 7 * 86_400_000).toISOString().split('T')[0]
    return { from, to: toDate }
  }
  if (preset === 'month') {
    const from = new Date(now.getTime() - 30 * 86_400_000).toISOString().split('T')[0]
    return { from, to: toDate }
  }
  return { from: '', to: '' }
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCSV(entries: HistoryEntry[]) {
  const headers = ['Fecha', 'Hora', 'Usuario', 'Cliente', 'N° Cliente', 'Destinatario', 'Instrumentos', 'Cantidad', 'Estado']
  const rows = entries.map((e) => [
    format(new Date(e.created_at), 'dd/MM/yyyy'),
    format(new Date(e.created_at), 'HH:mm'),
    e.user_name ?? '',
    e.client_name ?? '',
    e.client_number ?? '',
    e.to_email ?? '',
    (e.instruments ?? []).join(', '),
    String(e.order_count),
    STATUS_LABEL[e.status] ?? e.status,
  ])
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ordenes_${format(new Date(), 'yyyy-MM-dd')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isAdmin: boolean
  userName: string
}

export default function OrderHistorial({ isAdmin, userName }: Props) {
  const [entries, setEntries]     = useState<HistoryEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailMap, setDetailMap] = useState<Record<string, DetailEntry>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  // Filters
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [instrFilter, setInstr]   = useState('')
  const [userFilter, setUser]     = useState('')
  const [datePreset, setDatePreset] = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)      params.set('q', search)
      if (statusFilter) params.set('status', statusFilter)
      if (instrFilter) params.set('instrument', instrFilter)
      if (isAdmin && userFilter) params.set('user', userFilter)
      const range = datePreset ? getDateRange(datePreset) : { from: dateFrom, to: dateTo }
      if (range.from) params.set('dateFrom', range.from)
      if (range.to)   params.set('dateTo',   range.to)

      const res = await fetch(`/api/ordenes?${params.toString()}`)
      const data = await res.json()
      setEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, instrFilter, userFilter, datePreset, dateFrom, dateTo, isAdmin])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Expand / collapse entry — fetch detail on first expand
  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (detailMap[id]) return // already loaded
    setDetailLoading(id)
    try {
      const res = await fetch(`/api/ordenes/${id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailMap((prev) => ({ ...prev, [id]: data }))
      }
    } finally {
      setDetailLoading(null)
    }
  }

  function handleDatePreset(val: string) {
    setDatePreset(val)
    setDateFrom('')
    setDateTo('')
  }

  // Deduplicate users for admin filter
  const uniqueUsers = isAdmin
    ? Array.from(new Set(entries.map((e) => e.user_name).filter(Boolean))) as string[]
    : []

  return (
    <div className="space-y-3">

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#2D3F52]">Historial de órdenes</span>
            {!loading && (
              <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {entries.length} registros
              </span>
            )}
          </div>
          <button
            onClick={() => exportCSV(entries)}
            disabled={entries.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Exportar CSV
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2D3F52] focus:border-[#2D3F52] placeholder-gray-300"
              placeholder="Buscar por cliente, N°, destinatario…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Date quick filters */}
          <div className="flex gap-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => handleDatePreset(p.value)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  datePreset === p.value && p.value !== ''
                    ? 'bg-[#2D3F52] text-white'
                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2D3F52] text-gray-600 bg-white"
          >
            <option value="">Todos los estados</option>
            <option value="enviado">Enviado</option>
            <option value="borrador">Borrador</option>
            <option value="copiado">Copiado</option>
            <option value="error">Error</option>
          </select>

          {/* Instrument */}
          <select
            value={instrFilter}
            onChange={(e) => setInstr(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2D3F52] text-gray-600 bg-white"
          >
            <option value="">Todos los instrumentos</option>
            <option value="acciones">Acciones</option>
            <option value="fondos">Fondos</option>
            <option value="bonos">Bonos</option>
          </select>

          {/* User filter — admin only */}
          {isAdmin && uniqueUsers.length > 0 && (
            <select
              value={userFilter}
              onChange={(e) => setUser(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2D3F52] text-gray-600 bg-white"
            >
              <option value="">Todos los usuarios</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── List ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 text-center">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-400">Cargando historial…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-14 text-center">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-400">No hay órdenes registradas.</p>
            {(search || statusFilter || instrFilter) && (
              <button
                onClick={() => { setSearch(''); setStatus(''); setInstr(''); setUser(''); setDatePreset('') }}
                className="mt-2 text-xs text-blue-500 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {entries.map((entry) => (
              <li key={entry.id}>
                {/* ── Row ── */}
                <button
                  type="button"
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50/60 transition-colors"
                >
                  {/* Date/time */}
                  <div className="shrink-0 w-20">
                    <p className="text-xs font-semibold text-gray-700 leading-tight">
                      {format(new Date(entry.created_at), 'd MMM', { locale: es })}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {format(new Date(entry.created_at), 'HH:mm')}
                    </p>
                    {isAdmin && entry.user_name && (
                      <p className="text-[10px] text-[#16A34A] font-medium truncate max-w-[80px] mt-0.5">
                        {entry.user_name.split(' ')[0]}
                      </p>
                    )}
                  </div>

                  {/* Client info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2D3F52] truncate leading-tight">
                      {entry.client_name || '—'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {entry.client_number && (
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          #{entry.client_number}
                        </span>
                      )}
                      {entry.to_email && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[120px] md:max-w-none">
                          {entry.to_email.split(',')[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Instruments + count */}
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <div className="flex gap-1 flex-wrap justify-end">
                      {(entry.instruments ?? []).map((inst) => (
                        <span key={inst} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${INSTRUMENT_STYLE[inst] ?? 'bg-gray-100 text-gray-500'}`}>
                          {inst}
                        </span>
                      ))}
                    </div>
                    <span className="text-[10px] text-gray-400">{entry.order_count} {entry.order_count === 1 ? 'orden' : 'órdenes'}</span>
                  </div>

                  {/* Status */}
                  <div className="shrink-0 hidden sm:block">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[entry.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {STATUS_LABEL[entry.status] ?? entry.status}
                    </span>
                  </div>

                  {/* Chevron */}
                  <svg
                    className={`w-4 h-4 text-gray-300 shrink-0 transition-transform ${expandedId === entry.id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* ── Detail panel ── */}
                {expandedId === entry.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/30">
                    {detailLoading === entry.id ? (
                      <div className="py-6 text-center text-sm text-gray-400">Cargando detalle…</div>
                    ) : detailMap[entry.id] ? (
                      <DetailPanel entry={detailMap[entry.id]} isAdmin={isAdmin} />
                    ) : (
                      <div className="py-6 text-center text-sm text-gray-400">Sin detalle disponible.</div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ entry, isAdmin }: { entry: DetailEntry; isAdmin: boolean }) {
  const [showBody, setShowBody] = useState(false)

  return (
    <div className="pt-3 space-y-4">

      {/* Meta grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetaField label="Fecha y hora" value={format(new Date(entry.created_at), "d 'de' MMM yyyy HH:mm", { locale: es })} />
        {isAdmin && <MetaField label="Usuario" value={entry.user_name ?? '—'} highlight />}
        <MetaField label="Cliente" value={entry.client_name ?? '—'} />
        <MetaField label="N° cliente" value={entry.client_number ? `#${entry.client_number}` : '—'} mono />
        <MetaField label="Destinatario" value={entry.to_email ?? '—'} />
        <MetaField label="Estado">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[entry.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {STATUS_LABEL[entry.status] ?? entry.status}
          </span>
        </MetaField>
        {entry.sent_at && <MetaField label="Enviado" value={format(new Date(entry.sent_at), "d MMM HH:mm", { locale: es })} />}
      </div>

      {/* Items */}
      {entry.items && entry.items.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
            Detalle de operaciones ({entry.items.length})
          </p>
          <div className="space-y-2">
            {entry.items.map((item, idx) => (
              <div key={item.id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                {/* Number */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5 ${
                  INSTRUMENT_STYLE[item.order_type] ?? 'bg-gray-100 text-gray-600'
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Type + operation */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${INSTRUMENT_STYLE[item.order_type] ?? 'bg-gray-100 text-gray-500'}`}>
                      {ORDER_TYPE_LABEL[item.order_type] ?? item.order_type}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${OP_STYLE[item.operation_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {item.operation_type}
                    </span>
                  </div>
                  {/* Instrument details */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 text-xs">
                    {item.instrument_name && (
                      <span className="col-span-2 md:col-span-1 font-semibold text-[#2D3F52] truncate">{item.instrument_name}</span>
                    )}
                    {item.symbol && <ItemField label="Ticker" value={item.symbol} mono />}
                    {item.cusip && <ItemField label="CUSIP/ISIN" value={item.cusip} mono />}
                    {(item.quantity || item.value_amount) && (
                      <ItemField label={item.order_type === 'fondos' ? 'Monto' : 'Cantidad'} value={`${item.quantity || item.value_amount} ${item.moneda ?? ''}`.trim()} />
                    )}
                    {item.price && <ItemField label="Precio" value={item.price === 'mercado' ? 'A mercado' : `Límite: ${item.price} ${item.moneda ?? ''}`} />}
                    {item.order_date && <ItemField label="Fecha op." value={item.order_date} />}
                    {item.notes && <span className="col-span-2 md:col-span-3 text-gray-500 italic">{item.notes}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email body toggle */}
      {entry.body && (
        <div>
          <button
            onClick={() => setShowBody((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#2D3F52] transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${showBody ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {showBody ? 'Ocultar email' : 'Ver email completo'}
          </button>
          {showBody && (
            <pre className="mt-2 text-xs font-mono text-gray-600 bg-white border border-gray-200 rounded-lg p-4 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
              {entry.body}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function MetaField({ label, value, highlight, mono, children }: {
  label: string; value?: string; highlight?: boolean; mono?: boolean; children?: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      {children ?? (
        <p className={`text-xs truncate ${highlight ? 'text-[#16A34A] font-semibold' : 'text-gray-700'} ${mono ? 'font-mono' : ''}`}>
          {value}
        </p>
      )}
    </div>
  )
}

function ItemField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="text-gray-500">
      <span className="text-[10px] font-semibold text-gray-400">{label}: </span>
      <span className={mono ? 'font-mono text-[10px]' : ''}>{value}</span>
    </span>
  )
}
