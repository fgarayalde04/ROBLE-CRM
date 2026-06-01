'use client'

import { useState } from 'react'

interface Props {
  driveId?: string | null
  itemId?: string | null
  webUrl?: string | null
  label?: string
  variant?: 'row' | 'badge'
}

export default function OneDriveFolderButton({
  driveId,
  itemId,
  webUrl,
  label = 'Abrir carpeta',
  variant = 'row',
}: Props) {
  const [status, setStatus] = useState<'idle' | 'opening' | 'error'>('idle')
  const canOpen = !!(driveId && itemId) || !!webUrl?.startsWith('https://')

  if (!canOpen) return <span className="text-gray-300 text-xs">—</span>

  async function handleClick() {
    setStatus('opening')
    try {
      if (driveId && itemId) {
        const url = new URL('/onedrive/folder', window.location.origin)
        url.searchParams.set('driveId', driveId)
        url.searchParams.set('folderId', itemId)
        if (label) url.searchParams.set('name', label.replace(/^Abrir\s+/i, ''))
        window.open(url.toString(), '_blank', 'noopener,noreferrer')
        setStatus('idle')
        return
      }

      const res = await fetch('/api/onedrive/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveId, itemId, webUrl }),
      })
      const data = await res.json()
      if (!res.ok || !data.webUrl) throw new Error(data.error ?? 'Error')
      window.open(data.webUrl, '_blank', 'noopener,noreferrer')
      setStatus('idle')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2500)
    }
  }

  const text = status === 'opening' ? 'Abriendo...' : status === 'error' ? 'Error' : label

  if (variant === 'badge') {
    return (
      <button
        onClick={handleClick}
        disabled={status === 'opening'}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${
          status === 'error'
            ? 'border-red-200 text-red-600 bg-red-50'
            : 'border-[#2D3F52]/20 text-[#2D3F52] bg-[#2D3F52]/5 hover:bg-[#2D3F52]/10'
        }`}
        title={webUrl ?? itemId ?? undefined}
      >
        <FolderIcon className="w-4 h-4" />
        {text}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'opening'}
      className={`inline-flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-40 ${
        status === 'error' ? 'text-red-500' : 'text-[#2D3F52] hover:text-[#16A34A]'
      }`}
      title={webUrl ?? itemId ?? undefined}
    >
      <FolderIcon className="w-3.5 h-3.5" />
      {status === 'opening' ? '...' : status === 'error' ? 'Error' : label}
    </button>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}
