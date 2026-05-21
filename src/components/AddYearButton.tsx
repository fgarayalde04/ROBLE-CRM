'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface AddYearButtonProps {
  advisor: string
  company: string
  tab: string
  mostRecentYear: number | null
}

export default function AddYearButton({ advisor, company, tab, mostRecentYear }: AddYearButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [targetYear, setTargetYear] = useState<number>(mostRecentYear ? mostRecentYear + 1 : new Date().getFullYear() + 1)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      const res = await fetch(`/api/liquidacion-brokers?action=create-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advisor,
          company,
          target_year: targetYear,
          source_year: mostRecentYear ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Error creando año')
        return
      }
      setOpen(false)
      startTransition(() => {
        router.push(
          `?advisor=${encodeURIComponent(advisor)}&company=${encodeURIComponent(company)}&year=${targetYear}&tab=${tab}`
        )
        router.refresh()
      })
    } catch {
      setError('Error de red')
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-[#2D3F52] hover:text-[#2D3F52] transition-colors"
      >
        + Año
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={targetYear}
        onChange={(e) => setTargetYear(parseInt(e.target.value))}
        className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#2D3F52]"
        min={2020}
        max={2100}
      />
      <button
        onClick={handleCreate}
        disabled={isPending || isNaN(targetYear)}
        className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-[#2D3F52] text-white hover:bg-[#1a3560] transition-colors disabled:opacity-50"
      >
        {isPending ? 'Creando…' : 'Crear'}
      </button>
      <button
        onClick={() => { setOpen(false); setError(null) }}
        className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 transition-colors"
      >
        Cancelar
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
