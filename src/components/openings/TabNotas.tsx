'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OpeningNote } from '@/types/platform'

interface Props {
  notes: OpeningNote[]
  openingId: string
}

export default function TabNotas({ notes: initialNotes, openingId }: Props) {
  const router = useRouter()
  const [notes, setNotes] = useState<OpeningNote[]>(initialNotes)
  const [showClosed, setShowClosed] = useState(false)
  const [newText, setNewText] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [closing, setClosing] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const openNotes = notes.filter((n) => n.status === 'abierta')
  const closedNotes = notes.filter((n) => n.status === 'cerrada')

  async function handleAdd() {
    if (!newText.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/openings/${openingId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText.trim(), author: newAuthor.trim() || null }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Error al guardar')
      }
      const created = await res.json()
      setNotes((prev) => [created, ...prev])
      setNewText('')
      setNewAuthor('')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClose(note: OpeningNote) {
    setClosing((prev) => new Set(prev).add(note.id))

    try {
      const res = await fetch(`/api/openings/${openingId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: note.id,
          status: 'cerrada',
          closed_at: new Date().toISOString(),
          closed_by: null,
        }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)))
      router.refresh()
    } catch {
      // handle silently
    } finally {
      setClosing((prev) => {
        const next = new Set(prev)
        next.delete(note.id)
        return next
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Add note */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Nueva nota</h2>
        <div className="space-y-3">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Escribe la nota..."
            rows={3}
            className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newAuthor}
              onChange={(e) => setNewAuthor(e.target.value)}
              placeholder="Autor (opcional)"
              className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={submitting || !newText.trim()}
              className="px-4 py-2 text-sm rounded bg-[#2D3F52] text-white hover:bg-[#354A5E] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {submitting ? 'Guardando...' : 'Agregar nota'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>

      {/* Open notes */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
          Notas abiertas ({openNotes.length})
        </h2>
        {openNotes.length === 0 ? (
          <p className="text-sm text-gray-400">No hay notas abiertas.</p>
        ) : (
          <div className="space-y-3">
            {openNotes.map((note) => (
              <div key={note.id} className="flex items-start gap-3 border border-gray-100 rounded p-3">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleClose(note)}
                  disabled={closing.has(note.id)}
                  title="Marcar como cerrada"
                  className="mt-0.5 w-4 h-4 accent-[#16A34A] cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-relaxed">{note.text}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {note.author && (
                      <span className="text-[10px] text-gray-400">{note.author}</span>
                    )}
                    <span className="text-[10px] text-gray-300">
                      {new Date(note.created_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Closed notes */}
      {closedNotes.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Cerradas ({closedNotes.length})
            </h2>
            <span className="text-xs text-gray-400">{showClosed ? 'ocultar' : 'mostrar'}</span>
          </button>
          {showClosed && (
            <div className="mt-4 space-y-3">
              {closedNotes.map((note) => (
                <div key={note.id} className="border border-gray-100 rounded p-3 bg-gray-50">
                  <p className="text-sm text-gray-500 line-through leading-relaxed">{note.text}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {note.author && (
                      <span className="text-[10px] text-gray-400">{note.author}</span>
                    )}
                    {note.closed_at && (
                      <span className="text-[10px] text-gray-300">
                        Cerrada {new Date(note.closed_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                    {note.closed_by && (
                      <span className="text-[10px] text-gray-400">por {note.closed_by}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
