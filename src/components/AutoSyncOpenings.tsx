'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Runs silently on mount — calls POST /api/sync to detect new folders in the
 * Clientes OneDrive folder and apply the same sync rules as the scheduler.
 * Shows a subtle badge only when new openings were actually added.
 */
export default function AutoSyncOpenings() {
  const router = useRouter()
  const [newCount, setNewCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'clientes' }),
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        const created = data.results?.clientes?.created ?? 0
        if (created > 0) {
          setNewCount(created)
          router.refresh()
        }
      } catch {
        // Silent — network errors shouldn't disrupt the page
      }
    }

    run()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!newCount) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      {newCount} nueva{newCount !== 1 ? 's' : ''} carpeta{newCount !== 1 ? 's' : ''} detectada{newCount !== 1 ? 's' : ''} en Clientes
    </div>
  )
}
