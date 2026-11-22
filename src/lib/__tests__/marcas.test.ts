import { describe, expect, it } from 'vitest'
import { construirMarcas } from '../marcas'
import type { Operacion } from '../calculos'
import type { Trade } from '../trading'
import { diaASegundos } from '../velas'

const DIA = 86400
const base = Date.parse('2025-03-01T00:00:00Z') / 1000
const velas = Array.from({ length: 20 }, (_, i) => ({ time: base + i * DIA }))
const op = (id: string, tipo: 'compra' | 'venta', fecha: string): Operacion => ({ id, tipo, fecha, cantidad: 100, comision: 1, precio: 50000, moneda: 'EUR' })
const trade: Trade = { id: 't', estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-03', fechaCierre: '2025-03-08', precioEntrada: 100, precioSalida: 110, moneda: 'EUR', apalancamiento: 5, margenBTC: 0.1 }
const P = { EUR: 100, USD: 110, AUD: 165 }
const entrada = { velas, ops: [op('1', 'compra', '2025-03-05'), op('2', 'venta', '2025-03-10'), op('3', 'compra', '2025-02-01')], trades: [trade], moneda: 'EUR' as const, precios: P, verCompras: true, verTrades: true }

describe('marcas sobre las velas', () => {
  it('C en compras, V en ventas, E/S en trades; las anteriores a la primera vela se descartan', () => {
    const { marcas } = construirMarcas(entrada)
    expect(marcas.map((m) => m.texto)).toEqual(['E', 'C', 'S', 'V'])
    expect(marcas.find((m) => m.texto === 'C')!.time).toBe(base + 4 * DIA)
  })
  it('cada marca explica fecha, precio, cantidad y resultado', () => {
    const { marcas } = construirMarcas(entrada)
    expect(marcas.find((m) => m.texto === 'C')!.detalle).toMatch(/05\/03\/2025.*50\.000.*€.*100,00 €/)
    const s = marcas.find((m) => m.texto === 'S')!.detalle
    expect(s).toContain('+50,00 %')
    expect(s).toContain('BTC')
  })
  it('una línea discontinua une entrada y salida de cada trade cerrado', () => {
    const { lineas } = construirMarcas(entrada)
    expect(lineas).toEqual([{ id: 't', desde: { time: base + 2 * DIA, precio: 100 }, hasta: { time: base + 7 * DIA, precio: 110 }, gana: true }])
  })
  it('los trades abiertos solo tienen entrada y no línea', () => {
    const ab: Trade = { ...trade, estado: 'abierto', fechaCierre: undefined, precioSalida: undefined }
    const r = construirMarcas({ ...entrada, trades: [ab], verCompras: false })
    expect(r.marcas.map((m) => m.texto)).toEqual(['E'])
    expect(r.lineas).toEqual([])
  })
  it('respeta los interruptores y convierte la moneda del trade', () => {
    expect(construirMarcas({ ...entrada, verCompras: false, verTrades: false }).marcas).toEqual([])
    const usd = construirMarcas({ ...entrada, moneda: 'USD', trades: [trade], verCompras: false })
    expect(usd.lineas[0].desde.precio).toBeCloseTo(110)
  })
  it('sin velas no hay marcas; la hora del día no importa en velas diarias', () => {
    expect(construirMarcas({ ...entrada, velas: [] }).marcas).toEqual([])
    expect(diaASegundos('2025-03-05')).toBe(base + 4 * DIA + 12 * 3600)
  })
})
