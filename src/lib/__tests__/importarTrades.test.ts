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
  it('el acumulado se convierte en la diferencia de cada fila', () => {
    const r = filasATrades([CAB, [1, '2025-03-01', '2025-03-04', 100, 110, 0.5, 0.01], [2, '2025-03-05', '2025-03-06', 100, 90, -0.5, 0.004]], 'USD', { acumulado: true })
    expect(r.trades.map((t) => t.btcGanadoManual)).toEqual([0.01, -0.006])
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
