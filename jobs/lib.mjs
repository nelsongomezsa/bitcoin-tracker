import admin from 'firebase-admin'
import { claveSegura } from './alertas.mjs'

export function iniciarAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Falta el secret FIREBASE_SERVICE_ACCOUNT')
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
  return { db: admin.firestore(), messaging: admin.messaging() }
}

export async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).host}`)
  return res.json()
}

const TOKEN_INVALIDO = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])

/**
 * Envía a todos los tokens del usuario y devuelve los que hay que borrar.
 * No se registra ningún dato de usuario ni token en los logs.
 */
export async function enviarPush(messaging, tokens, { titulo, texto }) {
  if (!tokens.length) return { enviados: 0, invalidos: [] }
  const r = await messaging.sendEachForMulticast({ tokens, notification: { title: titulo, body: texto }, webpush: { fcmOptions: { link: '/' } } })
  const invalidos = []
  r.responses.forEach((x, i) => { if (!x.success && TOKEN_INVALIDO.has(x.error?.code)) invalidos.push(tokens[i]) })
  return { enviados: r.successCount, invalidos }
}

/** Procesa a todos los usuarios con avisos activos. `generar(userDoc)` devuelve la lista de avisos. */
export async function procesarUsuarios({ db, messaging }, generar, filtrarRepetidos) {
  const FieldValue = admin.firestore.FieldValue
  const snap = await db.collectionGroup('avisos').get()
  let usuarios = 0, push = 0
  for (const d of snap.docs) {
    if (d.id !== 'config') continue
    const data = d.data()
    const tokens = Array.isArray(data.tokens) ? data.tokens : []
    if (!tokens.length) continue
    const candidatos = filtrarRepetidos(generar(data), data.enviados)
    if (!candidatos.length) continue
    usuarios++
    const actualizar = {}
    let invalidos = []
    for (const a of candidatos) {
      const r = await enviarPush(messaging, tokens, a)
      if (r.enviados > 0) { push++; actualizar[`enviados.${claveSegura(a.clave)}`] = Date.now() }
      invalidos = invalidos.concat(r.invalidos)
    }
    if (invalidos.length) actualizar.tokens = FieldValue.arrayRemove(...new Set(invalidos))
    if (Object.keys(actualizar).length) await d.ref.update(actualizar)
  }
  console.log(`Usuarios avisados: ${usuarios} · notificaciones enviadas: ${push}`)
}
