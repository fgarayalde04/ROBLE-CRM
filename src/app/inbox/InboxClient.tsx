'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { AccountOpening, OpeningStatus } from '@/types/platform'

type ClientPartial = {
  id: string
  client_number: string
  first_name: string
  last_name: string
  status: string
  advisor: string | null
  created_at: string
  updated_at: string
}

type TodayEvent = {
  id: string
  title: string
  type: string
  event_date: string
  start_time: string | null
  end_time: string | null
  description: string | null
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskRow = {
  id: string
  title: string
  description: string | null
  client_id: string | null
  clients: { first_name: string; last_name: string } | null
  responsible: string | null
  priority: 'baja' | 'media' | 'alta' | 'urgente'
  status: 'pendiente' | 'en_proceso' | 'bloqueado' | 'completado'
  due_date: string | null
  notes: string | null
  opening_id: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  updated_at: string
}

type OpeningRow = AccountOpening & {
  client: Pick<ClientPartial, 'id' | 'first_name' | 'last_name'> | null
}

interface InboxData {
  tasks: TaskRow[]
  openings: OpeningRow[]
  bcu_incomplete: number
  clients_recent: ClientPartial[]
  summary: {
    overdue_tasks: number
    urgent_tasks: number
    open_tasks: number
    stalled_openings: number
    new_clients_30d: number
    bcu_incomplete: number
  }
}

type FilterKey =
  | 'todos'
  | 'vencidas'
  | 'urgentes'
  | 'hoy'
  | 'semana'
  | 'sin_responsable'
  | 'aperturas'
  | 'bcu'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  urgente: 'bg-red-500',
  alta: 'bg-orange-400',
  media: 'bg-amber-400',
  baja: 'bg-gray-300',
}

const STATUS_LABEL: Partial<Record<OpeningStatus, string>> = {
  carpeta_creada: 'Pendiente de apertura',
  recolectando_informacion: 'Recolectando info',
  documentacion_incompleta: 'Doc. incompleta',
  documentacion_completa: 'Doc. completa',
  formularios_enviados: 'Form. enviados',
  enviado_al_banco: 'Enviado al banco',
  en_revision_banco: 'En revisión banco',
  trabado: 'Trabado',
}

function getDateLabel(dateStr: string | null): {
  text: string
  cls: string
} {
  if (!dateStr) return { text: '—', cls: 'text-gray-400' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d < today) {
    const diff = Math.ceil((today.getTime() - d.getTime()) / 86400000)
    return { text: `Venció hace ${diff}d`, cls: 'text-red-600 font-medium' }
  }
  if (d.getTime() === today.getTime()) {
    return { text: 'Hoy', cls: 'text-amber-600 font-medium' }
  }
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return {
    text: `${d.getDate()} ${months[d.getMonth()]}`,
    cls: 'text-gray-400',
  }
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// ─── Priority selector ────────────────────────────────────────────────────────

const PRIORITIES: TaskRow['priority'][] = ['urgente', 'alta', 'media', 'baja']

function PrioritySelector({
  taskId,
  current,
  onUpdate,
}: {
  taskId: string
  current: TaskRow['priority']
  onUpdate: (id: string, priority: TaskRow['priority']) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
        title="Cambiar prioridad"
      >
        ↑
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-[110px]">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => {
                onUpdate(taskId, p)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                p === current ? 'font-semibold text-[#2D3F52]' : 'text-gray-700'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const EVENT_TYPE_COLOR: Record<string, string> = {
  reunion:     'bg-blue-100 text-blue-700 border-blue-200',
  llamada:     'bg-green-100 text-green-700 border-green-200',
  vencimiento: 'bg-red-100 text-red-700 border-red-200',
  seguimiento: 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

interface EmailPreview {
  id: string
  threadId: string
  fromName: string
  fromEmail: string
  subject: string
  snippet: string
  date: string
  isUnread: boolean
}

function emailTimeLabel(isoDate: string): string {
  const d = new Date(isoDate)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' })
}

export default function InboxClient({ initialData, todayEvents = [] }: { initialData: InboxData; todayEvents?: TodayEvent[] }) {
  const [data, setData] = useState<InboxData>(initialData)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('todos')
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [emails, setEmails] = useState<EmailPreview[]>([])
  const [emailsLoading, setEmailsLoading] = useState(false)

  useEffect(() => {
    setEmailsLoading(true)
    fetch('/api/gmail/inbox')
      .then((r) => r.json())
      .then((d) => setEmails((d.messages ?? []).slice(0, 5)))
      .catch(() => {})
      .finally(() => setEmailsLoading(false))
  }, [])

  // Auto-refresh every 60 seconds
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/inbox', { cache: 'no-store' })
      if (res.ok) {
        const fresh = (await res.json()) as InboxData
        setData(fresh)
      }
    } catch {
      // silent fail
    }
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  // ── Derived dates ──
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  // ── Filter tasks ──
  const filteredTasks = data.tasks.filter((t) => {
    if (activeFilter === 'vencidas') return t.due_date && t.due_date < todayStr
    if (activeFilter === 'urgentes') return t.priority === 'urgente'
    if (activeFilter === 'hoy') return t.due_date === todayStr
    if (activeFilter === 'semana')
      return t.due_date && t.due_date >= todayStr && t.due_date <= weekEndStr
    if (activeFilter === 'sin_responsable') return !t.responsible
    if (activeFilter === 'aperturas') return false
    if (activeFilter === 'bcu') return false
    return true
  })

  const showOpenings =
    activeFilter === 'todos' || activeFilter === 'aperturas'
  const showBcu =
    (activeFilter === 'todos' || activeFilter === 'bcu') &&
    data.bcu_incomplete > 0

  // ── Sort tasks: overdue → urgent → today → this week → rest ──
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const rank = (t: TaskRow) => {
      if (t.due_date && t.due_date < todayStr) return 0
      if (t.priority === 'urgente') return 1
      if (t.due_date === todayStr) return 2
      if (t.due_date && t.due_date <= weekEndStr) return 3
      return 4
    }
    const diff = rank(a) - rank(b)
    if (diff !== 0) return diff
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return a.created_at.localeCompare(b.created_at)
  })

  // ── Actions ──
  async function completeTask(id: string) {
    setCompleting((prev) => new Set(prev).add(id))
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'completado' }),
      })
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== id),
        summary: {
          ...prev.summary,
          open_tasks: Math.max(0, prev.summary.open_tasks - 1),
        },
      }))
    } finally {
      setCompleting((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function updatePriority(id: string, priority: TaskRow['priority']) {
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, priority }),
    })
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? { ...t, priority } : t)),
    }))
  }

  const { summary } = data

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'vencidas', label: 'Vencidas' },
    { key: 'urgentes', label: 'Urgentes' },
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Esta semana' },
    { key: 'sin_responsable', label: 'Sin responsable' },
    { key: 'aperturas', label: 'Aperturas' },
    { key: 'bcu', label: 'Banco Central' },
  ]

  const allEmpty =
    sortedTasks.length === 0 &&
    (!showOpenings || data.openings.length === 0) &&
    !showBcu

  return (
    <div className="p-8 min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#2D3F52]">Inbox operativo</h1>
        <p className="mt-0.5 text-sm text-gray-500">Todo lo pendiente de la empresa</p>
      </div>

      {/* Hoy en agenda */}
      {todayEvents.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/events" className="text-xs font-semibold text-[#2D3F52] hover:underline">
              Hoy en agenda
            </Link>
            <span className="text-xs text-gray-400">({todayEvents.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {todayEvents.map((ev) => {
              const colorCls = EVENT_TYPE_COLOR[ev.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'
              const timeStr = ev.start_time ? ev.start_time.slice(0, 5) + ' · ' : ''
              return (
                <span
                  key={ev.id}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${colorCls}`}
                  title={ev.description ?? undefined}
                >
                  {timeStr}{ev.title}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Últimos emails */}
      <div className="mb-5 bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EEF0F4] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-semibold text-[#2D3F52]">Últimos emails</span>
          </div>
          <Link href="/mail" className="text-[11px] text-blue-600 hover:underline font-medium">
            Ver todos →
          </Link>
        </div>

        {emailsLoading ? (
          <div className="px-4 py-4 text-xs text-gray-400 animate-pulse">Cargando…</div>
        ) : emails.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <p className="text-xs text-gray-400">No hay emails recientes.</p>
            <Link href="/mail" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
              Ir a Mail
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-[#EEF0F4]">
            {emails.map((m) => (
              <li key={m.id}>
                <Link
                  href="/mail"
                  className="flex items-start gap-3 px-4 py-3 hover:bg-[#F9FAFB] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-[12px] truncate ${m.isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                        {m.subject}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        <span className="text-[10px] text-gray-400">{emailTimeLabel(m.date)}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      <span className="font-medium">{m.fromName || m.fromEmail}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="text-gray-400">{m.snippet}</span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-5">
        {summary.overdue_tasks > 0 && (
          <button
            onClick={() => setActiveFilter('vencidas')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            {summary.overdue_tasks} Vencidas
          </button>
        )}
        {summary.urgent_tasks > 0 && (
          <button
            onClick={() => setActiveFilter('urgentes')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            {summary.urgent_tasks} Urgentes
          </button>
        )}
        <button
          onClick={() => setActiveFilter('todos')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
          {summary.open_tasks} Abiertas
        </button>
        {summary.stalled_openings > 0 && (
          <button
            onClick={() => setActiveFilter('aperturas')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
            {summary.stalled_openings} Aperturas
          </button>
        )}
        {summary.bcu_incomplete > 0 && (
          <button
            onClick={() => setActiveFilter('bcu')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
            {summary.bcu_incomplete} BCU incompletos
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              activeFilter === f.key
                ? 'bg-[#2D3F52] text-white border-[#2D3F52]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {allEmpty ? (
          <div className="px-6 py-16 text-center">
            <div className="text-4xl mb-3">✓</div>
            <p className="text-lg font-medium text-gray-700">Todo al día</p>
            <p className="text-sm text-gray-400 mt-1">
              No hay elementos pendientes en esta vista
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Task rows */}
            {sortedTasks.map((t) => {
              const isOverdue = t.due_date && t.due_date < todayStr
              const isToday = t.due_date === todayStr
              const clientName = t.clients
                ? `${t.clients.first_name} ${t.clients.last_name}`
                : null
              const dateLabel = getDateLabel(t.due_date)

              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group ${
                    isOverdue ? 'bg-red-50/30' : isToday ? 'bg-amber-50/20' : ''
                  }`}
                >
                  {/* Priority dot */}
                  <span
                    className={`flex-shrink-0 w-2 h-2 rounded-full ${PRIORITY_DOT[t.priority]}`}
                  />

                  {/* Complete button */}
                  <button
                    onClick={() => completeTask(t.id)}
                    disabled={completing.has(t.id)}
                    className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 transition-colors flex items-center justify-center disabled:opacity-50"
                    title="Marcar como completada"
                  >
                    {completing.has(t.id) && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </button>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {t.title}
                      </span>
                      {clientName && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                          {clientName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Due date */}
                  <span className={`text-xs flex-shrink-0 ${dateLabel.cls}`}>
                    {dateLabel.text}
                  </span>

                  {/* Responsible */}
                  <span
                    className={`text-xs flex-shrink-0 px-2 py-0.5 rounded ${
                      t.responsible
                        ? 'text-gray-500 bg-gray-100'
                        : 'text-amber-600 bg-amber-50 border border-amber-200'
                    }`}
                  >
                    {t.responsible ?? 'Sin asignar'}
                  </span>

                  {/* Quick actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <PrioritySelector
                      taskId={t.id}
                      current={t.priority}
                      onUpdate={updatePriority}
                    />
                    <Link
                      href={`/tasks?highlight=${t.id}`}
                      className="text-xs text-gray-400 hover:text-[#2D3F52] px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
                    >
                      Ver
                    </Link>
                  </div>
                </div>
              )
            })}

            {/* Opening rows */}
            {showOpenings &&
              data.openings.map((o) => {
                const statusLabel =
                  STATUS_LABEL[o.status as OpeningStatus] ?? o.status
                const daysOld = daysSince(o.updated_at)
                const isStalled =
                  o.status === 'trabado' || daysOld > 7

                return (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group border-l-2 border-purple-400"
                  >
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-purple-400" />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {o.folder_name}
                        </span>
                        {o.client && (
                          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {o.client.first_name} {o.client.last_name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <span
                      className={`text-xs flex-shrink-0 px-2 py-0.5 rounded border ${
                        o.status === 'trabado'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}
                    >
                      {statusLabel}
                    </span>

                    {/* Days since update */}
                    <span
                      className={`text-xs flex-shrink-0 ${
                        isStalled ? 'text-amber-600' : 'text-gray-400'
                      }`}
                    >
                      {daysOld}d sin cambios
                    </span>

                    {/* Ver link */}
                    <Link
                      href={`/openings/${o.id}`}
                      className="text-xs text-gray-400 hover:text-[#2D3F52] px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    >
                      Ver
                    </Link>
                  </div>
                )
              })}

            {/* BCU banner */}
            {showBcu && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <Link
                  href="/banco-central"
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#2D3F52] transition-colors group"
                >
                  <span>📋</span>
                  <span>
                    <strong>{data.bcu_incomplete}</strong> legajos BCU con documentación
                    incompleta
                  </span>
                  <span className="text-xs text-[#16A34A] group-hover:underline ml-1">
                    Ver legajos →
                  </span>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
