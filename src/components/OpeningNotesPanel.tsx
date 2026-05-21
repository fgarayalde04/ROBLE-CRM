'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Props {
  openingId: string
  initialNotes: string | null
}

function parseComments(notes: string | null) {
  if (!notes?.trim()) return []
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(.+?)\]\s*(.+)$/)
      if (match) return { date: match[1], text: match[2] }
      return { date: null, text: line }
    })
}

export default function OpeningNotesPanel({ openingId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)

  const comments = parseComments(notes)

  async function addComment() {
    if (!newComment.trim()) return
    setSaving(true)
    const dateStr = new Date().toLocaleDateString('es-UY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
    const line = `[${dateStr}] ${newComment.trim()}`
    const updated = notes ? `${notes}\n${line}` : line

    const { error } = await supabase
      .from('account_openings')
      .update({ notes: updated })
      .eq('id', openingId)

    if (!error) {
      setNotes(updated)
      setNewComment('')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      {/* Lista de comentarios */}
      {comments.length > 0 ? (
        <ul className="space-y-2">
          {comments.map((c, i) => (
            <li key={i} className="flex gap-3 text-sm">
              {c.date && (
                <span className="text-xs text-gray-400 shrink-0 pt-0.5 w-20">{c.date}</span>
              )}
              <p className="text-gray-700 flex-1">{c.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">Sin comentarios todavía.</p>
      )}

      {/* Agregar comentario */}
      <div className="pt-2 border-t border-[#EEF0F4] flex gap-2">
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
          placeholder="Agregar comentario..."
          className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 placeholder:text-gray-300"
        />
        <button
          onClick={addComment}
          disabled={saving || !newComment.trim()}
          className="px-4 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-50 shrink-0"
        >
          {saving ? '...' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}
