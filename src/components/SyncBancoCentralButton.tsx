'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncBancoCentralButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function sync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/sync-banco-central', { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        const r = json.results ?? {}
        const created =
          ((r.cundry as any)?.created ?? 0) + ((r.genelie as any)?.created ?? 0)
        setResult(
          created > 0
            ? `✓ ${created} legajo${created !== 1 ? 's' : ''} nuevo${created !== 1 ? 's' : ''} importado${created !== 1 ? 's' : ''}`
            : 'Todos los legajos ya estaban sincronizados',
        )
        router.refresh()
      }
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-xs text-emerald-700 font-medium">{result}</span>
      )}
      <button
        onClick={sync}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-40"
      >
        <svg
          className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {syncing ? 'Sincronizando...' : 'Sincronizar carpetas'}
      </button>
    </div>
  )
}
