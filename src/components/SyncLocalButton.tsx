'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SyncResult {
  total_found: number
  created: number
  duplicates: number
  errors: number
  folders: string[]
  all_folders: { name: string; is_new: boolean }[]
  folder_path: string
}

interface Props {
  configuredPath: string | null
}

export default function SyncLocalButton({ configuredPath }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/sync-local-folders', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al sincronizar')
        return
      }

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
          className="flex items-center gap-2 px-4 py-2 text-white text-sm rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#2D3F52' }}
        >
          <svg
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            {loading ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            )}
          </svg>
          {loading ? 'Sincronizando...' : 'Sincronizar carpeta local'}
        </button>

        {configuredPath && (
          <span className="text-xs text-gray-400 font-mono truncate max-w-xs" title={configuredPath}>
            {configuredPath}
          </span>
        )}
      </div>

      {!configuredPath && (
        <p className="text-xs text-amber-600">
          Agrega <code className="bg-amber-50 px-1 rounded">LOCAL_CLIENTS_FOLDER_PATH</code> en{' '}
          <code className="bg-amber-50 px-1 rounded">.env.local</code> para habilitar la sincronización.
        </p>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
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
            <StatBox label="Encontradas" value={result.total_found} />
            <StatBox label="Nuevas" value={result.created} accent={result.created > 0} />
            <StatBox label="Duplicadas" value={result.duplicates} />
            <StatBox label="Errores" value={result.errors} warning={result.errors > 0} />
          </div>

          {result.all_folders.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Carpetas en la ruta:</p>
              <ul className="space-y-0.5">
                {result.all_folders.map(({ name, is_new }) => (
                  <li key={name} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${is_new ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                    <span className={is_new ? 'text-gray-800 font-medium' : 'text-gray-400'}>
                      {name}
                    </span>
                    {is_new && (
                      <span className="text-[10px] text-emerald-600 font-medium">nueva</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.total_found === 0 && (
            <p className="text-xs text-gray-500">
              La carpeta está vacía o no contiene subcarpetas.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, accent, warning }: { label: string; value: number; accent?: boolean; warning?: boolean }) {
  return (
    <div className="bg-white rounded border border-gray-200 px-3 py-2 text-center">
      <p className={`text-xl font-bold ${accent ? 'text-emerald-600' : warning ? 'text-red-600' : 'text-gray-700'}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}
