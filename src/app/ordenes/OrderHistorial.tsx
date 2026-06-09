'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { FlatItem } from '@/app/api/ordenes/items/route'

// ─── Constants ────────────────────────────────────────────────────────────────

const INSTRUMENT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  acciones: { bg: 'bg-blue-50',    text: 'text-blue-700',   label: 'Acción' },
  fondos:   { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Fondo' },
  bonos:    { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Bono' },
}

const OP_STYLE: Record<string, { bg: string; text: string }> = {
  compra: { bg: 'bg-green-50',  text: 'text-green-700' },
  venta:  { bg: 'bg-red-50',    text: 'text-red-600' },
}

const DATE_PRESETS = [
  { label: 'Hoy',    value: 'today' },
  { label: 'Semana', value: 'week' },
  { label: 'Mes',    value: 'month' },
  { label: 'Todo',   value: '' },
]

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') {
    return { from: new Date(now.getTime() - 7 * 86_400_000).toISOString().split('T')[0], to: today }
  }
  if (preset === 'month') {
    return { from: new Date(now.getTime() - 30 * 86_400_000).toISOString().split('T')[0], to: today }
  }
  return { from: '', to: '' }
}

function qty(item: FlatItem): string {
  const q = item.quantity || item.value_amount
  if (!q) return '—'
  return item.moneda ? `${q} ${item.moneda}` : q
}

function exportCSV(items: FlatItem[]) {
  const headers = ['Hecho', 'Cantidad', 'Tipo operación', 'Tipo activo', 'Nombre', 'Ticker/CUSIP', 'Cliente', 'N° cliente', 'Usuario', 'Fecha y hora']
  const rows = items.map((i) => [
    i.done ? 'Realizado' : 'Pendiente',
    qty(i),
    i.operation_type,
    INSTRUMENT_STYLE[i.order_type]?.label ?? i.order_type,
    i.instrument_name ?? '',
    i.symbol ?? i.cusip ?? '',
    i.client_name ?? '',
    i.client_number ?? '',
    i.user_name ?? '',
    format(new Date(i.order_created_at), 'dd/MM/yyyy HH:mm'),
  ])
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `operaciones_${format(new Date(), 'yyyy-MM-dd')}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { isAdmin: boolean; userName: string }

export default function OrderHistorial({ isAdmin, userName }: Props) {
  const [items, setItems]       = useState<FlatItem[]>([])
  const [loading, setLoading]   = useState(true)

  // Done filter tabs
  const [doneTab, setDoneTab]   = useState<'all' | 'pending' | 'done'>('all')

  // Other filters
  const [search, setSearch]     = useState('')
  const [instrFilter, setInstr] = useState('')
  const [userFilter, setUser]   = useState('')
  const [datePreset, setDatePreset] = useState('month')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  // Track in-flight toggles to prevent double-click
  const toggling = useRef<Set<string>>(new Set())

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (doneTab === 'pending') params.set('done', 'false')
      if (doneTab === 'done')    params.set('done', 'true')
      if (instrFilter)           params.set('instrument', instrFilter)
      if (isAdmin && userFilter) params.set('user', userFilter)
      const range = datePreset ? getDateRange(datePreset) : { from: dateFrom, to: dateTo }
      if (range.from) params.set('dateFrom', range.from)
      if (range.to)   params.set('dateTo', range.to)

      const res  = await fetch(`/api/ordenes/items?${params.toString()}`)
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [doneTab, instrFilter, userFilter, datePreset, dateFrom, dateTo, isAdmin])

  useEffect(() => { fetchItems() }, [fetchItems])

  // ── Done toggle ────────────────────────────────────────────────────────────

  async function toggleDone(itemId: string, current: boolean) {
    if (toggling.current.has(itemId)) return
    toggling.current.add(itemId)

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => i.id === itemId ? { ...i, done: !current, done_by: !current ? userName : null } : i)
    )

    try {
      const res = await fetch(`/api/ordenes/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !current }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setItems((prev) =>
        prev.map((i) => i.id === itemId ? { ...i, done: updated.done, done_by: updated.done_by, done_at: updated.done_at } : i)
      )
    } catch {
      // Revert on error
      setItems((prev) =>
        prev.map((i) => i.id === itemId ? { ...i, done: current } : i)
      )
    } finally {
      toggling.current.delete(itemId)
    }
  }

  // ── Client-side search ─────────────────────────────────────────────────────

  const q = search.toLowerCase().trim()
  const displayItems = q
    ? items.filter((i) =>
        (i.client_name?.toLowerCase().includes(q)) ||
        (i.client_number?.toLowerCase().includes(q)) ||
        (i.instrument_name?.toLowerCase().includes(q)) ||
        (i.symbol?.toLowerCase().includes(q)) ||
        (i.cusip?.toLowerCase().includes(q))
      )
    : items

  // Admin user list for filter
  const uniqueUsers = isAdmin
    ? Array.from(new Set(items.map((i) => i.user_name).filter(Boolean))) as string[]
    : []

  function canToggle(item: FlatItem) {
    return isAdmin || item.user_name === userName
  }

  function handleDatePreset(val: string) {
    setDatePreset(val)
    setDateFrom('')
    setDateTo('')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

        {/* Header row: title + export */}
        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-[#2D3F52]">Historial de órdenes</span>
            {!loading && (
              <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {displayItems.length} operaciones
              </span>
            )}
          </div>
          <button
            onClick={() => exportCSV(displayItems)}
            disabled={displayItems.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
        </div>

        {/* Done tabs */}
        <div className="flex items-center gap-px px-4 md:px-5 pt-3 border-b border-gray-100">
          {[
            { key: 'all',     label: 'Todas' },
            { key: 'pending', label: 'Pendientes' },
            { key: 'done',    label: 'Realizadas' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDoneTab(key as typeof doneTab)}
              className={[
                'px-4 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px',
                doneTab === key
                  ? 'border-[#2D3F52] text-[#2D3F52]'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="px-4 md:px-5 py-3 flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2D3F52] placeholder-gray-300"
              placeholder="Cliente, instrumento, ticker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Date presets */}
          <div className="flex gap-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => handleDatePreset(p.value)}
                className={[
                  'px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  datePreset === p.value
                    ? 'bg-[#2D3F52] text-white'
                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Instrument type */}
          <select
            value={instrFilter}
            onChange={(e) => setInstr(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2D3F52] text-gray-600 bg-white"
          >
            <option value="">Todos los activos</option>
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
              {uniqueUsers.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 text-center">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-400">Cargando operaciones…</p>
          </div>
        ) : displayItems.length === 0 ? (
          <EmptyState onClear={() => { setSearch(''); setInstr(''); setUser(''); setDoneTab('all') }} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="pl-5 pr-3 py-2.5 text-left w-10">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hecho</span>
                    </th>
                    <th className="px-3 py-2.5 text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cantidad</span>
                    </th>
                    <th className="px-3 py-2.5 text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tipo op.</span>
                    </th>
                    <th className="px-3 py-2.5 text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Activo</span>
                    </th>
                    <th className="px-3 py-2.5 text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nombre</span>
                    </th>
                    <th className="px-3 py-2.5 text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cliente</span>
                    </th>
                    <th className="px-3 py-2.5 text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">N° cliente</span>
                    </th>
                    {isAdmin && (
                      <th className="px-3 py-2.5 text-left">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Asesor</span>
                      </th>
                    )}
                    <th className="px-3 py-2.5 pr-5 text-right">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha y hora</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayItems.map((item) => (
                    <DesktopRow
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      canToggle={canToggle(item)}
                      onToggle={toggleDone}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {displayItems.map((item) => (
                <MobileCard
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  canToggle={canToggle(item)}
                  onToggle={toggleDone}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Desktop row ──────────────────────────────────────────────────────────────

function DesktopRow({
  item, isAdmin, canToggle, onToggle,
}: {
  item: FlatItem
  isAdmin: boolean
  canToggle: boolean
  onToggle: (id: string, current: boolean) => void
}) {
  const instr = INSTRUMENT_STYLE[item.order_type]
  const op    = OP_STYLE[item.operation_type]

  return (
    <tr className={`group transition-colors hover:bg-gray-50/60 ${item.done ? 'bg-gray-50/40' : ''}`}>
      {/* Checkbox */}
      <td className="pl-5 pr-3 py-3">
        <button
          onClick={() => canToggle && onToggle(item.id, item.done)}
          disabled={!canToggle}
          className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all focus:outline-none ${
            item.done
              ? 'bg-[#16A34A] border-[#16A34A]'
              : canToggle
                ? 'border-gray-300 hover:border-[#16A34A] group-hover:border-gray-400'
                : 'border-gray-200 cursor-default'
          }`}
          title={
            !canToggle ? 'Sin permisos'
            : item.done ? `Marcado por ${item.done_by ?? '?'}`
            : 'Marcar como realizado'
          }
        >
          {item.done && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </button>
      </td>

      {/* Quantity */}
      <td className="px-3 py-3">
        <span className={`text-sm font-mono ${item.done ? 'text-gray-400' : 'text-gray-700'}`}>
          {qty(item)}
        </span>
      </td>

      {/* Operation */}
      <td className="px-3 py-3">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase ${op?.bg ?? 'bg-gray-100'} ${op?.text ?? 'text-gray-600'}`}>
          {item.operation_type}
        </span>
      </td>

      {/* Asset type */}
      <td className="px-3 py-3">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${instr?.bg ?? 'bg-gray-100'} ${instr?.text ?? 'text-gray-600'}`}>
          {instr?.label ?? item.order_type}
        </span>
      </td>

      {/* Name */}
      <td className="px-3 py-3 max-w-[200px]">
        <p className={`text-sm font-semibold leading-tight truncate ${item.done ? 'text-gray-400' : 'text-[#2D3F52]'}`}>
          {item.instrument_name ?? '—'}
        </p>
        {item.symbol && (
          <p className="text-[10px] font-mono text-gray-400 mt-0.5">{item.symbol}</p>
        )}
        {!item.symbol && item.cusip && (
          <p className="text-[10px] font-mono text-gray-400 mt-0.5">{item.cusip}</p>
        )}
      </td>

      {/* Client */}
      <td className="px-3 py-3">
        <span className={`text-sm ${item.done ? 'text-gray-400' : 'text-gray-700'} truncate max-w-[140px] block`}>
          {item.client_name ?? '—'}
        </span>
      </td>

      {/* Client number */}
      <td className="px-3 py-3">
        {item.client_number ? (
          <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            {item.client_number}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      {/* Advisor — admin only */}
      {isAdmin && (
        <td className="px-3 py-3">
          <span className="text-[11px] text-[#16A34A] font-medium">
            {item.user_name?.split(' ')[0] ?? '—'}
          </span>
        </td>
      )}

      {/* Date */}
      <td className="px-3 py-3 pr-5 text-right whitespace-nowrap">
        <p className={`text-[12px] font-semibold ${item.done ? 'text-gray-400' : 'text-gray-700'}`}>
          {format(new Date(item.order_created_at), 'd MMM yyyy', { locale: es })}
        </p>
        <p className="text-[10px] text-gray-400">
          {format(new Date(item.order_created_at), 'HH:mm')}
        </p>
      </td>
    </tr>
  )
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function MobileCard({
  item, isAdmin, canToggle, onToggle,
}: {
  item: FlatItem
  isAdmin: boolean
  canToggle: boolean
  onToggle: (id: string, current: boolean) => void
}) {
  const instr = INSTRUMENT_STYLE[item.order_type]
  const op    = OP_STYLE[item.operation_type]

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 ${item.done ? 'bg-gray-50/60' : ''}`}>
      {/* Checkbox */}
      <button
        onClick={() => canToggle && onToggle(item.id, item.done)}
        disabled={!canToggle}
        className={`mt-0.5 w-6 h-6 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
          item.done
            ? 'bg-[#16A34A] border-[#16A34A]'
            : canToggle
              ? 'border-gray-300 active:border-[#16A34A]'
              : 'border-gray-200'
        }`}
      >
        {item.done && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Line 1: instrument + badges */}
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className={`font-semibold text-[13px] truncate ${item.done ? 'text-gray-400 line-through' : 'text-[#2D3F52]'}`}>
            {item.instrument_name ?? '—'}
          </span>
          {item.symbol && (
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 py-0.5 rounded">
              {item.symbol}
            </span>
          )}
        </div>

        {/* Line 2: qty + type badges + client */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="font-mono text-gray-600 font-semibold">{qty(item)}</span>
          <span className="text-gray-300">·</span>
          <span className={`font-bold px-1.5 py-0.5 rounded uppercase ${op?.bg ?? ''} ${op?.text ?? ''}`}>
            {item.operation_type}
          </span>
          <span className={`font-semibold px-1.5 py-0.5 rounded ${instr?.bg ?? ''} ${instr?.text ?? ''}`}>
            {instr?.label ?? item.order_type}
          </span>
        </div>

        {/* Line 3: client + date */}
        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400 flex-wrap">
          {item.client_name && <span className="font-medium text-gray-600">{item.client_name}</span>}
          {item.client_number && (
            <span className="font-mono bg-gray-100 px-1 rounded">{item.client_number}</span>
          )}
          <span className="text-gray-300">·</span>
          <span>{format(new Date(item.order_created_at), 'd MMM HH:mm', { locale: es })}</span>
          {isAdmin && item.user_name && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-[#16A34A] font-medium">{item.user_name.split(' ')[0]}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="py-14 text-center">
      <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm text-gray-400">No hay operaciones registradas.</p>
      <button
        onClick={onClear}
        className="mt-2 text-xs text-blue-500 hover:underline"
      >
        Limpiar filtros
      </button>
    </div>
  )
}
