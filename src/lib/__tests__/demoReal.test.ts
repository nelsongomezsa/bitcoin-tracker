// Demo con el precio real de BTC (Kraken). Respuestas y números inventados.
import { describe, expect, it } from 'vitest'
import { cargarMercadoReal, construirMercadoReal, filasOhlc, preciosDeTicker, semanalesDeDiarias } from '../demoReal'

const AHORA = Date.parse('2025-06-30T12:00:00Z')
const DIA = 86400
const fila = (t: number, o: number, h: number, l: number, c: number) => [t, String(o), String(h), String(l), String(c), String(c), '10', 5]
const t0 = Math.floor(AHORA / 1000 / DIA) * DIA
// 400 días: el precio sube 10 € por día desde 40.000; el máximo (alto) cae el día 200
const diarias = { error: [], result: { XXBTZEUR: Array.from({ length: 400 }, (_, i) => { const c = 40000 + i * 10; return fila(t0 - (399 - i) * DIA, c - 5, i === 200 ? 99999 : c + 20, c - 20, c) }), last: t0 } }
const horarias = { error: [], result: { XXBTZEUR: Array.from({ length: 100 }, (_, i) => fila(AHORA / 1000 - (99 - i) * 3600, 43000, 43100, 42900, 43000 + i), ), last: 0 } }
const ticker = { error: [], result: { XXBTZEUR: { c: ['43990.5', '1'] }, XXBTZUSD: { c: ['47000.0', '1'] }, XBTAUD: { c: ['70000.0', '1'] } } }

describe('lectura de las respuestas de Kraken', () => {
  it('filas válidas y crecientes; errores o formas raras dan vacío', () => {
    expect(filasOhlc(diarias)).toHaveLength(400)
    expect(filasOhlc({ error: ['EGeneral:Too many requests'], result: {} })).toEqual([])
    expect(filasOhlc(null)).toEqual([])
    expect(filasOhlc({ error: [], result: { X: [fila(5, 1, 2, 1, 1), fila(5, 9, 9, 9, 9), fila(3, 1, 1, 1, 1), ['x'], fila(7, 0, 1, 1, 1)], last: 7 } })).toEqual([[5, 1, 2, 1, 1]])
  })
  it('precios del Ticker de las tres monedas; si falta una, null', () => {
    expect(preciosDeTicker(ticker)).toEqual({ EUR: 43990.5, USD: 47000, AUD: 70000 })
    expect(preciosDeTicker({ error: [], result: { XXBTZEUR: { c: ['1', '1'] } } })).toBeNull()
    expect(preciosDeTicker({ error: ['x'], result: ticker.result })).toBeNull()
  })
  it('semanas que empiezan en lunes UTC: apertura, máximo, mínimo y cierre', () => {
    const lunes = Date.parse('2025-06-23T00:00:00Z') / 1000 // 23 de junio de 2025 fue lunes
    const filas = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [lunes + i * DIA, 100 + i, 110 + i, 90 + i, 105 + i])
    const s = semanalesDeDiarias(filas)
    expect(s).toHaveLength(2)
    expect(s[0]).toEqual([lunes * 1000, 100, 116, 90, 111])
    expect(s[1][0]).toBe((lunes + 7 * DIA) * 1000)
  })
})

describe('mercado real de la demo', () => {
  const r = construirMercadoReal({ ticker, diarias, horarias, ahoraMs: AHORA })!
  it('los precios actuales son los del ticker (no los inventados)', () => {
    expect(r.mercado.precios).toEqual({ EUR: 43990.5, USD: 47000, AUD: 70000 })
    expect(r.usdPorEur).toBeCloseTo(47000 / 43990.5, 10)
  })
  it('histórico diario en ms, de un año, con los cierres reales (2 decimales)', () => {
    expect(r.historico).toHaveLength(366)
    expect(r.historico.at(-1)).toEqual({ t: t0 * 1000, precio: 43990 })
    expect(r.historico[0].precio).toBe(40000 + (399 - 365) * 10)
    for (let i = 1; i < r.historico.length; i++) expect(r.historico[i].t).toBeGreaterThan(r.historico[i - 1].t)
  })
  it('cambio de 24 h con la vela de 1 hora de hace 24 h y cambio de 7 días con el cierre diario', () => {
    expect(r.mercado.cambio24h).toBeCloseTo(43990.5 / (43000 + (99 - 24)) - 1, 6)
    expect(r.mercado.cambio7d).toBeCloseTo(43990.5 / (40000 + (399 - 7) * 10) - 1, 6)
  })
  it('máximo de lo que devuelve Kraken, con su fecha, y sin índice de miedo inventado', () => {
    expect(r.mercado.maximoHistorico.EUR).toBe(99999)
    expect(r.mercado.maximoHistorico.USD).toBeCloseTo(99999 * (47000 / 43990.5), 6)
    expect(r.mercado.athFecha?.getTime()).toBe((t0 - 199 * DIA) * 1000)
    expect(r.mercado.miedoCodicia).toBeNull()
  })
  it('velas diarias (90) y semanales (53) con el formato del documento del servidor', () => {
    expect(r.velas.diarias).toHaveLength(90)
    expect(r.velas.diarias.at(-1)![0]).toBe(t0 * 1000)
    expect(r.velas.semanales.length).toBeLessThanOrEqual(53)
    expect(r.velas.semanales.every((s) => s.length === 5)).toBe(true)
  })
  it('sin datos suficientes (pocas velas o sin ticker), null: la demo usará datos inventados', () => {
    expect(construirMercadoReal({ ticker, diarias: { error: [], result: { X: [fila(t0, 1, 1, 1, 1)], last: 0 } }, horarias, ahoraMs: AHORA })).toBeNull()
    expect(construirMercadoReal({ ticker: { error: ['x'], result: {} }, diarias, horarias, ahoraMs: AHORA })).toBeNull()
  })
})

describe('descarga de la demo', () => {
  const respuesta = (url: string) => (url.includes('/Ticker') ? ticker : url.includes('interval=1440') ? diarias : horarias)
  it('pide el ticker y las velas de 1 día y de 1 hora a la API pública de Kraken, sin clave', async () => {
    const urls: string[] = []
    const fetcher = (async (u: string) => { urls.push(u); return { ok: true, json: async () => respuesta(u) } }) as unknown as typeof fetch
    const r = await cargarMercadoReal(fetcher, AHORA)
    expect(r?.mercado.precios.EUR).toBe(43990.5)
    expect(urls.sort()).toEqual([
      'https://api.kraken.com/0/public/OHLC?pair=XBTEUR&interval=1440', 'https://api.kraken.com/0/public/OHLC?pair=XBTEUR&interval=60',
      'https://api.kraken.com/0/public/Ticker?pair=XBTEUR,XBTUSD,XBTAUD',
    ])
  })
  it('si falla la red o Kraken responde mal, null', async () => {
    expect(await cargarMercadoReal((async () => { throw new Error('sin red') }) as unknown as typeof fetch, AHORA)).toBeNull()
    expect(await cargarMercadoReal((async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch, AHORA)).toBeNull()
  })
})
