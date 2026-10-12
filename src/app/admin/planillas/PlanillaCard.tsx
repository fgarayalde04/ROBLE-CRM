'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanillaInfo } from '@/lib/planillas/settings'

// Tarjeta de una planilla con su nombre y descripción editables (lápiz).
export default function PlanillaCard({ planilla }: { planilla: PlanillaInfo }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(planilla.title)
  const [description, setDescription] = useState(planilla.description)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/planillas/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: planilla.book, title, description }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setEditing(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-[#2D3F52]/30 bg-white p-5 shadow-sm">
        <label className="text-xs text-gray-500">Nombre</label>
        <input
          autoFocus
          value={title}
          maxLength={80}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-medium text-[#2D3F52]"
        />
        <label className="mt-3 block text-xs text-gray-500">Descripción</label>
        <input
          value={description}
          maxLength={160}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600"
        />
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button onClick={save} disabled={saving || !title.trim()} className="rounded-md bg-[#2D3F52] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={() => { setEditing(false); setTitle(planilla.title); setDescription(planilla.description); setError(null) }}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link href={planilla.href} className="block p-5 pr-12">
        <h2 className="font-medium text-[#2D3F52]">{planilla.title}</h2>
        {planilla.description && <p className="mt-1 text-sm text-gray-500">{planilla.description}</p>}
      </Link>
      <button
        onClick={() => setEditing(true)}
        title="Editar nombre"
        aria-label="Editar nombre"
        className="absolute right-3 top-3 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#2D3F52]"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M13.6 3.6l2.8 2.8M4 16l3.2-.7 8.6-8.6a1.4 1.4 0 000-2l-.5-.5a1.4 1.4 0 00-2 0L4.7 12.8 4 16z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
