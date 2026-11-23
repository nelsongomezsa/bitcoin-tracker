import { describe, expect, it } from 'vitest'
import { elegirStats, parsearTickerRest, statsDeVelas } from '../stats24h'

// Respuesta de Kraken /Ticker con números inventados: h, l y v son [hoy, últimas 24 h].
const rest = {
  error: [],
  result: {
    XXBTZEUR: { h: ['91000.0', '92500.5'], l: ['89000.0', '88000.25'], v: ['500.1', '1234.56789'] },
    XXBTZUSD: { h: ['99000.0', '101000.0'], l: ['96000.0', '95000.0'], v: ['800.5', '2100.5'] },
    XBTAUD: { h: ['150000.0', '152000.0'], l: ['145000.0', '144000.0'], v: ['20.5', '55.25'] },
  },
}

describe('REST /Ticker de Kraken', () => {
  it('toma las últimas 24 h (segundo valor) del par de cada moneda', () => {
    expect(parsearTickerRest(rest, 'EUR')).toEqual({ high: 92500.5, low: 88000.25, volume: 1234.56789 })
    expect(parsearTickerRest(rest, 'USD')).toEqual({ high: 101000, low: 95000, volume: 2100.5 })
    expect(parsearTickerRest(rest, 'AUD')).toEqual({ high: 152000, low: 144000, volume: 55.25 })
  })
  it('respuestas con error, sin el par o con datos raros dan null', () => {
    expect(parsearTickerRest({ error: ['EQuery:Unknown asset pair'], result: {} }, 'EUR')).toBeNull()
    expect(parsearTickerRest({ error: [], result: { XXBTZEUR: rest.result.XXBTZEUR } }, 'USD')).toBeNull()
    expect(parsearTickerRest({ error: [], result: { XXBTZEUR: { h: ['1', 'x'], l: ['1', '1'], v: ['1', '1'] } } }, 'EUR')).toBeNull()
    expect(parsearTickerRest({ error: [], result: { XXBTZEUR: { h: ['1', '10'], l: ['1', '20'], v: ['1', '1'] } } }, 'EUR')).toBeNull() // máximo menor que el mínimo
    expect(parsearTickerRest(null, 'EUR')).toBeNull()
  })
})

describe('estadísticas de 24 h desde velas de 1 hora', () => {
  const ahora = 1_800_000_000
  const vela = (horasAtras: number, high: number, low: number, volume: number) => ({ time: ahora - horasAtras * 3600, high, low, volume })
  it('máximo, mínimo y volumen de las últimas 24 h (las anteriores no cuentan)', () => {
    const v = [vela(30, 999, 1, 100), vela(23, 50100, 49000, 10), vela(12, 51000, 50000, 20), vela(1, 50500, 49500, 5)]
    expect(statsDeVelas(v, ahora)).toEqual({ high: 51000, low: 49000, volume: 35 })
  })
  it('sin velas en ese tramo, null', () => {
    expect(statsDeVelas([], ahora)).toBeNull()
    expect(statsDeVelas([vela(48, 1, 1, 1)], ahora)).toBeNull()
  })
})

describe('qué fuente se usa', () => {
  const a = { high: 3, low: 1, volume: 5 }, b = { high: 4, low: 2, volume: 6 }
  it('la primera con datos válidos: directo → REST → velas', () => {
    expect(elegirStats(a, b)).toBe(a)
    expect(elegirStats(null, b)).toBe(b)
    expect(elegirStats(undefined, null, { high: NaN, low: 1, volume: 1 }, b)).toBe(b)
    expect(elegirStats(null, undefined)).toBeNull()
  })
})
