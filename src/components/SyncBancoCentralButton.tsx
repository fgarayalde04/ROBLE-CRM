'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SyncResult {
  found: number
  created: number
  updated: number
  errors: string[]
}

export default function SyncBancoCentralButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function sync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bcu' }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setResult(`Error: ${err.error ?? res.statusText}`)
        return
      }

      const json = await res.json()
      const local = json.results?.bcu_local   as SyncResult | undefined
      const intl  = json.results?.bcu_internacional as SyncResult | undefined

      const created = (local?.created ?? 0) + (intl?.created ?? 0)
      const updated = (local?.updated ?? 0) + (intl?.updated ?? 0)
      const errors  = [...(local?.errors ?? []), ...(intl?.errors ?? [])]

      if (errors.length > 0) {
        setResult(`⚠ ${errors[0]}`)
      } else if (created > 0) {
        setResult(`✓ ${created} legajo${created !== 1 ? 's' : ''} nuevo${created !== 1 ? 's' : ''} importado${created !== 1 ? 's' : ''}`)
      } else if (updated > 0) {
        setResult(`✓ ${updated} legajo${updated !== 1 ? 's' : ''} actualizado${updated !== 1 ? 's' : ''}`)
      } else {
        setResult('Todos los legajos ya estaban sincronizados')
      }

      router.refresh()
    } catch (e) {
      setResult(`Error de red: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className={`text-xs font-medium ${result.startsWith('✓') ? 'text-emerald-700' : result.startsWith('⚠') ? 'text-amber-600' : 'text-red-500'}`}>
          {result}
        </span>
      )}
      <button
        onClick={sync}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 bg-[#2D3F52] text-white text-sm rounded-lg hover:bg-[#354A5E] transition-colors disabled:opacity-40"
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
        {syncing ? 'Sincronizando...' : 'Sincronizar Banco Central'}
      </button>
    </div>
  )
}
