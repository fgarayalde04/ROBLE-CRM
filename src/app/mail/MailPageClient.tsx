'use client'

import { useState, useEffect, useCallback } from 'react'
import EmailCompose from '@/components/EmailCompose'
import type { InboxMessage } from '@/lib/google/gmail'

interface SentLog {
  id: string
  description: string | null
  created_at: string
  created_by: string | null
}

interface Props {
  googleEmail: string | null
  sentLogs: SentLog[]
}

function timeLabel(isoDate: string): string {
  const d = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' })
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]
function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function MailPageClient({ googleEmail, sentLogs }: Props) {
  const [messages, setMessages]         = useState<InboxMessage[]>([])
  const [loadingInbox, setLoadingInbox] = useState(false)
  const [inboxError, setInboxError]     = useState<string | null>(null)
  const [composeOpen, setComposeOpen]   = useState(false)
  const [selected, setSelected]         = useState<InboxMessage | null>(null)
  const [refreshKey, setRefreshKey]     = useState(0)

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true)
    setInboxError(null)
    try {
      const res  = await fetch('/api/gmail/inbox')
      const data = await res.json()
      if (data.messages) setMessages(data.messages)
    } catch {
      setInboxError('No se pudo cargar la bandeja.')
    } finally {
      setLoadingInbox(false)
    }
  }, [])

  useEffect(() => { loadInbox() }, [loadInbox, refreshKey])

  const unread  = messages.filter((m) => m.isUnread).length
  const market  = messages.filter((m) => m.isMarketRelated).length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

      {/* ── LEFT: Inbox ── */}
      <div className="lg:col-span-3 flex flex-col gap-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Recibidos hoy', value: messages.length },
            { label: 'Sin leer',      value: unread },
            { label: 'Newsletters',   value: market },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-3">
              <p className="text-[11px] text-gray-400 mb-1">{s.label}</p>
              <p className="text-2xl font-semibold text-[#2D3F52]">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Inbox list */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EEF0F4] flex items-center gap-2">
            <span className="text-xs font-semibold text-[#2D3F52]">Bandeja de hoy</span>
            {loadingInbox && (
              <span className="ml-auto text-[10px] text-gray-400 animate-pulse">Cargando…</span>
            )}
            {!loadingInbox && (
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
                title="Actualizar"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>

          {inboxError && (
            <div className="px-4 py-3 text-xs text-red-600 bg-red-50">{inboxError}</div>
          )}

          {!loadingInbox && messages.length === 0 && !inboxError && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-gray-400">No hay emails en la bandeja de hoy.</p>
            </div>
          )}

          {messages.length > 0 && (
            <ul className="divide-y divide-[#EEF0F4] max-h-[520px] overflow-y-auto">
              {messages.map((m) => {
                const isSelected = selected?.id === m.id
                return (
                  <li
                    key={m.id}
                    onClick={() => { setSelected(m); setComposeOpen(false) }}
                    className={`px-4 py-3.5 cursor-pointer transition-colors
                      ${isSelected ? 'bg-[#EFF3F8]' : 'hover:bg-[#F9FAFB]'}
                      ${m.isUnread ? 'bg-white' : 'bg-[#FAFBFC]'}`}
                  >
                    <div className="min-w-0 flex-1">
                      {/* Row 1: subject + time */}
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className={`text-[13px] leading-snug ${m.isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                          {m.subject}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          {m.isUnread && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                          <span className="text-[11px] text-gray-400">{timeLabel(m.date)}</span>
                        </div>
                      </div>

                      {/* Row 2: sender */}
                      <p className="text-[11px] text-gray-500 truncate">
                        {m.fromName && m.fromName !== m.fromEmail
                          ? <><span className="font-medium">{m.fromName}</span> <span className="text-gray-400">&lt;{m.fromEmail}&gt;</span></>
                          : <span className="font-medium">{m.fromEmail}</span>
                        }
                      </p>

                      {/* Row 3: snippet + badge */}
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[11px] text-gray-400 truncate flex-1">{m.snippet}</p>
                        {m.isMarketRelated && (
                          <span className="shrink-0 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            newsletter
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#EEF0F4] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 leading-snug">{selected.subject}</p>
                <p className="text-xs text-gray-500 mt-1">
                  <span className="font-medium text-gray-700">{selected.fromName || selected.fromEmail}</span>
                  {selected.fromName && selected.fromName !== selected.fromEmail && (
                    <span className="text-gray-400 ml-1">&lt;{selected.fromEmail}&gt;</span>
                  )}
                  <span className="mx-1.5 text-gray-300">·</span>
                  <span className="text-gray-400">{timeLabel(selected.date)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <a
                  href={`https://mail.google.com/mail/u/0/#inbox/${selected.threadId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-white px-3 py-1.5 rounded-md transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#2D3F52' }}
                >
                  Abrir en Gmail
                </a>
                <button
                  onClick={() => { setComposeOpen(true); setSelected(null) }}
                  className="text-[11px] font-medium text-[#2D3F52] bg-[#EEF0F4] hover:bg-[#E2E8F0] px-3 py-1.5 rounded-md transition-colors"
                >
                  Responder
                </button>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-4 py-4">
              <p className="text-[13px] text-gray-600 leading-relaxed">{selected.snippet}</p>
              <p className="text-[11px] text-gray-400 mt-4 italic">
                Fragmento del email — abrí Gmail para ver el mensaje completo.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Compose + Sent ── */}
      <div className="lg:col-span-2 flex flex-col gap-4">

        {/* Compose */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div
            className="px-4 py-3 border-b border-[#EEF0F4] flex items-center gap-2 cursor-pointer select-none"
            onClick={() => { setComposeOpen((v) => !v); setSelected(null) }}
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span className="text-xs font-semibold text-[#2D3F52] flex-1">Redactar</span>
            {googleEmail && (
              <span className="text-[10px] text-gray-400 hidden sm:block truncate max-w-[140px]">{googleEmail}</span>
            )}
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${composeOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {composeOpen ? (
            <div className="p-4">
              <EmailCompose
                defaultTo={selected?.fromEmail ?? ''}
                onSent={() => { setComposeOpen(false); setRefreshKey((k) => k + 1) }}
                onClose={() => setComposeOpen(false)}
              />
            </div>
          ) : (
            <div className="px-4 py-4 text-center">
              <button
                onClick={() => { setComposeOpen(true); setSelected(null) }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#2D3F52' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Nuevo email
              </button>
            </div>
          )}
        </div>

        {/* Sent history */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EEF0F4]">
            <span className="text-xs font-semibold text-[#2D3F52]">Enviados recientes</span>
          </div>
          {(sentLogs ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400">No hay emails enviados.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EEF0F4] max-h-[340px] overflow-y-auto">
              {(sentLogs ?? []).map((log) => {
                const match   = log.description?.match(/^Email enviado a (.+?): (.+)$/)
                const to      = match?.[1] ?? '—'
                const subject = match?.[2] ?? log.description ?? '—'
                return (
                  <li key={log.id} className="px-4 py-3 hover:bg-[#F4F6F8] transition-colors">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[12px] font-medium text-gray-700 truncate flex-1">{subject}</p>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {new Date(log.created_at).toLocaleString('es-UY', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">→ {to}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
