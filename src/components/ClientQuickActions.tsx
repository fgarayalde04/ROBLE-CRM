'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Client } from '@/types/platform'

interface Props {
  client: Client
}

export default function ClientQuickActions({ client }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function updateStatus(status: string, label: string) {
    setLoading(label)
    setError(null)
    try {
      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al actualizar')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  async function addNote() {
    if (!note.trim()) return
    setLoading('nota')
    setError(null)
    try {
      const today = new Date()
      const dd = String(today.getDate()).padStart(2, '0')
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const yyyy = today.getFullYear()
      const prefix = `[${dd}/${mm}/${yyyy}] `
      const existing = client.notes?.trim() ?? ''
      const updated = existing ? `${existing}\n${prefix}${note.trim()}` : `${prefix}${note.trim()}`

      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, notes: updated }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar nota')
      setNote('')
      setShowNote(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  async function iniciarApertura() {
    setLoading('apertura')
    setError(null)
    try {
      // 1. Crear la apertura
      const res = await fetch('/api/openings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          folder_name: `${client.first_name} ${client.last_name}`.trim(),
          status: 'carpeta_creada',
          start_date: new Date().toISOString().split('T')[0],
          source: 'local_folder',
          folder_path: client.onedrive_folder_url ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear apertura')

      // 2. Actualizar estado del cliente
      await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, status: 'en_apertura' }),
      })

      router.push(`/openings/${data.id}`)
    } catch (err: any) {
      setError(err.message)
      setLoading(null)
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>
      )}

      {/* Note input inline */}
      {showNote && (
        <div className="flex gap-2 items-start">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Escribir nota…"
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                addNote()
              }
              if (e.key === 'Escape') setShowNote(false)
            }}
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={addNote}
              disabled={loading === 'nota' || !note.trim()}
              className="px-2 py-1 bg-[#2D3F52] text-white text-xs rounded hover:bg-[#354A5E] disabled:opacity-40 transition-colors"
            >
              {loading === 'nota' ? '…' : 'OK'}
            </button>
            <button
              onClick={() => setShowNote(false)}
              className="px-2 py-1 border border-gray-200 text-gray-500 text-xs rounded hover:bg-gray-50 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/clients/${client.id}`}
          className="px-2.5 py-1 text-xs border border-gray-200 text-gray-600 rounded hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          Ver ficha
        </Link>

        <button
          onClick={() => setShowNote((v) => !v)}
          className="px-2.5 py-1 text-xs border border-gray-200 text-gray-600 rounded hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          + Nota
        </button>

        <button
          onClick={iniciarApertura}
          disabled={loading === 'apertura'}
          className="px-2.5 py-1 text-xs border border-[#16A34A] text-[#16A34A] rounded hover:bg-green-50 transition-colors disabled:opacity-40"
        >
          {loading === 'apertura' ? 'Creando…' : 'Iniciar apertura →'}
        </button>

        <button
          onClick={() => updateStatus('activo', 'activo')}
          disabled={loading === 'activo'}
          className="px-2.5 py-1 text-xs border border-blue-200 text-blue-600 rounded hover:bg-blue-50 transition-colors disabled:opacity-40"
        >
          {loading === 'activo' ? '…' : 'Marcar activo'}
        </button>

        <button
          onClick={() => updateStatus('descartado', 'descartar')}
          disabled={loading === 'descartar'}
          className="px-2.5 py-1 text-xs border border-red-100 text-red-400 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
        >
          {loading === 'descartar' ? '…' : 'Descartar'}
        </button>
      </div>
    </div>
  )
}
