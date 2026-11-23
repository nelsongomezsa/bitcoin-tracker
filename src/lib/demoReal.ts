// Modo demo con el PRECIO REAL de BTC: precios, histórico y cambios salen de la API pública de Kraken (sin clave, sin datos del usuario).
// Solo las compras, los trades y el plan de la demo son inventados, y se anclan a este histórico real.
import type { PuntoPrecio } from './calculos'
import type { Mercado } from './tipos'

export interface MercadoReal {
  mercado: Mercado
  /** Histórico diario en EUR (tiempo en ms), como el que guarda el servidor en mercado/historico. */
  historico: PuntoPrecio[]
  /** Velas diarias (90) y semanales (53) en EUR [t ms, apertura, máx, mín, cierre], como el documento mercado/velas. */
  velas: { diarias: number[][]; semanales: number[][] }
  /** Dólares por euro (cociente de los precios de BTC), para los trades de la demo en USD. */
  usdPorEur: number
}

const DIA_S = 86400
const num = (x: unknown) => Number(x)
type Fila = unknown[]
interface RespuestaOhlc { error?: unknown[]; result?: Record<string, unknown> }

/** Filas [t, o, h, l, c, …] válidas y crecientes de una respuesta OHLC de Kraken (la primera serie que no es «last»). */
export function filasOhlc(j: unknown): number[][] {
  const r = j as RespuestaOhlc
  if (!r || r.error?.length || !r.result) return []
  const clave = Object.keys(r.result).find((k) => k !== 'last')
  const filas = (clave ? r.result[clave] : []) as Fila[]
  if (!Array.isArray(filas)) return []
  const out: number[][] = []
  for (const f of filas) {
    const [t, o, h, l, c] = [f[0], f[1], f[2], f[3], f[4]].map(num)
    if (![t, o, h, l, c].every((x) => Number.isFinite(x)) || o <= 0 || h <= 0 || l <= 0 || c <= 0) continue
    if (out.length && t <= out[out.length - 1][0]) continue
    out.push([t, o, h, l, c])
  }
  return out
}

/** Último precio de cada moneda del Ticker de Kraken (c[0]). null si falta alguna. */
export function preciosDeTicker(j: unknown): { EUR: number; USD: number; AUD: number } | null {
  const r = j as { error?: unknown[]; result?: Record<string, { c?: unknown[] }> }
  if (!r || r.error?.length || !r.result) return null
  const p: Record<string, number> = {}
  for (const m of ['EUR', 'USD', 'AUD']) {
    const k = Object.keys(r.result).find((x) => x.toUpperCase().includes('XBT') && x.toUpperCase().endsWith(m))
    p[m] = k ? num(r.result[k].c?.[0]) : NaN
  }
  return [p.EUR, p.USD, p.AUD].every((x) => Number.isFinite(x) && x > 0) ? (p as { EUR: number; USD: number; AUD: number }) : null
}

/** Semanas que empiezan en lunes (UTC) a partir de velas diarias [t s, o, h, l, c]; el tiempo sale en ms. */
export function semanalesDeDiarias(filas: number[][]): number[][] {
  const semanas = new Map<number, number[]>()
  for (const [t, o, h, l, c] of filas) {
    const dia = Math.floor(t / DIA_S)
    const lunes = (dia - ((dia + 3) % 7)) * DIA_S // el día 0 (1-1-1970) fue jueves
    const s = semanas.get(lunes)
    if (!s) semanas.set(lunes, [lunes * 1000, o, h, l, c])
    else { s[2] = Math.max(s[2], h); s[3] = Math.min(s[3], l); s[4] = c }
  }
  return [...semanas.values()]
}

/** Cierre de la última vela que empieza en o antes de `tS`. null si no hay. */
function cierreEn(filas: number[][], tS: number): number | null {
  let r: number | null = null
  for (const f of filas) { if (f[0] <= tS) r = f[4]; else break }
  return r
}

interface Entrada { ticker: unknown; diarias: unknown; horarias: unknown; ahoraMs: number }

/** Junta las tres respuestas de Kraken (Ticker, velas diarias y velas de 1 hora, en EUR) en los datos de mercado de la demo. null si no se puede. */
export function construirMercadoReal({ ticker, diarias, horarias, ahoraMs }: Entrada): MercadoReal | null {
  const precios = preciosDeTicker(ticker)
  const dia = filasOhlc(diarias)
  if (!precios || dia.length < 30) return null
  const ahoraS = ahoraMs / 1000
  const hora = filasOhlc(horarias)
  // Cambio de 24 h: con la vela de 1 hora de hace 24 h; si no hay, con el cierre del día anterior.
  const hace24 = (hora.length ? cierreEn(hora, ahoraS - DIA_S) : null) ?? cierreEn(dia, ahoraS - DIA_S)
  const hace7d = cierreEn(dia, ahoraS - 7 * DIA_S)
  const max = dia.reduce((m, f) => (f[2] > m[2] ? f : m), dia[0])
  const k = (m: 'USD' | 'AUD') => precios[m] / precios.EUR
  const mercado: Mercado = {
    precios,
    cambio24h: hace24 ? precios.EUR / hace24 - 1 : 0,
    cambio7d: hace7d ? precios.EUR / hace7d - 1 : 0,
    // Máximo de lo que devuelve Kraken (unos dos años), no el máximo histórico absoluto.
    maximoHistorico: { EUR: max[2], USD: max[2] * k('USD'), AUD: max[2] * k('AUD') },
    athFecha: new Date(max[0] * 1000),
    miedoCodicia: null, // el índice no viene de Kraken: no se inventa
    actualizado: new Date(ahoraMs),
  }
  const historico: PuntoPrecio[] = dia.slice(-366).map((f) => ({ t: f[0] * 1000, precio: Math.round(f[4] * 100) / 100 }))
  return {
    mercado, historico, usdPorEur: k('USD'),
    velas: { diarias: dia.slice(-90).map((f) => [f[0] * 1000, f[1], f[2], f[3], f[4]]), semanales: semanalesDeDiarias(dia.slice(-371)).slice(-53) },
  }
}

const BASE = 'https://api.kraken.com/0/public'

/** Descarga lo necesario de Kraken para la demo. null si algo falla (sin red, límite de peticiones…): entonces se usan datos inventados. */
export async function cargarMercadoReal(fetcher: typeof fetch = fetch, ahoraMs = Date.now()): Promise<MercadoReal | null> {
  try {
    const pedir = async (ruta: string) => { const r = await fetcher(`${BASE}/${ruta}`); if (!r.ok) throw new Error('http'); return r.json() }
    const [ticker, diarias, horarias] = await Promise.all([
      pedir('Ticker?pair=XBTEUR,XBTUSD,XBTAUD'), pedir('OHLC?pair=XBTEUR&interval=1440'), pedir('OHLC?pair=XBTEUR&interval=60'),
    ])
    return construirMercadoReal({ ticker, diarias, horarias, ahoraMs })
  } catch {
    return null
  }
}
