'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDisconnect() {
    if (!confirm('¿Desconectar tu cuenta Google del CRM?')) return
    setLoading(true)
    try {
      await fetch('/api/auth/google-disconnect', { method: 'POST' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="text-xs px-3 py-1.5 border border-red-200 rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      {loading ? 'Desconectando...' : 'Desconectar Google'}
    </button>
  )
}
