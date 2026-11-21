// Cada 15 min: actualiza el precio, el índice de miedo y codicia, y envía los avisos de mercado.
import admin from 'firebase-admin'
import { getJson, iniciarAdmin, procesarUsuarios } from './lib.mjs'
import { avisosDeMercado, filtrarRepetidos } from './alertas.mjs'

const MONEDAS = ['eur', 'usd', 'aud']

async function main() {
  const ctx = iniciarAdmin()
  const { db } = ctx

  const datos = await Promise.all(
    MONEDAS.map((m) =>
      getJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=${m}&ids=bitcoin&price_change_percentage=24h,7d`).then((r) => r[0]),
    ),
  )
  const por = (campo) => Object.fromEntries(datos.map((d, i) => [MONEDAS[i].toUpperCase(), d[campo]]))
  const precios = por('current_price')
  const eur = datos[0]

  let fng = null
  try {
    const f = await getJson('https://api.alternative.me/fng/?limit=1')
    fng = { valor: Number(f.data[0].value), clasificacion: f.data[0].value_classification }
  } catch (e) {
    console.warn('No se pudo leer el índice de miedo y codicia:', e.message)
  }

  const ref = db.doc('mercado/precio')
  const anterior = (await ref.get()).data()
  const prev = anterior?.precios?.EUR ?? null

  const nuevo = {
    precios,
    maximoHistorico: por('ath'),
    cambio24h: (eur.price_change_percentage_24h_in_currency ?? eur.price_change_percentage_24h ?? 0) / 100,
    cambio7d: (eur.price_change_percentage_7d_in_currency ?? 0) / 100,
    miedoCodicia: fng ?? anterior?.miedoCodicia ?? null,
    actualizado: admin.firestore.FieldValue.serverTimestamp(),
  }
  await ref.set(nuevo)
  console.log('Precio actualizado')

  const m = { prev, precio: precios.EUR, cambio24h: nuevo.cambio24h, cambio7d: nuevo.cambio7d, fng: fng?.valor ?? null }
  await procesarUsuarios(ctx, (u) => avisosDeMercado(m, u), filtrarRepetidos)
}

main().catch((e) => {
  console.error('Fallo del job:', e.message) // sin stack ni datos de usuarios
  process.exit(1)
})
