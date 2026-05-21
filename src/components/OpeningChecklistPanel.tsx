'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { OpeningChecklistItem } from '@/types/platform'

interface Props {
  items: OpeningChecklistItem[]
  openingId: string
}

export default function OpeningChecklistPanel({ items: initial, openingId }: Props) {
  const [items, setItems] = useState(initial)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((i) => [i.id, i.note ?? '']))
  )
  const [responsibles, setResponsibles] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((i) => [i.id, i.responsible ?? '']))
  )

  const completed = items.filter((i) => i.completed).length
  const pct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0

  async function toggle(item: OpeningChecklistItem) {
    setSavingId(item.id)
    const newVal = !item.completed
    const { error } = await supabase
      .from('opening_checklist_items')
      .update({ completed: newVal, completed_at: newVal ? new Date().toISOString() : null })
      .eq('id', item.id)
    if (!error) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, completed: newVal, completed_at: newVal ? new Date().toISOString() : null }
            : i
        )
      )
    }
    setSavingId(null)
  }

  async function saveNote(item: OpeningChecklistItem) {
    setSavingId(item.id)
    await supabase
      .from('opening_checklist_items')
      .update({ note: notes[item.id] || null, responsible: responsibles[item.id] || null })
      .eq('id', item.id)
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, note: notes[item.id] || null, responsible: responsibles[item.id] || null }
          : i
      )
    )
    setSavingId(null)
    setExpandedId(null)
  }

  return (
    <div>
      {/* Progress */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#16A34A' : '#16A34A' }}
          />
        </div>
        <span className="text-xs font-medium text-gray-500 shrink-0">
          {completed}/{items.length} completados
        </span>
      </div>

      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-[#EEF0F4] overflow-hidden">
            <div
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                item.completed ? 'bg-[#F4F6F8]' : 'bg-white hover:bg-[#F4F6F8]'
              }`}
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); toggle(item) }}
                disabled={savingId === item.id}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  item.completed
                    ? 'border-[#16A34A] bg-[#16A34A]'
                    : 'border-gray-300 hover:border-[#16A34A]'
                }`}
              >
                {item.completed && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <span className={`text-sm flex-1 ${item.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                {item.title}
              </span>
              <div className="flex items-center gap-2">
                {item.responsible && (
                  <span className="text-[10px] text-gray-400">{item.responsible}</span>
                )}
                {item.completed_at && (
                  <span className="text-[10px] text-gray-400">
                    {new Date(item.completed_at).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' })}
                  </span>
                )}
                <svg
                  className={`w-3.5 h-3.5 text-gray-300 transition-transform ${expandedId === item.id ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {expandedId === item.id && (
              <div className="px-4 py-3 bg-[#F4F6F8] border-t border-[#EEF0F4] space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">
                      Responsable
                    </label>
                    <input
                      value={responsibles[item.id]}
                      onChange={(e) => setResponsibles((p) => ({ ...p, [item.id]: e.target.value }))}
                      placeholder="Nombre"
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">
                      Nota
                    </label>
                    <input
                      value={notes[item.id]}
                      onChange={(e) => setNotes((p) => ({ ...p, [item.id]: e.target.value }))}
                      placeholder="Opcional"
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setExpandedId(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => saveNote(item)}
                    disabled={savingId === item.id}
                    className="text-xs px-3 py-1 bg-[#2D3F52] text-white rounded hover:bg-[#354A5E] disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
