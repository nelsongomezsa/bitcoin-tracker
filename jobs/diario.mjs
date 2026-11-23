// Una vez al día: histórico de un año, velas, extremos, miedo y codicia, limpieza y avisos que dependen de datos diarios.
import { FieldValue, crearEnviarPush, getJson, iniciarAdmin } from './lib.mjs'
import { crearEnviarTelegram } from './telegram.mjs'
import { limpiarHistorial, procesarUsuarios } from './avisos/orquestador.mjs'
import { extremosDeHistorico, precioHace } from './mercado/extremos.mjs'
import { velasDiarias, velasSemanales } from './mercado/velas.mjs'
import { guardarVelas } from './mercado/kraken.mjs'
import { actualizarInstituciones } from './mercado/instituciones.mjs'

async function main() {
  const { db, messaging, auth } = iniciarAdmin()
  const ahora = Date.now()

  const h = await getJson('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=eur&days=365&interval=daily')
  const puntos = h.prices.map(([t, p]) => [t, Math.round(p * 100) / 100])
  await db.doc('mercado/historico').set({ puntos, actualizado: FieldValue.serverTimestamp() })
  console.log(`Histórico guardado: ${puntos.length} puntos`)

  // Velas: diarias (de los últimos 90 días, con datos horarios) y semanales (del año).
  try {
    const hh = await getJson('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=eur&days=90')
    await db.doc('mercado/velas').set({
      diarias: velasDiarias(hh.prices).slice(-90),
      semanales: velasSemanales(puntos).slice(-53),
      actualizado: FieldValue.serverTimestamp(),
    })
  } catch (e) {
    console.warn('Velas no actualizadas:', e.message)
  }

  await guardarVelas({ db, FieldValue, getJson, ahora, forzar: true })

  const estad = {
    extremos: extremosDeHistorico(puntos, ahora),
    ref: { d1: precioHace(puntos, 1, ahora), d7: precioHace(puntos, 7, ahora), d30: precioHace(puntos, 30, ahora) },
    actualizado: FieldValue.serverTimestamp(),
  }
  await db.doc('mercado/estadisticas').set(estad, { merge: true })

  // Índice de miedo y codicia: valor de hoy y serie de 30 días.
  let fng = null
  try {
    const f = await getJson('https://api.alternative.me/fng/?limit=31')
    const serie = f.data.map((x) => ({ t: Number(x.timestamp) * 1000, v: Number(x.value) })).reverse()
    const hoy = f.data[0]
    fng = { valor: Number(hoy.value), clasificacion: hoy.value_classification, hace1d: f.data[1] ? Number(f.data[1].value) : null, hace7d: f.data[7] ? Number(f.data[7].value) : null }
    await db.doc('mercado/fng').set({ ...fng, serie: serie.slice(-30), actualizado: FieldValue.serverTimestamp() })
  } catch (e) {
    console.warn('Miedo y codicia no disponible:', e.message)
  }

  // Dominancia y capitalización total.
  try {
    const g = await getJson('https://api.coingecko.com/api/v3/global')
    await db.doc('mercado/global').set({
      dominanciaBtc: g.data.market_cap_percentage?.btc ?? null,
      capitalizacion: g.data.total_market_cap ?? null,
      actualizado: FieldValue.serverTimestamp(),
    })
  } catch (e) {
    console.warn('Datos globales no disponibles:', e.message)
  }

  // Empresas y gobiernos con BTC (solo si hay clave Demo de CoinGecko).
  try {
    await actualizarInstituciones({ db, getJson, clave: process.env.COINGECKO_DEMO_KEY, FieldValue })
  } catch (e) {
    console.warn('Instituciones no actualizadas:', e.message)
  }

  // Limpieza: historial de más de 30 días y códigos de Telegram caducados.
  let borrados = 0
  try {
    borrados = await limpiarHistorial(db, ahora)
  } catch (e) {
    console.warn('Historial no limpiado:', e.message.slice(0, 80))
  }
  const caducados = await db.collection('vinculos').where('expira', '<', new Date(ahora)).limit(400).get()
  if (!caducados.empty) {
    const lote = db.batch()
    caducados.docs.forEach((d) => lote.delete(d.ref))
    await lote.commit()
  }
  console.log(`Limpieza: ${borrados} avisos antiguos, ${caducados.size} códigos caducados`)

  const [precioSnap, redSnap] = await Promise.all([db.doc('mercado/precio').get(), db.doc('mercado/red').get()])
  const precios = precioSnap.data()?.precios
  if (!precios) return
  const estadActual = { ...estad, extremos: estad.extremos }
  const ctx = { ahora, precios, prev: null, cambio1h: null, cambio24h: null, cambio7d: null, estad: estadActual, fng, red: redSnap.data() ?? null }

  const cuentaDe = async (uid) => {
    try {
      const u = await auth.getUser(uid)
      return { correo: u.email ?? null, tokensValidAfter: u.tokensValidAfterTime ?? null }
    } catch {
      return null
    }
  }
  const resumen = await procesarUsuarios({
    db, ctx, modo: 'diario', FieldValue, cuentaDe,
    enviarPush: crearEnviarPush(messaging),
    enviarTelegram: crearEnviarTelegram(process.env.TELEGRAM_BOT_TOKEN),
  })
  console.log(`Usuarios avisados: ${resumen.usuarios} · avisos: ${resumen.avisos} · mensajes: ${resumen.mensajes}`)
}

main().catch((e) => {
  console.error('Fallo del job diario:', e.message)
  process.exit(1)
})
