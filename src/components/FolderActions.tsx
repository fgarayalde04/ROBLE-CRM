'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { NewFolder } from '@/types/platform'

interface Props {
  folder: NewFolder
}

export default function FolderActions({ folder }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function setStatus(status: string) {
    setLoading(true)
    await supabase.from('new_folders').update({ status }).eq('id', folder.id)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={`/openings/new?folder=${encodeURIComponent(folder.folder_name)}&url=${encodeURIComponent(folder.onedrive_url ?? '')}`}
        className="text-xs px-2.5 py-1 bg-[#2D3F52] text-white rounded hover:bg-[#354A5E] transition-colors"
      >
        Iniciar apertura
      </a>
      {folder.status === 'pendiente' && (
        <button
          onClick={() => setStatus('ignorada')}
          disabled={loading}
          className="text-xs px-2.5 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Ignorar
        </button>
      )}
      {folder.status === 'ignorada' && (
        <button
          onClick={() => setStatus('pendiente')}
          disabled={loading}
          className="text-xs px-2.5 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Restaurar
        </button>
      )}
    </div>
  )
}
