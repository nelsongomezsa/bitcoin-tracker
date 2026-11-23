// Máximo, mínimo y volumen de las últimas 24 horas. Prioridad: ticker en directo (WebSocket de Kraken) → REST /Ticker de Kraken → velas de 1 hora.
import type { Moneda } from './calculos'
import type { Vela } from './velas'

export interface Stats24h { high: number; low: number; volume: number }

const num = (x: unknown) => Number(x)
const valida = (s: Stats24h) => [s.high, s.low, s.volume].every((n) => Number.isFinite(n)) && s.high > 0 && s.low > 0 && s.high >= s.low && s.volume >= 0

/** Respuesta de la API pública /0/public/Ticker (varios pares) → estadísticas de 24 h del par de la moneda. h, l y v son [hoy, últimas 24 h]. */
export function parsearTickerRest(json: unknown, moneda: Moneda): Stats24h | null {
  const j = json as { error?: unknown[]; result?: Record<string, { h?: unknown[]; l?: unknown[]; v?: unknown[] }> }
  if (!j || j.error?.length || !j.result) return null
  const clave = Object.keys(j.result).find((k) => k.toUpperCase().includes('XBT') && k.toUpperCase().endsWith(moneda))
  const d = clave ? j.result[clave] : undefined
  if (!d?.h || !d.l || !d.v) return null
  const s = { high: num(d.h[1]), low: num(d.l[1]), volume: num(d.v[1]) }
  return valida(s) ? s : null
}

export const URL_TICKER = 'https://api.kraken.com/0/public/Ticker?pair=XBTEUR,XBTUSD,XBTAUD'

/** Máximo, mínimo y volumen de las velas de las últimas 24 h antes de `ahoraS` (segundos). null si no hay velas en ese tramo. */
export function statsDeVelas(velas: Pick<Vela, 'time' | 'high' | 'low' | 'volume'>[], ahoraS: number): Stats24h | null {
  const desde = ahoraS - 86400
  const v = velas.filter((x) => x.time > desde && x.time <= ahoraS)
  if (!v.length) return null
  return { high: Math.max(...v.map((x) => x.high)), low: Math.min(...v.map((x) => x.low)), volume: v.reduce((s, x) => s + x.volume, 0) }
}

/** La primera fuente con datos válidos: directo, REST o velas. */
export function elegirStats(...fuentes: (Stats24h | null | undefined)[]): Stats24h | null {
  return fuentes.find((s): s is Stats24h => s != null && valida(s)) ?? null
}
