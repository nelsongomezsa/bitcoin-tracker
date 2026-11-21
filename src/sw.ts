/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

// Web Push (FCM): muestra la notificación con el título y el texto recibidos.
self.addEventListener('push', (event) => {
  let title = 'Bitcoin Tracker'
  let body: string
  try {
    const payload = event.data?.json() ?? {}
    title = payload.notification?.title ?? payload.data?.title ?? title
    body = payload.notification?.body ?? payload.data?.body ?? ''
  } catch {
    body = event.data?.text() ?? ''
  }
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      const c = list[0]
      return c ? c.focus() : self.clients.openWindow('/')
    }),
  )
})
