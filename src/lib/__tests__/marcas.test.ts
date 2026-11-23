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

import { agruparMarcas, type Marca } from '../marcas'
describe('agrupar marcas que se solapan', () => {
  const m = (time: number, texto: Marca['texto'] = 'C'): Marca => ({ time, tipo: 'compra', texto, precio: 1, detalle: `m${time}`, ref: { tipo: 'operacion', id: String(time) } })
  const px = (k: number) => (t: number) => t * k // x = tiempo × k
  it('las marcas cercanas forman un solo grupo y las lejanas, cada una el suyo', () => {
    const g = agruparMarcas([m(1), m(2), m(3), m(50), m(100), m(101)], px(5), 18)
    expect(g.map((x) => x.marcas.length)).toEqual([3, 1, 2])
    expect(g.map((x) => x.time)).toEqual([1, 50, 100])
  })
  it('varias marcas en la misma vela (mismo tiempo) siempre se agrupan', () => {
    expect(agruparMarcas([m(10), m(10, 'E'), m(10, 'S')], px(100), 18)).toHaveLength(1)
  })
  it('al hacer zoom (más píxeles por vela) se separan; al alejarse, se juntan', () => {
    const marcas = [m(1), m(2), m(3), m(4)]
    expect(agruparMarcas(marcas, px(40), 18)).toHaveLength(4)
    expect(agruparMarcas(marcas, px(10), 18).length).toBe(2)
    expect(agruparMarcas(marcas, px(1), 18)).toHaveLength(1)
  })
  it('un grupo no crece sin fin en cadena: se mide desde su primera marca', () => {
    const g = agruparMarcas(Array.from({ length: 10 }, (_, i) => m(i)), px(10), 18) // 10 px entre marcas
    expect(g.map((x) => x.marcas.length)).toEqual([2, 2, 2, 2, 2])
  })
  it('sin posición en pantalla (fuera del gráfico), la marca va sola; sin marcas, vacío; no se pierde ninguna', () => {
    const g = agruparMarcas([m(1), m(2), m(3)], (t) => (t === 2 ? null : t), 18)
    expect(g.map((x) => x.marcas.length)).toEqual([1, 1, 1])
    expect(agruparMarcas([], px(1))).toEqual([])
    const muchas = Array.from({ length: 40 }, (_, i) => m(i))
    expect(agruparMarcas(muchas, px(3), 18).reduce((s, x) => s + x.marcas.length, 0)).toBe(40)
  })
})
