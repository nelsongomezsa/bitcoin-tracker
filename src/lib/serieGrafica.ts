// Prepara los datos de la gráfica principal. lightweight-charts exige tiempos estrictamente crecientes
// y sin repetir; el histórico diario de CoinGecko trae, además de un punto por día a las 00:00 UTC,
// un último punto con la hora actual (el mismo día), y llega en milisegundos.
import type { Operacion, PuntoPrecio } from './calculos'

export type Periodo = '1D' | '1S' | '1M' | '1A' | 'Todo'
export const PERIODOS: Periodo[] = ['1D', '1S', '1M', '1A', 'Todo']
const DIAS: Record<Periodo, number | null> = { '1D': 1, '1S': 7, '1M': 30, '1A': 365, Todo: null }
const DIA_S = 86400

export interface PuntoGrafica {
  /** Segundos UTC (UTCTimestamp de lightweight-charts), nunca milisegundos. */
  time: number
  value: number
}

export interface MarcaGrafica {
  time: number
  tipo: 'compra' | 'venta'
}

export const aSegundos = (ms: number): number => Math.floor(ms / 1000)
const fechaDe = (segundos: number): string => new Date(segundos * 1000).toISOString().slice(0, 10)

interface EntradaSerie {
  /** Histórico diario en EUR con el tiempo en milisegundos (mercado/historico). */
  historico: PuntoPrecio[]
  /** Precio actual en EUR (mercado/precio): será el último punto. */
  precioActual?: number | null
  ahoraMs: number
  periodo: Periodo
  /** Factor para expresar el EUR en la moneda elegida. */
  factor?: number
}

/**
 * Serie lista para dibujar: segundos, orden creciente, sin repetidos, recortada al periodo
 * y terminada en el precio actual.
 */
export function prepararSerie({ historico, precioActual, ahoraMs, periodo, factor = 1 }: EntradaSerie): PuntoGrafica[] {
  const ahora = aSegundos(ahoraMs)
  const inicioHoy = Math.floor(ahora / DIA_S) * DIA_S

  // 1. Segundos, sin valores raros, sin futuro y sin repetidos (si hay dos del mismo instante gana el último).
  const mapa = new Map<number, number>()
  for (const p of historico) {
    const time = aSegundos(p.t)
    if (!Number.isFinite(time) || !Number.isFinite(p.precio) || p.precio <= 0 || time > ahora) continue
    mapa.set(time, p.precio * factor)
  }
  let pts: PuntoGrafica[] = [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }))

  // 2. El último punto es el precio actual. Los puntos de hoy posteriores a las 00:00 UTC (el que añade el job diario)
  //    se sustituyen por él; así hoy tiene como mucho dos puntos distintos (00:00 y ahora).
  if (precioActual && precioActual > 0) {
    pts = pts.filter((p) => p.time <= inicioHoy)
    if (pts.at(-1)?.time === ahora) pts.pop()
    pts.push({ time: ahora, value: precioActual * factor })
  }

  // 3. Recorte por periodo, con un punto de anclaje anterior al corte para que la línea llegue al borde izquierdo.
  const dias = DIAS[periodo]
  if (dias == null) return pts
  const corte = ahora - dias * DIA_S
  const i = pts.findIndex((p) => p.time >= corte)
  if (i === -1) return pts.slice(-2)
  return pts.slice(Math.max(0, i - 1))
}

/**
 * Marcas de compras y ventas. Cada operación se pega al primer punto de la serie de SU día,
 * así su tiempo coincide siempre con un punto existente. Las fuera del rango visible se omiten.
 */
export function prepararMarcas(ops: Pick<Operacion, 'fecha' | 'tipo'>[], serie: PuntoGrafica[]): MarcaGrafica[] {
  if (!serie.length) return []
  const porDia = new Map<string, number>()
  for (const p of serie) {
    const f = fechaDe(p.time)
    if (!porDia.has(f)) porDia.set(f, p.time)
  }
  const primera = fechaDe(serie[0].time)
  const ultima = fechaDe(serie[serie.length - 1].time)
  const marcas: MarcaGrafica[] = []
  for (const o of ops) {
    if (o.fecha < primera || o.fecha > ultima) continue
    let time = porDia.get(o.fecha)
    if (time == null) {
      // Día sin punto propio dentro del rango: el último punto anterior.
      const previos = serie.filter((p) => fechaDe(p.time) < o.fecha)
      time = previos.at(-1)?.time
    }
    if (time != null) marcas.push({ time, tipo: o.tipo })
  }
  return marcas.sort((a, b) => a.time - b.time)
}
