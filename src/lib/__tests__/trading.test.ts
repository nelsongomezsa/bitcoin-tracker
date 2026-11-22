import { describe, expect, it } from 'vitest'
import { calcularTrade, diasEntre, etiquetaTrade, filasTrades, informeTradingAnual, movimiento, ordenarTrades, pasoAPaso, pctGanancia, totalesTrading, tradeAbiertoSuperaDias, type Trade } from '../trading'
import { tradeSchema } from '../schemas'

const P = { EUR: 90000, USD: 100000, AUD: 150000 }
const t = (o: Partial<Trade> = {}): Trade => ({
  id: 'x', estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-01', fechaCierre: '2025-03-04', precioEntrada: 80000, precioSalida: 82520, moneda: 'USD',
  apalancamiento: 5, margenBTC: 0.05, comisiones: 0.4, ...o,
})

describe('fórmulas básicas', () => {
  it('movimiento: largo gana si sube, corto si baja', () => {
    expect(movimiento(100, 110, 'largo')).toBeCloseTo(0.1)
    expect(movimiento(100, 110, 'corto')).toBeCloseTo(-0.1)
    expect(movimiento(100, 90, 'corto')).toBeCloseTo(0.1)
  })
  it('% = movimiento × apalancamiento − comisiones', () => {
    expect(pctGanancia(0.0315, 5, 0.4)).toBeCloseTo(0.1535)
    expect(pctGanancia(0.0315, 1)).toBeCloseTo(0.0315)
  })
  it('BTC = margen × %; el manual manda; sin margen ni manual no hay BTC', () => {
    const c = calcularTrade(t(), 0)
    expect(c.pct).toBeCloseTo(0.1535, 6)
    expect(c.btc).toBeCloseTo(0.05 * 0.1535, 8)
    expect(calcularTrade(t({ btcGanadoManual: 0.01 }), 0)).toMatchObject({ btc: 0.01, manual: true })
    expect(calcularTrade(t({ margenBTC: undefined }), 0).btc).toBeNull()
    expect(calcularTrade(t({ margenBTC: undefined, btcGanadoManual: -0.002 }), 0).btc).toBe(-0.002)
  })
  it('abierto: usa el precio actual y se marca sin cerrar', () => {
    const c = calcularTrade(t({ estado: 'abierto', fechaCierre: undefined, precioSalida: undefined, direccion: 'corto' }), 76000)
    expect(c.abierto).toBe(true)
    expect(c.movimiento).toBeCloseTo(0.05)
    expect(c.precioReferencia).toBe(76000)
  })
  it('paso a paso', () => {
    expect(pasoAPaso(t(), calcularTrade(t(), 0))).toBe('Movimiento +3,15% × 5 − comisiones 0,4% = +15,35% → +0,0077 BTC')
    expect(pasoAPaso(t({ margenBTC: undefined, comisiones: undefined }), calcularTrade(t({ margenBTC: undefined, comisiones: undefined }), 0))).toContain('sin margen')
  })
})

describe('totales y detalle', () => {
  const trades: Trade[] = [
    t({ id: 'a', fechaInicio: '2025-01-01', fechaCierre: '2025-01-03', precioEntrada: 100, precioSalida: 110, apalancamiento: 2, comisiones: 0, margenBTC: 0.1 }), // +20 % → +0,02
    t({ id: 'b', fechaInicio: '2025-01-05', fechaCierre: '2025-01-09', precioEntrada: 100, precioSalida: 95, apalancamiento: 1, comisiones: 0, margenBTC: 0.1 }), // −5 % → −0,005
    t({ id: 'c', fechaInicio: '2025-01-10', fechaCierre: '2025-01-11', precioEntrada: 100, precioSalida: 90, direccion: 'corto', apalancamiento: 1, comisiones: 0, margenBTC: 0.2 }), // +10 % → +0,02
    t({ id: 'd', fechaInicio: '2025-01-12', fechaCierre: '2025-01-14', precioEntrada: 100, precioSalida: 100, apalancamiento: 1, comisiones: 0, margenBTC: 0.2 }), // 0
    t({ id: 'e', estado: 'abierto', fechaCierre: undefined, precioSalida: undefined, fechaInicio: '2025-02-01', precioEntrada: 90000, moneda: 'EUR', apalancamiento: 1, comisiones: 0, margenBTC: 0.1 }), // 90000→90000 = 0
  ]
  it('Ganado, Perdido, Neto = Ganado − Perdido, y valor hoy', () => {
    const x = totalesTrading(trades, P, 'USD')
    expect(x.ganado).toBeCloseTo(0.04, 10)
    expect(x.perdido).toBeCloseTo(0.005, 10)
    expect(x.neto).toBeCloseTo(0.035, 10)
    expect(x.netoValor).toBeCloseTo(0.035 * 100000, 6)
    expect(x.nCerrados).toBe(4)
    expect(x.nAbiertos).toBe(1)
    expect(x.pctGanadores).toBe(0.5)
    expect(x.mejor?.trade.id).toBe('a')
    expect(x.peor?.trade.id).toBe('b')
    expect(x.pctMedia).toBeCloseTo(0.0625, 10) // media simple de +20, −5, +10 y 0
    expect(x.sumaPct).toBeCloseTo(0.25, 10)
    expect(x.duracionMediaDias).toBeCloseTo((2 + 4 + 1 + 2) / 4)
  })
  it('acumulado trade a trade; los abiertos no entran', () => {
    const f = filasTrades(trades, P, 'USD')
    expect(f.map((r) => r.trade.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(f.map((r) => r.acumulado)).toEqual([expect.closeTo(0.02, 10), expect.closeTo(0.015, 10), expect.closeTo(0.035, 10), expect.closeTo(0.035, 10), null])
    expect(f[0].valeHoy).toBeCloseTo(0.02 * 100000, 6)
    expect(f[0].valiaAlCerrar).toBeCloseTo(0.02 * 110, 6)
    expect(f[4].valiaAlCerrar).toBeNull()
  })
  it('racha actual: la última cerrada es un 0 → 0; ganadoras seguidas suman', () => {
    expect(totalesTrading(trades, P, 'USD').racha).toBe(0)
    expect(totalesTrading(trades.slice(0, 3), P, 'USD').racha).toBe(1)
    const seguidas = [trades[0], t({ id: 'f', fechaInicio: '2025-02-01', fechaCierre: '2025-02-02', precioSalida: 70000 }), t({ id: 'g', fechaInicio: '2025-02-03', fechaCierre: '2025-02-04', precioSalida: 70000 })]
    expect(totalesTrading(seguidas, P, 'USD').racha).toBe(-2)
  })
  it('sin trades: todo a cero, sin NaN', () => {
    const x = totalesTrading([], P, 'EUR')
    expect(x).toMatchObject({ neto: 0, ganado: 0, perdido: 0, nCerrados: 0, pctGanadores: 0, racha: 0, mejor: null, peor: null })
  })
  it('sin margen ni manual: no suma BTC pero cuenta como trade', () => {
    const x = totalesTrading([t({ margenBTC: undefined })], P, 'USD')
    expect(x.neto).toBe(0)
    expect(x.nCerrados).toBe(1)
    expect(filasTrades([t({ margenBTC: undefined })], P, 'USD')[0].valeHoy).toBeNull()
  })
  it('ordena por cierre y desempata por inicio', () => {
    const o = ordenarTrades([t({ id: '2', fechaCierre: '2025-03-05' }), t({ id: '1', fechaCierre: '2025-03-04' }), t({ id: '0', estado: 'abierto', fechaCierre: undefined, precioSalida: undefined })])
    expect(o.map((x) => x.id)).toEqual(['1', '2', '0'])
  })
})

describe('informe fiscal y avisos', () => {
  it('suma los cerrados del año a EUR con el precio del día', () => {
    const r = informeTradingAnual([t({ btcGanadoManual: 0.01 }), t({ id: 'y', fechaInicio: '2024-12-01', fechaCierre: '2024-12-05', btcGanadoManual: 1 })], 2025, () => 80000)
    expect(r.filas).toHaveLength(1)
    expect(r.totalEur).toBeCloseTo(800)
    expect(informeTradingAnual([t({ btcGanadoManual: 0.01 })], 2025, () => null).sinPrecio).toBe(1)
  })
  it('días y abiertos que superan X días', () => {
    expect(diasEntre('2025-02-28', '2025-03-02')).toBe(2)
    const ab = t({ estado: 'abierto', fechaCierre: undefined, precioSalida: undefined, fechaInicio: '2025-03-01' })
    expect(tradeAbiertoSuperaDias(ab, '2025-03-10', 7)).toBe(true)
    expect(tradeAbiertoSuperaDias(ab, '2025-03-08', 7)).toBe(false)
  })
})

describe('esquema Zod', () => {
  const ok = { estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-01', fechaCierre: '2025-03-04', precioEntrada: 80000, precioSalida: 82520 }
  it('aplica el valor por defecto de la moneda (USD); el apalancamiento es opcional', () => {
    const r = tradeSchema.parse(ok)
    expect(r.moneda).toBe('USD')
    expect(r.apalancamiento).toBeUndefined() // opcional
  })
  it('rechaza lo que las reglas rechazan', () => {
    for (const mal of [
      { horaInicio: '25:00' }, { horaCierre: '9:30' }, { fechaCierre: '2025-03-01', horaInicio: '15:00', horaCierre: '14:59' },
      { apalancamiento: 126 }, { apalancamiento: 0 }, { pctManual: 100000 }, { pctManual: 'x' }, { precioEntrada: 0 }, { precioSalida: undefined }, { fechaCierre: '2025-02-01' }, { fechaInicio: '2999-01-01' },
      { margenBTC: 0 }, { comisiones: 101 }, { direccion: 'neutral' }, { nota: 'x'.repeat(201) }, { plataforma: '<b>' },
    ]) expect(tradeSchema.safeParse({ ...ok, ...mal }).success, JSON.stringify(mal)).toBe(false)
    expect(tradeSchema.safeParse({ ...ok, horaInicio: '10:00', horaCierre: '12:30' }).success).toBe(true)
    expect(tradeSchema.safeParse({ ...ok, fechaCierre: '2025-03-01', horaInicio: '10:00', horaCierre: '10:00' }).success).toBe(true)
    expect(tradeSchema.safeParse({ ...ok, horaInicio: '', horaCierre: '' }).success).toBe(true)
    expect(tradeSchema.safeParse({ estado: 'abierto', direccion: 'corto', fechaInicio: '2025-03-01', precioEntrada: 1 }).success).toBe(true)
  })
})

import { precioEurEnFecha } from '../trading'
describe('precio histórico por día', () => {
  const h = [{ t: Date.parse('2025-03-01T00:00:00Z'), precio: 80000 }, { t: Date.parse('2025-03-02T00:00:00Z'), precio: 82000 }, { t: Date.parse('2025-03-03T00:00:00Z'), precio: 81000 }]
  it('el punto más cercano; hoy usa el actual; sin dato cerca da null', () => {
    expect(precioEurEnFecha(h, '2025-03-02')).toBe(82000)
    expect(precioEurEnFecha(h, '2025-03-03', 90000, '2025-03-03')).toBe(90000)
    expect(precioEurEnFecha(h, '2025-03-20')).toBeNull()
    expect(precioEurEnFecha([], '2025-03-02')).toBeNull()
  })
})

describe('calibración: % y BTC a mano, apalancamiento opcional', () => {
  it('el % escrito a mano manda sobre el cálculo y el cálculo queda como sugerencia', () => {
    const c = calcularTrade(t({ pctManual: 12, apalancamiento: 5 }), 0)
    expect(c.pct).toBeCloseTo(0.12, 12)
    expect(c.pctManual).toBe(true)
    expect(c.btc).toBeCloseTo(0.05 * 0.12, 12) // margen × % a mano
    expect(c.sugerencia.pct).toBeCloseTo(0.1535, 6)
    expect(c.sugerencia.btc).toBeCloseTo(0.05 * 0.1535, 8)
  })
  it('los BTC a mano mandan sobre margen × %', () => {
    expect(calcularTrade(t({ pctManual: 12, btcGanadoManual: 0.0089 }), 0)).toMatchObject({ btc: 0.0089, manual: true })
  })
  it('sin apalancamiento se calcula como x1 y se etiqueta sin «x»', () => {
    const sin = t({ apalancamiento: undefined, comisiones: 0 })
    expect(calcularTrade(sin, 0).pct).toBeCloseTo(0.0315, 6)
    expect(etiquetaTrade(sin)).toBe('Largo')
    expect(etiquetaTrade(t({ direccion: 'corto' }))).toBe('Corto x5')
    expect(pasoAPaso(sin, calcularTrade(sin, 0))).toBe('Movimiento +3,15% = +3,15% → +0,0016 BTC')
    expect(pasoAPaso(t({ pctManual: 15.35 }), calcularTrade(t({ pctManual: 15.35 }), 0))).toContain('% escrito a mano: +15,35%')
  })
  it('«Media por trade» es la media simple de los % de los cerrados; los abiertos no cuentan', () => {
    const lote = [t({ id: '1', pctManual: 10 }), t({ id: '2', pctManual: -4, fechaCierre: '2025-03-05' }), t({ id: '3', pctManual: 30, fechaCierre: '2025-03-06' }), t({ id: '4', estado: 'abierto', fechaCierre: undefined, precioSalida: undefined, pctManual: 99 })]
    const x = totalesTrading(lote, P, 'USD')
    expect(x.sumaPct).toBeCloseTo(0.36, 12)
    expect(x.pctMedia).toBeCloseTo(0.12, 12)
  })
})

