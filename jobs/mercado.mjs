// Cada 15 min: precio, miedo y codicia, red (mempool.space), vinculación de Telegram y avisos.
import { FieldValue, crearEnviarPush, getJson, iniciarAdmin } from './lib.mjs'
import { crearEnviarTelegram, vincularChats } from './telegram.mjs'
import { procesarUsuarios } from './avisos/orquestador.mjs'
import { actualizarExtremos } from './mercado/extremos.mjs'
import { infoRed } from './mercado/red.mjs'

const MONEDAS = ['eur', 'usd', 'aud']

async function main() {
  const { db, messaging } = iniciarAdmin()
  const ahora = Date.now()

  const datos = await Promise.all(
    MONEDAS.map((m) => getJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=${m}&ids=bitcoin&price_change_percentage=1h,24h,7d`).then((r) => r[0])),
  )
  const por = (campo) => Object.fromEntries(datos.map((d, i) => [MONEDAS[i].toUpperCase(), d[campo]]))
  const precios = por('current_price')
  const eur = datos[0]
  const cambio = (k) => (eur[`price_change_percentage_${k}_in_currency`] ?? 0) / 100

  let fng = null
  try {
    const f = await getJson('https://api.alternative.me/fng/?limit=1')
    fng = { valor: Number(f.data[0].value), clasificacion: f.data[0].value_classification }
  } catch (e) {
    console.warn('No se pudo leer el índice de miedo y codicia:', e.message)
  }

  const refPrecio = db.doc('mercado/precio')
  const refEstad = db.doc('mercado/estadisticas')
  const [anterior, estadSnap] = await Promise.all([refPrecio.get(), refEstad.get()])
  const prev = anterior.data()?.precios ?? null
  const estad = estadSnap.data() ?? null

  await refPrecio.set({
    precios,
    maximoHistorico: por('ath'),
    cambio1h: cambio('1h'),
    cambio24h: cambio('24h'),
    cambio7d: cambio('7d'),
    miedoCodicia: fng ?? anterior.data()?.miedoCodicia ?? null,
    actualizado: FieldValue.serverTimestamp(),
  })

  // Evalúa con los extremos de ANTES de este precio y después los actualiza.
  const ctx = { ahora, precios, prev, cambio1h: cambio('1h'), cambio24h: cambio('24h'), cambio7d: cambio('7d'), estad, fng: null, red: null }
  const nuevaEstad = actualizarExtremos(estad, precios.EUR, ahora)

  try {
    const red = await infoRed(getJson)
    await db.doc('mercado/red').set({ ...red, actualizado: FieldValue.serverTimestamp() })
    ctx.red = red
  } catch (e) {
    console.warn('mempool.space no responde:', e.message)
  }
  console.log('Precio actualizado')

  const token = process.env.TELEGRAM_BOT_TOKEN
  const enviarTelegram = crearEnviarTelegram(token)
  try {
    const n = await vincularChats({ db, token, enviar: enviarTelegram, ahora })
    if (n) console.log(`Chats de Telegram vinculados: ${n}`)
  } catch (e) {
    console.warn('Telegram:', e.message)
  }

  // Dispositivos nuevos (una consulta; solo cuenta lo que devuelve).
  const extras = {}
  const nuevos = await db.collectionGroup('dispositivos').where('procesado', '==', false).get()
  for (const d of nuevos.docs) {
    const uid = d.ref.parent.parent.id
    ;(extras[uid] ??= []).push({
      clave: `dispositivo:${d.id}`, titulo: 'Nuevo dispositivo', requiere: 'dispositivoNuevo', cooldownMs: 1000, url: '/ajustes',
      texto: `Se ha iniciado sesión en un dispositivo nuevo (${String(d.data().navegador ?? 'desconocido').slice(0, 40)}). Si no has sido tú, cambia tu contraseña.`,
    })
  }

  const resumen = await procesarUsuarios({
    db, ctx, modo: 'frecuente', extras, FieldValue,
    enviarPush: crearEnviarPush(messaging),
    enviarTelegram,
    evaluarExtra: null,
  })
  for (const d of nuevos.docs) await d.ref.update({ procesado: true })
  if (nuevaEstad.cambiado) await refEstad.set(nuevaEstad.datos, { merge: true })
  console.log(`Usuarios avisados: ${resumen.usuarios} · avisos: ${resumen.avisos} · mensajes: ${resumen.mensajes}`)
}

main().catch((e) => {
  console.error('Fallo del job:', e.message) // sin stack ni datos de usuarios
  process.exit(1)
})
