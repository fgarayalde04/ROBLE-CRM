'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface AdvisorStat {
  name: string
  count: number
}

interface SyncResult {
  total_found: number
  created: number
  duplicates: number
  errors: number
  advisors: AdvisorStat[]
  clients_folder: string
}

interface Props {
  configuredPath: string | null
}

export default function SyncClientesButton({ configuredPath }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/sync-clientes', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al sincronizar'); return }
      setResult(data)
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={loading || !configuredPath}
          className="flex items-center gap-2 px-4 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Sincronizando...' : 'Sincronizar carpeta Clientes'}
        </button>
        {configuredPath && (
          <span className="text-xs text-gray-400 font-mono truncate max-w-xs" title={configuredPath}>
            {configuredPath}
          </span>
        )}
      </div>

      {!configuredPath && (
        <p className="text-xs text-amber-600">
          Agrega <code className="bg-amber-50 px-1 rounded">CLIENTS_FOLDER_PATH</code> en{' '}
          <code className="bg-amber-50 px-1 rounded">.env.local</code> para habilitar la sincronización.
        </p>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className={`rounded-lg border p-4 space-y-3 ${result.created > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <svg className={`w-4 h-4 ${result.created > 0 ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-800">Sincronización completada</p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Encontradas', value: result.total_found },
              { label: 'Nuevas', value: result.created, accent: result.created > 0 },
              { label: 'Duplicadas', value: result.duplicates },
              { label: 'Errores', value: result.errors, warning: result.errors > 0 },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded border border-gray-200 px-3 py-2 text-center">
                <p className={`text-xl font-bold ${s.accent ? 'text-emerald-600' : s.warning ? 'text-red-600' : 'text-gray-700'}`}>{s.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {result.advisors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Por asesor:</p>
              <div className="flex gap-2 flex-wrap">
                {result.advisors.map((a) => (
                  <span key={a.name} className="text-xs bg-white border border-gray-200 rounded px-2 py-1">
                    <span className="font-medium text-gray-700">{a.name}</span>
                    <span className="text-gray-400 ml-1">({a.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
