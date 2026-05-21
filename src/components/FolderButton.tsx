'use client'

import { useState } from 'react'

interface Props {
  path: string | null | undefined
  label?: string
  variant?: 'row'   // compact table row style
          | 'badge' // pill badge style (for detail pages)
}

export default function FolderButton({ path, label = 'Carpeta', variant = 'row' }: Props) {
  const [status, setStatus] = useState<'idle' | 'opening' | 'error'>('idle')

  if (!path) return <span className="text-gray-300 text-xs">—</span>

  async function handleClick() {
    setStatus('opening')
    try {
      const res = await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (!res.ok) throw new Error('Error')
      setStatus('idle')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  if (variant === 'badge') {
    return (
      <button
        onClick={handleClick}
        disabled={status === 'opening'}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors
          ${status === 'error'
            ? 'border-red-200 text-red-600 bg-red-50'
            : 'border-[#2D3F52]/20 text-[#2D3F52] bg-[#2D3F52]/5 hover:bg-[#2D3F52]/10'
          } disabled:opacity-50`}
      >
        <FolderIcon className="w-4 h-4" />
        {status === 'opening' ? 'Abriendo...' : status === 'error' ? 'Error' : label}
      </button>
    )
  }

  // variant === 'row'
  return (
    <button
      onClick={handleClick}
      disabled={status === 'opening'}
      className={`inline-flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-40
        ${status === 'error'
          ? 'text-red-500'
          : 'text-[#2D3F52] hover:text-[#16A34A]'
        }`}
      title={path}
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
