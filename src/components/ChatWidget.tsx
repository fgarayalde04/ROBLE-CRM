'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { SessionUser } from '@/lib/auth'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  type: 'direct' | 'group'
  name: string | null
  other_participants: { id: string; name: string }[]
  last_message: string | null
  last_message_sender: string | null
  last_message_at: string | null
  unread_count: number
  updated_at: string
}

interface Message {
  id: string
  sender_id: string
  sender_name: string
  content: string
  message_type: 'text' | 'task_ref'
  task_id: string | null
  task_title: string | null
  created_at: string
}

interface CrmUser {
  id: string
  name: string
  role: string
  active: boolean
}

interface TaskResult {
  id: string
  title: string
  responsible: string | null
  client?: { first_name: string; last_name: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function convTitle(conv: Conversation): string {
  if (conv.type === 'group' && conv.name) return conv.name
  if (conv.other_participants.length === 1) return conv.other_participants[0].name
  if (conv.other_participants.length > 1)
    return conv.other_participants.map((p) => p.name.split(' ')[0]).join(', ')
  return 'Conversación'
}

function convInitials(conv: Conversation): string {
  const title = convTitle(conv)
  if (conv.type === 'group') return title.slice(0, 2).toUpperCase()
  return title.charAt(0).toUpperCase()
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return format(d, 'HH:mm')
  if (diff < 7 * 86_400_000) return format(d, 'EEE', { locale: es })
  return format(d, 'd MMM', { locale: es })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatWidget({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [composerText, setComposerText] = useState('')
  const [attachedTask, setAttachedTask] = useState<TaskResult | null>(null)
  const [showNewConv, setShowNewConv] = useState(false)
  const [showTaskSearch, setShowTaskSearch] = useState(false)
  const [taskQuery, setTaskQuery] = useState('')
  const [taskResults, setTaskResults] = useState<TaskResult[]>([])
  const [allUsers, setAllUsers] = useState<CrmUser[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [totalUnread, setTotalUnread] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const convPollRef = useRef<ReturnType<typeof setInterval>>()
  const msgPollRef = useRef<ReturnType<typeof setInterval>>()

  // ── Fetch conversations ──────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat')
      if (!res.ok) return
      const data: Conversation[] = await res.json()
      setConversations(data)
      setTotalUnread(data.reduce((s, c) => s + c.unread_count, 0))
    } catch {}
  }, [])

  // ── Fetch messages ───────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/chat/messages?conversationId=${convId}`)
      if (!res.ok) return
      const data: Message[] = await res.json()
      setMessages(data)
    } catch {}
  }, [])

  // ── Poll conversations (30s background, 10s when open) ──────────────────
  useEffect(() => {
    fetchConversations()
    const interval = setInterval(fetchConversations, open ? 10_000 : 30_000)
    convPollRef.current = interval
    return () => clearInterval(interval)
  }, [open, fetchConversations])

  // ── Poll messages (3s when conversation is open) ─────────────────────────
  useEffect(() => {
    clearInterval(msgPollRef.current)
    if (!activeConvId) { setMessages([]); return }
    fetchMessages(activeConvId)
    msgPollRef.current = setInterval(() => fetchMessages(activeConvId), 3_000)
    return () => clearInterval(msgPollRef.current)
  }, [activeConvId, fetchMessages])

  // ── Scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Mark as read when opening a conversation ─────────────────────────────
  useEffect(() => {
    if (!activeConvId) return
    fetch('/api/chat/messages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: activeConvId }),
    })
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConvId ? { ...c, unread_count: 0 } : c))
    )
  }, [activeConvId])

  // ── Task search ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!taskQuery.trim()) { setTaskResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks?q=${encodeURIComponent(taskQuery)}&limit=6`)
        if (res.ok) setTaskResults(await res.json())
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [taskQuery])

  // ── Send message ─────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!activeConvId || (!composerText.trim() && !attachedTask)) return
    setSending(true)
    try {
      const body: any = {
        conversationId: activeConvId,
        content: composerText.trim() || (attachedTask ? attachedTask.title : ''),
        messageType: attachedTask ? 'task_ref' : 'text',
      }
      if (attachedTask) {
        body.taskId = attachedTask.id
        body.taskTitle = attachedTask.title
        if (!composerText.trim()) body.content = attachedTask.title
      }

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) return
      const msg: Message = await res.json()

      setMessages((prev) => [...prev, msg])
      setComposerText('')
      setAttachedTask(null)
      setShowTaskSearch(false)
      setTaskQuery('')
      fetchConversations()
    } finally {
      setSending(false)
      composerRef.current?.focus()
    }
  }

  // ── Load users for new conversation modal ────────────────────────────────
  async function openNewConv() {
    setShowNewConv(true)
    setSelectedUserIds([])
    setGroupName('')
    if (allUsers.length) return
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data: CrmUser[] = await res.json()
        setAllUsers(data.filter((u) => u.active && u.id !== user.id))
      }
    } finally {
      setLoadingUsers(false)
    }
  }

  // ── Create conversation ──────────────────────────────────────────────────
  async function createConversation() {
    if (!selectedUserIds.length) return
    const isGroup = selectedUserIds.length > 1
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: isGroup ? 'group' : 'direct',
        name: isGroup && groupName.trim() ? groupName.trim() : null,
        participantIds: selectedUserIds,
      }),
    })
    if (!res.ok) return
    const { id } = await res.json()
    await fetchConversations()
    setActiveConvId(id)
    setShowNewConv(false)
  }

  // ── Keyboard handler in composer ─────────────────────────────────────────
  function handleComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating button ── */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open) setActiveConvId(null) }}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#2D3F52] shadow-lg flex items-center justify-center hover:bg-[#354A5E] transition-colors"
        title="Mensajes"
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[720px] h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex overflow-hidden">

          {/* ── LEFT: Conversation list ── */}
          <div className="w-56 border-r border-gray-100 flex flex-col shrink-0">
            {/* Header */}
            <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#2D3F52]">Mensajes</span>
              <button
                onClick={openNewConv}
                className="w-6 h-6 rounded-full bg-[#2D3F52] text-white flex items-center justify-center hover:bg-[#354A5E] transition-colors"
                title="Nueva conversación"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-xs text-gray-400">Sin conversaciones.</p>
                  <button onClick={openNewConv} className="mt-2 text-xs text-blue-500 hover:underline">
                    Iniciar una
                  </button>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConvId(conv.id)}
                    className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors hover:bg-gray-50 ${
                      conv.id === activeConvId ? 'bg-blue-50/60' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white ${
                      conv.type === 'group' ? 'bg-[#16A34A]' : 'bg-[#2D3F52]'
                    }`}>
                      {convInitials(conv)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs truncate ${conv.unread_count > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {convTitle(conv)}
                        </span>
                        {conv.last_message_at && (
                          <span className="text-[10px] text-gray-400 shrink-0">{timeLabel(conv.last_message_at)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="text-[11px] text-gray-400 truncate flex-1">
                          {conv.last_message ?? 'Sin mensajes'}
                        </p>
                        {conv.unread_count > 0 && (
                          <span className="min-w-[16px] h-4 bg-[#2D3F52] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 shrink-0">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── RIGHT: Message thread ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {!activeConvId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">Seleccioná una conversación</p>
                <p className="text-xs text-gray-400 mt-1">o iniciá una nueva con el botón +</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${
                    activeConv?.type === 'group' ? 'bg-[#16A34A]' : 'bg-[#2D3F52]'
                  }`}>
                    {activeConv ? convInitials(activeConv) : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {activeConv ? convTitle(activeConv) : ''}
                    </p>
                    {activeConv?.type === 'group' && (
                      <p className="text-[10px] text-gray-400">
                        {activeConv.other_participants.map((p) => p.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setActiveConvId(null)} className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                  {messages.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-8">Empezá la conversación.</p>
                  )}
                  {messages.map((msg, i) => {
                    const isMine = msg.sender_id === user.id
                    const showSender = !isMine && (i === 0 || messages[i - 1]?.sender_id !== msg.sender_id)
                    const isTaskRef = msg.message_type === 'task_ref'
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${i > 0 && messages[i-1].sender_id === msg.sender_id ? 'mt-0.5' : 'mt-3'}`}>
                        {showSender && (
                          <span className="text-[10px] text-gray-400 font-medium mb-1 px-1">{msg.sender_name}</span>
                        )}
                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                          isMine
                            ? 'bg-[#2D3F52] text-white rounded-br-sm'
                            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                        }`}>
                          {isTaskRef ? (
                            <div className={`flex items-start gap-2 ${isMine ? '' : ''}`}>
                              <div className={`mt-0.5 p-1 rounded ${isMine ? 'bg-white/15' : 'bg-white'}`}>
                                <svg className={`w-3 h-3 ${isMine ? 'text-white/70' : 'text-[#2D3F52]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                              </div>
                              <div>
                                <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${isMine ? 'text-white/60' : 'text-gray-500'}`}>Tarea</p>
                                <p className="text-sm font-medium leading-snug">{msg.task_title ?? msg.content}</p>
                                {msg.content !== msg.task_title && msg.content && (
                                  <p className={`text-xs mt-1 ${isMine ? 'text-white/75' : 'text-gray-600'}`}>{msg.content}</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </span>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <div className="px-3 py-2.5 border-t border-gray-100">
                  {/* Attached task preview */}
                  {attachedTask && (
                    <div className="mb-2 flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
                      <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="text-xs text-blue-700 font-medium truncate flex-1">{attachedTask.title}</span>
                      <button onClick={() => setAttachedTask(null)} className="text-blue-400 hover:text-blue-600 shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Task search dropdown */}
                  {showTaskSearch && (
                    <div className="mb-2 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <input
                          autoFocus
                          type="text"
                          value={taskQuery}
                          onChange={(e) => setTaskQuery(e.target.value)}
                          placeholder="Buscar tarea..."
                          className="w-full text-xs outline-none text-gray-700 placeholder-gray-400"
                        />
                      </div>
                      {taskResults.length === 0 ? (
                        <p className="px-3 py-2.5 text-xs text-gray-400">{taskQuery ? 'Sin resultados.' : 'Escribí para buscar.'}</p>
                      ) : (
                        <ul>
                          {taskResults.map((t) => (
                            <li key={t.id}>
                              <button
                                onClick={() => {
                                  setAttachedTask(t)
                                  setShowTaskSearch(false)
                                  setTaskQuery('')
                                  setTaskResults([])
                                  composerRef.current?.focus()
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                              >
                                <p className="text-xs font-medium text-gray-800 truncate">{t.title}</p>
                                {t.client && (
                                  <p className="text-[10px] text-gray-400">{t.client.first_name} {t.client.last_name}</p>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    {/* Task attach button */}
                    <button
                      onClick={() => setShowTaskSearch((s) => !s)}
                      title="Adjuntar tarea"
                      className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                        showTaskSearch ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </button>

                    {/* Text input */}
                    <textarea
                      ref={composerRef}
                      rows={1}
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      onKeyDown={handleComposerKey}
                      placeholder="Escribí un mensaje... (Enter para enviar)"
                      className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 focus:border-[#2D3F52]/30 placeholder-gray-400 text-gray-800 max-h-24 overflow-y-auto"
                      style={{ lineHeight: '1.4' }}
                    />

                    {/* Send button */}
                    <button
                      onClick={sendMessage}
                      disabled={sending || (!composerText.trim() && !attachedTask)}
                      className="shrink-0 w-8 h-8 rounded-full bg-[#2D3F52] text-white flex items-center justify-center hover:bg-[#354A5E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── New conversation modal ── */}
      {showNewConv && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Nueva conversación</h3>
              <button onClick={() => setShowNewConv(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Seleccioná participantes</p>
                {loadingUsers ? (
                  <p className="text-xs text-gray-400 py-2">Cargando...</p>
                ) : (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {allUsers.map((u) => (
                      <label key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={(e) =>
                            setSelectedUserIds((prev) =>
                              e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                            )
                          }
                          className="rounded border-gray-300 text-[#2D3F52] focus:ring-[#16A34A]"
                        />
                        <div className="w-7 h-7 rounded-full bg-[#2D3F52]/10 flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-bold text-[#2D3F52]">{u.name.charAt(0)}</span>
                        </div>
                        <span className="text-sm text-gray-700">{u.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {selectedUserIds.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Nombre del grupo <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Ej: Equipo comercial"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowNewConv(false)} className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={createConversation}
                  disabled={!selectedUserIds.length}
                  className="flex-1 py-2.5 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#354A5E] transition-colors disabled:opacity-50"
                >
                  {selectedUserIds.length > 1 ? 'Crear grupo' : 'Iniciar chat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
