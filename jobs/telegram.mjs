// Telegram (opcional): vinculación con código de un solo uso y envío. Si no hay token, todo se omite.
import { getJson } from './lib.mjs'

const API = (token, metodo) => `https://api.telegram.org/bot${token}/${metodo}`

export function crearEnviarTelegram(token) {
  if (!token) return null
  return async (chatId, texto) => {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto.slice(0, 4000), disable_web_page_preview: true }),
    })
    if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`)
  }
}

/** Extrae el código de un mensaje `/start CODIGO`. Solo mayúsculas y dígitos, 8 a 16 caracteres. */
export function codigoDeMensaje(texto) {
  const m = /^\/start\s+([A-Z0-9]{8,16})\s*$/.exec(String(texto ?? '').trim())
  return m ? m[1] : null
}

/**
 * Lee los mensajes nuevos del bot y vincula los chats cuyo código sea válido.
 * El `offset` se guarda en mercado/telegram (solo lo escribe el backend).
 */
export async function vincularChats({ db, token, enviar, ahora }) {
  if (!token) return 0
  const ref = db.doc('mercado/telegram')
  const offset = (await ref.get()).data()?.offset ?? 0
  const r = await getJson(`${API(token, 'getUpdates')}?offset=${offset}&timeout=0&allowed_updates=${encodeURIComponent('["message"]')}`)
  let vinculados = 0
  let siguiente = offset
  for (const up of r.result ?? []) {
    siguiente = Math.max(siguiente, up.update_id + 1)
    const codigo = codigoDeMensaje(up.message?.text)
    const chatId = up.message?.chat?.id
    if (!codigo || !chatId || up.message?.chat?.type !== 'private') continue
    const docCodigo = db.doc(`vinculos/${codigo}`)
    const v = (await docCodigo.get()).data()
    if (!v || !v.uid || (v.expira?.toMillis?.() ?? 0) < ahora) {
      await enviar(chatId, 'Código no válido o caducado. Genera uno nuevo desde la app.')
      continue
    }
    await db.doc(`users/${v.uid}/avisos/estado`).set({ telegramChatId: chatId }, { merge: true })
    await docCodigo.delete()
    await enviar(chatId, 'Listo: Telegram está conectado a tu cuenta. Recibirás aquí tus avisos.')
    vinculados++
  }
  if (siguiente !== offset) await ref.set({ offset: siguiente })
  return vinculados
}
