import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { MAX_BYTES, detectarTipo, filasAOperaciones, leerArchivo } from '../importar'
import { aCsv, seguroCelda } from '../exportar'

const filas = [
  ['Fecha de compra', 'Precio', 'Cantidad ', 'Comisión'],
  [45800, 50000, 200, 2],
  ['15/03/2025', '48.000,50', '300,00', '3'],
  ['2025-04-01', 40000, 100, 0],
  [null, null, null, null],
  ['Resumen', 123],
]

describe('importar', () => {
  it('lee fechas de Excel, texto es-ES y ISO', () => {
    const r = filasAOperaciones(filas, 'EUR')
    expect(r.errores).toEqual([])
    expect(r.operaciones.map((o) => o.fecha).slice(1)).toEqual(['2025-03-15', '2025-04-01'])
    expect(r.operaciones[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.operaciones[1].precio).toBe(48000.5)
    expect(r.operaciones[1].cantidad).toBe(300)
    expect(r.operaciones).toHaveLength(3)
  })
  it('informa de filas inválidas sin abortar', () => {
    const r = filasAOperaciones([filas[0], ['2025-01-01', 50000, -5, 0], ['2025-01-02', 50000, 100, 200], ['2025-01-03', 50000, 100, 1]], 'EUR')
    expect(r.operaciones).toHaveLength(1)
    expect(r.errores.map((e) => e.fila)).toEqual([2, 3])
  })
  it('rechaza fechas futuras', () => {
    expect(filasAOperaciones([filas[0], ['2999-01-01', 50000, 100, 1]], 'EUR').errores).toHaveLength(1)
  })
  it('sin cabecera falla', () => {
    expect(() => filasAOperaciones([['a', 'b']], 'EUR')).toThrow()
  })
  it('lee un xlsx real y un csv', () => {
    const ws = XLSX.utils.aoa_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja')
    const xlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    expect(detectarTipo(new Uint8Array(xlsx))).toBe('xlsx')
    expect(leerArchivo(xlsx, 'EUR').operaciones).toHaveLength(3)
    const csv = new TextEncoder().encode('Fecha,Precio,Cantidad,Comisión\n2025-01-01,50000,100,1\n')
    expect(detectarTipo(csv)).toBe('csv')
    expect(leerArchivo(csv.buffer as ArrayBuffer, 'USD').operaciones[0].moneda).toBe('USD')
  })
  it('comprueba el tipo real, no la extensión', () => {
    const binario = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])
    expect(detectarTipo(binario)).toBeNull()
    expect(() => leerArchivo(binario.buffer, 'EUR')).toThrow('tipo')
  })
  it('máximo 2 MB', () => {
    expect(() => leerArchivo(new ArrayBuffer(MAX_BYTES + 1), 'EUR')).toThrow('tamano')
  })
})

describe('exportar', () => {
  it('protege contra inyección de fórmulas', () => {
    expect(seguroCelda('=HYPERLINK("x")')).toBe("'=HYPERLINK(\"x\")")
    expect(seguroCelda('normal')).toBe('normal')
  })
  it('CSV con cabecera y comillas', () => {
    const csv = aCsv([{ id: '1', tipo: 'compra', fecha: '2025-01-01', cantidad: 100, comision: 1, precio: 50000, moneda: 'EUR', nota: 'a "b"' }])
    expect(csv).toContain('"Fecha","Tipo"')
    expect(csv).toContain('"a ""b"""')
  })
})
