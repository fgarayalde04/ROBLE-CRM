'use client'

import { useState, useEffect } from 'react'

interface ClientEmail {
  id: string
  email: string
  label: string | null
}

export default function ClientEmailsManager({ clientId, primaryEmail }: { clientId: string; primaryEmail: string | null }) {
  const [emails, setEmails] = useState<ClientEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/clients/${clientId}/emails`)
      .then((r) => r.json())
      .then((d) => setEmails(d.emails ?? []))
      .finally(() => setLoading(false))
  }, [clientId])

  async function handleAdd() {
    setError(null)
    if (!newEmail.trim() || !newEmail.includes('@')) { setError('Ingresá un email válido'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), label: newLabel.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al agregar'); return }
      setEmails((prev) => [...prev, data.email])
      setNewEmail(''); setNewLabel(''); setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setEmails((prev) => prev.filter((e) => e.id !== id))
    await fetch(`/api/clients/${clientId}/emails/${id}`, { method: 'DELETE' })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Emails de la cuenta</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-blue-600 hover:underline font-medium">
            + Agregar
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {primaryEmail && (
          <li className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <a href={`mailto:${primaryEmail}`} className="text-sm text-gray-900 hover:underline truncate block">{primaryEmail}</a>
              <span className="text-[10px] text-gray-400">Principal</span>
            </div>
          </li>
        )}
        {loading ? (
          <li className="text-xs text-gray-400">Cargando…</li>
        ) : (
          emails.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <a href={`mailto:${e.email}`} className="text-sm text-gray-900 hover:underline truncate block">{e.email}</a>
                {e.label && <span className="text-[10px] text-gray-400">{e.label}</span>}
              </div>
              <button onClick={() => handleDelete(e.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0" aria-label="Quitar email">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))
        )}
        {!loading && !primaryEmail && emails.length === 0 && (
          <li className="text-xs text-gray-400">Sin emails cargados.</li>
        )}
      </ul>

      {adding && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email@ejemplo.com"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            autoFocus
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Etiqueta (opcional) — ej. Apoderado, Contador"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold bg-[#2D3F52] text-white rounded-lg hover:bg-[#354A5E] disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => { setAdding(false); setError(null); setNewEmail(''); setNewLabel('') }}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
