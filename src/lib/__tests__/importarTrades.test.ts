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

import { leerArchivoTrades } from '../importarTrades'
describe('CSV: las fechas dd/mm/aaaa no se leen como americanas', () => {
  // Datos inventados.
  const csv = [
    'Trade,Fecha inicio,Fecha cierre,Precio entrada (USD),Precio salida (USD),% ganancia,Total ganado (BTC),Total historico',
    '1,12/08/2024,19/08/2024,50000,51000,7.5,0.00100000,0.00100000',
    '2,01/02/2024,03/02/2024,52000,53000,-2.25,-0.00050000,0.00050000',
  ].join('\n')
  it('12/08/2024 es el 12 de agosto (no el 8 de diciembre), y los decimales con punto valen', () => {
    const buf = new TextEncoder().encode(csv)
    const r = leerArchivoTrades(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, 'USD')
    expect(r.errores).toEqual([])
    expect(r.trades.map((t) => [t.fechaInicio, t.fechaCierre])).toEqual([['2024-08-12', '2024-08-19'], ['2024-02-01', '2024-02-03']])
    expect(r.trades.map((t) => t.pctManual)).toEqual([7.5, -2.25])
    expect(r.trades.map((t) => t.btcGanadoManual)).toEqual([0.001, -0.0005])
    expect(r.hayHistorico).toBe(true)
    expect(r.desajustes).toEqual([])
  })
})

import * as XLSX from 'xlsx'
describe('Excel con rarezas: se ignoran sin fallar (datos inventados)', () => {
  // Hoja con la forma de un registro real: título, cabecera en la fila 3 con una celda de error (#VALUE!) en la J,
  // una columna de mes sin cabecera (I), notas sueltas en la J, columnas de resumen a la derecha (K, L) y un resumen debajo de la tabla.
  function libro(conErrorEnDatos = false): ArrayBuffer {
    const filas: unknown[][] = [
      ['REGISTRO DE TRADES'],
      [],
      ['Trade #', 'Fecha inicio', 'Fecha cierre', 'Precio entrada (USD)', 'Precio salida (USD)', '% ganancia', 'Total ganado (BTC)', 'Total historico', null, null, '% TOTAL', 'TOTAL   EN   USD'],
      ['1. x5', 45292, 45294, 50000, 51000, 0.1, 0.002, 0.002, 'ene', 'nota suelta', 0.15, 0],
      [2, 45294, 45295, 51000, 50500, 0.05, 0.001, 0.003, 'ene'],
      [3, 45296, 45296, 50500, 51500, 0.2, 0.0005, 0.0035, null, 'otra nota'], // mes vacío
      [],
      ['Trades ganadores', 3],
      ['Total ganado (BTC)', 0.0035],
    ]
    const ws = XLSX.utils.aoa_to_sheet(filas)
    ws.J3 = { t: 'e', v: 15, w: '#VALUE!' } // la cabecera de la columna J es un error de fórmula
    ws.J5 = { t: 'e', v: 15, w: '#VALUE!' }
    if (conErrorEnDatos) ws.H5 = { t: 'e', v: 15, w: '#VALUE!' } // «Total historico» de la fila 2 con un error de fórmula
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Trades')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cómo usar el Excel'], ['1. Cada fila representa un trade']]), 'Instrucciones')
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    return out
  }
  it('importa las filas, ignora el mes vacío, las notas de la columna J y los #VALUE!', () => {
    const r = leerArchivoTrades(libro(), 'USD')
    expect(r.errores).toEqual([])
    expect(r.trades).toHaveLength(3)
    expect(r.trades.map((t) => t.pctManual)).toEqual([10, 5, 20])
    expect(r.trades.map((t) => t.btcGanadoManual)).toEqual([0.002, 0.001, 0.0005])
    expect(r.hayHistorico).toBe(true)
    expect(r.desajustes).toEqual([])
  })
  it('lee «1. x5» como el trade 1 con apalancamiento x5; los demás quedan sin él', () => {
    const r = leerArchivoTrades(libro(), 'USD')
    expect(r.trades[0].apalancamiento).toBe(5)
    expect(r.trades.slice(1).every((t) => t.apalancamiento === undefined)).toBe(true)
    expect(r.conApalancamiento).toBe(1)
    expect(r.apalancamiento).toBeNull() // no viene en la cabecera
  })
  it('las fechas del Excel (números de serie) se leen bien', () => {
    const r = leerArchivoTrades(libro(), 'USD')
    expect(r.trades[0].fechaInicio).toBe('2024-01-01') // número de serie 45292 de Excel
    expect(r.trades[0].fechaCierre).toBe('2024-01-03')
  })
  it('una celda de error en una columna de datos cuenta como vacía (no como el número 15)', () => {
    const r = leerArchivoTrades(libro(true), 'USD')
    expect(r.errores).toEqual([])
    expect(r.trades).toHaveLength(3)
    expect(r.desajustes).toEqual([]) // esa fila no se compara; las demás siguen cuadrando
  })
  it('un nombre de hoja con otros textos debajo de la tabla no se confunde con trades', () => {
    expect(leerArchivoTrades(libro(), 'USD').trades).toHaveLength(3)
  })
})
