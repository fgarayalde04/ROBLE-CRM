'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import {
  format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GEvent {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
  hangoutLink?: string
  conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> }
  htmlLink?: string
}

interface LEvent {
  id: string
  title: string
  event_date: string
  start_time?: string | null
  type: string
}

interface DayBucket { google: GEvent[]; local: LEvent[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gDate(ev: GEvent) {
  return (ev.start.dateTime ?? ev.start.date ?? '').slice(0, 10)
}

function gTime(ev: GEvent) {
  if (!ev.start.dateTime) return ''
  return new Date(ev.start.dateTime).toLocaleTimeString('es-UY', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function meetUrl(ev: GEvent) {
  return (
    ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
    ev.hangoutLink ??
    null
  )
}

const localColor: Record<string, string> = {
  reunion:     'bg-blue-100 text-blue-800',
  llamada:     'bg-emerald-100 text-emerald-800',
  seguimiento: 'bg-purple-100 text-purple-800',
  vencimiento: 'bg-red-100 text-red-800',
  interno:     'bg-gray-100 text-gray-600',
  otro:        'bg-amber-100 text-amber-800',
}

const localBorder: Record<string, string> = {
  reunion:     'border-blue-300',
  llamada:     'border-emerald-300',
  seguimiento: 'border-purple-300',
  vencimiento: 'border-red-300',
  interno:     'border-gray-300',
  otro:        'border-amber-300',
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarView({ isGoogleConnected }: { isGoogleConnected: boolean }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [byDate, setByDate] = useState<Record<string, DayBucket>>({})
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // ── Fetch events for the current month ─────────────────────────────────────
  const fetchMonth = useCallback(async (month: Date) => {
    setLoading(true)
    const from = format(startOfMonth(month), 'yyyy-MM-dd')
    const to   = format(endOfMonth(month),   'yyyy-MM-dd')

    const grouped: Record<string, DayBucket> = {}
    const get = (d: string): DayBucket => {
      if (!grouped[d]) grouped[d] = { google: [], local: [] }
      return grouped[d]
    }

    // Local events (Supabase)
    const { data: local } = await supabase
      .from('events')
      .select('id, title, event_date, start_time, type')
      .gte('event_date', from)
      .lte('event_date', to)
      .order('start_time', { ascending: true, nullsFirst: false })

    for (const ev of local ?? []) get(ev.event_date).local.push(ev)

    // Google Calendar (if connected)
    if (isGoogleConnected) {
      try {
        const res = await fetch(`/api/events?from=${from}&to=${to}`)
        if (res.ok) {
          const data = await res.json()
          for (const ev of data.events ?? []) {
            const d = gDate(ev)
            if (d >= from && d <= to) get(d).google.push(ev)
          }
        }
      } catch { /* silent */ }
    }

    setByDate(grouped)
    setLoading(false)
  }, [isGoogleConnected])

  useEffect(() => { fetchMonth(currentMonth) }, [currentMonth, fetchMonth])

  // ── Build calendar grid ───────────────────────────────────────────────────
  const mStart  = startOfMonth(currentMonth)
  const mEnd    = endOfMonth(currentMonth)
  const calDays = eachDayOfInterval({
    start: startOfWeek(mStart, { weekStartsOn: 0 }),
    end:   endOfWeek(mEnd,     { weekStartsOn: 0 }),
  })

  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: es })

  function prev()   { setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }
  function next()   { setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }
  function today()  { const n = new Date(); setCurrentMonth(new Date(n.getFullYear(), n.getMonth(), 1)) }

  const selBucket = selected ? byDate[selected] : null
  const selHasEvents = selBucket && (selBucket.google.length + selBucket.local.length > 0)

  return (
    <div>
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="p-1.5 rounded hover:bg-white border border-transparent hover:border-[#E2E8F0] transition-all">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-[#2D3F52] capitalize w-40 text-center select-none">
            {monthLabel}
          </h2>
          <button onClick={next} className="p-1.5 rounded hover:bg-white border border-transparent hover:border-[#E2E8F0] transition-all">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={today} className="text-[11px] px-2.5 py-1 rounded border border-[#E2E8F0] bg-white text-gray-600 hover:border-gray-400 transition-colors">
            Hoy
          </button>
          {loading && <span className="text-[11px] text-gray-400 ml-1">Cargando…</span>}
        </div>

        <div className="flex items-center gap-2">
          {!isGoogleConnected && (
            <a
              href="/api/auth/google-connect"
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded border border-[#E2E8F0] bg-white text-gray-600 hover:border-gray-400 transition-colors"
            >
              <GoogleIcon /> Conectar Google
            </a>
          )}
          <Link
            href="/events/new"
            className="text-[11px] px-3 py-1.5 text-white rounded hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#2D3F52' }}
          >
            + Nuevo evento
          </Link>
        </div>
      </div>

      {/* ── Grid + optional detail panel ────────────────────────────────────── */}
      <div className={`grid gap-4 ${selected ? 'grid-cols-[1fr_260px]' : 'grid-cols-1'}`}>
        {/* Calendar */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-[#E2E8F0] bg-[#F4F6F8]">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 divide-x divide-y divide-[#EEF0F4]">
            {calDays.map((day) => {
              const ds = format(day, 'yyyy-MM-dd')
              const inMonth = isSameMonth(day, currentMonth)
              const isT     = ds === todayStr
              const isSel   = ds === selected
              const bucket  = byDate[ds]
              const gCount  = bucket?.google.length ?? 0
              const lCount  = bucket?.local.length  ?? 0
              const total   = gCount + lCount

              // Show up to 3 chips: Google events first, then local
              const gShow = bucket?.google.slice(0, 3) ?? []
              const lShow = bucket?.local.slice(0, Math.max(0, 3 - gShow.length)) ?? []
              const extra = total - gShow.length - lShow.length

              return (
                <div
                  key={ds}
                  onClick={() => setSelected(isSel ? null : ds)}
                  className={`
                    min-h-[90px] p-1.5 cursor-pointer transition-colors select-none
                    ${isSel  ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' :
                      isT    ? 'bg-amber-50 hover:bg-amber-100' :
                      !inMonth ? 'bg-[#FAFAFA] hover:bg-gray-100' :
                                 'hover:bg-[#F4F6F8]'}
                  `}
                >
                  {/* Day number */}
                  <div className="flex items-start justify-between mb-1">
                    <span className={`
                      text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full
                      ${isT ? 'bg-[#2D3F52] text-white' :
                        !inMonth ? 'text-gray-300' :
                        isSel ? 'text-blue-700' :
                        'text-gray-600'}
                    `}>
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Event chips */}
                  <div className="space-y-0.5">
                    {gShow.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-0.5 text-[9.5px] leading-tight px-1 py-0.5 rounded bg-blue-100 text-blue-800 truncate"
                      >
                        {gTime(ev) && (
                          <span className="font-semibold shrink-0">{gTime(ev)}</span>
                        )}
                        <span className="truncate">{ev.summary || '(Sin título)'}</span>
                      </div>
                    ))}
                    {lShow.map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[9.5px] leading-tight px-1 py-0.5 rounded truncate ${localColor[ev.type] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {ev.start_time && (
                          <span className="font-semibold mr-0.5">{ev.start_time.slice(0, 5)}</span>
                        )}
                        {ev.title}
                      </div>
                    ))}
                    {extra > 0 && (
                      <div className="text-[9px] text-gray-400 pl-1">+{extra} más</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Day detail panel ─────────────────────────────────────────────── */}
        {selected && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[#EEF0F4] flex items-center justify-between shrink-0">
              <p className="text-xs font-semibold text-gray-700 capitalize">
                {format(parseISO(selected), "EEEE d 'de' MMMM", { locale: es })}
              </p>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {!selHasEvents ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-gray-400">Sin eventos.</p>
                  <Link href="/events/new" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
                    + Agregar evento
                  </Link>
                </div>
              ) : (
                <>
                  {/* Google events */}
                  {selBucket?.google.map((ev) => {
                    const url = meetUrl(ev)
                    return (
                      <div key={ev.id} className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            {gTime(ev) && (
                              <p className="text-[10px] font-semibold text-blue-500 mb-0.5">{gTime(ev)}</p>
                            )}
                            <p className="text-xs font-semibold text-blue-900 truncate">
                              {ev.summary || '(Sin título)'}
                            </p>
                          </div>
                          <GoogleIcon />
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#1A73E8] text-white hover:opacity-90"
                            >
                              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z" />
                              </svg>
                              Meet
                            </a>
                          )}
                          {ev.htmlLink && (
                            <a
                              href={ev.htmlLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-500 hover:underline"
                            >
                              Ver en Google Cal
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Local events */}
                  {selBucket?.local.map((ev) => (
                    <div
                      key={ev.id}
                      className={`p-3 rounded-lg border ${localColor[ev.type] ?? 'bg-gray-50 text-gray-800'} ${localBorder[ev.type] ?? 'border-gray-300'}`}
                    >
                      {ev.start_time && (
                        <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                          {ev.start_time.slice(0, 5)}
                        </p>
                      )}
                      <p className="text-xs font-semibold">{ev.title}</p>
                      <span className="text-[9px] capitalize opacity-60 mt-0.5 block">{ev.type}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="px-3 py-2 border-t border-[#EEF0F4] shrink-0">
              <Link href="/events/new" className="text-[11px] text-[#2D3F52] hover:underline font-medium">
                + Nuevo evento este día
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 mt-3">
        {isGoogleConnected && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded bg-blue-100 border border-blue-300" />
            <span className="text-[10px] text-gray-400">Google Calendar</span>
          </div>
        )}
        {[
          { label: 'Reunión',     color: 'bg-blue-100 border-blue-300' },
          { label: 'Llamada',     color: 'bg-emerald-100 border-emerald-300' },
          { label: 'Vencimiento', color: 'bg-red-100 border-red-300' },
          { label: 'Seguimiento', color: 'bg-purple-100 border-purple-300' },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-2 rounded border ${l.color}`} />
            <span className="text-[10px] text-gray-400">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}
