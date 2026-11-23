// Cada 15 min: precio, miedo y codicia, red (mempool.space), vinculación de Telegram y avisos.
import { FieldValue, crearEnviarPush, getJson, iniciarAdmin } from './lib.mjs'
import { crearEnviarTelegram, vincularChats } from './telegram.mjs'
import { procesarUsuarios } from './avisos/orquestador.mjs'
import { actualizarExtremos } from './mercado/extremos.mjs'
import { infoRed } from './mercado/red.mjs'
import { bloquesNuevos, mezclarMovimientos } from './mercado/ballenas.mjs'
import { INTERVALO_MS, consultarCarteras, detectarCambios } from './mercado/carteras.mjs'
import { guardarVelas } from './mercado/kraken.mjs'
import { readFileSync } from 'node:fs'

const leerJson = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'))

const MONEDAS = ['eur', 'usd', 'aud']

async function main() {
  const { db, messaging } = iniciarAdmin()
  const ahora = Date.now()

  // Velas de Kraken (API pública, sin clave): van primero porque no dependen de CoinGecko (si este limita las peticiones, las velas se guardan igualmente).
  // 15m en cada pasada y el resto según su antigüedad (1h, 4h, 1d y 1w).
  try {
    await guardarVelas({ db, FieldValue, getJson, ahora })
  } catch (e) {
    console.warn('Velas no actualizadas:', String(e.message).slice(0, 80))
  }

  // CoinGecko: con la clave Demo gratuita (secret COINGECKO_DEMO_KEY) si existe, que tiene un límite de peticiones mayor; un reintento si responde 429.
  const cabCg = process.env.COINGECKO_DEMO_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_DEMO_KEY } : {}
  const pedirCg = async (m) => {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${m}&ids=bitcoin&price_change_percentage=1h,24h,7d`
    try { return (await getJson(url, cabCg))[0] } catch (e) {
      if (!/429/.test(String(e.message))) throw e
      await new Promise((r) => setTimeout(r, 8000))
      return (await getJson(url, cabCg))[0]
    }
  }
  const datos = []
  for (const m of MONEDAS) datos.push(await pedirCg(m)) // de una en una, para no disparar el límite
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
    athFecha: eur.ath_date ?? null,
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


  // Ballenas: bloques nuevos con transacciones grandes (mempool.space).
  const cfgBallenas = leerJson('./config/ballenas.json')
  try {
    const refB = db.doc('mercado/ballenas')
    const previo = (await refB.get()).data() ?? {}
    const r = await bloquesNuevos({ getJson, ultimoBloque: previo.ultimoBloque ?? null, umbralBtc: cfgBallenas.umbralBtc, maxBloques: cfgBallenas.maxBloquesPorEjecucion })
    ctx.ballenasNuevas = r.movimientos
    await refB.set({
      ultimoBloque: r.altura, umbralBtc: cfgBallenas.umbralBtc,
      movimientos: mezclarMovimientos(previo.movimientos ?? [], r.movimientos, cfgBallenas.maxMovimientosGuardados),
      actualizado: FieldValue.serverTimestamp(),
    })
  } catch (e) {
    console.warn('Ballenas no actualizadas:', e.message.slice(0, 80))
  }

  // Carteras públicas seguibles: una consulta por hora.
  try {
    const lista = leerJson('../config/carteras.json').carteras ?? []
    const refC = db.doc('mercado/carteras')
    const prevC = (await refC.get()).data() ?? {}
    if (lista.length && ahora - (prevC.ultimaConsulta ?? 0) >= INTERVALO_MS) {
      const nuevas = await consultarCarteras({ getJson, lista })
      ctx.carterasCambios = detectarCambios(prevC.carteras, nuevas)
      await refC.set({ ultimaConsulta: ahora, carteras: nuevas, cambios: ctx.carterasCambios.map((c) => ({ ...c, hora: ahora })), actualizado: FieldValue.serverTimestamp() })
    } else if (!lista.length && !prevC.carteras) {
      await refC.set({ ultimaConsulta: ahora, carteras: {}, cambios: [], actualizado: FieldValue.serverTimestamp() })
    }
  } catch (e) {
    console.warn('Carteras no actualizadas:', e.message.slice(0, 80))
  }

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
  let nuevos = { docs: [] }
  try {
    nuevos = await db.collectionGroup('dispositivos').where('procesado', '==', false).get()
  } catch (e) {
    console.warn('Dispositivos nuevos no consultados:', e.message.slice(0, 80))
  }
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
