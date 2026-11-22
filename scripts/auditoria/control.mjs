// Calculadora de control: segunda implementación INDEPENDIENTE de los cálculos de la app.
// No importa nada de src/. Usa aritmética decimal exacta (decimal.js), así que no arrastra errores de coma flotante.
import Decimal from 'decimal.js'

Decimal.set({ precision: 60, rounding: Decimal.ROUND_HALF_UP })
export const D = (x) => new Decimal(x)
const CERO = D(0)
const sumar = (xs) => xs.reduce((s, x) => s.plus(x), CERO)

// ───────────── Orden y FIFO ─────────────
/** Por fecha; el mismo día, compras antes que ventas; estable. */
export function ordenar(ops) {
  return ops
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.fecha < b.o.fecha ? -1 : a.o.fecha > b.o.fecha ? 1 : a.o.tipo === b.o.tipo ? a.i - b.i : a.o.tipo === 'compra' ? -1 : 1))
    .map((x) => x.o)
}

export const btcCompra = (o) => D(o.cantidad).minus(o.comision).div(o.precio)
export const btcVenta = (o) => D(o.cantidad).plus(o.comision).div(o.precio)

const EPS = D('1e-12')
/** Consume `btc` de los lotes más antiguos. Devuelve el coste consumido. Modifica `lotes`. */
function consumir(lotes, btc) {
  let falta = D(btc)
  let coste = CERO
  while (falta.gt(EPS) && lotes.length) {
    const l = lotes[0]
    const usa = Decimal.min(l.btc, falta)
    const frac = usa.div(l.btc)
    coste = coste.plus(l.coste.mul(frac))
    l.coste = l.coste.mul(D(1).minus(frac))
    l.sin = l.sin.mul(D(1).minus(frac))
    l.btc = l.btc.minus(usa)
    falta = falta.minus(usa)
    if (l.btc.lte(EPS)) lotes.shift()
  }
  return coste
}

/** FIFO completo. Lanza 'VENTA_EXCEDIDA' si se vende más de lo que hay. */
export function fifo(ops) {
  const lotes = []
  const ventas = []
  for (const o of ordenar(ops)) {
    if (o.tipo === 'compra') {
      const cant = D(o.cantidad)
      lotes.push({ btc: btcCompra(o), coste: cant, sin: cant.minus(o.comision) })
      continue
    }
    const btc = btcVenta(o)
    if (btc.gt(sumar(lotes.map((l) => l.btc)).plus('1e-9'))) throw new Error('VENTA_EXCEDIDA')
    const coste = consumir(lotes, btc)
    ventas.push({ fecha: o.fecha, btc, ingreso: D(o.cantidad), coste, ganancia: D(o.cantidad).minus(coste) })
  }
  return { lotes, ventas }
}

// ───────────── Compras y totales ─────────────
export function filaCompra(o, precioActual) {
  const btc = btcCompra(o)
  const valor = btc.mul(precioActual)
  const cant = D(o.cantidad)
  return { btc, valor, ganancia: valor.minus(cant), rent: cant.gt(0) ? valor.minus(cant).div(cant) : CERO, pctCom: cant.gt(0) ? D(o.comision).div(cant) : CERO }
}

export function totales(ops, precioActual) {
  const { lotes, ventas } = fifo(ops)
  const btc = sumar(lotes.map((l) => l.btc))
  const invertido = sumar(lotes.map((l) => l.coste))
  const sin = sumar(lotes.map((l) => l.sin))
  const compras = ops.filter((o) => o.tipo === 'compra')
  const comisiones = sumar(compras.map((o) => o.comision))
  const comprado = sumar(compras.map((o) => o.cantidad))
  const valor = btc.mul(precioActual)
  const medio = btc.gt(0) ? invertido.div(btc) : CERO
  return {
    btc, invertido, valor, ganancia: valor.minus(invertido),
    rent: invertido.gt(0) ? valor.minus(invertido).div(invertido) : CERO,
    comisiones, pctCom: comprado.gt(0) ? comisiones.div(comprado) : CERO,
    medioReal: medio, medioSin: btc.gt(0) ? sin.div(btc) : CERO,
    subida: btc.gt(0) && D(precioActual).gt(0) ? Decimal.max(0, medio.div(precioActual).minus(1)) : CERO,
    gananciaRealizada: sumar(ventas.map((v) => v.ganancia)),
    lotes, ventas,
  }
}

// ───────────── Monedas ─────────────
export const convertir = (importe, de, a, precios) => (de === a ? D(importe) : D(importe).mul(precios[a]).div(precios[de]))
export const normalizar = (ops, moneda, precios) =>
  ops.map((o) => (o.moneda === moneda ? o : { ...o, moneda, cantidad: convertir(o.cantidad, o.moneda, moneda, precios), comision: convertir(o.comision, o.moneda, moneda, precios), precio: convertir(o.precio, o.moneda, moneda, precios) }))

// ───────────── Plan ─────────────
/** El plan está en EUR: los precios de compra se pasan a EUR antes de compararlos con cada nivel. */
export function estadoNiveles(plan, ops, precios) {
  const compras = ops.filter((o) => o.tipo === 'compra')
  return plan.nivelesClave.map((n) => {
    const importe = D(plan.capital).mul(n.porcentajeCapital).div(100)
    const comprado = compras.some((c) => {
      const p = precios ? convertir(c.precio, c.moneda ?? 'EUR', 'EUR', precios) : D(c.precio)
      return p.minus(n.precio).abs().lte(D(n.precio).mul('0.005'))
    })
    return { precio: D(n.precio), importe, estado: comprado ? 'Comprado' : 'Pendiente' }
  })
}
export function proximoNivel(plan, ops, precioEur, precios) {
  const pend = estadoNiveles(plan, ops, precios).filter((n) => n.estado === 'Pendiente' && n.precio.lt(precioEur)).sort((a, b) => b.precio.comparedTo(a.precio))[0]
  return pend ? { precio: pend.precio, bajada: D(1).minus(pend.precio.div(precioEur)) } : null
}
export const totalPlanificado = (plan) => sumar(plan.nivelesClave.map((n) => n.porcentajeCapital)).plus(D(plan.dca.porcentajeSemanal).mul(plan.dca.semanas))
export function progresoDca(plan, hoy) {
  const semanal = D(plan.capital).mul(plan.dca.porcentajeSemanal).div(100)
  let semana = 0
  if (plan.dca.inicio) {
    const dias = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${plan.dca.inicio}T00:00:00Z`)) / 86400000)
    semana = dias < 0 ? 0 : Math.min(plan.dca.semanas, Math.floor(dias / 7) + 1)
  }
  const metido = semanal.mul(semana)
  return { semanal, semana, metido, queda: semanal.mul(plan.dca.semanas).minus(metido) }
}

// ───────────── Calculadoras ─────────────
export function bajarMedia(ops, objetivo, precio, comisionPct = 0) {
  const t = totales(ops, precio)
  if (t.btc.lte(0)) return { posible: false, motivo: 'sin_btc' }
  if (D(objetivo).gte(t.medioReal)) return { posible: false, motivo: 'ya_alcanzado' }
  const k = D(1).minus(comisionPct)
  if (D(precio).lte(0) || D(precio).gte(D(objetivo).mul(k))) return { posible: false, motivo: 'precio_alto' }
  // (I + X) / (B + X·k/p) = objetivo  →  X = (objetivo·B − I) / (1 − objetivo·k/p)
  const X = D(objetivo).mul(t.btc).minus(t.invertido).div(D(1).minus(D(objetivo).mul(k).div(precio)))
  const nuevos = X.mul(k).div(precio)
  return { posible: true, importe: X, btcNuevos: nuevos, nuevaMedia: t.invertido.plus(X).div(t.btc.plus(nuevos)) }
}
export function escenario(ops, precio) {
  const t = totales(ops, precio)
  return { valor: t.valor, ganancia: t.ganancia, rent: t.rent }
}
const TRAMOS = [[6000, '0.19'], [50000, '0.21'], [200000, '0.23'], [300000, '0.27'], [Infinity, '0.30']]
export function irpf(ganancia) {
  let resto = D(ganancia)
  if (resto.lte(0)) return CERO
  let previo = D(0)
  let cuota = CERO
  for (const [hasta, tipo] of TRAMOS) {
    const ancho = hasta === Infinity ? resto : Decimal.min(resto, D(hasta).minus(previo))
    if (ancho.lte(0)) break
    cuota = cuota.plus(ancho.mul(tipo))
    resto = resto.minus(ancho)
    previo = hasta === Infinity ? previo : D(hasta)
    if (resto.lte(0)) break
  }
  return cuota
}
export function siVendoHoy(ops, precio, btc, comisionPct = 0) {
  const { lotes } = fifo(ops)
  const disp = sumar(lotes.map((l) => l.btc))
  const cantidad = btc == null ? disp : D(btc)
  if (cantidad.gt(disp.plus('1e-9'))) throw new Error('VENTA_EXCEDIDA')
  const ingreso = cantidad.mul(precio).mul(D(1).minus(comisionPct))
  const coste = consumir(lotes, cantidad)
  const ganancia = ingreso.minus(coste)
  return { btc: cantidad, ingreso, coste, ganancia, irpf: irpf(ganancia) }
}

// ───────────── Estadísticas ─────────────
const fechaDeMs = (t) => new Date(t).toISOString().slice(0, 10)

/** Serie {fecha, valor, invertido} con el histórico [{t (ms), precio}]. */
export function serieCartera(ops, historico) {
  const orden = ordenar(ops)
  const salida = []
  for (const p of historico) {
    const f = fechaDeMs(p.t)
    const hasta = orden.filter((o) => o.fecha <= f)
    if (!hasta.length) continue
    try {
      const t = totales(hasta, p.precio)
      salida.push({ fecha: f, valor: t.valor, invertido: t.invertido })
    } catch { /* datos incoherentes */ }
  }
  return salida
}
export function drawdown(serie) {
  let max = CERO
  return serie.map((p) => {
    max = Decimal.max(max, p.valor)
    return { fecha: p.fecha, caida: max.gt(0) ? p.valor.div(max).minus(1) : CERO }
  })
}
export function hitos(serie) {
  if (serie.length < 2) return null
  let mejor = { fecha: serie[1].fecha, cambio: D('-Infinity') }
  let peor = { fecha: serie[1].fecha, cambio: D('Infinity') }
  for (let i = 1; i < serie.length; i++) {
    const c = serie[i].valor.minus(serie[i - 1].valor).minus(serie[i].invertido.minus(serie[i - 1].invertido))
    if (c.gt(mejor.cambio)) mejor = { fecha: serie[i].fecha, cambio: c }
    if (c.lt(peor.cambio)) peor = { fecha: serie[i].fecha, cambio: c }
  }
  const max = serie.reduce((m, p) => (p.valor.gt(m.valor) ? p : m), serie[0])
  return { mejor, peor, maximo: { fecha: max.fecha, valor: max.valor } }
}
export function histograma(ops, precioActual, grupos = 8) {
  const compras = ops.filter((o) => o.tipo === 'compra')
  if (!compras.length) return { bins: [], pctGanancias: CERO }
  const precios = compras.map((o) => D(o.precio))
  const min = Decimal.min(...precios), max = Decimal.max(...precios)
  const ancho = max.minus(min).div(grupos).isZero() ? D(1) : max.minus(min).div(grupos)
  const bins = Array.from({ length: grupos }, (_, i) => ({ desde: min.plus(ancho.mul(i)), hasta: min.plus(ancho.mul(i + 1)), compras: 0, importe: CERO }))
  for (const o of compras) {
    const i = Math.min(grupos - 1, Math.floor(D(o.precio).minus(min).div(ancho).toNumber()))
    bins[i].compras++
    bins[i].importe = bins[i].importe.plus(o.cantidad)
  }
  const gana = compras.filter((o) => filaCompra(o, precioActual).ganancia.gt(0)).length
  return { bins, pctGanancias: D(gana).div(compras.length) }
}
export function invertidoPorMes(ops) {
  const m = new Map()
  for (const o of ops) if (o.tipo === 'compra') m.set(o.fecha.slice(0, 7), (m.get(o.fecha.slice(0, 7)) ?? CERO).plus(o.cantidad))
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([mes, importe]) => ({ mes, importe }))
}
export function calendarioDca(ops, hasta, semanas = 26) {
  const lunes = (iso) => {
    const t = Date.parse(`${iso}T00:00:00Z`)
    return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10)
  }
  const fin = Date.parse(`${lunes(hasta)}T00:00:00Z`)
  const m = new Map()
  for (const o of ops) {
    if (o.tipo !== 'compra') continue
    const k = lunes(o.fecha)
    const v = m.get(k) ?? { compras: 0, importe: CERO }
    m.set(k, { compras: v.compras + 1, importe: v.importe.plus(o.cantidad) })
  }
  return Array.from({ length: semanas }, (_, i) => {
    const semana = new Date(fin - (semanas - 1 - i) * 7 * 86400000).toISOString().slice(0, 10)
    return { semana, ...(m.get(semana) ?? { compras: 0, importe: CERO }) }
  })
}
export const sats = (btc) => D(btc).mul(100000000).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
export function comisionPorPlataforma(ops) {
  const m = new Map()
  for (const o of ops) {
    if (o.tipo !== 'compra') continue
    const k = o.plataforma || 'Sin indicar'
    const v = m.get(k) ?? { n: 0, cant: CERO, com: CERO }
    m.set(k, { n: v.n + 1, cant: v.cant.plus(o.cantidad), com: v.com.plus(o.comision) })
  }
  return [...m.entries()].map(([plataforma, v]) => ({ plataforma, compras: v.n, comision: v.com, pct: v.cant.gt(0) ? v.com.div(v.cant) : CERO })).sort((a, b) => a.pct.comparedTo(b.pct))
}
export function primerDia(ops, precioActual) {
  const compras = ordenar(ops.filter((o) => o.tipo === 'compra'))
  if (!compras.length) return null
  const metido = sumar(compras.map((o) => o.cantidad))
  const btc = metido.div(compras[0].precio)
  const valor = btc.mul(precioActual)
  const real = totales(compras, precioActual)
  return { metido, btc, valor, ganancia: valor.minus(metido), valorReal: real.valor, gananciaReal: real.ganancia }
}
export function mejorPeor(ops, precioActual) {
  const f = ops.filter((o) => o.tipo === 'compra' && D(o.cantidad).gt(0)).map((o, i) => ({ i, o, ...filaCompra(o, precioActual) }))
  if (!f.length) return { mejor: null, peor: null }
  const orden = [...f].sort((a, b) => b.rent.comparedTo(a.rent))
  return { mejor: orden[0], peor: orden[orden.length - 1] }
}

// ───────────── Avisos ─────────────
/** Cruce del precio medio con margen del ±0,5 %. Devuelve la lista de eventos ('sube' | 'baja') de una secuencia de precios. */
export function eventosRentable(precios, media, margen = '0.005') {
  let estado = null
  const ev = []
  for (const p of precios) {
    const alto = D(media).mul(D(1).plus(margen)), bajo = D(media).mul(D(1).minus(margen))
    if (D(p).gte(alto) && estado !== 'positivo') { if (estado === 'negativo') ev.push('sube'); estado = 'positivo' }
    else if (D(p).lte(bajo) && estado !== 'negativo') { if (estado === 'positivo') ev.push('baja'); estado = 'negativo' }
  }
  return ev
}
/** Hitos de rentabilidad: cada hito avisa una vez hasta que se vuelve a cruzar en sentido contrario. */
export function eventosHitos(precios, btc, invertido) {
  const activos = new Set()
  const ev = []
  for (const p of precios) {
    const r = D(btc).mul(p).div(invertido).minus(1).mul(100)
    for (const h of [10, 25, 50, 100, -10, -20]) {
      const alcanzado = h > 0 ? r.gte(h) : r.lte(h)
      if (alcanzado && !activos.has(h)) { activos.add(h); ev.push(h) }
      else if (!alcanzado && activos.has(h)) activos.delete(h)
    }
  }
  return ev
}
/** Nivel clave: 'toca' al cruzar hacia abajo; 'cerca' si está por encima y a menos de X % (y no lo ha tocado). */
export function eventoNivel(prev, precio, nivel, pctCerca) {
  if (prev != null && D(prev).gt(nivel) && D(precio).lte(nivel)) return 'toca'
  if (D(precio).gt(nivel) && D(precio).lte(D(nivel).mul(D(1).plus(D(pctCerca).div(100))))) return 'cerca'
  return null
}
export const zonaMiedo = (v) => (v <= 24 ? 0 : v <= 44 ? 1 : v <= 55 ? 2 : v <= 74 ? 3 : 4)
export const nombreZona = ['Miedo extremo', 'Miedo', 'Neutral', 'Codicia', 'Codicia extrema']
export const caidaPuntos = (referencia, valor, umbral) => referencia - valor >= umbral
