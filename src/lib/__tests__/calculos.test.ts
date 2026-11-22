import { describe, expect, it } from 'vitest'
import {
  VentaExcedidaError, bajarMedia, btcDeCompra, btcDeVenta, calcularFifo, comparativaPrimerDia, convertir, escenarioPrecio,
  estadoNiveles, estimarIrpf, filaCompra, informeFifoAnual, invertidoPorMes, mejorYPeorCompra, normalizar, ordenarPorFecha,
  progresoDca, progresoObjetivo, proximoNivel, resumen, serieCartera, siVendoHoy, totalPlanificadoPct, precioObjetivoPorGanancia,
  type Operacion,
} from '../calculos'
import { COMPRAS, PLAN, TOTAL_BTC, TOTAL_CANTIDAD, TOTAL_COMISION } from './fixture'

const venta = (id: string, fecha: string, cantidad: number, comision: number, precio: number): Operacion => ({
  id, tipo: 'venta', fecha, cantidad, comision, precio, moneda: 'EUR',
})

describe('compra individual', () => {
  it('BTC = (cantidad − comisión) / precio', () => {
    expect(btcDeCompra(COMPRAS[0])).toBeCloseTo(0.0198, 10)
    expect(btcDeCompra(COMPRAS[1])).toBeCloseTo(0.012375, 10)
  })

  it('marca como alta la comisión de más del 3 %', () => {
    const f = filaCompra(COMPRAS[4], 30000) // 2 / 40 = 5 %
    expect(f.pctComision).toBeCloseTo(0.05, 10)
    expect(f.comisionAlta).toBe(true)
    expect(filaCompra(COMPRAS[0], 30000).comisionAlta).toBe(false) // 1 %
  })

  it('valor hoy, ganancia y rentabilidad', () => {
    // 0,0198 BTC a 60.000 = 1.188 · metido 1.000
    const f = filaCompra(COMPRAS[0], 60000)
    expect(f.valorHoy).toBeCloseTo(1188, 6)
    expect(f.ganancia).toBeCloseTo(188, 6)
    expect(f.rentabilidad).toBeCloseTo(0.188, 10)
  })
})

describe('totales con 10 compras', () => {
  const r = resumen(COMPRAS, 40000)

  it('suma BTC, dinero y comisiones', () => {
    expect(r.btc).toBeCloseTo(TOTAL_BTC, 10)
    expect(r.invertido).toBeCloseTo(TOTAL_CANTIDAD, 8)
    expect(r.comisiones).toBeCloseTo(TOTAL_COMISION, 8)
    expect(r.pctComisiones).toBeCloseTo(51.5 / 4990, 10)
  })

  it('precio medio real y sin comisiones', () => {
    expect(r.precioMedioReal).toBeCloseTo(4990 / 0.115865, 4) // ≈ 43.067,36
    expect(r.precioMedioSinComisiones).toBeCloseTo((4990 - 51.5) / 0.115865, 4)
    expect(r.precioMedioReal).toBeGreaterThan(r.precioMedioSinComisiones)
  })

  it('valor, ganancia y rentabilidad a 40.000', () => {
    expect(r.valorHoy).toBeCloseTo(0.115865 * 40000, 6) // 4.634,60
    expect(r.ganancia).toBeCloseTo(4634.6 - 4990, 6)
    expect(r.rentabilidad).toBeCloseTo((4634.6 - 4990) / 4990, 8)
  })

  it('subida que falta para ser rentable', () => {
    expect(r.subidaParaRentable).toBeCloseTo(4990 / 0.115865 / 40000 - 1, 8)
    expect(resumen(COMPRAS, 100000).subidaParaRentable).toBe(0)
  })

  it('dos compras el mismo día conservan el orden', () => {
    const orden = ordenarPorFecha(COMPRAS).map((o) => o.id)
    expect(orden.indexOf('c3')).toBeLessThan(orden.indexOf('c4'))
  })

  it('mejor y peor compra', () => {
    const { mejor, peor } = mejorYPeorCompra(COMPRAS, 40000)
    expect(mejor?.id).toBe('c6') // comprada a 25.000
    expect(peor?.id).toBe('c8') // comprada a 80.000
  })
})

describe('ventas por FIFO', () => {
  // Vende 0,03 BTC a 60.000: recibe 1.790 netos y paga 10 de comisión → (1790 + 10) / 60000 = 0,03
  const ops = [...COMPRAS, venta('v1', '2025-06-01', 1790, 10, 60000)]
  const { lotes, ventas } = calcularFifo(ops)

  it('BTC vendidos', () => {
    expect(btcDeVenta(ops[10])).toBeCloseTo(0.03, 12)
  })

  it('consume el lote más antiguo entero y parte del segundo', () => {
    // lote 1: 0,0198 (coste 1.000) · lote 2: 0,0102 de 0,012375 → 500 × 0,0102/0,012375
    const costeEsperado = 1000 + (500 * 0.0102) / 0.012375
    expect(ventas).toHaveLength(1)
    expect(ventas[0].coste).toBeCloseTo(costeEsperado, 6) // ≈ 1.412,12
    expect(ventas[0].ganancia).toBeCloseTo(1790 - costeEsperado, 6) // ≈ 377,88
    expect(lotes.find((l) => l.id === 'c1')).toBeUndefined()
    expect(lotes[0].id).toBe('c2')
    expect(lotes[0].btc).toBeCloseTo(0.002175, 10)
  })

  it('el precio medio y lo invertido se calculan sobre lo que queda', () => {
    const r = resumen(ops, 40000)
    expect(r.btc).toBeCloseTo(0.085865, 10)
    expect(r.invertido).toBeCloseTo(4990 - (1000 + (500 * 0.0102) / 0.012375), 6)
    expect(r.precioMedioReal).toBeCloseTo(r.invertido / 0.085865, 6)
    expect(r.gananciaRealizada).toBeCloseTo(ventas[0].ganancia, 8)
  })

  it('no se puede vender más BTC del que hay', () => {
    const demasiado = [...COMPRAS, venta('v2', '2025-06-01', 12000, 0, 60000)] // 0,2 BTC
    expect(() => calcularFifo(demasiado)).toThrow(VentaExcedidaError)
  })

  it('no se puede vender antes de haber comprado', () => {
    expect(() => calcularFifo([venta('v3', '2024-12-31', 100, 0, 50000), ...COMPRAS])).toThrow(VentaExcedidaError)
  })

  it('informe FIFO del año', () => {
    const inf = informeFifoAnual(ops, 2025)
    expect(inf.ventas).toHaveLength(1)
    expect(inf.gananciaTotal).toBeCloseTo(ventas[0].ganancia, 8)
    expect(informeFifoAnual(ops, 2024).ventas).toHaveLength(0)
  })
})

describe('monedas', () => {
  const precios = { EUR: 50000, USD: 55000, AUD: 80000 }
  it('convierte con el cociente de precios de BTC', () => {
    expect(convertir(100, 'EUR', 'USD', precios)).toBeCloseTo(110, 10)
    expect(convertir(160, 'AUD', 'EUR', precios)).toBeCloseTo(100, 10)
    expect(convertir(5, 'EUR', 'EUR', precios)).toBe(5)
  })
  it('normaliza operaciones a otra moneda sin cambiar los BTC', () => {
    const n = normalizar(COMPRAS, 'USD', precios)
    expect(n[0].moneda).toBe('USD')
    expect(btcDeCompra(n[0])).toBeCloseTo(btcDeCompra(COMPRAS[0]), 10)
  })
})

describe('plan y DCA', () => {
  it('2 niveles comprados y 2 pendientes', () => {
    const e = estadoNiveles(PLAN, COMPRAS)
    expect(e.map((x) => x.estado)).toEqual(['Comprado', 'Comprado', 'Pendiente', 'Pendiente'])
    expect(e[0].importe).toBe(1000)
    expect(e[3].importe).toBe(2500)
  })
  it('tolerancia del ±0,5 %', () => {
    const casi: Operacion = { ...COMPRAS[0], id: 'x', precio: 29860 } // −0,47 % de 30.000
    expect(estadoNiveles(PLAN, [casi])[2].estado).toBe('Comprado')
    expect(estadoNiveles(PLAN, [{ ...casi, precio: 29800 }])[2].estado).toBe('Pendiente')
  })
  it('próximo nivel pendiente por debajo del precio', () => {
    const p = proximoNivel(PLAN, COMPRAS, 36000)
    expect(p?.precio).toBe(30000)
    expect(p?.bajadaNecesaria).toBeCloseTo(1 - 30000 / 36000, 10)
    expect(proximoNivel(PLAN, COMPRAS, 15000)).toBeNull()
  })
  it('suma planificada: 75 % en niveles + 25 × 1 % de DCA = 100 %', () => {
    expect(totalPlanificadoPct(PLAN)).toBe(100)
    expect(totalPlanificadoPct({ ...PLAN, capital: 1, dca: { ...PLAN.dca, semanas: 20 } })).toBe(95)
  })
  it('DCA de 1 % semanal durante 25 semanas: semana 3 de 25', () => {
    const p = progresoDca(PLAN, '2025-06-15')
    expect(p.importeSemanal).toBe(100)
    expect(p.semanaActual).toBe(3)
    expect(p.semanas).toBe(25)
    expect(p.metidoSegunPlan).toBe(300)
    expect(p.quedaPorMeter).toBe(2200)
  })
  it('DCA sin fecha de inicio: sin empezar', () => {
    const p = progresoDca({ ...PLAN, dca: { porcentajeSemanal: 1, semanas: 25 } }, '2025-06-15')
    expect(p.semanaActual).toBe(0)
    expect(p.quedaPorMeter).toBe(2500)
  })
  it('DCA aún no empezado y terminado', () => {
    expect(progresoDca(PLAN, '2025-05-01').semanaActual).toBe(0)
    expect(progresoDca(PLAN, '2027-01-01').semanaActual).toBe(25)
    expect(progresoDca(PLAN, '2027-01-01').quedaPorMeter).toBe(0)
  })
})

describe('calculadoras', () => {
  it('bajar la media hasta el objetivo', () => {
    const r = resumen(COMPRAS, 30000)
    const res = bajarMedia(COMPRAS, 38000, 30000)
    expect(res.posible).toBe(true)
    if (res.posible) {
      expect(res.nuevaMedia).toBeCloseTo(38000, 6)
      expect(res.importe).toBeGreaterThan(0)
      expect((r.invertido + res.importe) / (r.btc + res.btcNuevos)).toBeCloseTo(38000, 6)
    }
  })
  it('con comisión también llega al objetivo', () => {
    const res = bajarMedia(COMPRAS, 38000, 30000, 0.01)
    expect(res.posible && Math.abs(res.nuevaMedia - 38000) < 1e-6).toBe(true)
  })
  it('explica cuándo no es posible', () => {
    expect(bajarMedia(COMPRAS, 38000, 45000)).toEqual({ posible: false, motivo: 'precio_alto' })
    expect(bajarMedia(COMPRAS, 50000, 30000)).toEqual({ posible: false, motivo: 'ya_alcanzado' })
    expect(bajarMedia([], 100, 50)).toEqual({ posible: false, motivo: 'sin_btc' })
  })
  it('¿y si BTC llega a X?', () => {
    const e = escenarioPrecio(COMPRAS, 100000)
    expect(e.valor).toBeCloseTo(11586.5, 6)
    expect(e.ganancia).toBeCloseTo(11586.5 - 4990, 6)
  })
  it('si vendo hoy: ganancia FIFO de todo', () => {
    const s = siVendoHoy(COMPRAS, 60000)
    expect(s.btc).toBeCloseTo(TOTAL_BTC, 10)
    expect(s.ingreso).toBeCloseTo(0.115865 * 60000, 6)
    expect(s.ganancia).toBeCloseTo(0.115865 * 60000 - 4990, 6)
    expect(s.irpfEstimado).toBeCloseTo(s.ganancia * 0.19, 6)
  })
  it('si vendo hoy más de lo que tengo, falla', () => {
    expect(() => siVendoHoy(COMPRAS, 60000, 1)).toThrow(VentaExcedidaError)
  })
  it('IRPF del ahorro por tramos', () => {
    expect(estimarIrpf(7000)).toBeCloseTo(6000 * 0.19 + 1000 * 0.21, 8)
    expect(estimarIrpf(60000)).toBeCloseTo(6000 * 0.19 + 44000 * 0.21 + 10000 * 0.23, 8)
    expect(estimarIrpf(-500)).toBe(0)
  })
})

describe('objetivos y estadísticas', () => {
  it('progreso acotado entre 0 y 1', () => {
    expect(progresoObjetivo(0.05, 0.2)).toBeCloseTo(0.25, 10)
    expect(progresoObjetivo(1, 0.2)).toBe(1)
    expect(progresoObjetivo(1, 0)).toBe(0)
  })
  it('precio objetivo por % de ganancia', () => {
    expect(precioObjetivoPorGanancia(40000, 25)).toBe(50000)
  })
  it('invertido por mes', () => {
    const m = invertidoPorMes(COMPRAS)
    expect(m[0]).toEqual({ mes: '2025-01', importe: 1500 })
    expect(m[1]).toEqual({ mes: '2025-02', importe: 540 })
    expect(m.reduce((s, x) => s + x.importe, 0)).toBe(4990)
  })
  it('comparativa "todo el primer día"', () => {
    const c = comparativaPrimerDia(COMPRAS, 60000)!
    expect(c.metido).toBe(4990)
    expect(c.btcPrimerDia).toBeCloseTo(4990 / 50000, 10)
    expect(c.valorPrimerDia).toBeCloseTo((4990 / 50000) * 60000, 6)
  })
  it('serie de cartera: valor frente a lo metido', () => {
    const s = serieCartera(COMPRAS, [
      { t: Date.parse('2025-01-15T00:00:00Z'), precio: 50000 },
      { t: Date.parse('2025-02-05T00:00:00Z'), precio: 50000 },
    ])
    expect(s[0].invertido).toBe(1000)
    expect(s[0].valor).toBeCloseTo(0.0198 * 50000, 6)
    expect(s[1].invertido).toBe(2000)
  })
})
