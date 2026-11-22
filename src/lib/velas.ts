// Velas y medias móviles. Funciones puras (sin red).
import type { Moneda, PreciosBtc } from './calculos'

/** [tiempo en SEGUNDOS, apertura, máximo, mínimo, cierre, volumen] */
export type FilaVela = number[]
export interface Vela { time: number; open: number; high: number; low: number; close: number; volume: number }

export const TEMPORALIDADES = ['1m', '5m', '15m', '1h', '4h', '1D', '1S'] as const
export type Temporalidad = (typeof TEMPORALIDADES)[number]
/** Documento del job (mercado/velas_*) de cada temporalidad; 1m y 5m vienen de Kraken en directo. */
export const DOC_VELAS: Partial<Record<Temporalidad, string>> = { '15m': 'velas_15m', '1h': 'velas_1h', '4h': 'velas_4h', '1D': 'velas_1d', '1S': 'velas_1w' }
export const MINUTOS: Record<Temporalidad, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 1440, '1S': 10080 }

export const aVelas = (filas: FilaVela[], factor = 1): Vela[] =>
  filas.map(([time, o, h, l, c, v]) => ({ time, open: o * factor, high: h * factor, low: l * factor, close: c * factor, volume: v ?? 0 }))

/** Factor para pasar velas de EUR a otra moneda con los precios de BTC que ya tiene la app (AUD no se pide a Kraken). */
export const factorDesdeEur = (moneda: Moneda, precios: PreciosBtc | null): number => (moneda === 'EUR' || !precios ? 1 : precios[moneda] / precios.EUR)

/** Media móvil simple de `n` cierres. Devuelve un punto por vela desde la n-ésima (las anteriores no tienen media). */
export function mediaMovil(velas: Pick<Vela, 'time' | 'close'>[], n: number): { time: number; value: number }[] {
  if (!Number.isInteger(n) || n < 1 || velas.length < n) return []
  const out: { time: number; value: number }[] = []
  let suma = 0
  for (let i = 0; i < velas.length; i++) {
    suma += velas[i].close
    if (i >= n) suma -= velas[i - n].close
    if (i >= n - 1) out.push({ time: velas[i].time, value: suma / n })
  }
  return out
}

/** Une velas: las nuevas sustituyen a las que tienen el mismo tiempo; salida ordenada y sin repetidos. */
export function fusionarVelas(base: Vela[], nuevas: Vela[], max = 1000): Vela[] {
  const m = new Map<number, Vela>()
  for (const v of base) m.set(v.time, v)
  for (const v of nuevas) m.set(v.time, v)
  return [...m.values()].sort((a, b) => a.time - b.time).slice(-max)
}

/** Tiempo de la última vela que empieza en o antes de `t` (segundos). null si `t` es anterior a la primera. */
export function velaDe(velas: Pick<Vela, 'time'>[], t: number): number | null {
  let lo = 0, hi = velas.length - 1, r = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (velas[mid].time <= t) { r = mid; lo = mid + 1 } else hi = mid - 1
  }
  return r < 0 ? null : velas[r].time
}

/** Una fecha 'YYYY-MM-DD' (sin hora) → segundos al mediodía UTC de ese día. */
export const diaASegundos = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 1000

export const PERIODOS = [['Hoy', 1], ['7 d', 7], ['30 d', 30], ['90 d', 90], ['180 d', 180], ['1 año', 365]] as const

/** Rendimiento (fracción) del precio actual frente al de hace `dias` días, con el histórico diario [{t en ms, precio}]. */
export function rendimiento(historico: { t: number; precio: number }[], actual: number, dias: number, ahora = Date.now()): number | null {
  if (!historico.length || !(actual > 0)) return null
  const objetivo = ahora - dias * 86_400_000
  let mejor = historico[0]
  for (const p of historico) if (Math.abs(p.t - objetivo) < Math.abs(mejor.t - objetivo)) mejor = p
  if (Math.abs(mejor.t - objetivo) > 3 * 86_400_000) return null // no hay dato cerca
  return actual / mejor.precio - 1
}
