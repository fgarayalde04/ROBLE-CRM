'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StartOpeningButton({ openingId }: { openingId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleStart() {
    setLoading(true)
    try {
      await fetch('/api/openings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: openingId,
          status: 'recolectando_informacion',
          start_date: new Date().toISOString().split('T')[0],
        }),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleStart}
      disabled={loading}
      className="text-xs px-3 py-1 rounded font-medium text-white transition-colors disabled:opacity-60 whitespace-nowrap"
      style={{ backgroundColor: loading ? '#6b7280' : '#16A34A' }}
      onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#15803d' }}
      onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#16A34A' }}
    >
      {loading ? '...' : 'Comenzar'}
    </button>
  )
}
