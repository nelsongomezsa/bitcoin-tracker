import { describe, expect, it } from 'vitest'
import {
  VentaExcedidaError, bajarMedia, btcDeCompra, btcDeVenta, calcularFifo, comparativaPrimerDia, convertir, escenarioPrecio,
  estadoNiveles, estimarIrpf, filaCompra, informeFifoAnual, invertidoPorMes, mejorYPeorCompra, normalizar, ordenarPorFecha,
  progresoDca, progresoObjetivo, proximoNivel, resumen, serieCartera, siVendoHoy, totalPlanificadoPct, precioObjetivoPorGanancia,
  aSats, btcAcumulado, calendarioDca, comprasConComisionAlta, drawdown, histogramaCompras, hitosCartera, serieRentabilidad,
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

describe('estadísticas ampliadas', () => {
  const serie = [
    { fecha: '2025-01-01', valor: 1000, invertido: 1000 },
    { fecha: '2025-01-02', valor: 1200, invertido: 1000 }, // +200
    { fecha: '2025-01-03', valor: 900, invertido: 1000 }, // −300 (cae desde 1.200: −25 %)
    { fecha: '2025-01-04', valor: 1500, invertido: 1300 }, // +600 de valor, 300 son dinero nuevo → +300 reales
  ]
  it('rentabilidad en el tiempo', () => {
    const r = serieRentabilidad(serie).map((p) => p.rentabilidad)
    ;[0, 0.2, -0.1, 1500 / 1300 - 1].forEach((e, i) => expect(r[i]).toBeCloseTo(e, 10))
  })
  it('drawdown desde el máximo', () => {
    const d = drawdown(serie)
    expect(d[1].caida).toBe(0)
    expect(d[2].caida).toBeCloseTo(-0.25, 10)
    expect(d[3].caida).toBe(0)
  })
  it('mejor y peor día descuentan el dinero nuevo', () => {
    const h = hitosCartera(serie)!
    expect(h.mejor).toEqual({ fecha: '2025-01-04', cambio: 300 })
    expect(h.peor).toEqual({ fecha: '2025-01-03', cambio: -300 })
    expect(h.maximo).toEqual({ fecha: '2025-01-04', valor: 1500 })
    expect(hitosCartera([serie[0]])).toBeNull()
  })
  it('mapa de compras: histograma y % en ganancias', () => {
    const h = histogramaCompras(COMPRAS, 45000, 4)
    expect(h.bins.reduce((s, b) => s + b.compras, 0)).toBe(10)
    expect(h.bins.reduce((s, b) => s + b.importe, 0)).toBe(4990)
    // A 45.000 ganan las compradas a menos de ~45.000: c2, c3, c5, c6, c10 (precio 45.000 con comisión no gana).
    expect(h.pctEnGanancias).toBeCloseTo(4 / 10, 10)
  })
  it('BTC acumulado compra a compra y con ventas', () => {
    const a = btcAcumulado(COMPRAS)
    expect(a.at(-1)!.btc).toBeCloseTo(TOTAL_BTC, 10)
    expect(a.find((x) => x.fecha === '2025-02-03')!.btc).toBeCloseTo(0.0198 + 0.012375 + 0.00495 + 0.00594, 10)
    const conVenta = btcAcumulado([...COMPRAS, { id: 'v', tipo: 'venta', fecha: '2025-06-01', cantidad: 1790, comision: 10, precio: 60000, moneda: 'EUR' }])
    expect(conVenta.at(-1)!.btc).toBeCloseTo(TOTAL_BTC - 0.03, 10)
  })
  it('calendario de DCA: semanas con y sin compra (lunes a domingo)', () => {
    const cal = calendarioDca(COMPRAS, '2025-02-09', 4) // las 4 semanas que terminan en la del 03/02 (el 09/02 cae en esa semana)
    expect(cal.map((s) => s.semana)).toEqual(['2025-01-13', '2025-01-20', '2025-01-27', '2025-02-03'])
    expect(cal.find((s) => s.semana === '2025-01-20')).toMatchObject({ compras: 1, importe: 500 })
    expect(cal.find((s) => s.semana === '2025-02-03')).toMatchObject({ compras: 2, importe: 500 })
    expect(cal.find((s) => s.semana === '2025-01-27')).toMatchObject({ compras: 0, importe: 0 })
  })
  it('sats y comisiones altas', () => {
    expect(aSats(0.00012345)).toBe(12345)
    expect(aSats(1)).toBe(100_000_000)
    const altas = comprasConComisionAlta(COMPRAS, 40000)
    expect(altas.map((f) => f.id)).toEqual(['c5']) // 2 / 40 = 5 %
  })
})

import { operacionSchema } from '../schemas'
import { fechaConHora } from '../format'
describe('hora opcional de las operaciones', () => {
  const base = { tipo: 'compra', fecha: '2025-03-01', cantidad: 100, comision: 1, precio: 50000, moneda: 'EUR' }
  it('acepta HH:MM, la cadena vacía (= sin hora) y la ausencia', () => {
    expect(operacionSchema.parse({ ...base, hora: '09:05' }).hora).toBe('09:05')
    expect(operacionSchema.parse({ ...base, hora: '23:59' }).hora).toBe('23:59')
    expect(operacionSchema.parse({ ...base, hora: '' }).hora).toBeUndefined()
    expect(operacionSchema.parse(base).hora).toBeUndefined()
  })
  it('rechaza horas imposibles o mal escritas', () => {
    for (const h of ['24:00', '9:05', '12:60', '12-30', 'mediodía', '12:30:15', ' 12:30']) expect(operacionSchema.safeParse({ ...base, hora: h }).success, h).toBe(false)
  })
  it('la hora no cambia ningún cálculo: el resumen es idéntico con y sin ella', () => {
    const ops = [{ id: '1', tipo: 'compra' as const, fecha: '2025-03-01', cantidad: 100, comision: 1, precio: 50000, moneda: 'EUR' as const }]
    expect(resumen(ops.map((o) => ({ ...o, hora: '10:00' })), 60000)).toEqual(resumen(ops, 60000))
  })
  it('se muestra con la fecha solo si existe', () => {
    expect(fechaConHora('2025-03-01', '09:05')).toBe('01/03/2025 09:05')
    expect(fechaConHora('2025-03-01')).toBe('01/03/2025')
    expect(fechaConHora('2025-03-01', '')).toBe('01/03/2025')
  })
})

describe('histograma de compras: un valor justo en el límite va siempre al intervalo que empieza ahí ([a, b))', () => {
  const compra = (precio: number, id = String(precio)) => ({ id, tipo: 'compra' as const, fecha: '2025-01-01', cantidad: 100, comision: 0, precio, moneda: 'EUR' as const })
  // Casos que con coma flotante caían en el intervalo anterior (números inventados): [mínimo, valor en el límite, máximo, intervalo esperado]
  const casos: [number, number, number, number][] = [
    [46014.48, 46039.99, 46218.56, 1], [6966.99, 7139.19, 7196.59, 6], [52270.9, 52305.85, 52364.1, 3],
    [33007.01, 33087.32, 33221.17, 3], [16513.7, 16520.21, 16521.14, 7], [29035.72, 29049.64, 29063.56, 4],
  ]
  it.each(casos)('mín %d, límite %d, máx %d → intervalo %d', (min, limite, max, esperado) => {
    const h = histogramaCompras([compra(min), compra(limite), compra(max)], 50000, 8)
    expect(h.bins[esperado].compras).toBe(1 + (esperado === 7 ? 1 : 0)) // el límite (y, en el último, también el máximo)
    expect(h.bins.reduce((s, b) => s + b.compras, 0)).toBe(3)
    expect(h.bins[0].compras).toBe(1) // el mínimo, siempre en el primero
    expect(h.bins[7].compras).toBeGreaterThanOrEqual(1) // el máximo, siempre en el último
  })
  it('todos los límites interiores de 8 intervalos: cada uno va al que empieza ahí', () => {
    for (const [minC, m] of [[4601448, 25499], [696699, 28700], [5227090, 11650], [3300701, 26770]]) {
      const ops = [compra(minC / 100)]
      for (let k = 1; k < 8; k++) ops.push(compra((minC + k * m) / 100))
      ops.push(compra((minC + 8 * m) / 100))
      const b = histogramaCompras(ops, 1, 8).bins
      expect(b.map((x) => x.compras), `mín ${minC} paso ${m}`).toEqual([1, 1, 1, 1, 1, 1, 1, 2])
    }
  })
  it('un solo precio (o todos iguales): todo en el primer intervalo; sin compras, vacío', () => {
    expect(histogramaCompras([compra(100), compra(100, 'b')], 1, 8).bins.map((x) => x.compras)).toEqual([2, 0, 0, 0, 0, 0, 0, 0])
    expect(histogramaCompras([], 1, 8).bins).toEqual([])
  })
})
