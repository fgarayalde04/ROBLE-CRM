'use client'

import { useEffect, useRef, useState } from 'react'

type PersonalFile = {
  id: string
  file_name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  notes: string | null
  created_at: string
}

interface Props {
  userId: string
  userName: string
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('es-UY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export default function MiCarpetaClient({ userName }: Props) {
  const [files, setFiles]             = useState<PersonalFile[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadFiles() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/personal-files')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cargar archivos')
      setFiles(data.files ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFiles() }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/personal-files', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al subir archivo')
      setFiles((prev) => [data.file, ...prev])
    } catch (e: any) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function startEdit(f: PersonalFile) {
    setEditingId(f.id)
    setEditingName(f.file_name)
  }

  async function saveEdit(id: string) {
    if (!editingName.trim()) { setEditingId(null); return }
    try {
      const res = await fetch('/api/personal-files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, file_name: editingName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, file_name: data.file.file_name } : f))
    } catch (e: any) {
      alert(e.message)
    } finally {
      setEditingId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este archivo?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/personal-files?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al eliminar')
      }
      setFiles((prev) => prev.filter((f) => f.id !== id))
    } catch (e: any) {
      alert(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-8 min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D3F52]">Mi carpeta</h1>
          <p className="mt-0.5 text-sm text-gray-500">{userName} · Archivos personales</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#2D3F52' }}
          >
            {uploading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Subiendo…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Subir archivo
              </>
            )}
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {uploadError}
        </div>
      )}

      {/* File list */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400 animate-pulse">
            Cargando archivos…
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center text-sm text-red-500">{error}</div>
        ) : files.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-gray-400">No tenés archivos aún. ¡Subí el primero!</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tamaño</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {files.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    {editingId === f.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => saveEdit(f.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(f.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full text-sm border border-blue-400 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span className="font-medium text-gray-900 truncate">{f.file_name}</span>
                        <button
                          onClick={() => startEdit(f)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 shrink-0"
                          title="Renombrar"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatSize(f.file_size)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(f.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={f.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#2D3F52] hover:underline"
                      >
                        Ver / Descargar
                      </a>
                      <button
                        onClick={() => handleDelete(f.id)}
                        disabled={deletingId === f.id}
                        className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === f.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
