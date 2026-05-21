'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  /** Intervalo en milisegundos. Por defecto: 5000 (5 seg) */
  intervalMs?: number
}

/**
 * Componente invisible que refresca los datos del servidor
 * cada `intervalMs` milisegundos llamando a router.refresh().
 * Úsalo en cualquier página que necesite polling automático.
 */
export default function AutoRefresh({ intervalMs = 5000 }: Props) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
