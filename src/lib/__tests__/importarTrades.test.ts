import { describe, expect, it } from 'vitest'
import { filasATrades, leerApalancamiento } from '../importarTrades'
import { tradesACsv } from '../exportar'
import { calcularTrade } from '../trading'

describe('apalancamiento en el texto', () => {
  it('lee x5, 5x, ×10 y x2,5; ignora lo demás', () => {
    expect(leerApalancamiento('Trade x5')).toBe(5)
    expect(leerApalancamiento('5x')).toBe(5)
    expect(leerApalancamiento('Trade ×10')).toBe(10)
    expect(leerApalancamiento('x2,5')).toBe(2.5)
    expect(leerApalancamiento('Trade 3')).toBeNull()
    expect(leerApalancamiento('box')).toBeNull()
    expect(leerApalancamiento('x500')).toBeNull()
    expect(leerApalancamiento(null)).toBeNull()
  })
})

const CAB = ['Trade x5', 'Fecha inicio', 'Fecha cierre', 'Precio entrada', 'Precio salida', '% ganancia', 'Total ganado (BTC)']
describe('filasATrades', () => {
  const filas = [
    ['Título suelto'], CAB,
    [1, '2025-03-01', '2025-03-04', 80000, 82520, 0.1535, 0.0077],
    [2, '2025-03-10', '2025-03-12', 82000, 80360, 0.08, 0.0113], // precio baja y % positivo → corto
    [3, '2025-03-20', null, 81000, null, null, null], // abierto
    [], ['resumen', 1],
  ]
  it('lee las filas, el x5 de la cabecera y la dirección por el signo', () => {
    const r = filasATrades(filas, 'USD')
    expect(r.errores).toEqual([])
    expect(r.trades).toHaveLength(3)
    expect(r.apalancamiento).toBe(5)
    expect(r.trades.map((t) => t.apalancamiento)).toEqual([5, 5, 5])
    expect(r.trades.map((t) => t.direccion)).toEqual(['largo', 'corto', 'largo'])
    expect(r.trades[2].estado).toBe('abierto')
    expect(r.trades[2].precioSalida).toBeUndefined()
    expect(r.trades[0].btcGanadoManual).toBe(0.0077)
  })
  it('el % y los BTC de cada fila se importan tal cual (mandan sobre el cálculo)', () => {
    const r = filasATrades(filas, 'USD')
    expect(r.trades.map((t) => t.pctManual)).toEqual([0.1535, 0.08, undefined].map((x) => (x == null ? x : x * 100)).map((x) => (x == null ? x : Math.round(x * 1e6) / 1e6)))
    expect(r.trades.map((t) => t.btcGanadoManual)).toEqual([0.0077, 0.0113, undefined])
  })
  it('apalancamiento por fila en la columna Trade y fechas dd/mm/aaaa; filas malas van a errores', () => {
    const r = filasATrades([['Trade', 'Fecha inicio', 'Fecha cierre', 'Precio entrada', 'Precio salida'], ['Trade x10', '01/03/2025', '04/03/2025', 100, 105], ['Trade', 'mal', '04/03/2025', 100, 105]], 'EUR')
    expect(r.trades[0]).toMatchObject({ apalancamiento: 10, fechaInicio: '2025-03-01', moneda: 'EUR' })
    expect(r.errores).toHaveLength(1)
  })
  it('sin cabecera de trades lanza', () => {
    expect(() => filasATrades([['a', 'b']], 'USD')).toThrow()
  })
})

describe('exportar trades', () => {
  it('CSV con cabecera y sin inyección de fórmulas', () => {
    const csv = tradesACsv([{ id: '1', estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-01', fechaCierre: '2025-03-04', precioEntrada: 80000, precioSalida: 82520, moneda: 'USD', apalancamiento: 5, margenBTC: 0.05, nota: '=cmd()' }])
    expect(csv).toContain('Total ganado (BTC)')
    expect(csv).toContain("\"'=cmd()\"")
    expect(csv).toContain(String(calcularTrade({ id: '1', estado: 'cerrado', direccion: 'largo', fechaInicio: '', precioEntrada: 80000, precioSalida: 82520, moneda: 'USD', apalancamiento: 5, margenBTC: 0.05 }, 0).btc))
  })
})

describe('calibración con la hoja real: Total ganado por trade y Total histórico acumulado', () => {
  const CAB2 = ['Trade', 'Fecha inicio', 'Fecha cierre', 'Precio entrada', 'Precio salida', '% ganancia', 'Total ganado (BTC)', 'Total histórico']
  const base = [
    [1, '2025-03-01', '2025-03-04', 80000, 82000, 5.2, 0.002, 0.002],
    [2, '2025-03-05', '2025-03-06', 82000, 81000, -1.5, -0.0005, 0.0015],
    [3, '2025-03-07', '2025-03-09', 81000, 84000, 15.35, 0.0089, 0.0104],
  ]
  it('sin apalancamiento en la hoja: queda sin él (es opcional)', () => {
    const r = filasATrades([CAB2, ...base], 'USD')
    expect(r.trades.every((t) => t.apalancamiento === undefined)).toBe(true)
    expect(r.apalancamiento).toBeNull()
  })
  it('comprueba que la suma acumulada coincide con «Total histórico»', () => {
    const r = filasATrades([CAB2, ...base], 'USD')
    expect(r.hayHistorico).toBe(true)
    expect(r.desajustes).toEqual([])
  })
  it('avisa de la fila cuyo «Total histórico» no cuadra con la suma de los totales por trade', () => {
    const mal = base.map((f, i) => (i === 1 ? [...f.slice(0, 7), 0.0016] : f))
    const r = filasATrades([CAB2, ...mal], 'USD')
    expect(r.desajustes.map((d) => d.fila)).toEqual([3]) // la fila de la hoja (la cabecera es la 1)
    expect(r.desajustes[0]).toMatchObject({ historico: 0.0016 })
    expect(r.desajustes[0].calculado).toBeCloseTo(0.0015, 12)
  })
  it('tolera el redondeo a 7 decimales de la hoja', () => {
    const r = filasATrades([CAB2, [1, '2025-03-01', '2025-03-04', 80000, 82000, 5.2, 0.00200004, 0.002]], 'USD')
    expect(r.desajustes).toEqual([])
  })
  it('sin columna «Total histórico» no hay comprobación', () => {
    const r = filasATrades([CAB2.slice(0, 7), ...base.map((f) => f.slice(0, 7))], 'USD')
    expect(r.hayHistorico).toBe(false)
    expect(r.desajustes).toEqual([])
  })
  it('el % puede venir en puntos (15,35), como fracción (0,1535) o como texto «15,35%»', () => {
    const f = (v: unknown) => filasATrades([CAB2.slice(0, 6), [1, '2025-03-01', '2025-03-04', 80000, 82000, v]], 'USD').trades[0].pctManual
    expect(f(15.35)).toBe(15.35)
    expect(f('15,35%')).toBe(15.35)
    // con el formato de % de Excel, la celda guarda 0,1535
    const fr = filasATrades([CAB2.slice(0, 6), [1, '2025-03-01', '2025-03-04', 80000, 82000, 0.1535], [2, '2025-03-05', '2025-03-06', 82000, 81000, -0.015]], 'USD')
    expect(fr.trades.map((t) => t.pctManual)).toEqual([15.35, -1.5])
  })
})
