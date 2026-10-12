'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// "Cuenta abierta": deja la apertura en cuenta_abierta y el cliente en activo,
// sin tener que ir a editar el estado a mano.
export default function MarkAccountOpenedButton({
  openingId,
  clientId,
  name,
  size = 'sm',
}: {
  openingId?: string | null
  clientId?: string | null
  name?: string
  size?: 'xs' | 'sm'
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`¿Confirmás que la cuenta${name ? ` de ${name}` : ''} ya está abierta? Pasa a cliente activo.`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/openings/mark-opened', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(openingId ? { opening_id: openingId } : { client_id: clientId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'No se pudo marcar la cuenta como abierta')
      }
      router.refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const sizing = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1'
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="Marcar la cuenta como abierta (cliente activo)"
      className={`${sizing} inline-flex items-center gap-1 font-medium rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap transition-colors`}
    >
      {loading ? '…' : '✓ Cuenta abierta'}
    </button>
  )
}
