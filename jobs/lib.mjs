import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { getAuth } from 'firebase-admin/auth'

export { FieldValue }

export const APP_URL = process.env.APP_URL || 'https://bitcoin-tracker-4aac9.web.app'

export function iniciarAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Falta el secret FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw)) })
  return { db: getFirestore(), messaging: getMessaging(), auth: getAuth() }
}

export async function getJson(url, cabeceras = {}) {
  const res = await fetch(url, { headers: { accept: 'application/json', ...cabeceras } })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).host}`)
  return res.json()
}

const TOKEN_INVALIDO = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])

/** Envía por FCM a todos los tokens y devuelve los caducados. Sin datos de usuario en los logs. */
export function crearEnviarPush(messaging) {
  return async (tokens, { titulo, texto, url = '/avisos' }) => {
    if (!tokens.length) return []
    const r = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: titulo, body: texto },
      data: { url },
      webpush: { fcmOptions: { link: `${APP_URL}${url}` } },
    })
    const invalidos = []
    r.responses.forEach((x, i) => { if (!x.success && TOKEN_INVALIDO.has(x.error?.code)) invalidos.push(tokens[i]) })
    return invalidos
  }
}
