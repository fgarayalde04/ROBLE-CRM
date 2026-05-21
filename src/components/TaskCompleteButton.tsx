'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  taskId: string
  completed: boolean
  onComplete?: () => void
}

export default function TaskCompleteButton({ taskId, completed, onComplete }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(completed)

  async function handleClick() {
    if (done || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          status: 'completado',
          completed_at: new Date().toISOString(),
        }),
      })
      if (res.ok) {
        setDone(true)
        onComplete?.()
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={done ? 'Completado' : 'Marcar como completado'}
      className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
        done
          ? 'bg-[#2D3F52] border-[#2D3F52]'
          : 'border-gray-300 hover:border-[#16A34A]'
      } ${loading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
    >
      {done && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 12 12"
          className="w-2.5 h-2.5 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="2 6 5 9 10 3" />
        </svg>
      )}
    </button>
  )
}
