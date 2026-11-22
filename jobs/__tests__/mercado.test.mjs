import { describe, expect, it } from 'vitest'
import { actualizarExtremos, extremosDeHistorico, precioHace } from '../mercado/extremos.mjs'
import { calcularHalving } from '../mercado/red.mjs'
import { velasDiarias, velasSemanales } from '../mercado/velas.mjs'
import { codigoDeMensaje } from '../telegram.mjs'

const D = 24 * 3600e3
describe('extremos', () => {
  it('se inicializan, se actualizan y se reinician al cambiar de mes', () => {
    const ahora = Date.parse('2025-06-10T00:00:00Z')
    let r = actualizarExtremos(null, 50000, ahora)
    expect(r.datos.extremos.mes).toMatchObject({ clave: '2025-06', max: 50000, min: 50000 })
    r = actualizarExtremos(r.datos, 51000, ahora)
    expect(r.cambiado).toBe(true)
    expect(r.datos.extremos.anio.max).toBe(51000)
    expect(actualizarExtremos(r.datos, 50500, ahora).cambiado).toBe(false)
    const julio = actualizarExtremos(r.datos, 49000, Date.parse('2025-07-01T00:00:00Z'))
    expect(julio.datos.extremos.mes).toMatchObject({ clave: '2025-07', max: 49000, min: 49000 })
    expect(julio.datos.extremos.anio.min).toBe(49000)
  })
  it('desde el histórico y precio de referencia', () => {
    const ahora = Date.parse('2025-06-10T00:00:00Z')
    const pts = [[Date.parse('2025-05-31T00:00:00Z'), 70000], [Date.parse('2025-06-02T00:00:00Z'), 50000], [Date.parse('2025-06-09T00:00:00Z'), 55000]]
    const e = extremosDeHistorico(pts, ahora)
    expect(e.mes).toMatchObject({ max: 55000, min: 50000 })
    expect(e.anio.max).toBe(70000)
    expect(precioHace(pts, 1, ahora)).toBe(55000)
  })
})

describe('halving y velas', () => {
  it('días al próximo halving a partir de la altura', () => {
    const h = calcularHalving(1_050_000 - 4320) // 4320 bloques ≈ 30 días
    expect(h.proximoBloque).toBe(1_050_000)
    expect(h.diasHalving).toBeCloseTo(30, 5)
    expect(calcularHalving(840_000).diasDesdeUltimo).toBe(0)
  })
  it('velas diarias OHLC a partir de puntos horarios', () => {
    const t0 = Math.floor(Date.parse('2025-06-02T00:00:00Z') / D) * D
    const v = velasDiarias([[t0 + 1, 10], [t0 + 3600e3, 14], [t0 + 7200e3, 8], [t0 + 20 * 3600e3, 12], [t0 + D + 5, 13]])
    expect(v).toEqual([[t0, 10, 14, 8, 12], [t0 + D, 13, 13, 13, 13]])
  })
  it('velas semanales empiezan en lunes', () => {
    const lunes = Date.parse('2025-06-02T00:00:00Z')
    const v = velasSemanales([[lunes + 2 * D, 5], [lunes + 4 * D, 9], [lunes + 8 * D, 7]])
    expect(v).toHaveLength(2)
    expect(v[0]).toEqual([lunes, 5, 9, 5, 9])
  })
})

describe('telegram', () => {
  it('solo acepta /start con un código bien formado', () => {
    expect(codigoDeMensaje('/start ABCD1234EF')).toBe('ABCD1234EF')
    expect(codigoDeMensaje('/start abcd1234')).toBeNull()
    expect(codigoDeMensaje('/start ABC')).toBeNull()
    expect(codigoDeMensaje('hola')).toBeNull()
    expect(codigoDeMensaje('/start ABCD1234; DROP')).toBeNull()
  })
})

import { filtrarGrandes, mezclarMovimientos } from '../mercado/ballenas.mjs'
import { detectarCambios, saldoDeEstadisticas } from '../mercado/carteras.mjs'
import { normalizarEntidades, normalizarMovimientos } from '../mercado/instituciones.mjs'

describe('ballenas', () => {
  it('filtra por umbral y convierte sats a BTC', () => {
    const r = filtrarGrandes([{ txid: 't1', value: 600 * 1e8 }, { txid: 't2', value: 499.99 * 1e8 }, { txid: 't3', value: 12_000_000_000 }], 500)
    expect(r).toEqual([{ txid: 't1', btc: 600 }, { txid: 't3', btc: 120 }].filter((x) => x.btc >= 500).concat([]))
  })
  it('mezcla sin repetir y recorta', () => {
    const m = mezclarMovimientos([{ txid: 'a' }, { txid: 'b' }], [{ txid: 'c' }, { txid: 'a' }], 3)
    expect(m.map((x) => x.txid)).toEqual(['c', 'a', 'b'])
    expect(mezclarMovimientos([], [{ txid: '1' }, { txid: '2' }], 1)).toHaveLength(1)
  })
})

describe('carteras seguibles', () => {
  it('saldo = confirmado + mempool', () => {
    expect(saldoDeEstadisticas({ chain_stats: { funded_txo_sum: 500e8, spent_txo_sum: 100e8 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 50e8 } })).toBe(350)
  })
  it('detecta cambios mayores que el mínimo y no inventa la primera consulta', () => {
    const ant = { a: { saldoBtc: 100 }, b: { saldoBtc: 50 } }
    const nuevo = { a: { nombre: 'A', saldoBtc: 90.5 }, b: { nombre: 'B', saldoBtc: 50.001 }, c: { nombre: 'C', saldoBtc: 9 } }
    expect(detectarCambios(ant, nuevo)).toEqual([{ id: 'a', nombre: 'A', cambioBtc: -9.5 }])
    expect(detectarCambios(undefined, nuevo)).toEqual([])
  })
})

describe('instituciones', () => {
  it('normaliza de forma tolerante y ordena por BTC', () => {
    const r = normalizarEntidades([{ name: 'B', total_holdings: 10 }, { name: 'A', total_holdings: 500, symbol: 'AAA', country: 'US' }, { name: 'sin datos' }, null].filter(Boolean))
    expect(r.map((e) => e.nombre)).toEqual(['A', 'B'])
    expect(normalizarEntidades(undefined)).toEqual([])
  })
  it('movimientos de compra y venta', () => {
    const m = normalizarMovimientos({ nombre: 'A' }, { transactions: [{ type: 'buy', holding_net_change: 5, date: 1700000000000 }, { type: 'sell', holding_net_change: -2, date: 1690000000000 }, { type: 'buy' }] })
    expect(m).toHaveLength(2)
    expect(m[1].tipo).toBe('venta')
  })
})
