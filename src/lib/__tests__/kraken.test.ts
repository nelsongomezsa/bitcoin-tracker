import { describe, expect, it } from 'vitest'
import { esperaReconexion, parsearMensaje } from '../kraken'

describe('mensajes de Kraken', () => {
  it('ticker: precio y estadísticas de 24 h por moneda', () => {
    const r = parsearMensaje({ channel: 'ticker', type: 'update', data: [{ symbol: 'BTC/EUR', last: 90000.5, high: 91000, low: 89000, volume: 1200.5, change_pct: 1.25 }, { symbol: 'BTC/USD', last: 99000 }, { symbol: 'ETH/EUR', last: 3 }] })
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ tipo: 'ticker', moneda: 'EUR', tick: { last: 90000.5, high: 91000, low: 89000, volume: 1200.5, cambioPct: 1.25 } })
    expect(r[1]).toMatchObject({ moneda: 'USD', tick: { last: 99000 } })
  })
  it('ohlc: tiempos en segundos, ordenadas y sin repetidos', () => {
    const v = (t: string, c: number) => ({ symbol: 'BTC/EUR', open: 1, high: 2, low: 0.5, close: c, volume: 3, interval_begin: t, interval: 5 })
    const [r] = parsearMensaje({ channel: 'ohlc', type: 'snapshot', data: [v('2025-06-10T10:05:00.000000Z', 7), v('2025-06-10T10:00:00.000000Z', 5), v('2025-06-10T10:05:00.000000Z', 8)] })
    expect(r).toMatchObject({ tipo: 'ohlc', moneda: 'EUR', intervalo: 5 })
    if (r.tipo !== 'ohlc') throw new Error()
    expect(r.velas.map((x) => x.time)).toEqual([Date.parse('2025-06-10T10:00:00Z') / 1000, Date.parse('2025-06-10T10:05:00Z') / 1000])
    expect(r.velas[1].close).toBe(8)
  })
  it('ignora lo que no es válido: latidos, estados, suscripciones y datos raros', () => {
    expect(parsearMensaje({ channel: 'heartbeat' })).toEqual([])
    expect(parsearMensaje({ method: 'subscribe', success: true })).toEqual([])
    expect(parsearMensaje(null)).toEqual([])
    expect(parsearMensaje({ channel: 'ticker', type: 'update', data: [{ symbol: 'BTC/EUR', last: 'x' }] })).toEqual([])
    expect(parsearMensaje({ channel: 'ohlc', type: 'update', data: [{ symbol: 'BTC/EUR', open: 0, high: 1, low: 1, close: 1, interval_begin: 'mal', interval: 1 }] })).toEqual([])
  })
  it('reconexión con espera progresiva, tope de 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(esperaReconexion)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
  })
})
