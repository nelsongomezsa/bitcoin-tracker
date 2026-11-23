// Precio de BTC para pasar el «Resultado en dinero» de un trade a BTC: la vela de Kraken (par XBT/EUR, XBT/USD o XBT/AUD) del cierre.
// La parte de elegir vela y de respaldo es pura; la descarga (API pública de Kraken, sin clave ni datos del usuario) recibe el `fetch`.
import { convertir, type Moneda, type PreciosBtc } from './calculos'
import type { Trade } from './trading'

export const PAR_KRAKEN: Record<Moneda, string> = { EUR: 'XBTEUR', USD: 'XBTUSD', AUD: 'XBTAUD' }

export type FuentePrecio = 'minuto' | 'hora' | 'dia' | 'salida'
export interface PrecioUsado { precio: number; fuente: FuentePrecio; detalle: string }

const DETALLE: Record<FuentePrecio, string> = {
  minuto: 'vela de 1 minuto de Kraken', hora: 'vela de 1 hora de Kraken', dia: 'vela diaria de Kraken',
  salida: 'precio de salida del trade convertido con el cambio',
}

/** Instante del cierre en segundos: con hora, la hora local del usuario; sin hora, el mediodía UTC de ese día (cae dentro de la vela diaria). */
export function instanteCierre(fecha: string, hora?: string): number {
  return hora ? new Date(`${fecha}T${hora}:00`).getTime() / 1000 : Date.parse(`${fecha}T12:00:00Z`) / 1000
}

/** Intervalo de vela (minutos): 1 minuto solo si es reciente (Kraken guarda unas 12 h), 1 hora hasta unos 28 días y el resto, diaria. Sin hora, siempre diaria. */
export function intervaloPara(instanteS: number, ahoraS: number, conHora: boolean): 1 | 60 | 1440 {
  if (!conHora) return 1440
  const edad = ahoraS - instanteS
  return edad <= 11 * 3600 ? 1 : edad <= 28 * 86400 ? 60 : 1440
}

/** Principio de la vela que contiene el instante (las velas de Kraken van alineadas con el tiempo UNIX: 1440 = 00:00 UTC). */
export const inicioVela = (instanteS: number, intervaloMin: number) => Math.floor(instanteS / (intervaloMin * 60)) * intervaloMin * 60

/** Precio de la vela que contiene el instante: su VWAP (o el cierre). Filas de Kraken: [t, o, h, l, c, vwap, volumen, nº]. null si no hay esa vela. */
export function precioDeVela(filas: unknown[][], instanteS: number, intervaloMin: number): number | null {
  const t0 = inicioVela(instanteS, intervaloMin)
  const fila = filas.find((f) => Number(f[0]) === t0)
  if (!fila) return null
  const vwap = Number(fila[5]), cierre = Number(fila[4])
  const p = vwap > 0 ? vwap : cierre
  return Number.isFinite(p) && p > 0 ? p : null
}

/** Respaldo: el precio de salida del trade (en su moneda) convertido a la moneda del resultado con el cambio disponible. */
export function precioDeSalida(t: Pick<Trade, 'precioSalida' | 'moneda'>, moneda: Moneda, precios: PreciosBtc | null): number | null {
  if (t.precioSalida == null || !(t.precioSalida > 0)) return null
  if (t.moneda === moneda) return t.precioSalida
  return precios ? convertir(t.precioSalida, t.moneda, moneda, precios) : null
}

interface Busqueda {
  moneda: Moneda
  fecha: string
  hora?: string
  /** Para el respaldo. */
  trade: Pick<Trade, 'precioSalida' | 'moneda'>
  precios: PreciosBtc | null
  ahoraMs?: number
  fetcher?: typeof fetch
}

/** Vela de Kraken del cierre; si no hay vela (o falla la red), el precio de salida convertido. null si tampoco hay precio de salida. */
export async function buscarPrecioBtc({ moneda, fecha, hora, trade, precios, ahoraMs = Date.now(), fetcher = fetch }: Busqueda): Promise<PrecioUsado | null> {
  const instante = instanteCierre(fecha, hora)
  const intervalo = intervaloPara(instante, ahoraMs / 1000, Boolean(hora))
  // La vela del cierre existe en cuanto empieza (la diaria de hoy, desde las 00:00 UTC), aunque el mediodía de hoy aún no haya llegado.
  if (Number.isFinite(instante) && inicioVela(instante, intervalo) <= ahoraMs / 1000) {
    try {
      const url = `https://api.kraken.com/0/public/OHLC?pair=${PAR_KRAKEN[moneda]}&interval=${intervalo}&since=${inicioVela(instante, intervalo) - 1}`
      const r = await fetcher(url)
      if (r.ok) {
        const j = (await r.json()) as { error?: unknown[]; result?: Record<string, unknown[][]> }
        const clave = Object.keys(j.result ?? {}).find((k) => k !== 'last')
        const p = !j.error?.length && clave ? precioDeVela(j.result![clave], instante, intervalo) : null
        if (p != null) {
          const fuente: FuentePrecio = intervalo === 1 ? 'minuto' : intervalo === 60 ? 'hora' : 'dia'
          return { precio: Math.round(p * 100) / 100, fuente, detalle: DETALLE[fuente] }
        }
      }
    } catch { /* sin red: se usa el respaldo */ }
  }
  const s = precioDeSalida(trade, moneda, precios)
  return s == null ? null : { precio: Math.round(s * 100) / 100, fuente: 'salida', detalle: DETALLE.salida }
}
