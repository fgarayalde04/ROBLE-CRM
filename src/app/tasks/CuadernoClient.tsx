'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Item {
  id: string
  owner_name: string
  entry_date: string
  title: string
  comments: string
  done: boolean
  done_at: string | null
  shared_with: string[]
  position: number
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return format(parseISO(dateStr), "EEEE d 'de' MMMM", { locale: es })
}

// ─── ItemModal ────────────────────────────────────────────────────────────────

function ItemModal({
  initial,
  users,
  onSave,
  onClose,
}: {
  initial?: Partial<Item>
  users: string[]
  onSave: (data: { title: string; comments: string; shared_with: string[] }) => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle]   = useState(initial?.title ?? '')
  const [comments, setComments] = useState(initial?.comments ?? '')
  const [sharedWith, setSharedWith] = useState<string[]>(initial?.shared_with ?? [])
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  function toggleUser(name: string) {
    setSharedWith(prev => prev.includes(name) ? prev.filter(u => u !== name) : [...prev, name])
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onSave({ title: title.trim(), comments: comments.trim(), shared_with: sharedWith })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">{initial?.id ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Título *</label>
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSave()}
              placeholder="¿Qué hay que hacer?"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 focus:border-[#2D3F52]/40"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Comentarios</label>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Detalles, contexto, links…"
              rows={3}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 focus:border-[#2D3F52]/40 resize-none"
            />
          </div>

          {users.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Compartir con</label>
              <div className="flex flex-wrap gap-1.5">
                {users.map(u => {
                  const sel = sharedWith.includes(u)
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => toggleUser(u)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        sel
                          ? 'bg-[#2D3F52] text-white border-[#2D3F52]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {sel && <span className="mr-1">✓</span>}{u}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!title.trim() || saving}
            className="px-4 py-2 text-sm font-semibold bg-[#2D3F52] text-white rounded-lg hover:bg-[#354A5E] disabled:opacity-40 transition">
            {saving ? 'Guardando…' : initial?.id ? 'Guardar cambios' : 'Agregar tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  item,
  currentUser,
  users,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: Item
  currentUser: string
  users: string[]
  onToggle: () => void
  onEdit: (data: { title: string; comments: string; shared_with: string[] }) => Promise<void>
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const isOwner = item.owner_name === currentUser
  const isShared = item.shared_with.length > 0

  return (
    <>
      <div className={`group rounded-lg border transition-all ${
        item.done ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}>
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          {/* Checkbox */}
          <button
            onClick={onToggle}
            disabled={!isOwner}
            className={`mt-0.5 w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
              item.done
                ? 'bg-emerald-500 border-emerald-500'
                : isOwner
                ? 'border-gray-300 hover:border-emerald-400 cursor-pointer'
                : 'border-gray-200 cursor-not-allowed'
            }`}
          >
            {item.done && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p
                onClick={() => item.comments && setExpanded(e => !e)}
                className={`text-sm leading-snug ${
                  item.done ? 'line-through text-gray-400' : 'text-gray-800'
                } ${item.comments ? 'cursor-pointer' : ''}`}
              >
                {item.title}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {item.comments && (
                  <button onClick={() => setExpanded(e => !e)}
                    className="p-1 text-gray-300 hover:text-gray-500 transition">
                    <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                {isOwner && (
                  <>
                    <button onClick={() => setShowEdit(true)}
                      className="p-1 text-gray-300 hover:text-blue-500 transition">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={onDelete}
                      className="p-1 text-gray-300 hover:text-red-400 transition">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {!isOwner && (
                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  de {item.owner_name}
                </span>
              )}
              {isShared && isOwner && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-blue-400">compartida con</span>
                  {item.shared_with.map(u => (
                    <span key={u} className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">{u}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Expanded comments */}
            {expanded && item.comments && (
              <p className="mt-2 text-xs text-gray-500 leading-relaxed whitespace-pre-wrap border-t border-gray-100 pt-2">
                {item.comments}
              </p>
            )}
          </div>
        </div>
      </div>

      {showEdit && (
        <ItemModal
          initial={item}
          users={users}
          onSave={async (data) => { await onEdit(data); setShowEdit(false) }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  )
}

// ─── SaveIndicator ────────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null
  return (
    <span className={`text-[11px] font-medium ${
      state === 'saving' ? 'text-gray-400' :
      state === 'saved'  ? 'text-emerald-600' : 'text-red-500'
    }`}>
      {state === 'saving' ? 'Guardando…' : state === 'saved' ? '✓ Guardado' : '✕ Error'}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CuadernoClient() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate]     = useState(today)
  const [items, setItems]   = useState<Item[]>([])
  const [users, setUsers]   = useState<string[]>([])
  const [currentUser, setCurrentUser] = useState('')
  const [notes, setNotes]   = useState('')
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestNotes = useRef(notes)

  useEffect(() => { latestNotes.current = notes }, [notes])

  // Load items for date
  const loadItems = useCallback(async (d: string) => {
    const res  = await fetch(`/api/cuaderno/items?date=${d}`)
    const json = await res.json()
    setItems(json.items ?? [])
    setUsers(json.users ?? [])
    setCurrentUser(json.currentUser ?? '')
  }, [])

  // Load notes for date
  const loadNotes = useCallback(async (d: string) => {
    const res  = await fetch(`/api/cuaderno?date=${d}`)
    const json = await res.json()
    setNotes(json.notes ?? '')
  }, [])

  useEffect(() => {
    setLoading(true)
    setSaveState('idle')
    Promise.all([loadItems(date), loadNotes(date)]).finally(() => setLoading(false))
  }, [date, loadItems, loadNotes])

  // Auto-save notes
  function handleNotesChange(v: string) {
    setNotes(v)
    latestNotes.current = v
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving')
      const res = await fetch('/api/cuaderno', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_date: date, notes: latestNotes.current, items: [] }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
      if (res.ok) setTimeout(() => setSaveState('idle'), 2000)
    }, 700)
  }

  async function handleAddItem(data: { title: string; comments: string; shared_with: string[] }) {
    const res = await fetch('/api/cuaderno/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_date: date, ...data, position: items.length }),
    })
    if (res.ok) { await loadItems(date); setShowAdd(false) }
  }

  async function handleToggle(item: Item) {
    const res = await fetch(`/api/cuaderno/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !item.done }),
    })
    if (res.ok) await loadItems(date)
  }

  async function handleEdit(item: Item, data: { title: string; comments: string; shared_with: string[] }) {
    const res = await fetch(`/api/cuaderno/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) await loadItems(date)
  }

  async function handleDelete(item: Item) {
    const res = await fetch(`/api/cuaderno/items/${item.id}`, { method: 'DELETE' })
    if (res.ok) setItems(prev => prev.filter(i => i.id !== item.id))
  }

  const pending = items.filter(it => !it.done)
  const done    = items.filter(it => it.done)
  const isToday = date === today

  return (
    <div className="p-4 md:p-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#2D3F52]">Cuaderno</h1>
          <p className="text-sm text-gray-400 mt-0.5">Tareas y notas del día</p>
        </div>
        <SaveIndicator state={saveState} />
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => setDate(subDays(parseISO(date), 1).toISOString().split('T')[0])}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition text-lg">
          ‹
        </button>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="sr-only" id="date-picker" />
          <label htmlFor="date-picker"
            className="cursor-pointer text-sm font-semibold text-gray-800 capitalize hover:text-[#2D3F52] transition">
            {fmtDate(date)}
          </label>
          {isToday && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#2D3F52] text-white">HOY</span>
          )}
        </div>
        <button onClick={() => setDate(addDays(parseISO(date), 1).toISOString().split('T')[0])}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition text-lg">
          ›
        </button>
        {!isToday && (
          <button onClick={() => setDate(today)} className="text-xs text-blue-500 hover:underline ml-1">
            Ir a hoy
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Left: Tasks */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tareas del día</span>
                {pending.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {pending.length}
                  </span>
                )}
              </div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 text-xs font-semibold text-[#2D3F52] hover:text-[#354A5E] transition">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Nueva tarea
              </button>
            </div>

            <div className="p-3 space-y-1.5">
              {pending.length === 0 && done.length === 0 && (
                <div className="py-8 text-center space-y-2">
                  <p className="text-sm text-gray-300">Sin tareas para este día</p>
                  <button onClick={() => setShowAdd(true)}
                    className="text-xs text-[#2D3F52] hover:underline font-medium">
                    + Agregar tarea
                  </button>
                </div>
              )}

              {pending.map(item => (
                <TaskCard key={item.id} item={item} currentUser={currentUser} users={users}
                  onToggle={() => handleToggle(item)}
                  onEdit={data => handleEdit(item, data)}
                  onDelete={() => handleDelete(item)} />
              ))}

              {done.length > 0 && (
                <div className="pt-2 mt-2 border-t border-gray-100 space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider px-1 mb-1">
                    Completadas · {done.length}
                  </p>
                  {done.map(item => (
                    <TaskCard key={item.id} item={item} currentUser={currentUser} users={users}
                      onToggle={() => handleToggle(item)}
                      onEdit={data => handleEdit(item, data)}
                      onDelete={() => handleDelete(item)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Notes */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Notas</span>
              <SaveIndicator state={saveState} />
            </div>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder={`Apuntes del ${fmtDate(date)}…`}
              className="flex-1 w-full p-4 text-sm text-gray-700 resize-none focus:outline-none placeholder-gray-300 leading-relaxed min-h-[380px]"
            />
          </div>
        </div>
      )}

      {/* Add item modal */}
      {showAdd && (
        <ItemModal
          users={users}
          onSave={handleAddItem}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
