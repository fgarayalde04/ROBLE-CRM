'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

interface Props {
  openingId: string
  currentStatus: string
}

export default function MarkOpenedButton({ openingId, currentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (currentStatus === 'cuenta_abierta') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Cuenta abierta
      </span>
    )
  }

  async function handleClick() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('account_openings')
      .update({ status: 'cuenta_abierta', opened_date: today })
      .eq('id', openingId)
    router.push('/openings')
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded transition-colors disabled:opacity-50"
      style={{ backgroundColor: '#16A34A' }}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {loading ? 'Guardando...' : 'Marcar como abierta'}
    </button>
  )
}
