// Carteras públicas seguibles: saldo agregado de sus direcciones (mempool.space) y detección de cambios.
const SATS = 100_000_000
export const MIN_CAMBIO_BTC = 0.01
export const INTERVALO_MS = 55 * 60 * 1000 // una consulta por hora

/** Saldo en BTC a partir de las estadísticas de una dirección (confirmado + mempool). */
export function saldoDeEstadisticas(a) {
  const c = (a.chain_stats?.funded_txo_sum ?? 0) - (a.chain_stats?.spent_txo_sum ?? 0)
  const m = (a.mempool_stats?.funded_txo_sum ?? 0) - (a.mempool_stats?.spent_txo_sum ?? 0)
  return (c + m) / SATS
}

/** Compara con la consulta anterior: devuelve los cambios mayores que el mínimo. */
export function detectarCambios(anterior, nuevo, minBtc = MIN_CAMBIO_BTC) {
  const cambios = []
  for (const [id, c] of Object.entries(nuevo)) {
    const prev = anterior?.[id]?.saldoBtc
    if (prev == null) continue
    const d = c.saldoBtc - prev
    if (Math.abs(d) >= minBtc) cambios.push({ id, nombre: c.nombre, cambioBtc: Math.round(d * 100) / 100 })
  }
  return cambios
}

export async function consultarCarteras({ getJson, lista }) {
  const salida = {}
  for (const c of lista) {
    let total = 0
    for (const dir of c.direcciones ?? []) total += saldoDeEstadisticas(await getJson(`https://mempool.space/api/address/${encodeURIComponent(dir)}`))
    salida[c.id] = { nombre: c.nombre, descripcion: c.descripcion ?? '', fuente: c.fuente ?? '', saldoBtc: Math.round(total * 1e4) / 1e4 }
  }
  return salida
}
