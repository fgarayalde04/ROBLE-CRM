'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { setAppBadge } from '@/lib/push/client'

interface NotificationRow {
  id: string
  title: string
  message: string
  notif_type: string | null
  client_name: string | null
  url: string | null
  read_at: string | null
  created_at: string
  event_count: number
}

const POLL_MS = 45_000

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.floor(hrs / 24)} d`
}

// Visual accent per event type — matches spec: devuelta = amber/orange,
// ejecutada = green with ✅. Everything else stays neutral.
function accentFor(notifType: string | null) {
  if (notifType === 'orden_devuelta') return { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400' }
  if (notifType === 'orden_ejecutada') return { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' }
  return { bg: 'bg-white', border: 'border-gray-100', dot: 'bg-blue-400' }
}

export default function NotificationBell({ variant = 'dark', align = 'right' }: { variant?: 'dark' | 'light'; align?: 'left' | 'right' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
      setAppBadge(data.unreadCount ?? 0)
    } catch {
      // silent — the bell just stays at its last known state
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const id = setInterval(fetchNotifications, POLL_MS)
    return () => clearInterval(id)
  }, [fetchNotifications])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      await fetchNotifications()
      setLoading(false)
    }
  }

  async function handleItemClick(n: NotificationRow) {
    setOpen(false)
    if (!n.read_at) {
      // Optimistic — once read, it drops out of the list entirely (server
      // only returns unread ones), not just greyed out.
      setItems((prev) => prev.filter((i) => i.id !== n.id))
      setUnreadCount((c) => Math.max(0, c - 1))
      fetch(`/api/notifications/${n.id}`, { method: 'PATCH' }).then(() => {
        setAppBadge(Math.max(0, unreadCount - 1))
      })
    }
    if (n.url) router.push(n.url)
  }

  const iconColor = variant === 'dark' ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-700'

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
          variant === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100'
        } ${iconColor}`}
        aria-label="Notificaciones"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50`}>
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-xs font-semibold text-gray-700">Notificaciones</span>
            {unreadCount > 0 && <span className="text-[10px] text-gray-400">{unreadCount} sin leer</span>}
          </div>

          {loading ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">Sin notificaciones.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {items.map((n) => {
                const accent = accentFor(n.notif_type)
                const unread = !n.read_at
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleItemClick(n)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-50 ${unread ? accent.bg : 'bg-white'}`}
                    >
                      <div className="flex items-start gap-2">
                        {unread && <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${accent.dot}`} />}
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-snug ${unread ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <p className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</p>
                            {n.event_count > 1 && (
                              <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 rounded-full">
                                +{n.event_count - 1} actualizaci{n.event_count - 1 === 1 ? 'ón' : 'ones'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
