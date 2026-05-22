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

function fullTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('es-UY', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function MailPageClient({ googleEmail, sentLogs }: Props) {
  const [messages, setMessages]           = useState<InboxMessage[]>([])
  const [loadingInbox, setLoadingInbox]   = useState(false)
  const [inboxError, setInboxError]       = useState<string | null>(null)
  const [composeOpen, setComposeOpen]     = useState(false)
  const [selected, setSelected]           = useState<InboxMessage | null>(null)
  const [body, setBody]                   = useState<string | null>(null)
  const [loadingBody, setLoadingBody]     = useState(false)
  const [refreshKey, setRefreshKey]       = useState(0)
  const [mailFilter, setMailFilter]       = useState<'all' | 'unread'>('all')
  const [attachments, setAttachments]     = useState<Array<{ filename: string; mimeType: string; attachmentId: string; size: number }>>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)

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

  // Fetch full body + attachments when a message is selected
  useEffect(() => {
    if (!selected) { setBody(null); setAttachments([]); return }
    setBody(null)
    setAttachments([])
    setLoadingBody(true)
    setLoadingAttachments(true)
    fetch(`/api/gmail/message?id=${selected.id}`)
      .then((r) => r.json())
      .then((d) => {
        setBody(d.body ?? d.error ?? '')
        setAttachments(d.attachments ?? [])
      })
      .catch(() => setBody('No se pudo cargar el mensaje.'))
      .finally(() => { setLoadingBody(false); setLoadingAttachments(false) })
  }, [selected])

  const unread = messages.filter((m) => m.isUnread).length
  const market = messages.filter((m) => m.isMarketRelated).length
  const displayMessages = mailFilter === 'unread' ? messages.filter((m) => m.isUnread) : messages

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

      {/* ── LEFT: inbox or detail ── */}
      <div className="lg:col-span-3 flex flex-col gap-4">

        {/* ── DETAIL VIEW (replaces list when open) ── */}
        {selected ? (
          <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#EEF0F4]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-gray-900 leading-snug">{selected.subject}</h2>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
                    <span className="text-[12px] font-medium text-gray-700">
                      {selected.fromName || selected.fromEmail}
                    </span>
                    {selected.fromName && selected.fromName !== selected.fromEmail && (
                      <span className="text-[11px] text-gray-400">&lt;{selected.fromEmail}&gt;</span>
                    )}
                    <span className="text-gray-300">·</span>
                    <span className="text-[11px] text-gray-400 capitalize">{fullTime(selected.date)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${selected.threadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-white px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
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
                  <button
                    onClick={() => setSelected(null)}
                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title="Volver a bandeja"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-5 min-h-[300px]">
              {loadingBody ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 animate-pulse">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Cargando mensaje…
                </div>
              ) : body ? (
                <pre className="text-[13px] text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {body}
                </pre>
              ) : (
                <p className="text-sm text-gray-400 italic">Sin contenido.</p>
              )}

              {/* Attachments */}
              {!loadingAttachments && attachments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#EEF0F4]">
                  <p className="text-[11px] font-semibold text-gray-500 mb-2">Adjuntos ({attachments.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att) => (
                      <a
                        key={att.attachmentId}
                        href={`/api/gmail/attachment?messageId=${selected?.id}&attachmentId=${att.attachmentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F9FAFB] hover:bg-[#EFF3F8] text-[12px] text-gray-700 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                        <span className="max-w-[160px] truncate">{att.filename}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {att.size > 1024 * 1024
                            ? `${(att.size / 1024 / 1024).toFixed(1)}MB`
                            : `${Math.round(att.size / 1024)}KB`}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setMailFilter('all')}
                className={`text-left bg-white border rounded-lg px-4 py-3 transition-colors ${mailFilter === 'all' ? 'border-[#2D3F52] bg-[#EFF3F8]' : 'border-[#E2E8F0] hover:bg-[#F9FAFB]'}`}
              >
                <p className="text-[11px] text-gray-400 mb-1">Recibidos hoy</p>
                <p className="text-2xl font-semibold text-[#2D3F52]">{messages.length}</p>
              </button>
              <button
                onClick={() => setMailFilter('unread')}
                className={`text-left bg-white border rounded-lg px-4 py-3 transition-colors ${mailFilter === 'unread' ? 'border-[#2D3F52] bg-[#EFF3F8]' : 'border-[#E2E8F0] hover:bg-[#F9FAFB]'}`}
              >
                <p className="text-[11px] text-gray-400 mb-1">Sin leer</p>
                <p className="text-2xl font-semibold text-[#2D3F52]">{unread}</p>
              </button>
              <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-3">
                <p className="text-[11px] text-gray-400 mb-1">Newsletters</p>
                <p className="text-2xl font-semibold text-[#2D3F52]">{market}</p>
              </div>
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

              {!loadingInbox && displayMessages.length === 0 && !inboxError && (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-400">No hay emails en la bandeja de hoy.</p>
                </div>
              )}

              {displayMessages.length > 0 && (
                <ul className="divide-y divide-[#EEF0F4]">
                  {displayMessages.map((m) => (
                    <li
                      key={m.id}
                      onClick={() => { setSelected(m); setComposeOpen(false) }}
                      className={`px-4 py-3.5 cursor-pointer transition-colors hover:bg-[#F9FAFB] ${m.isUnread ? 'bg-white' : 'bg-[#FAFBFC]'}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className={`text-[13px] leading-snug flex-1 min-w-0 truncate ${m.isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                          {m.subject}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          {m.isUnread && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                          <span className="text-[11px] text-gray-400">{timeLabel(m.date)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] text-gray-500 truncate flex-1">
                          <span className="font-medium">{m.fromName || m.fromEmail}</span>
                          {m.fromName && m.fromName !== m.fromEmail && (
                            <span className="text-gray-400 ml-1">&lt;{m.fromEmail}&gt;</span>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
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
