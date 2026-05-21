'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface TeamMember { id: string; name: string }

export default function UserSwitcher() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [input, setInput] = useState('')
  const [changing, setChanging] = useState(false)
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/user-session').then((r) => r.json()),
      fetch('/api/team-members').then((r) => r.json()),
    ]).then(([session, team]) => {
      setCurrentUser(session.user ?? null)
      setMembers(Array.isArray(team) ? team : [])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (changing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [changing])

  async function handleSet(name: string) {
    if (!name.trim()) return
    await fetch('/api/user-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setCurrentUser(name.trim())
    setChanging(false)
    setInput('')
    router.refresh()
  }

  async function handleClear() {
    await fetch('/api/user-session', { method: 'DELETE' })
    setCurrentUser(null)
    router.refresh()
  }

  if (loading) return null

  if (currentUser && !changing) {
    return (
      <div className="flex items-center gap-3 px-6 py-2 bg-[#F4F6F8] border-b border-gray-200 text-xs text-gray-500">
        <span>
          Vista de: <span className="font-medium text-[#2D3F52]">{currentUser}</span>
        </span>
        <button
          onClick={() => setChanging(true)}
          className="text-[#16A34A] hover:underline"
        >
          cambiar
        </button>
        <button
          onClick={handleClear}
          className="text-gray-400 hover:text-gray-600 hover:underline"
        >
          ver todos
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-6 py-2 bg-[#F4F6F8] border-b border-gray-200 text-xs text-gray-500">
      <span>Ver como:</span>
      {members.length > 0 ? (
        <select
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
        >
          <option value="">— elegir —</option>
          {members.map((m) => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSet(input)}
          placeholder="Tu nombre..."
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 w-32 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
        />
      )}
      <button
        onClick={() => handleSet(input)}
        disabled={!input.trim()}
        className="px-2 py-1 bg-[#2D3F52] text-white rounded text-xs hover:bg-[#354A5E] disabled:opacity-40 transition-colors"
      >
        Confirmar
      </button>
      {currentUser && (
        <button
          onClick={() => setChanging(false)}
          className="text-gray-400 hover:text-gray-600 hover:underline"
        >
          cancelar
        </button>
      )}
    </div>
  )
}
