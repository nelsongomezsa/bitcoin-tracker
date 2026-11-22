// Movimientos de ballenas: transacciones con ≥ N BTC de salidas en los bloques nuevos (mempool.space, sin clave).
// `value` del resumen de bloque es el total de las salidas de la transacción (incluye el cambio que vuelve al emisor).
const SATS = 100_000_000

/** Transacciones grandes de un resumen de bloque [{txid, value}] (value en sats). */
export function filtrarGrandes(resumenBloque, umbralBtc) {
  return resumenBloque
    .filter((t) => Number(t.value) >= umbralBtc * SATS)
    .map((t) => ({ txid: String(t.txid), btc: Math.round((Number(t.value) / SATS) * 100) / 100 }))
}

/**
 * Revisa los bloques nuevos desde `ultimoBloque`. Una llamada para la altura y dos por bloque (hash y resumen).
 * Si hay un hueco grande (caída del servicio), salta a los últimos bloques en vez de recorrerlo todo.
 */
export async function bloquesNuevos({ getJson, ultimoBloque, umbralBtc, maxBloques }) {
  const altura = Number(await getJson('https://mempool.space/api/blocks/tip/height'))
  let desde = ultimoBloque == null ? altura : ultimoBloque + 1
  if (altura - desde + 1 > maxBloques) desde = altura - maxBloques + 1
  const movimientos = []
  for (let h = desde; h <= altura; h++) {
    const hash = String(await (await fetch(`https://mempool.space/api/block-height/${h}`)).text())
    const resumen = await getJson(`https://mempool.space/api/v1/block/${hash}/summary`)
    const hora = Date.now()
    for (const t of filtrarGrandes(resumen, umbralBtc)) movimientos.push({ ...t, bloque: h, hora })
  }
  return { altura, movimientos }
}

/** Mezcla los movimientos nuevos con los guardados y se queda con los más recientes (sin repetir txid). */
export function mezclarMovimientos(antiguos, nuevos, max) {
  const vistos = new Set()
  return [...nuevos, ...antiguos].filter((m) => !vistos.has(m.txid) && vistos.add(m.txid)).slice(0, max)
}
