// Auditoría: las funciones de la app frente a la calculadora de control (scripts/auditoria/control.mjs),
// que es independiente (no importa nada de src/) y usa aritmética decimal exacta.
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import * as fc from 'fast-check'
import Decimal from 'decimal.js'
import * as K from '../../../scripts/auditoria/control.mjs'
import * as A from '../calculos'
import { comisionPorPlataforma } from '../plataformas'
import { evaluarDiarios, evaluarFrecuentes, estadoInicial } from '../../../jobs/avisos/evaluadores.mjs'
import { mercadoDemo, operacionesDemo, planDemo } from '../../state/demoData'
import { dinero, porcentaje } from '../format'
import * as T from '../trading'

// Tolerancias del encargo
const EUR = 0.01 // importes
const BTC = 1e-8
const PP = 0.01 // puntos porcentuales

const n = (d: Decimal.Value) => new Decimal(d).toNumber()
const cerca = (app: number, ctl: Decimal.Value, tol: number, etiqueta: string) => {
  const dif = Math.abs(app - n(ctl))
  if (!(dif <= tol)) throw new Error(`${etiqueta}: app=${app} control=${n(ctl)} dif=${dif} (tol ${tol})`)
}
const pp = (appFrac: number, ctlFrac: Decimal.Value, etiqueta: string) => cerca(appFrac * 100, new Decimal(ctlFrac).mul(100), PP, etiqueta)

type Op = A.Operacion
const op = (id: string, tipo: 'compra' | 'venta', fecha: string, cantidad: number, comision: number, precio: number, moneda: A.Moneda = 'EUR', plataforma?: string): Op => ({ id, tipo, fecha, cantidad, comision, precio, moneda, plataforma })

/** Compara todo lo que la app calcula sobre una cartera con la calculadora de control. Devuelve el nº de comprobaciones. */
function compararCartera(ops: Op[], P: number, etiqueta = ''): number {
  let c = 0
  const ok = (app: number, ctl: Decimal.Value, tol: number, e: string) => { cerca(app, ctl, tol, `${etiqueta} ${e}`); c++ }
  const r = A.resumen(ops, P)
  const t = K.totales(ops, P)
  ok(r.btc, t.btc, BTC, 'btc'); ok(r.invertido, t.invertido, EUR, 'invertido'); ok(r.valorHoy, t.valor, EUR, 'valor'); ok(r.ganancia, t.ganancia, EUR, 'ganancia')
  pp(r.rentabilidad, t.rent, `${etiqueta} rentabilidad`); c++
  ok(r.comisiones, t.comisiones, EUR, 'comisiones'); pp(r.pctComisiones, t.pctCom, `${etiqueta} % comisiones`); c++
  ok(r.precioMedioReal, t.medioReal, EUR, 'precio medio real'); ok(r.precioMedioSinComisiones, t.medioSin, EUR, 'precio medio sin comisiones')
  pp(r.subidaParaRentable, t.subida, `${etiqueta} subida`); c++
  ok(r.gananciaRealizada, t.gananciaRealizada, EUR, 'ganancia realizada')
  // Cada compra
  ops.filter((o) => o.tipo === 'compra').forEach((o, i) => {
    const f = A.filaCompra(o, P)
    const k = K.filaCompra(o, P)
    ok(f.btc, k.btc, BTC, `compra ${i} btc`); ok(f.valorHoy, k.valor, EUR, `compra ${i} valor`); ok(f.ganancia, k.ganancia, EUR, `compra ${i} ganancia`)
    pp(f.rentabilidad, k.rent, `${etiqueta} compra ${i} rentabilidad`); pp(f.pctComision, k.pctCom, `${etiqueta} compra ${i} % comisión`); c += 2
  })
  // FIFO: ventas y lo que queda
  const fa = A.calcularFifo(ops)
  const fk = K.fifo(ops)
  expect(fa.ventas.length).toBe(fk.ventas.length); c++
  fa.ventas.forEach((v, i) => {
    ok(v.btcVendidos, fk.ventas[i].btc, BTC, `venta ${i} btc`); ok(v.ingreso, fk.ventas[i].ingreso, EUR, `venta ${i} ingreso`)
    ok(v.coste, fk.ventas[i].coste, EUR, `venta ${i} coste`); ok(v.ganancia, fk.ventas[i].ganancia, EUR, `venta ${i} ganancia`)
  })
  ok(fa.lotes.reduce((s, l) => s + l.btc, 0), fk.lotes.reduce((s: Decimal, l: { btc: Decimal }) => s.plus(l.btc), new Decimal(0)), BTC, 'btc que queda')
  ok(fa.lotes.reduce((s, l) => s + l.coste, 0), fk.lotes.reduce((s: Decimal, l: { coste: Decimal }) => s.plus(l.coste), new Decimal(0)), EUR, 'coste que queda')
  return c
}

describe('casos fijos', () => {
  it('modo demo', () => {
    const ops = operacionesDemo()
    const m = mercadoDemo()
    expect(compararCartera(ops, m.precios.EUR, 'demo')).toBeGreaterThan(50)
    const plan = planDemo()
    A.estadoNiveles(plan, ops).forEach((x, i) => { expect(x.estado).toBe(K.estadoNiveles(plan, ops)[i].estado); cerca(x.importe, K.estadoNiveles(plan, ops)[i].importe, EUR, 'importe nivel demo') })
  })

  it('ventas FIFO parciales y totales', () => {
    const ops = [
      op('1', 'compra', '2025-01-10', 1000, 10, 50000), op('2', 'compra', '2025-02-10', 500, 5, 40000), op('3', 'compra', '2025-03-10', 800, 20, 80000),
      op('4', 'venta', '2025-04-01', 1790, 10, 60000), // parcial: 0,03 BTC
      op('5', 'compra', '2025-04-15', 300, 3, 45000),
      op('6', 'venta', '2025-05-01', 400, 4, 70000), // parcial
    ]
    expect(compararCartera(ops, 65000, 'fifo parcial')).toBeGreaterThan(40)
    // Venta total: se vende todo lo que queda (cantidad calculada con decimales exactos)
    const t = K.totales(ops, 1)
    const todo = t.btc
    const bruto = todo.mul(72000)
    const total = [...ops, op('7', 'venta', '2025-06-01', n(bruto.mul('0.99')), n(bruto.mul('0.01')), 72000)]
    expect(compararCartera(total, 70000, 'fifo total')).toBeGreaterThan(40)
    expect(A.resumen(total, 70000).btc).toBeCloseTo(0, 8)
    expect(Number.isFinite(A.resumen(total, 70000).precioMedioReal)).toBe(true)
  })

  it('las 3 monedas: conversión y totales en cada moneda', () => {
    const precios: A.PreciosBtc = { EUR: 50000, USD: 54321.5, AUD: 81234.25 }
    const ops = [op('1', 'compra', '2025-01-10', 1000, 10, 50000, 'EUR'), op('2', 'compra', '2025-01-12', 1100, 12, 54000, 'USD'), op('3', 'compra', '2025-02-01', 1700, 20, 80000, 'AUD'), op('4', 'venta', '2025-03-01', 600, 6, 52000, 'EUR')]
    for (const m of ['EUR', 'USD', 'AUD'] as A.Moneda[]) {
      const a = A.normalizar(ops, m, precios)
      const k = K.normalizar(ops, m, precios)
      a.forEach((o, i) => { cerca(o.cantidad, k[i].cantidad, EUR, `${m} cantidad ${i}`); cerca(o.comision, k[i].comision, EUR, `${m} comisión ${i}`); cerca(o.precio, k[i].precio, EUR, `${m} precio ${i}`) })
      compararCartera(a, precios[m], `moneda ${m}`)
      // El BTC no depende de la moneda en que se exprese
      cerca(A.resumen(a, precios[m]).btc, K.totales(ops.map((o) => ({ ...o })), 1).btc.isNaN() ? 0 : A.resumen(A.normalizar(ops, 'EUR', precios), precios.EUR).btc, BTC, `BTC en ${m}`)
    }
    for (const [de, a] of [['EUR', 'USD'], ['USD', 'AUD'], ['AUD', 'EUR'], ['EUR', 'EUR']] as [A.Moneda, A.Moneda][]) cerca(A.convertir(1234.56, de, a, precios), K.convertir(1234.56, de, a, precios), 1e-9, `convertir ${de}→${a}`)
  })

  it('compra con comisión muy alta', () => {
    const ops = [op('1', 'compra', '2025-01-10', 10, 4.5, 50000), op('2', 'compra', '2025-01-11', 1000, 10, 50000)]
    expect(compararCartera(ops, 40000, 'comisión alta')).toBeGreaterThan(20)
    expect(A.comprasConComisionAlta(ops, 40000).map((f) => f.id)).toEqual(['1'])
  })

  it('una sola compra', () => {
    expect(compararCartera([op('1', 'compra', '2025-01-10', 200, 2, 50000)], 60000, 'una compra')).toBeGreaterThan(15)
  })

  it('cartera vacía: sin NaN ni divisiones por cero', () => {
    const r = A.resumen([], 50000)
    for (const [k, v] of Object.entries(r)) expect(Number.isFinite(v), `${k} debe ser finito`).toBe(true)
    expect(compararCartera([], 50000, 'vacía')).toBeGreaterThan(8)
    expect(A.mejorYPeorCompra([], 50000)).toEqual({ mejor: null, peor: null })
    expect(A.comparativaPrimerDia([], 50000)).toBeNull()
    expect(A.histogramaCompras([], 50000).bins).toEqual([])
    expect(A.drawdown([])).toEqual([])
    expect(A.estimarIrpf(0)).toBe(0)
    const b = A.bajarMedia([], 40000, 50000)
    expect(b).toEqual({ posible: false, motivo: 'sin_btc' })
  })

  it('no se puede vender más BTC del que hay', () => {
    const ops = [op('1', 'compra', '2025-01-10', 1000, 10, 50000), op('2', 'venta', '2025-02-10', 2000, 0, 50000)]
    expect(() => A.calcularFifo(ops)).toThrow()
    expect(() => K.fifo(ops)).toThrow()
    expect(() => A.siVendoHoy([ops[0]], 60000, 1)).toThrow()
  })
})

// ───────────── Aleatorios ─────────────
interface Receta { venta: boolean; dias: number; precioC: number; cantidadC: number; comBp: number; frac: number; moneda: number; plat: number }
const receta = fc.record({
  venta: fc.boolean(), dias: fc.integer({ min: 0, max: 6 }), precioC: fc.integer({ min: 100_000, max: 20_000_000 }), cantidadC: fc.integer({ min: 1_000, max: 5_000_000 }),
  comBp: fc.integer({ min: 0, max: 3000 }), frac: fc.integer({ min: 1, max: 95 }), moneda: fc.integer({ min: 0, max: 0 }), plat: fc.integer({ min: 0, max: 3 }),
})
const PLATS = ['Revolut', 'Binance', 'Kraken', undefined]

/** Construye una cartera válida: las ventas nunca superan lo que hay. */
function construir(rs: Receta[]): Op[] {
  const ops: Op[] = []
  let dia = 0
  for (const [i, r] of rs.entries()) {
    dia += r.dias
    const fecha = new Date(Date.UTC(2025, 0, 1) + dia * 86400000).toISOString().slice(0, 10)
    const precio = r.precioC / 100
    if (r.venta && ops.length) {
      const disp = K.totales(ops, 1).btc
      if (disp.gt('1e-6')) {
        const btc = disp.mul(r.frac).div(100)
        const bruto = btc.mul(precio)
        const com = bruto.mul(r.comBp).div(10000).toDecimalPlaces(2)
        const cant = bruto.minus(com).toDecimalPlaces(2)
        const cand = op(`v${i}`, 'venta', fecha, n(cant), n(com), precio)
        if (cant.gt(0) && K.btcVenta(cand).lte(disp)) { ops.push(cand); continue }
      }
    }
    const cant = r.cantidadC / 100
    const com = Math.round(cant * (r.comBp / 10000) * 100) / 100
    ops.push(op(`c${i}`, 'compra', fecha, cant, Math.min(com, cant - 0.01), precio, 'EUR', PLATS[r.plat]))
  }
  return ops
}
const carteraArb = fc.array(receta, { minLength: 1, maxLength: 50 }).map(construir)
const precioArb = fc.integer({ min: 100_000, max: 20_000_000 }).map((c) => c / 100)

describe('500 carteras aleatorias frente a la calculadora de control', () => {
  it('resumen, compras, FIFO, ventas y lo que queda coinciden', () => {
    let comprobaciones = 0
    fc.assert(fc.property(carteraArb, precioArb, (ops, P) => { comprobaciones += compararCartera(ops, P, 'aleatoria'); return true }), { numRuns: 500 })
    expect(comprobaciones).toBeGreaterThan(500 * 10)
    if (process.env.AUDIT_OUT) writeFileSync(process.env.AUDIT_OUT, JSON.stringify({ carterasAleatorias: 500, comprobacionesAleatorias: comprobaciones }))
  })

  it('invariantes: ganancia = valor − metido; Σ valores = valor total; medio × BTC = metido', () => {
    fc.assert(fc.property(carteraArb, precioArb, (ops, P) => {
      const r = A.resumen(ops, P)
      cerca(r.ganancia, r.valorHoy - r.invertido, 1e-6, 'ganancia = valor − metido')
      if (!ops.some((o) => o.tipo === 'venta')) {
        const suma = ops.reduce((s, o) => s + A.filaCompra(o, P).valorHoy, 0)
        cerca(suma, r.valorHoy, EUR, 'Σ valores de compra = valor total')
        cerca(ops.reduce((s, o) => s + A.filaCompra(o, P).ganancia, 0), r.ganancia, EUR, 'Σ ganancias = ganancia total')
      }
      cerca(r.precioMedioReal * r.btc, r.invertido, EUR, 'medio × BTC = metido')
      cerca(r.precioMedioSinComisiones * r.btc, K.totales(ops, P).medioSin.mul(r.btc), EUR, 'medio sin comisiones × BTC')
      return Number.isFinite(r.rentabilidad) && r.btc >= -1e-12
    }), { numRuns: 500 })
  })

  it('invariante: nunca se vende más BTC del que hay', () => {
    fc.assert(fc.property(carteraArb, fc.integer({ min: 1, max: 100 }), (ops, extraC) => {
      const disp = K.totales(ops, 1).btc
      const demasiado = op('x', 'venta', '2030-01-01', n(disp.plus(extraC / 1000).mul(50000)), 0, 50000)
      expect(() => A.calcularFifo([...ops, demasiado])).toThrow()
      expect(() => A.siVendoHoy(ops, 50000, n(disp) + 0.01)).toThrow()
      return true
    }), { numRuns: 200 })
  })

  it('invariante: EUR→USD→EUR devuelve el mismo importe', () => {
    const precios = fc.record({ EUR: precioArb, USD: precioArb, AUD: precioArb })
    fc.assert(fc.property(fc.integer({ min: 1, max: 100_000_000 }).map((c) => c / 100), precios, fc.constantFrom('EUR', 'USD', 'AUD'), fc.constantFrom('EUR', 'USD', 'AUD'), (x, p, m1, m2) => {
      cerca(A.convertir(A.convertir(x, m1 as A.Moneda, m2 as A.Moneda, p), m2 as A.Moneda, m1 as A.Moneda, p), x, EUR, 'ida y vuelta')
      cerca(A.convertir(x, m1 as A.Moneda, m2 as A.Moneda, p), K.convertir(x, m1, m2, p), 1e-6, 'convertir')
      return true
    }), { numRuns: 500 })
  })
})

describe('calculadoras', () => {
  it('bajar mi media, ¿y si BTC llega a X? y si vendo hoy (con IRPF) — aleatorio', () => {
    fc.assert(fc.property(carteraArb, precioArb, fc.integer({ min: 30, max: 130 }), fc.integer({ min: 0, max: 500 }), fc.integer({ min: 1, max: 100 }), precioArb, (ops, P, objPct, comBp, fracVenta, X) => {
      const t = K.totales(ops, P)
      if (t.btc.lte('1e-9')) return true
      const obj = n(t.medioReal.mul(objPct).div(100).toDecimalPlaces(2))
      const c = comBp / 10000
      const a = A.bajarMedia(ops, obj, P, c)
      const k = K.bajarMedia(ops, obj, P, c)
      expect(a.posible).toBe(k.posible)
      if (a.posible && k.posible) {
        cerca(a.importe, k.importe, EUR, 'bajar media: importe'); cerca(a.btcNuevos, k.btcNuevos, BTC, 'bajar media: BTC'); cerca(a.nuevaMedia, k.nuevaMedia, EUR, 'bajar media: nueva media')
        cerca(a.nuevaMedia, obj, EUR, 'la media nueva es la que se pidió')
      } else if (!a.posible && !k.posible) expect(a.motivo).toBe(k.motivo)
      const e = A.escenarioPrecio(ops, X); const ke = K.escenario(ops, X)
      cerca(e.valor, ke.valor, EUR, 'escenario: valor'); cerca(e.ganancia, ke.ganancia, EUR, 'escenario: ganancia'); pp(e.rentabilidad, ke.rent, 'escenario: rentabilidad')
      const btcVender = n(t.btc.mul(fracVenta).div(100))
      const s = A.siVendoHoy(ops, P, btcVender, c); const ks = K.siVendoHoy(ops, P, btcVender, c)
      cerca(s.ingreso, ks.ingreso, EUR, 'vender hoy: ingreso'); cerca(s.coste, ks.coste, EUR, 'vender hoy: coste'); cerca(s.ganancia, ks.ganancia, EUR, 'vender hoy: ganancia'); cerca(s.irpfEstimado, ks.irpf, EUR, 'vender hoy: IRPF')
      const todo = A.siVendoHoy(ops, P); const kt = K.siVendoHoy(ops, P)
      cerca(todo.ganancia, kt.ganancia, EUR, 'vender todo: ganancia'); cerca(todo.irpfEstimado, kt.irpf, EUR, 'vender todo: IRPF')
      return true
    }), { numRuns: 300 })
  })

  it('IRPF por tramos: límites exactos y aleatorios', () => {
    for (const g of [-500, 0, 0.01, 5999.99, 6000, 6000.01, 49999.99, 50000, 50000.01, 199999, 200000, 200000.01, 299999.99, 300000, 300000.01, 1_000_000]) cerca(A.estimarIrpf(g), K.irpf(g), 1e-6, `IRPF ${g}`)
    fc.assert(fc.property(fc.integer({ min: 0, max: 100_000_000 }).map((c) => c / 100), (g) => { cerca(A.estimarIrpf(g), K.irpf(g), 1e-6, 'IRPF'); return true }), { numRuns: 500 })
    expect(n(K.irpf(7000))).toBeCloseTo(6000 * 0.19 + 1000 * 0.21, 8)
  })
})

describe('plan', () => {
  const planArb = fc.record({
    capital: fc.integer({ min: 100, max: 1_000_000 }),
    niveles: fc.array(fc.record({ precio: fc.integer({ min: 1000, max: 150000 }), pct: fc.integer({ min: 0, max: 40 }) }), { minLength: 0, maxLength: 8 }),
    dcaPct: fc.integer({ min: 0, max: 5 }), semanas: fc.integer({ min: 0, max: 60 }), inicioDias: fc.option(fc.integer({ min: -30, max: 400 }), { nil: undefined }), hoyDias: fc.integer({ min: 0, max: 400 }),
  })
  const plan = (p: { capital: number; niveles: { precio: number; pct: number }[]; dcaPct: number; semanas: number; inicioDias?: number }): A.Plan => ({
    capital: p.capital, nivelesClave: p.niveles.map((x) => ({ precio: x.precio, porcentajeCapital: x.pct })),
    dca: { ...(p.inicioDias == null ? {} : { inicio: new Date(Date.UTC(2025, 5, 1) + p.inicioDias * 86400000).toISOString().slice(0, 10) }), porcentajeSemanal: p.dcaPct, semanas: p.semanas },
  })

  it('estado de cada nivel (±0,5 %), importes, total planificado y progreso del DCA', () => {
    fc.assert(fc.property(planArb, carteraArb, precioArb, (p, ops, P) => {
      const pl = plan(p)
      const a = A.estadoNiveles(pl, ops); const k = K.estadoNiveles(pl, ops)
      a.forEach((x, i) => { expect(x.estado).toBe(k[i].estado); cerca(x.importe, k[i].importe, EUR, 'importe del nivel') })
      cerca(A.totalPlanificadoPct(pl), K.totalPlanificado(pl), 1e-9, 'total planificado')
      const hoy = new Date(Date.UTC(2025, 5, 1) + p.hoyDias * 86400000).toISOString().slice(0, 10)
      const pa = A.progresoDca(pl, hoy); const pk = K.progresoDca(pl, hoy)
      expect(pa.semanaActual).toBe(pk.semana); cerca(pa.importeSemanal, pk.semanal, EUR, 'DCA semanal'); cerca(pa.metidoSegunPlan, pk.metido, EUR, 'DCA metido'); cerca(pa.quedaPorMeter, pk.queda, EUR, 'DCA queda')
      const na = A.proximoNivel(pl, ops, P); const nk = K.proximoNivel(pl, ops, P)
      expect(na?.precio ?? null).toBe(nk ? n(nk.precio) : null)
      if (na && nk) cerca(na.bajadaNecesaria, nk.bajada, 1e-9, 'bajada al próximo nivel')
      return true
    }), { numRuns: 500 })
  })

  it('tolerancia exacta del ±0,5 % y niveles con compras en otras monedas', () => {
    const pl: A.Plan = { capital: 1000, nivelesClave: [{ precio: 40000, porcentajeCapital: 10 }, { precio: 30000, porcentajeCapital: 10 }], dca: { porcentajeSemanal: 1, semanas: 10 } }
    expect(A.estadoNiveles(pl, [op('a', 'compra', '2025-01-01', 100, 1, 40200)])[0].estado).toBe('Comprado') // +0,5 % justo
    expect(A.estadoNiveles(pl, [op('a', 'compra', '2025-01-01', 100, 1, 40201)])[0].estado).toBe('Pendiente')
    // Una compra hecha en USD a 43.200 $ equivale a 40.000 € cuando 1 BTC = 50.000 € = 54.000 $: el nivel de 40.000 € está comprado.
    const precios: A.PreciosBtc = { EUR: 50000, USD: 54000, AUD: 80000 }
    const usd = [op('u', 'compra', '2025-01-01', 100, 1, 43200, 'USD')]
    expect(K.estadoNiveles(pl, usd, precios)[0].estado).toBe('Comprado')
    expect(A.estadoNiveles(pl, usd, precios)[0].estado).toBe('Comprado')
  })
})

describe('estadísticas', () => {
  const historico = (precios: number[]) => precios.map((p, i) => ({ t: Date.UTC(2025, 0, 1) + i * 86400000, precio: p }))
  it('drawdown, hitos, histograma, invertido por mes, calendario de DCA, sats, comisión por plataforma, primer día y mejor/peor', () => {
    fc.assert(fc.property(carteraArb, fc.array(precioArb, { minLength: 30, maxLength: 80 }), precioArb, (ops, precios, P) => {
      const h = historico(precios)
      const sa = A.serieCartera(ops, h); const sk = K.serieCartera(ops, h)
      expect(sa.length).toBe(sk.length)
      sa.forEach((p, i) => { cerca(p.valor, sk[i].valor, EUR, 'serie: valor'); cerca(p.invertido, sk[i].invertido, EUR, 'serie: invertido') })
      A.drawdown(sa).forEach((d, i) => pp(d.caida, K.drawdown(sk)[i].caida, 'drawdown'))
      const ha = A.hitosCartera(sa); const hk = K.hitos(sk)
      if (ha && hk) { cerca(ha.maximo.valor, hk.maximo.valor, EUR, 'hitos: máximo'); cerca(ha.mejor.cambio, hk.mejor.cambio, EUR, 'hitos: mejor día'); cerca(ha.peor.cambio, hk.peor.cambio, EUR, 'hitos: peor día') }
      const ga = A.histogramaCompras(ops, P, 8); const gk = K.histograma(ops, P, 8)
      expect(ga.bins.map((b) => b.compras)).toEqual(gk.bins.map((b: { compras: number }) => b.compras))
      ga.bins.forEach((b, i) => cerca(b.importe, gk.bins[i].importe, EUR, 'histograma: importe'))
      pp(ga.pctEnGanancias, gk.pctGanancias, 'histograma: % en ganancias')
      const ma = A.invertidoPorMes(ops); const mk = K.invertidoPorMes(ops)
      expect(ma.map((x) => x.mes)).toEqual(mk.map((x: { mes: string }) => x.mes)); ma.forEach((x, i) => cerca(x.importe, mk[i].importe, EUR, 'invertido por mes'))
      const ca = A.calendarioDca(ops, '2025-04-01', 26); const ck = K.calendarioDca(ops, '2025-04-01', 26)
      expect(ca.map((s) => [s.semana, s.compras])).toEqual(ck.map((s: { semana: string; compras: number }) => [s.semana, s.compras])); ca.forEach((s, i) => cerca(s.importe, ck[i].importe, EUR, 'calendario: importe'))
      const btc = A.resumen(ops, P).btc
      expect(A.aSats(btc)).toBe(n(K.sats(btc)))
      const pa = comisionPorPlataforma(ops); const pk = K.comisionPorPlataforma(ops)
      expect(pa.map((x) => x.plataforma)).toEqual(pk.map((x: { plataforma: string }) => x.plataforma))
      pa.forEach((x, i) => { cerca(x.comision, pk[i].comision, EUR, 'plataforma: comisión'); pp(x.pct, pk[i].pct, 'plataforma: %') })
      const fa = A.comparativaPrimerDia(ops, P); const fk = K.primerDia(ops, P)
      if (fa && fk) { cerca(fa.valorPrimerDia, fk.valor, EUR, 'primer día: valor'); cerca(fa.gananciaPrimerDia, fk.ganancia, EUR, 'primer día: ganancia'); cerca(fa.valorReal, fk.valorReal, EUR, 'primer día: valor real') }
      const mp = A.mejorYPeorCompra(ops, P); const kp = K.mejorPeor(ops, P)
      if (mp.mejor && kp.mejor) { pp(mp.mejor.rentabilidad, kp.mejor.rent, 'mejor compra'); pp(mp.peor!.rentabilidad, kp.peor!.rent, 'peor compra') }
      return true
    }), { numRuns: 200 })
  })
})

describe('avisos', () => {
  const P = (eur: number) => ({ EUR: eur, USD: eur * 1.1, AUD: eur * 1.65 })
  const AHORA = Date.parse('2025-06-02T10:00:00Z')
  const usuario = (ajustes: Record<string, unknown>, resumen: Record<string, unknown>) => ({ config: { ajustes: { rentable: { activo: false }, nivelClave: { activo: false }, ...ajustes }, general: { zona: 'Europe/Madrid' }, resumen }, uid: 'u' })
  // Precios con céntimos "raros" para no caer justo en un umbral (donde la coma flotante podría diferir de la aritmética exacta).
  const camino = fc.array(fc.integer({ min: 2_000_000, max: 8_000_000 }).map((c) => c / 100 + 0.0037), { minLength: 5, maxLength: 40 })

  it('cruce del precio medio con margen del ±0,5 %', () => {
    fc.assert(fc.property(camino, fc.integer({ min: 3_000_000, max: 7_000_000 }).map((c) => c / 100 + 0.0113), (precios, media) => {
      const est = estadoInicial()
      const u = usuario({ rentable: { activo: true } }, { precioMedio: media, btc: 0.1, invertido: media * 0.1 })
      const ev: string[] = []
      precios.forEach((p, i) => {
        const a = evaluarFrecuentes({ ahora: AHORA, precios: P(p), prev: i ? P(precios[i - 1]) : null, cambio1h: 0, cambio24h: 0, cambio7d: 0, estad: null }, u, est)
        a.forEach((x: { clave: string }) => ev.push(x.clave.split(':')[1]))
      })
      expect(ev).toEqual(K.eventosRentable(precios, media))
      return true
    }), { numRuns: 300 })
  })

  it('hitos de rentabilidad: una vez cada uno, hasta que se vuelve a cruzar', () => {
    fc.assert(fc.property(camino, (precios) => {
      const btc = 0.1, invertido = 5000.37
      const est = estadoInicial()
      const u = usuario({ hitos: { activo: true } }, { precioMedio: invertido / btc, btc, invertido })
      const ev: number[] = []
      precios.forEach((p, i) => {
        evaluarFrecuentes({ ahora: AHORA, precios: P(p), prev: i ? P(precios[i - 1]) : null, cambio1h: 0, cambio24h: 0, cambio7d: 0, estad: null }, u, est)
          .forEach((x: { clave: string }) => ev.push(Number(x.clave.split(':')[1])))
      })
      expect(ev).toEqual(K.eventosHitos(precios, btc, invertido))
      return true
    }), { numRuns: 300 })
  })

  it('acercamiento a un nivel clave y toque', () => {
    fc.assert(fc.property(camino, fc.integer({ min: 3_000_000, max: 7_000_000 }).map((c) => c / 100 + 0.0213), fc.integer({ min: 1, max: 10 }), (precios, nivel, pct) => {
      const u = usuario({ nivelClave: { activo: true, umbral: pct } }, { precioMedio: 1, btc: 0, invertido: 0, nivelesPendientes: [nivel] })
      precios.forEach((p, i) => {
        const prev = i ? precios[i - 1] : null
        const a = evaluarFrecuentes({ ahora: AHORA, precios: P(p), prev: prev == null ? null : P(prev), cambio1h: 0, cambio24h: 0, cambio7d: 0, estad: null }, u, estadoInicial())
        const esperado = K.eventoNivel(prev, p, nivel, pct)
        expect(a.map((x: { clave: string }) => x.clave.split(':')[1] ?? '')).toEqual(esperado ? [esperado] : [])
      })
      return true
    }), { numRuns: 300 })
  })

  it('cambio de zona de miedo y codicia y subida brusca del miedo', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 4, maxLength: 40 }), fc.integer({ min: 5, max: 40 }), (valores, umbral) => {
      const est = estadoInicial()
      const u = usuario({ zonaIndice: { activo: true, direccion: 'ambos' }, subidaMiedo: { activo: true, umbral, ventana: 7 } }, {})
      let zonaPrev: number | null = null
      valores.forEach((v, i) => {
        const hace7 = i >= 7 ? valores[i - 7] : null
        const a = evaluarDiarios({ ahora: AHORA, precios: P(50000), fng: { valor: v, clasificacion: 'x', hace1d: v, hace7d: hace7 } }, u, est)
        const textos = a.filter((x: { clave: string }) => x.clave.startsWith('zona')).map((x: { texto: string }) => x.texto)
        const z = K.zonaMiedo(v)
        const esperadoZona = zonaPrev != null && zonaPrev !== z ? [`El mercado pasa de ${K.nombreZona[zonaPrev]} a ${K.nombreZona[z]} (${v}).`] : []
        expect(textos).toEqual(esperadoZona)
        zonaPrev = z
        expect(a.some((x: { clave: string }) => x.clave.startsWith('subidaMiedo'))).toBe(hace7 != null && K.caidaPuntos(hace7, v, umbral))
      })
      return true
    }), { numRuns: 300 })
  })
})

describe('formato mostrado en pantalla', () => {
  it('es-ES: 1.234,56 € y porcentajes con coma', () => {
    expect(dinero(1234.56)).toBe('1234,56 €') // es-ES no agrupa los millares de 4 cifras
    expect(dinero(12345.6)).toBe('12.345,60 €')
    expect(porcentaje(0.1234)).toBe('12,34 %')
  })
})

// ───────────── Trading ─────────────
describe('trading frente a la calculadora de control', () => {
  const PR = { EUR: 91234.5, USD: 99876.25, AUD: 151000.75 }
  const base = (o: Partial<T.Trade>): T.Trade => ({ id: 'x', estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-01-01', fechaCierre: '2025-01-02', precioEntrada: 100, precioSalida: 110, moneda: 'USD', apalancamiento: 1, ...o })

  function comparar(trades: T.Trade[], vista: A.Moneda, etiqueta: string): number {
    let c = 0
    const ok = (app: number, ctl: Decimal.Value, tol: number, e: string) => { cerca(app, ctl, tol, `${etiqueta} ${e}`); c++ }
    const a = T.totalesTrading(trades, PR, vista)
    const k = K.totalesTradingCtl(trades, PR, vista)
    ok(a.ganado, k.ganado, BTC, 'ganado'); ok(a.perdido, k.perdido, BTC, 'perdido'); ok(a.neto, k.neto, BTC, 'neto')
    ok(a.netoValor, k.netoValor, EUR, 'neto × precio'); ok(a.abiertos, k.abiertos, BTC, 'abiertos')
    pp(a.pctTotal, k.pctTotal, `${etiqueta} % total`); pp(a.gananciaMedia, k.gananciaMedia, `${etiqueta} media`); pp(a.pctGanadores, k.pctGanadores, `${etiqueta} ganadores`); c += 2
    ok(a.duracionMediaDias, k.duracionMedia, 1e-9, 'duración'); ok(a.racha, k.racha, 0, 'racha')
    if (k.mejor) { pp(a.mejor!.calculo.pct, k.mejor, `${etiqueta} mejor`); pp(a.peor!.calculo.pct, k.peor, `${etiqueta} peor`); c += 2 }
    const filas = T.filasTrades(trades, PR, vista).filter((f) => !f.calculo.abierto)
    expect(filas.length).toBe(k.filas.length)
    filas.forEach((f, i) => {
      const kf = k.filas[i]
      pp(f.calculo.pct, kf.pct, `${etiqueta} fila ${i} %`); pp(f.calculo.movimiento, kf.mov, `${etiqueta} fila ${i} mov`); c += 2
      ok(f.btc, kf.btcN, BTC, `fila ${i} btc`); ok(f.acumulado!, kf.acumulado, BTC, `fila ${i} acumulado`)
      if (kf.valeHoy) { ok(f.valeHoy!, kf.valeHoy, EUR, `fila ${i} vale hoy`); ok(f.valiaAlCerrar!, kf.valia, EUR, `fila ${i} valía al cerrar`) }
    })
    return c
  }

  it('casos fijos', () => {
    // largo x5 con comisiones: +3,15 % × 5 − 0,4 % = 15,35 %
    const a = base({ precioEntrada: 80000, precioSalida: 82520, apalancamiento: 5, comisiones: 0.4, margenBTC: 0.05 })
    expect(T.calcularTrade(a, 0).pct).toBeCloseTo(0.1535, 10)
    expect(T.calcularTrade(a, 0).btc).toBeCloseTo(0.007675, 10)
    // corto que gana, corto que pierde, manual, sin margen, cierre el mismo día
    const lote = [
      a, base({ id: 'b', direccion: 'corto', precioEntrada: 100, precioSalida: 90, margenBTC: 0.2, apalancamiento: 3 }),
      base({ id: 'c', direccion: 'corto', precioEntrada: 100, precioSalida: 120, margenBTC: 0.1, apalancamiento: 2, comisiones: 0.1 }),
      base({ id: 'd', btcGanadoManual: -0.0031, margenBTC: 0.5 }), base({ id: 'e', margenBTC: undefined }),
      base({ id: 'f', estado: 'abierto', fechaCierre: undefined, precioSalida: undefined, moneda: 'EUR', precioEntrada: 90000, margenBTC: 0.1, apalancamiento: 10 }),
    ]
    for (const vista of ['EUR', 'USD', 'AUD'] as const) expect(comparar(lote, vista, `fijo ${vista}`)).toBeGreaterThan(20)
  })

  it('300 conjuntos de trades aleatorios', () => {
    const trade = fc.record({
      estado: fc.constantFrom('abierto', 'cerrado', 'cerrado', 'cerrado'),
      direccion: fc.constantFrom('largo', 'corto'),
      ini: fc.integer({ min: 0, max: 300 }), dur: fc.integer({ min: 0, max: 40 }),
      entrada: fc.integer({ min: 100_000, max: 15_000_000 }).map((c) => c / 100), salida: fc.integer({ min: 100_000, max: 15_000_000 }).map((c) => c / 100),
      moneda: fc.constantFrom('EUR', 'USD', 'AUD'), lev: fc.constantFrom(1, 2, 3, 5, 10, 25, 125),
      margen: fc.option(fc.integer({ min: 1, max: 500_000 }).map((n) => n / 1e6), { nil: undefined }),
      com: fc.option(fc.integer({ min: 0, max: 300 }).map((n) => n / 100), { nil: undefined }),
      manual: fc.option(fc.integer({ min: -50_000, max: 50_000 }).map((n) => n / 1e6), { nil: undefined }),
    })
    const dia = (n: number) => new Date(Date.UTC(2024, 0, 1 + n)).toISOString().slice(0, 10)
    fc.assert(fc.property(fc.array(trade, { maxLength: 25 }), fc.constantFrom('EUR', 'USD', 'AUD'), (xs, vista) => {
      const trades: T.Trade[] = xs.map((x, i) => ({
        id: `t${i}`, estado: x.estado as T.EstadoTrade, direccion: x.direccion as T.Direccion, fechaInicio: dia(x.ini),
        ...(x.estado === 'cerrado' ? { fechaCierre: dia(x.ini + x.dur), precioSalida: x.salida } : {}),
        precioEntrada: x.entrada, moneda: x.moneda as A.Moneda, apalancamiento: x.lev,
        ...(x.margen != null ? { margenBTC: x.margen } : {}), ...(x.com != null ? { comisiones: x.com } : {}), ...(x.manual != null ? { btcGanadoManual: x.manual } : {}),
      }))
      comparar(trades, vista as A.Moneda, 'aleatorio')
      return true
    }), { numRuns: 300 })
  })

  it('invariantes', () => {
    const trade = fc.record({
      dir: fc.constantFrom('largo', 'corto'), entrada: fc.integer({ min: 1000, max: 200_000 }), salida: fc.integer({ min: 1000, max: 200_000 }),
      lev: fc.integer({ min: 1, max: 125 }), margen: fc.integer({ min: 1, max: 1_000_000 }).map((n) => n / 1e6), com: fc.integer({ min: 0, max: 200 }).map((n) => n / 100),
    })
    fc.assert(fc.property(fc.array(trade, { minLength: 1, maxLength: 20 }), (xs) => {
      const trades = xs.map((x, i): T.Trade => ({ id: `t${i}`, estado: 'cerrado', direccion: x.dir as T.Direccion, fechaInicio: '2025-01-01', fechaCierre: `2025-02-${String((i % 28) + 1).padStart(2, '0')}`, precioEntrada: x.entrada, precioSalida: x.salida, moneda: 'USD', apalancamiento: x.lev, margenBTC: x.margen, comisiones: x.com }))
      const tot = T.totalesTrading(trades, PR, 'USD')
      // Neto = Ganado − Perdido = suma de todos los BTC; Perdido ≥ 0
      const suma = T.filasTrades(trades, PR, 'USD').reduce((s, f) => s + f.btc, 0)
      expect(tot.neto).toBeCloseTo(suma, 9); expect(tot.perdido).toBeGreaterThanOrEqual(0); expect(tot.ganado).toBeGreaterThanOrEqual(0)
      expect(tot.curva.at(-1)!.acumulado).toBeCloseTo(tot.neto, 9)
      expect(tot.pctGanadores).toBeGreaterThanOrEqual(0); expect(tot.pctGanadores).toBeLessThanOrEqual(1)
      // largo y corto son opuestos (sin comisiones)
      const x = xs[0]
      const l = T.calcularTrade({ ...trades[0], direccion: 'largo', comisiones: 0 }, 1).pct, s = T.calcularTrade({ ...trades[0], direccion: 'corto', comisiones: 0 }, 1).pct
      expect(l).toBeCloseTo(-s, 12)
      // con x1 y misma entrada/salida el resultado es 0 sin comisiones
      expect(T.calcularTrade({ ...trades[0], precioSalida: x.entrada, apalancamiento: 1, comisiones: 0 }, 1).pct).toBeCloseTo(0, 12)
      // a más apalancamiento (sin comisiones), el % escala linealmente
      expect(T.calcularTrade({ ...trades[0], comisiones: 0, apalancamiento: 2 }, 1).pct).toBeCloseTo(2 * T.calcularTrade({ ...trades[0], comisiones: 0, apalancamiento: 1 }, 1).pct, 10)
      return true
    }), { numRuns: 300 })
  })
})
