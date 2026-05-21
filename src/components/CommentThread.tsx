'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Comment {
  id: string
  entity_type: string
  entity_id: string | null
  author: string
  content: string
  created_at: string
}

interface CommentThreadProps {
  entityType: string
  entityId: string
  currentUser?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'hace un momento'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days}d`
  return new Date(dateStr).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })
}

const STORAGE_KEY = 'crm_username'

// ─── Main component ───────────────────────────────────────────────────────────

export default function CommentThread({ entityType, entityId, currentUser }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [author, setAuthor] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listEndRef = useRef<HTMLDivElement>(null)

  // Load stored author name
  useEffect(() => {
    if (currentUser) {
      setAuthor(currentUser)
      return
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setAuthor(saved)
    }
  }, [currentUser])

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/comments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`
      )
      const data = await res.json()
      if (Array.isArray(data)) setComments(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // Save author to localStorage when changed
  const handleAuthorChange = (val: string) => {
    setAuthor(val)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, val)
    }
  }

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || !author.trim()) return
    setError(null)

    // Optimistic update
    const optimistic: Comment = {
      id: `tmp-${Date.now()}`,
      entity_type: entityType,
      entity_id: entityId,
      author: author.trim(),
      content: content.trim(),
      created_at: new Date().toISOString(),
    }
    setComments((prev) => [...prev, optimistic])
    setContent('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          author: author.trim(),
          content: optimistic.content,
        }),
      })

      if (!res.ok) {
        // Rollback
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id))
        setContent(optimistic.content)
        setError('No se pudo guardar el comentario.')
        return
      }

      const saved: Comment = await res.json()
      // Replace optimistic with real record
      setComments((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)))
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id))
      setContent(optimistic.content)
      setError('Error de conexion.')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete
  const handleDelete = async (id: string) => {
    if (id.startsWith('tmp-')) return
    setComments((prev) => prev.filter((c) => c.id !== id))
    try {
      await fetch(`/api/comments?id=${id}`, { method: 'DELETE' })
    } catch {
      // silent — we already removed it optimistically
    }
  }

  // Scroll to bottom when new comment added
  useEffect(() => {
    if (comments.length > 0) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [comments.length])

  return (
    <div className="border border-gray-100 rounded-xl bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Notas del equipo</h3>
        {comments.length > 0 && (
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {comments.length}
          </span>
        )}
      </div>

      {/* Comment list */}
      <div className="px-4 py-3 space-y-3 max-h-72 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-4">Cargando...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Sin notas todavia.</p>
        ) : (
          comments.map((c) => (
            <CommentItem key={c.id} comment={c} onDelete={handleDelete} />
          ))
        )}
        <div ref={listEndRef} />
      </div>

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-2">
        {/* Author field — only show if not pre-filled via prop */}
        {!currentUser && (
          <input
            type="text"
            value={author}
            onChange={(e) => handleAuthorChange(e.target.value)}
            placeholder="Tu nombre"
            className="w-full text-xs text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#16A34A] placeholder-gray-400"
          />
        )}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escribir una nota..."
          rows={3}
          className="w-full text-sm text-gray-700 px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#16A34A] resize-none placeholder-gray-400"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {author ? (
              <span className="text-gray-600 font-medium">{author}</span>
            ) : (
              'Ingresa tu nombre arriba'
            )}
          </span>
          <button
            type="submit"
            disabled={submitting || !content.trim() || !author.trim()}
            className="px-4 py-1.5 text-xs font-medium text-white bg-[#2D3F52] rounded-lg hover:bg-[#354A5E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Guardando...' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Comment item ─────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  onDelete,
}: {
  comment: Comment
  onDelete: (id: string) => void
}) {
  const [hover, setHover] = useState(false)
  const isOptimistic = comment.id.startsWith('tmp-')

  return (
    <div
      className={`group relative flex gap-3 ${isOptimistic ? 'opacity-60' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Author avatar pill */}
      <div className="flex-shrink-0 mt-0.5">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#2D3F52]/10 text-[10px] font-semibold text-[#2D3F52] uppercase">
          {comment.author.charAt(0)}
        </span>
      </div>

      {/* Bubble */}
      <div className="flex-1 min-w-0">
        <div className="bg-gray-50 rounded-xl rounded-tl-none px-3 py-2">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-700">{comment.author}</span>
            <span className="text-[10px] text-gray-400">{relativeTime(comment.created_at)}</span>
          </div>
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
        </div>
      </div>

      {/* Delete button */}
      {hover && !isOptimistic && (
        <button
          onClick={() => onDelete(comment.id)}
          className="absolute top-0 right-0 w-5 h-5 rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="Eliminar"
        >
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}
