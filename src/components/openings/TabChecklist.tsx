'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OpeningChecklistItem } from '@/types/platform'

interface Props {
  items: OpeningChecklistItem[]
  openingId: string
}

export default function TabChecklist({ items, openingId }: Props) {
  const router = useRouter()
  const [localItems, setLocalItems] = useState<OpeningChecklistItem[]>(items)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [editFields, setEditFields] = useState<Record<string, { responsible: string; note: string }>>({})

  const completed = localItems.filter((i) => i.completed).length
  const total = localItems.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  function getEdit(id: string) {
    const item = localItems.find((i) => i.id === id)
    return editFields[id] ?? { responsible: item?.responsible ?? '', note: item?.note ?? '' }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleToggle(item: OpeningChecklistItem) {
    const newCompleted = !item.completed
    setSaving((prev) => new Set(prev).add(item.id))

    try {
      const res = await fetch('/api/openings/checklist-item', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, completed: newCompleted }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setLocalItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
      router.refresh()
    } catch {
      // revert on error
    } finally {
      setSaving((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  async function handleSaveDetails(item: OpeningChecklistItem) {
    const edit = getEdit(item.id)
    setSaving((prev) => new Set(prev).add(item.id))

    try {
      const res = await fetch('/api/openings/checklist-item', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          completed: item.completed,
          responsible: edit.responsible.trim() || null,
          note: edit.note.trim() || null,
        }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setLocalItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
      router.refresh()
    } catch {
      // handle silently
    } finally {
      setSaving((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const sorted = [...localItems].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Checklist de apertura</h2>
        <span className="text-xs text-gray-500">{completed}/{total} — {pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-5">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: '#16A34A' }}
        />
      </div>

      <div className="space-y-2">
        {sorted.map((item) => {
          const isExpanded = expanded.has(item.id)
          const isSaving = saving.has(item.id)
          const edit = getEdit(item.id)

          return (
            <div key={item.id} className={`rounded border ${item.completed ? 'border-emerald-100 bg-emerald-50/30' : 'border-gray-100 bg-white'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => handleToggle(item)}
                  disabled={isSaving}
                  className="w-4 h-4 accent-[#16A34A] cursor-pointer"
                />
                <span className={`flex-1 text-sm ${item.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {item.title}
                </span>
                {item.completed && item.completed_at && (
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {new Date(item.completed_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'short' })}
                  </span>
                )}
                {item.responsible && (
                  <span className="text-[10px] text-gray-400 shrink-0">{item.responsible}</span>
                )}
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 shrink-0 transition-colors"
                >
                  {isExpanded ? 'cerrar' : 'editar'}
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Responsable</label>
                      <input
                        type="text"
                        value={edit.responsible}
                        onChange={(e) => setEditFields((prev) => ({ ...prev, [item.id]: { ...getEdit(item.id), responsible: e.target.value } }))}
                        placeholder="Nombre"
                        className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Nota</label>
                      <input
                        type="text"
                        value={edit.note}
                        onChange={(e) => setEditFields((prev) => ({ ...prev, [item.id]: { ...getEdit(item.id), note: e.target.value } }))}
                        placeholder="Comentario opcional"
                        className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleSaveDetails(item)}
                    disabled={isSaving}
                    className="px-3 py-1.5 text-xs rounded bg-[#2D3F52] text-white hover:bg-[#354A5E] disabled:opacity-40 transition-colors"
                  >
                    {isSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
