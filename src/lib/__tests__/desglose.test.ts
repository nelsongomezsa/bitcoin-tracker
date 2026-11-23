// «Sumar los BTC ganados con trades a mi cartera»: desactivado por defecto, desglose Cartera / Trading (neto) / Total y precio medio intacto.
// Todos los números están inventados.
import { describe, expect, it } from 'vitest'
import { desgloseCartera, totalesTrading, type Trade } from '../trading'
import { resumen, type Operacion } from '../calculos'
import { perfilSchema } from '../schemas'
import { PERFIL_INICIAL } from '../tipos'
import { PERFIL_DEMO } from '../../state/demoData'

const compra = (id: string, fecha: string, cantidad: number, precio: number): Operacion => ({ id, tipo: 'compra', fecha, cantidad, comision: 0, precio, moneda: 'EUR' })
const ops = [compra('a', '2025-01-10', 1000, 50000), compra('b', '2025-02-10', 1500, 30000)] // 0,02 + 0,05 = 0,07 BTC
const P = 60000
const res = resumen(ops, P)
const t = (id: string, fechaCierre: string, resultadoDinero: number): Trade => ({
  id, estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-01', fechaCierre, precioEntrada: 50000, precioSalida: 51000, moneda: 'EUR',
  resultadoDinero, resultadoMoneda: 'EUR', resultadoPrecio: 60000, // ±600 € a 60.000 € = ±0,01 BTC
})
const PR = { EUR: P, USD: P * 1.1, AUD: P * 1.6 }

describe('desactivada por defecto en cuentas nuevas', () => {
  it('el perfil inicial, el del modo demo y el esquema dejan «sumar trading a la cartera» en falso', () => {
    expect(PERFIL_INICIAL.sumarTradingACartera).toBe(false)
    expect(PERFIL_DEMO.sumarTradingACartera).toBe(false)
    expect(perfilSchema.parse({ nombre: 'Ana', monedaPreferida: 'EUR', modoPrivado: false }).sumarTradingACartera).toBe(false)
  })
  it('con el ajuste apagado, el trading no entra: el total es la cartera', () => {
    const d = desgloseCartera(res, 0.05, P, false)
    expect(d.trading).toEqual({ btc: 0, valor: 0 })
    expect(d.total).toEqual(d.cartera)
  })
})

describe('con el ajuste activado: Cartera, Trading (neto) y Total por separado', () => {
  it('Total = Cartera + Trading (neto), en BTC y en valor', () => {
    const neto = totalesTrading([t('1', '2025-03-04', 600), t('2', '2025-03-05', 300)], PR, 'EUR').neto // +0,015 BTC
    const d = desgloseCartera(res, neto, P, true)
    expect(d.cartera.btc).toBeCloseTo(0.07, 10)
    expect(d.trading.btc).toBeCloseTo(0.015, 10)
    expect(d.total.btc).toBeCloseTo(0.085, 10)
    expect(d.trading.valor).toBeCloseTo(0.015 * P, 6)
    expect(d.total.valor).toBeCloseTo(d.cartera.valor + 0.015 * P, 6)
  })
  it('las pérdidas de Trading restan: con más pérdidas que ganancias el total baja', () => {
    const lote = [t('1', '2025-03-04', 600), t('2', '2025-03-05', -1500)] // +0,01 − 0,025 = −0,015 BTC
    const neto = totalesTrading(lote, PR, 'EUR').neto
    expect(neto).toBeCloseTo(-0.015, 10)
    const d = desgloseCartera(res, neto, P, true)
    expect(d.trading.btc).toBeLessThan(0)
    expect(d.trading.valor).toBeLessThan(0)
    expect(d.total.btc).toBeCloseTo(0.055, 10)
    expect(d.total.btc).toBeLessThan(d.cartera.btc)
    expect(d.total.valor).toBeCloseTo(d.cartera.valor - 0.015 * P, 6)
  })
  it('el total se calcula en la moneda de la vista (BTC × precio de esa moneda)', () => {
    for (const m of ['EUR', 'USD', 'AUD'] as const) {
      const neto = totalesTrading([t('1', '2025-03-04', 600)], PR, m).neto
      const d = desgloseCartera({ ...res, valorHoy: res.btc * PR[m] }, neto, PR[m], true)
      expect(d.total.valor).toBeCloseTo((res.btc + neto) * PR[m], 6)
    }
  })
})

describe('el precio medio de compra NO cambia por los trades', () => {
  it('es el mismo con el ajuste apagado, encendido, con ganancias y con pérdidas enormes', () => {
    const base = res.precioMedioReal
    expect(base).toBeCloseTo((1000 + 1500) / 0.07, 6) // lo metido entre los BTC de las compras
    for (const sumar of [false, true]) {
      for (const neto of [0, 0.5, -0.5, 12.3456]) expect(desgloseCartera(res, neto, P, sumar).precioMedio).toBe(base)
    }
  })
  it('resumen() solo mira las compras: añadir trades al cálculo no existe y las ventas/compras siguen mandando', () => {
    // El resumen de la cartera no recibe trades: el precio medio es función solo de las operaciones.
    expect(resumen(ops, 1).precioMedioReal).toBe(resumen(ops, 99999).precioMedioReal)
    expect(resumen(ops.slice(0, 1), P).precioMedioReal).toBeCloseTo(50000, 6)
  })
})
