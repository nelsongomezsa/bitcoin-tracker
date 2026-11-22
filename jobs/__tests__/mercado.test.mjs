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
