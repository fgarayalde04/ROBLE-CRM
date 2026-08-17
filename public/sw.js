// Roble Capital — Service Worker
// Scope: push notifications only. No offline caching (by design, for now).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── Push: show a notification ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Roble Capital', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Roble Capital'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: {
      url: data.url || '/',
      type: data.type || null,
      entityId: data.entityId || null,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Click: focus existing tab or open a new one, then navigate ────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => {
        try {
          return new URL(c.url).origin === self.location.origin
        } catch {
          return false
        }
      })

      if (existing) {
        return existing.focus().then((focused) => {
          if (focused && 'navigate' in focused) {
            return focused.navigate(targetUrl)
          }
          return focused
        })
      }

      return self.clients.openWindow(targetUrl)
    })
  )
})
