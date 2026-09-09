'use client'

import { useEffect, useState } from 'react'

export default function PortfolioShareControl({
  clientId,
  initialSharedWithUserIds,
  currentUserId,
}: {
  clientId: string
  initialSharedWithUserIds: string[]
  currentUserId: string
}) {
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; email: string }[]>([])
  const [sharedIds, setSharedIds] = useState<string[]>(initialSharedWithUserIds)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/team-emails')
      .then(r => r.json())
      .then(d => setTeamMembers(Array.isArray(d) ? d.filter((m: any) => m.id !== currentUserId) : []))
      .catch(() => {})
  }, [currentUserId])

  const toggleMember = async (userId: string) => {
    const next = sharedIds.includes(userId) ? sharedIds.filter(id => id !== userId) : [...sharedIds, userId]
    setSaving(true)
    setSharedIds(next) // optimista
    try {
      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clientId, shared_with_user_ids: next }),
      })
      if (!res.ok) setSharedIds(sharedIds) // revertir si falló
    } catch {
      setSharedIds(sharedIds)
    } finally {
      setSaving(false)
    }
  }

  if (teamMembers.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Compartir portafolio</h2>
      <p className="text-[11px] text-gray-400 mb-3">
        Además del asesor asignado, elegí qué otros usuarios pueden ver el portafolio de este cliente.
      </p>
      <div className="space-y-1.5">
        {teamMembers.map(m => (
          <label key={m.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sharedIds.includes(m.id)}
              disabled={saving}
              onChange={() => toggleMember(m.id)}
              className="rounded border-gray-300"
            />
            {m.name}
          </label>
        ))}
      </div>
    </div>
  )
}
