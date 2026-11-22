// Altura de bloque, tarifas y halving con la API pública de mempool.space (sin clave).
export const BLOQUES_HALVING = 210000
const MIN_POR_BLOQUE = 10

export function calcularHalving(altura, ahora = Date.now()) {
  const proximoBloque = (Math.floor(altura / BLOQUES_HALVING) + 1) * BLOQUES_HALVING
  const faltan = proximoBloque - altura
  const diasHalving = (faltan * MIN_POR_BLOQUE) / 1440
  return {
    proximoBloque,
    bloquesRestantes: faltan,
    diasHalving,
    halvingEstimado: ahora + diasHalving * 24 * 3600 * 1000,
    diasDesdeUltimo: ((altura - Math.floor(altura / BLOQUES_HALVING) * BLOQUES_HALVING) * MIN_POR_BLOQUE) / 1440,
  }
}

export async function infoRed(getJson) {
  const [altura, tarifas] = await Promise.all([
    getJson('https://mempool.space/api/blocks/tip/height'),
    getJson('https://mempool.space/api/v1/fees/recommended'),
  ])
  return {
    altura: Number(altura),
    tarifas: { rapida: tarifas.fastestFee, media: tarifas.halfHourFee, lenta: tarifas.hourFee },
    ...calcularHalving(Number(altura)),
  }
}
