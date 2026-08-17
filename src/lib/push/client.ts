'use client'

// ─── Client-side Web Push helpers ──────────────────────────────────────────────
// No permission is requested here on its own — callers decide when to prompt.

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ reports as Mac but has touch support
  const isIPadOS = ua.includes('Macintosh') && navigator.maxTouchPoints > 1
  return isIOSDevice || isIPadOS
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.error('[push] SW registration failed', err)
    return null
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed'

export async function getPushState(): Promise<NotificationPermissionState> {
  if (!isPushSupported()) return 'unsupported'
  const perm = Notification.permission
  if (perm === 'denied') return 'denied'
  if (perm === 'default') return 'default'

  // granted — check if we actually have an active subscription
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'subscribed' : 'granted'
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPushSupported()) return { ok: false, error: 'Este navegador no soporta notificaciones push.' }

  const reg = await registerServiceWorker()
  if (!reg) return { ok: false, error: 'No se pudo registrar el Service Worker.' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, error: permission === 'denied' ? 'Permiso denegado.' : 'Permiso no otorgado.' }
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return { ok: false, error: 'Falta configurar la clave pública VAPID.' }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })
  }

  const json = sub.toJSON()
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error ?? 'No se pudo guardar la suscripción.' }
  }
  return { ok: true }
}

export async function disablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPushSupported()) return { ok: true }
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
    await sub.unsubscribe()
  }
  return { ok: true }
}

// ─── App badge (unread count on the home-screen icon) ──────────────────────────
// Prepared for future use — not wired to any real unread count yet.
// Support: Chrome/Edge on Android + desktop, Safari on iOS 16.4+ standalone. No-ops elsewhere.

export function isBadgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator
}

export async function setAppBadge(count: number): Promise<void> {
  if (!isBadgeSupported()) return
  try {
    if (count > 0) await (navigator as any).setAppBadge(count)
    else await (navigator as any).clearAppBadge()
  } catch {
    // Unsupported in this context — ignore, never block on it.
  }
}

export async function sendTestPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('/api/push/test', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error ?? 'Error al enviar la notificación de prueba.' }
  return { ok: true }
}
