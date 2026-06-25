'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderEntry {
  id: string
  orden_id: string | null
  user_name: string | null
  client_name: string | null
  client_number: string | null
  to_email: string | null
  subject: string | null
  status: string
  order_count: number
  instruments: string[]
  confirmacion_cliente: boolean
  orden_ejecutada: boolean
  comentarios: string | null
  summary_text: string | null
  created_at: string
  sent_at: string | null
}

interface OrderItem {
  id: string
  order_id: string
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
  vigencia: string | null
  comision: string | null
  created_at: string
}

interface OrderDetail extends OrderEntry {
  items: OrderItem[]
  body: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INSTR: Record<string, { bg: string; text: string; label: string }> = {
  acciones: { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Acción' },
  fondos:   { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Fondo'  },
  bonos:    { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Bono'   },
}

const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  enviado:  { bg: 'bg-blue-50',  text: 'text-blue-600',  label: 'Enviado'  },
  borrador: { bg: 'bg-gray-100', text: 'text-gray-500',  label: 'Borrador' },
  copiado:  { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Copiado'  },
}

const DATE_PRESETS = [
  { label: 'Hoy',    value: 'today' },
  { label: 'Semana', value: 'week'  },
  { label: 'Mes',    value: 'month' },
  { label: 'Todo',   value: ''      },
]

function getDateRange(p: string) {
  const now = new Date(), today = now.toISOString().split('T')[0]
  if (p === 'today') return { from: today, to: today }
  if (p === 'week')  return { from: new Date(now.getTime() - 7  * 86_400_000).toISOString().split('T')[0], to: today }
  if (p === 'month') return { from: new Date(now.getTime() - 30 * 86_400_000).toISOString().split('T')[0], to: today }
  return { from: '', to: '' }
}

function fmtQty(item: OrderItem) {
  const q = item.quantity || item.value_amount
  return q ? (item.moneda ? `${q} ${item.moneda}` : q) : '—'
}

// ─── CSV export ───────────────────────────────────────────────────────────────

async function exportCSV(entries: OrderEntry[]) {
  let allItems: any[] = []
  try {
    const r = await fetch('/api/ordenes/items?limit=5000')
    allItems = (await r.json()).items ?? []
  } catch { /* ignore */ }

  const entryMap  = new Map(entries.map((e) => [e.id, e]))
  const visibleIds = new Set(entries.map((e) => e.id))
  const rows = allItems.filter((i: any) => visibleIds.has(i.order_id))

  const headers = ['Confirmación Cliente','Orden Ejecutada','Estado','Fecha y Hora','Cliente','N° Cliente','Email','Asunto','Comentarios','Tipo activo','Operación','Instrumento','Ticker/CUSIP','Cantidad','Precio','Vigencia','Comisión','Notas']

  const dataRows = rows.length > 0
    ? rows.map((i: any) => {
        const e = entryMap.get(i.order_id)
        return [
          e?.confirmacion_cliente ? 'Sí' : 'No',
          e?.orden_ejecutada      ? 'Sí' : 'No',
          STATUS[e?.status ?? '']?.label ?? (e?.status ?? ''),
          i.order_created_at ? format(new Date(i.order_created_at), 'dd/MM/yyyy HH:mm') : '',
          e?.client_name   ?? '', e?.client_number ?? '',
          e?.to_email ?? '', e?.subject ?? '', e?.comentarios ?? '',
          INSTR[i.order_type]?.label ?? i.order_type,
          i.operation_type ?? '', i.instrument_name ?? '',
          i.symbol ?? i.cusip ?? '', i.quantity ?? i.value_amount ?? '',
          i.price ?? '', i.vigencia ?? '', i.comision ?? '', i.notes ?? '',
        ]
      })
    : entries.map((e) => [
        e.confirmacion_cliente ? 'Sí' : 'No',
        e.orden_ejecutada      ? 'Sí' : 'No',
        STATUS[e.status]?.label ?? e.status,
        format(new Date(e.created_at), 'dd/MM/yyyy HH:mm'),
        e.client_name ?? '', e.client_number ?? '',
        e.to_email ?? '', e.subject ?? '', e.comentarios ?? '',
        '', '', '', '', '', '', '', '', '',
      ])

  const csv = [headers, ...dataRows]
    .map((r) => r.map((c: any) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `ordenes_${format(new Date(), 'yyyy-MM-dd')}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { isAdmin: boolean; userName: string }

export default function OrderHistorial({ isAdmin, userName }: Props) {
  const [entries, setEntries]   = useState<OrderEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [datePreset, setDatePreset] = useState('')
  const [detailEntry, setDetailEntry]   = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const patching = useRef<Set<string>>(new Set())

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (search) p.set('q', search)
      const range = getDateRange(datePreset)
      if (range.from) p.set('dateFrom', range.from)
      if (range.to)   p.set('dateTo',   range.to)
      const data = await fetch(`/api/ordenes?${p}`).then((r) => r.json())
      setEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch { setEntries([]) }
    finally  { setLoading(false) }
  }, [search, datePreset])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // ── Patch ─────────────────────────────────────────────────────────────────

  async function patchEntry(id: string, updates: Record<string, any>) {
    const key = id + JSON.stringify(updates)
    if (patching.current.has(key)) return
    patching.current.add(key)
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...updates } : e))
    if (detailEntry?.id === id) setDetailEntry((p) => p ? { ...p, ...updates } : p)
    try {
      const res = await fetch(`/api/ordenes/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...updated } : e))
      if (detailEntry?.id === id) setDetailEntry((p) => p ? { ...p, ...updated } : p)
    } catch {
      setEntries((prev) => prev.map((e) => {
        if (e.id !== id) return e
        const rev: any = { ...e }
        for (const k of Object.keys(updates)) rev[k] = !updates[k]
        return rev
      }))
    } finally { patching.current.delete(key) }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteEntry(id: string) {
    if (!confirm('¿Eliminar esta orden del historial? Esta acción no se puede deshacer.')) return
    setEntries((prev) => prev.filter((e) => e.id !== id))
    if (detailEntry?.id === id) setDetailEntry(null)
    const res = await fetch(`/api/ordenes/${id}`, { method: 'DELETE' })
    if (!res.ok) fetchEntries() // revert on error
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  async function openDetail(entry: OrderEntry) {
    setDetailEntry({ ...entry, items: [], body: null })
    setDetailLoading(true)
    try {
      const data = await fetch(`/api/ordenes/${entry.id}`).then((r) => r.json())
      setDetailEntry({ ...data, items: data.items ?? [] })
    } catch {
      setDetailEntry((p) => p ? { ...p, body: null, items: [] } : null)
    } finally { setDetailLoading(false) }
  }

  function canEdit(entry: OrderEntry) { return isAdmin || entry.user_name === userName }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-3">

        {/* Toolbar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#2D3F52]">Historial de órdenes</span>
              {!loading && (
                <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {entries.length} {entries.length === 1 ? 'orden' : 'órdenes'}
                </span>
              )}
            </div>
            <button
              onClick={() => exportCSV(entries)}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>
          </div>

          <div className="px-4 md:px-5 py-3 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2D3F52] placeholder-gray-300"
                placeholder="Buscar cliente, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setDatePreset(p.value)}
                  className={[
                    'px-2.5 py-1.5 text-xs font-medium rounded-lg transition',
                    datePreset === p.value
                      ? 'bg-[#2D3F52] text-white'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Cargando historial…</p>
            </div>
          ) : entries.length === 0 ? (
            <EmptyState onClear={() => { setSearch(''); setDatePreset('') }} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <Th>Fecha</Th>
                    <Th>Cliente</Th>
                    <Th center>Confirm.</Th>
                    <Th center>Ejecutada</Th>
                    <Th>Resumen</Th>
                    <Th>Comentarios</Th>
                    <Th center>Acciones</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      canEdit={canEdit(entry)}
                      onPatch={patchEntry}
                      onDetail={openDetail}
                      onDelete={deleteEntry}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailEntry && (
        <DetailPanel
          entry={detailEntry}
          loading={detailLoading}
          canEdit={canEdit(detailEntry)}
          onPatch={patchEntry}
          onClose={() => setDetailEntry(null)}
        />
      )}
    </>
  )
}

// ─── Th ───────────────────────────────────────────────────────────────────────

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider ${center ? 'text-center' : 'text-left'}`}>
      {children}
    </th>
  )
}

// ─── Entry Row ────────────────────────────────────────────────────────────────

function EntryRow({
  entry, canEdit, onPatch, onDetail, onDelete,
}: {
  entry: OrderEntry
  canEdit: boolean
  onPatch: (id: string, u: Record<string, any>) => void
  onDetail: (e: OrderEntry) => void
  onDelete: (id: string) => void
}) {
  const [editComment, setEditComment]   = useState(false)
  const [commentVal, setCommentVal]     = useState(entry.comentarios ?? '')
  const commentRef = useRef<HTMLInputElement>(null)
  const st = STATUS[entry.status] ?? STATUS.copiado

  function saveComment() {
    const v = commentVal.trim() || null
    if (v !== entry.comentarios) onPatch(entry.id, { comentarios: v })
    setEditComment(false)
  }

  return (
    <tr className="group hover:bg-gray-50/50 transition-colors">

      {/* Fecha */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <p className="text-[13px] font-semibold text-gray-800">
          {format(new Date(entry.created_at), 'd MMM yyyy', { locale: es })}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-gray-400">{format(new Date(entry.created_at), 'HH:mm')}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${st.bg} ${st.text}`}>{st.label}</span>
        </div>
      </td>

      {/* Cliente */}
      <td className="px-4 py-3.5">
        <p className="text-[13px] font-semibold text-[#2D3F52] truncate max-w-[160px]">
          {entry.client_name || <span className="text-gray-300 font-normal">Sin nombre</span>}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {entry.client_number && (
            <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {entry.client_number}
            </span>
          )}
          {entry.to_email && (
            <span className="text-[10px] text-gray-400 truncate max-w-[140px]">{entry.to_email}</span>
          )}
        </div>
      </td>

      {/* Confirmación cliente */}
      <td className="px-4 py-3.5 text-center">
        <Check
          checked={entry.confirmacion_cliente}
          canEdit={canEdit}
          color="emerald"
          onToggle={() => onPatch(entry.id, { confirmacion_cliente: !entry.confirmacion_cliente })}
        />
      </td>

      {/* Orden ejecutada */}
      <td className="px-4 py-3.5 text-center">
        <Check
          checked={entry.orden_ejecutada}
          canEdit={canEdit}
          color="blue"
          onToggle={() => onPatch(entry.id, { orden_ejecutada: !entry.orden_ejecutada })}
        />
      </td>

      {/* Resumen */}
      <td className="px-4 py-3.5 max-w-[220px]">
        <p className="text-[12px] text-gray-600 truncate">{entry.summary_text || '—'}</p>
        {entry.instruments?.length > 0 && (
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {Array.from(new Set(entry.instruments)).map((k) => {
              const s = INSTR[k]; if (!s) return null
              return (
                <span key={k} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
                  {s.label}
                </span>
              )
            })}
          </div>
        )}
      </td>

      {/* Comentarios */}
      <td className="px-4 py-3.5 w-[160px]">
        {editComment ? (
          <input
            ref={commentRef}
            autoFocus
            className="w-full text-xs px-2 py-1 rounded border border-blue-300 focus:outline-none"
            value={commentVal}
            onChange={(e) => setCommentVal(e.target.value)}
            onBlur={saveComment}
            onKeyDown={(e) => { if (e.key === 'Enter') saveComment(); if (e.key === 'Escape') setEditComment(false) }}
          />
        ) : (
          <div
            onClick={() => canEdit && (setCommentVal(entry.comentarios ?? ''), setEditComment(true))}
            className={`text-xs min-h-[20px] rounded px-1.5 py-1 leading-snug ${canEdit ? 'cursor-pointer hover:bg-gray-100' : ''}`}
          >
            {entry.comentarios
              ? <span className="text-gray-700">{entry.comentarios}</span>
              : canEdit
                ? <span className="text-gray-300 italic">Agregar…</span>
                : <span className="text-gray-300">—</span>
            }
          </div>
        )}
      </td>

      {/* Acciones */}
      <td className="px-4 py-3.5 text-center">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onDetail(entry)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition px-2 py-1 rounded hover:bg-blue-50"
          >
            Ver
          </button>
          {canEdit && (
            <button
              onClick={() => onDelete(entry.id)}
              className="text-[11px] font-semibold text-gray-400 hover:text-red-500 transition px-2 py-1 rounded hover:bg-red-50"
              title="Eliminar"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Check ────────────────────────────────────────────────────────────────────

function Check({ checked, canEdit, color, onToggle }: {
  checked: boolean; canEdit: boolean; color: 'emerald' | 'blue'; onToggle: () => void
}) {
  const on  = color === 'emerald' ? 'bg-emerald-500 border-emerald-500' : 'bg-blue-500 border-blue-500'
  const hov = color === 'emerald' ? 'hover:border-emerald-400' : 'hover:border-blue-400'
  return (
    <div className="flex justify-center">
      <button
        onClick={() => canEdit && onToggle()}
        disabled={!canEdit}
        className={[
          'w-5 h-5 rounded flex items-center justify-center border-2 transition-all focus:outline-none',
          checked ? on : `border-gray-300 ${canEdit ? hov : 'opacity-50 cursor-default'}`,
        ].join(' ')}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ entry, loading, canEdit, onPatch, onClose }: {
  entry: OrderDetail; loading: boolean; canEdit: boolean
  onPatch: (id: string, u: Record<string, any>) => void; onClose: () => void
}) {
  const [commentDraft, setCommentDraft]   = useState(entry.comentarios ?? '')
  const [savingComment, setSavingComment] = useState(false)
  const st = STATUS[entry.status] ?? STATUS.copiado

  useEffect(() => { setCommentDraft(entry.comentarios ?? '') }, [entry.comentarios])

  async function saveComment() {
    const v = commentDraft.trim() || null
    if (v === entry.comentarios) return
    setSavingComment(true)
    await onPatch(entry.id, { comentarios: v })
    setSavingComment(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-[#2D3F52]">Detalle de orden</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.bg} ${st.text}`}>{st.label}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Meta */}
          <div className="px-5 py-4 border-b border-gray-100 space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Meta label="Fecha"    value={format(new Date(entry.created_at), "d 'de' MMMM yyyy, HH:mm", { locale: es })} />
              <Meta label="Cliente"  value={entry.client_name ?? '—'} />
              <Meta label="N° Cliente" value={entry.client_number ?? '—'} />
              <Meta label="Email destino" value={entry.to_email ?? '—'} />
            </div>

            {/* Checks */}
            <div className="flex gap-6 pt-1">
              <label className={`flex items-center gap-2 ${canEdit ? 'cursor-pointer' : ''}`}>
                <Check checked={entry.confirmacion_cliente} canEdit={canEdit} color="emerald"
                  onToggle={() => onPatch(entry.id, { confirmacion_cliente: !entry.confirmacion_cliente })} />
                <span className="text-[12px] font-semibold text-gray-700">Confirmación cliente</span>
              </label>
              <label className={`flex items-center gap-2 ${canEdit ? 'cursor-pointer' : ''}`}>
                <Check checked={entry.orden_ejecutada} canEdit={canEdit} color="blue"
                  onToggle={() => onPatch(entry.id, { orden_ejecutada: !entry.orden_ejecutada })} />
                <span className="text-[12px] font-semibold text-gray-700">Orden ejecutada</span>
              </label>
            </div>

            {/* Comentarios */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Comentarios</p>
              {canEdit ? (
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#2D3F52] resize-none"
                    placeholder="Agregar comentario…"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                  />
                  <button
                    onClick={saveComment}
                    disabled={savingComment || commentDraft === (entry.comentarios ?? '')}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#2D3F52] text-white disabled:opacity-40 transition self-start"
                  >
                    {savingComment ? '…' : 'Guardar'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 min-h-[40px]">
                  {entry.comentarios || <span className="text-gray-300 italic">Sin comentarios</span>}
                </p>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
              Instrucciones ({entry.items?.length ?? 0})
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                Cargando…
              </div>
            ) : entry.items?.length > 0 ? (
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Tipo','Op.','Instrumento','Cantidad','Precio','Vigencia','Comisión'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {entry.items.map((item) => {
                      const s = INSTR[item.order_type]
                      return (
                        <tr key={item.id} className="hover:bg-gray-50/60">
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s?.bg ?? 'bg-gray-100'} ${s?.text ?? 'text-gray-600'}`}>
                              {s?.label ?? item.order_type}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${item.operation_type === 'compra' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                              {item.operation_type}
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[150px]">
                            <p className="font-semibold text-[#2D3F52] truncate">{item.instrument_name ?? '—'}</p>
                            {(item.symbol || item.cusip) && <p className="text-[10px] font-mono text-gray-400">{item.symbol ?? item.cusip}</p>}
                          </td>
                          <td className="px-3 py-2 font-mono">{fmtQty(item)}</td>
                          <td className="px-3 py-2 text-gray-600">{item.price ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.vigencia === 'GTC' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                              {item.vigencia ?? 'DIA'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500">{item.comision ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin instrucciones detalladas.</p>
            )}
          </div>

          {/* Email body */}
          {entry.body && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Cuerpo del mail</p>
              <pre className="text-[11px] text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg px-4 py-3 border border-gray-100 leading-relaxed font-sans">
                {entry.body}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[12px] font-medium text-gray-700 truncate">{value}</p>
    </div>
  )
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="py-16 text-center">
      <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
      <p className="text-sm text-gray-400">No hay órdenes registradas.</p>
      <button onClick={onClear} className="mt-2 text-xs text-blue-500 hover:underline">Limpiar filtros</button>
    </div>
  )
}
