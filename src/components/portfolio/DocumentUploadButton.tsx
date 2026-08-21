'use client'
import { useRef, useState } from 'react'

// Single-file upload button used for the enrichment document types (Cash
// Projections Excel, Performance PDF, Unrealized Gain/Loss Excel) — unlike
// positions, these don't need a preview/confirm step: they're supplementary
// data tied to whatever account page you're already on, not a new snapshot
// to review first.
export default function DocumentUploadButton({ accountNumber, endpoint, accept, label, onImported }: {
  accountNumber: string
  endpoint: 'performance' | 'cashflows' | 'unrealizedgl'
  accept: string
  label: string
  onImported: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/${endpoint}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al importar'); return }
      onImported()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
      >
        {uploading ? 'Importando…' : label}
      </button>
      <input ref={fileRef} type="file" accept={accept} className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
      {error && <p className="text-[11px] text-red-600 mt-1 max-w-xs">{error}</p>}
    </div>
  )
}
