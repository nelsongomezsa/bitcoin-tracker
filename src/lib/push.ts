import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { app, vapidKey } from './firebase'

export async function pushSoportado(): Promise<boolean> {
  try {
    return Boolean(app) && 'serviceWorker' in navigator && 'Notification' in window && (await isSupported())
  } catch {
    return false
  }
}

/** Pide permiso (solo desde un gesto del usuario) y devuelve el token FCM. */
export async function activarPush(): Promise<string> {
  if (!app || !vapidKey) throw new Error('push-no-configurado')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('permiso-denegado')
  const registro = await navigator.serviceWorker.ready
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registro })
  if (!token) throw new Error('sin-token')
  return token
}
