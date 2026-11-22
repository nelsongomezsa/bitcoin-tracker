/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
// Al activarse la versión nueva toma el control de las pestañas abiertas.
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Web Push (FCM): muestra la notificación con el título y el texto recibidos.
self.addEventListener('push', (event) => {
  let title = 'Bitcoin Tracker'
  let body: string
  let url = '/avisos'
  try {
    const payload = event.data?.json() ?? {}
    title = payload.notification?.title ?? payload.data?.title ?? title
    body = payload.notification?.body ?? payload.data?.body ?? ''
    if (typeof payload.data?.url === 'string' && payload.data.url.startsWith('/')) url = payload.data.url
  } catch {
    body = event.data?.text() ?? ''
  }
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', data: { url } }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/avisos'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      const c = list[0] as WindowClient | undefined
      return c ? c.navigate(url).then((w) => (w ?? c).focus()).catch(() => c.focus()) : self.clients.openWindow(url)
    }),
  )
})
