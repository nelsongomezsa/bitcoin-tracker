// Una vez al día: histórico de un año y avisos programados (DCA, resumen mensual, copia de seguridad).
import { FieldValue } from 'firebase-admin/firestore'
import { getJson, iniciarAdmin, procesarUsuarios } from './lib.mjs'
import { avisosDiarios, filtrarRepetidos } from './alertas.mjs'

async function main() {
  const ctx = iniciarAdmin()
  const h = await getJson('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=eur&days=365&interval=daily')
  const puntos = h.prices.map(([t, p]) => [t, Math.round(p * 100) / 100])
  await ctx.db.doc('mercado/historico').set({ puntos, actualizado: FieldValue.serverTimestamp() })
  console.log(`Histórico guardado: ${puntos.length} puntos`)

  const hoy = new Date()
  await procesarUsuarios(ctx, (u) => avisosDiarios(hoy, u), filtrarRepetidos)
}

main().catch((e) => {
  console.error('Fallo del job diario:', e.message)
  process.exit(1)
})
