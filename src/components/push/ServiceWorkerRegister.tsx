'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/push/client'

// Registers the SW silently on load — this does NOT request notification
// permission (that only happens when the user clicks "Activar notificaciones").
export default function ServiceWorkerRegister() {
  useEffect(() => {
    registerServiceWorker()
  }, [])
  return null
}
