// Lógica de cálculo pura (sin I/O). Todas las funciones son deterministas y están cubiertas por tests.
import { TOLERANCIA_NIVEL, TRAMOS_IRPF_AHORRO, UMBRAL_COMISION_ALTA, type TramoIrpf } from '../config/irpf'

export type Moneda = 'EUR' | 'USD' | 'AUD'
export type TipoOperacion = 'compra' | 'venta'

export interface Operacion {
  id: string
  tipo: TipoOperacion
  /** Fecha en formato AAAA-MM-DD. */
  fecha: string
  /** Dinero metido (compra) o recibido neto (venta), en la moneda de la operación. */
  cantidad: number
  comision: number
  /** Precio de 1 BTC en esa operación. */
  precio: number
  moneda: Moneda
  plataforma?: string
  nota?: string
  /** Hora opcional (HH:MM, 24 h). Sin ella solo cuenta la fecha. */
  hora?: string
}

export type PreciosBtc = Record<Moneda, number>

export class VentaExcedidaError extends Error {
  constructor(public disponible: number, public solicitado: number) {
    super('No puedes vender más BTC del que tienes.')
    this.name = 'VentaExcedidaError'
  }
}

// ───────────── Monedas ─────────────

/** Tipo de cambio de `de` a `a`, deducido del precio de BTC en cada moneda. */
export function tipoCambio(de: Moneda, a: Moneda, precios: PreciosBtc): number {
  if (de === a) return 1
  return precios[a] / precios[de]
}

export function convertir(importe: number, de: Moneda, a: Moneda, precios: PreciosBtc): number {
  return importe * tipoCambio(de, a, precios)
}

/** Devuelve las operaciones expresadas en una sola moneda. */
export function normalizar(ops: Operacion[], moneda: Moneda, precios: PreciosBtc): Operacion[] {
  return ops.map((o) => {
    if (o.moneda === moneda) return o
    const k = tipoCambio(o.moneda, moneda, precios)
    return { ...o, cantidad: o.cantidad * k, comision: o.comision * k, precio: o.precio * k, moneda }
  })
}

// ───────────── Compra individual ─────────────

export const btcDeCompra = (o: Pick<Operacion, 'cantidad' | 'comision' | 'precio'>): number =>
  (o.cantidad - o.comision) / o.precio

/** BTC que salen en una venta: lo recibido neto más la comisión, entre el precio. */
export const btcDeVenta = (o: Pick<Operacion, 'cantidad' | 'comision' | 'precio'>): number =>
  (o.cantidad + o.comision) / o.precio

export interface FilaCompra {
  id: string
  fecha: string
  btc: number
  cantidad: number
  valorHoy: number
  ganancia: number
  rentabilidad: number
  pctComision: number
  comisionAlta: boolean
}

export function filaCompra(o: Operacion, precioActual: number): FilaCompra {
  const btc = btcDeCompra(o)
  const valorHoy = btc * precioActual
  const ganancia = valorHoy - o.cantidad
  const pctComision = o.cantidad > 0 ? o.comision / o.cantidad : 0
  return {
    id: o.id,
    fecha: o.fecha,
    btc,
    cantidad: o.cantidad,
    valorHoy,
    ganancia,
    rentabilidad: o.cantidad > 0 ? ganancia / o.cantidad : 0,
    pctComision,
    comisionAlta: pctComision > UMBRAL_COMISION_ALTA,
  }
}

// ───────────── FIFO ─────────────

export interface Lote {
  id: string
  fecha: string
  btc: number
  /** Dinero total (con comisión) correspondiente al BTC que queda en el lote. */
  coste: number
  /** Coste sin comisión del BTC que queda. */
  costeSinComision: number
}

export interface VentaRealizada {
  id: string
  fecha: string
  btcVendidos: number
  ingreso: number
  coste: number
  ganancia: number
}

export interface ResultadoFifo {
  lotes: Lote[]
  ventas: VentaRealizada[]
}

export function ordenarPorFecha<T extends { fecha: string; tipo: TipoOperacion }>(ops: T[]): T[] {
  // Orden estable: por fecha; el mismo día, las compras antes que las ventas.
  return ops
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.fecha < b.o.fecha ? -1 : a.o.fecha > b.o.fecha ? 1 : a.o.tipo === b.o.tipo ? a.i - b.i : a.o.tipo === 'compra' ? -1 : 1))
    .map((x) => x.o)
}

const EPS = 1e-12

/** Aplica las ventas por FIFO. Lanza VentaExcedidaError si se vende más de lo disponible. */
export function calcularFifo(ops: Operacion[]): ResultadoFifo {
  const lotes: Lote[] = []
  const ventas: VentaRealizada[] = []
  for (const o of ordenarPorFecha(ops)) {
    if (o.tipo === 'compra') {
      const btc = btcDeCompra(o)
      lotes.push({ id: o.id, fecha: o.fecha, btc, coste: o.cantidad, costeSinComision: o.cantidad - o.comision })
      continue
    }
    let porVender = btcDeVenta(o)
    const disponible = lotes.reduce((s, l) => s + l.btc, 0)
    if (porVender > disponible + 1e-9) throw new VentaExcedidaError(disponible, porVender)
    const total = porVender
    let coste = 0
    while (porVender > EPS && lotes.length) {
      const l = lotes[0]
      const usa = Math.min(l.btc, porVender)
      const frac = l.btc > 0 ? usa / l.btc : 0
      coste += l.coste * frac
      l.coste -= l.coste * frac
      l.costeSinComision -= l.costeSinComision * frac
      l.btc -= usa
      porVender -= usa
      if (l.btc <= EPS) lotes.shift()
    }
    ventas.push({ id: o.id, fecha: o.fecha, btcVendidos: total, ingreso: o.cantidad, coste, ganancia: o.cantidad - coste })
  }
  return { lotes, ventas }
}

export const btcDisponible = (ops: Operacion[]): number => calcularFifo(ops).lotes.reduce((s, l) => s + l.btc, 0)

// ───────────── Totales ─────────────

export interface Resumen {
  btc: number
  invertido: number
  valorHoy: number
  ganancia: number
  rentabilidad: number
  /** Comisiones pagadas en todas las compras (histórico). */
  comisiones: number
  pctComisiones: number
  precioMedioReal: number
  precioMedioSinComisiones: number
  /** Subida necesaria desde el precio actual para llegar al precio medio. */
  subidaParaRentable: number
  gananciaRealizada: number
}

export function resumen(ops: Operacion[], precioActual: number): Resumen {
  const { lotes, ventas } = calcularFifo(ops)
  const btc = lotes.reduce((s, l) => s + l.btc, 0)
  const invertido = lotes.reduce((s, l) => s + l.coste, 0)
  const sinCom = lotes.reduce((s, l) => s + l.costeSinComision, 0)
  const comisiones = ops.filter((o) => o.tipo === 'compra').reduce((s, o) => s + o.comision, 0)
  const totalComprado = ops.filter((o) => o.tipo === 'compra').reduce((s, o) => s + o.cantidad, 0)
  const valorHoy = btc * precioActual
  const precioMedioReal = btc > 0 ? invertido / btc : 0
  return {
    btc,
    invertido,
    valorHoy,
    ganancia: valorHoy - invertido,
    rentabilidad: invertido > 0 ? (valorHoy - invertido) / invertido : 0,
    comisiones,
    pctComisiones: totalComprado > 0 ? comisiones / totalComprado : 0,
    precioMedioReal,
    precioMedioSinComisiones: btc > 0 ? sinCom / btc : 0,
    subidaParaRentable: btc > 0 && precioActual > 0 ? Math.max(0, precioMedioReal / precioActual - 1) : 0,
    gananciaRealizada: ventas.reduce((s, v) => s + v.ganancia, 0),
  }
}

/** Cómo quedaría el resumen tras añadir una operación (vista previa en vivo). */
export function resumenConOperacion(ops: Operacion[], nueva: Operacion, precioActual: number): Resumen {
  return resumen([...ops, nueva], precioActual)
}

export function mejorYPeorCompra(ops: Operacion[], precioActual: number): { mejor: FilaCompra | null; peor: FilaCompra | null } {
  const filas = ops.filter((o) => o.tipo === 'compra' && o.cantidad > 0).map((o) => filaCompra(o, precioActual))
  if (!filas.length) return { mejor: null, peor: null }
  const orden = [...filas].sort((a, b) => b.rentabilidad - a.rentabilidad)
  return { mejor: orden[0], peor: orden[orden.length - 1] }
}

/** "Si lo hubieras metido todo el primer día": todo lo comprado al precio de la primera compra. */
export function comparativaPrimerDia(ops: Operacion[], precioActual: number) {
  const compras = ordenarPorFecha(ops.filter((o) => o.tipo === 'compra'))
  if (!compras.length) return null
  const metido = compras.reduce((s, o) => s + o.cantidad, 0)
  const btc = metido / compras[0].precio
  const valorHoy = btc * precioActual
  const real = resumen(compras, precioActual)
  return {
    metido,
    btcPrimerDia: btc,
    valorPrimerDia: valorHoy,
    gananciaPrimerDia: valorHoy - metido,
    valorReal: real.valorHoy,
    gananciaReal: real.ganancia,
    diferencia: valorHoy - real.valorHoy,
  }
}

// ───────────── Plan, niveles y DCA ─────────────

export interface NivelClave {
  precio: number
  porcentajeCapital: number
}
export interface ConfigDca {
  /** Opcional: sin fecha el DCA se considera sin empezar. */
  inicio?: string
  porcentajeSemanal: number
  semanas: number
  /** Precio de arranque del DCA (opcional): un aviso salta cuando BTC lo toca. */
  precioInicio?: number
  monedaInicio?: Moneda
}
export interface Plan {
  capital: number
  nivelesClave: NivelClave[]
  dca: ConfigDca
}

export interface EstadoNivel {
  precio: number
  importe: number
  estado: 'Comprado' | 'Pendiente'
}

/**
 * Los niveles del plan están en EUR. Si las compras están en otra moneda hay que pasar los precios de BTC (`precios`)
 * para convertir el precio de cada compra a EUR antes de compararlo con el nivel.
 */
export function estadoNiveles(plan: Plan, ops: Operacion[], precios?: PreciosBtc): EstadoNivel[] {
  const compras = ops
    .filter((o) => o.tipo === 'compra')
    .map((o) => (precios && o.moneda !== 'EUR' ? { ...o, precio: convertir(o.precio, o.moneda, 'EUR', precios) } : o))
  return plan.nivelesClave.map((n) => ({
    precio: n.precio,
    importe: (plan.capital * n.porcentajeCapital) / 100,
    estado: compras.some((c) => Math.abs(c.precio - n.precio) <= n.precio * TOLERANCIA_NIVEL) ? 'Comprado' : 'Pendiente',
  }))
}

/** `precioActual` en EUR (los niveles del plan están en EUR). */
export function proximoNivel(plan: Plan, ops: Operacion[], precioActual: number, precios?: PreciosBtc): { precio: number; bajadaNecesaria: number } | null {
  const pend = estadoNiveles(plan, ops, precios)
    .filter((n) => n.estado === 'Pendiente' && n.precio < precioActual)
    .sort((a, b) => b.precio - a.precio)[0]
  return pend ? { precio: pend.precio, bajadaNecesaria: 1 - pend.precio / precioActual } : null
}

export function totalPlanificadoPct(plan: Plan): number {
  return plan.nivelesClave.reduce((s, n) => s + n.porcentajeCapital, 0) + plan.dca.porcentajeSemanal * plan.dca.semanas
}

export interface ProgresoDca {
  importeSemanal: number
  semanaActual: number
  semanas: number
  /** Importe del plan que ya debería estar metido según la semana actual. */
  metidoSegunPlan: number
  quedaPorMeter: number
}

const MS_SEMANA = 7 * 24 * 3600 * 1000
export function progresoDca(plan: Plan, hoy: string): ProgresoDca {
  const importeSemanal = (plan.capital * plan.dca.porcentajeSemanal) / 100
  const dif = plan.dca.inicio ? Date.parse(hoy + 'T00:00:00Z') - Date.parse(plan.dca.inicio + 'T00:00:00Z') : -1
  const semanaActual = dif < 0 ? 0 : Math.min(plan.dca.semanas, Math.floor(dif / MS_SEMANA) + 1)
  const metidoSegunPlan = importeSemanal * semanaActual
  return {
    importeSemanal,
    semanaActual,
    semanas: plan.dca.semanas,
    metidoSegunPlan,
    quedaPorMeter: importeSemanal * plan.dca.semanas - metidoSegunPlan,
  }
}

// ───────────── Calculadoras ─────────────

export type ResultadoBajarMedia =
  | { posible: true; importe: number; btcNuevos: number; nuevaMedia: number }
  | { posible: false; motivo: 'sin_btc' | 'ya_alcanzado' | 'precio_alto' }

/** Cuánto comprar al precio actual para que el precio medio real baje hasta `objetivo`. */
export function bajarMedia(ops: Operacion[], objetivo: number, precioActual: number, comisionPct = 0): ResultadoBajarMedia {
  const r = resumen(ops, precioActual)
  if (r.btc <= 0) return { posible: false, motivo: 'sin_btc' }
  if (objetivo >= r.precioMedioReal) return { posible: false, motivo: 'ya_alcanzado' }
  const k = 1 - comisionPct
  // Si el precio actual (con comisión) no está por debajo del objetivo, comprar no lo logra nunca.
  if (precioActual <= 0 || precioActual >= objetivo * k) return { posible: false, motivo: 'precio_alto' }
  const importe = (objetivo * r.btc - r.invertido) / (1 - (objetivo * k) / precioActual)
  const btcNuevos = (importe * k) / precioActual
  return { posible: true, importe, btcNuevos, nuevaMedia: (r.invertido + importe) / (r.btc + btcNuevos) }
}

export function escenarioPrecio(ops: Operacion[], precio: number) {
  const r = resumen(ops, precio)
  return { valor: r.valorHoy, ganancia: r.ganancia, rentabilidad: r.rentabilidad }
}

export function estimarIrpf(ganancia: number, tramos: TramoIrpf[] = TRAMOS_IRPF_AHORRO): number {
  if (ganancia <= 0) return 0
  let resto = ganancia
  let previo = 0
  let cuota = 0
  for (const t of tramos) {
    const ancho = Math.min(resto, t.hasta - previo)
    if (ancho <= 0) break
    cuota += ancho * t.tipo
    resto -= ancho
    previo = t.hasta
    if (resto <= 0) break
  }
  return cuota
}

export interface SimulacionVenta {
  btc: number
  ingreso: number
  coste: number
  ganancia: number
  irpfEstimado: number
}

/** Ganancia FIFO de vender hoy `btc` (o todo si no se indica). */
export function siVendoHoy(ops: Operacion[], precioActual: number, btc?: number, comisionPct = 0): SimulacionVenta {
  const disp = btcDisponible(ops)
  const cantidad = btc ?? disp
  if (cantidad > disp + 1e-9) throw new VentaExcedidaError(disp, cantidad)
  const ingreso = cantidad * precioActual * (1 - comisionPct)
  const sim: Operacion = {
    id: 'sim', tipo: 'venta', fecha: '9999-12-31', cantidad: ingreso, comision: cantidad * precioActual * comisionPct,
    precio: precioActual, moneda: ops[0]?.moneda ?? 'EUR',
  }
  const v = calcularFifo([...ops, sim]).ventas.at(-1)!
  return { btc: cantidad, ingreso, coste: v.coste, ganancia: v.ganancia, irpfEstimado: estimarIrpf(v.ganancia) }
}

// ───────────── Objetivos ─────────────

export const progresoObjetivo = (actual: number, meta: number): number => (meta > 0 ? Math.min(1, Math.max(0, actual / meta)) : 0)

/** Precio de venta objetivo a partir de un % de ganancia sobre el precio medio. */
export const precioObjetivoPorGanancia = (precioMedio: number, pctGanancia: number): number => precioMedio * (1 + pctGanancia / 100)

// ───────────── Series para gráficas ─────────────

export interface PuntoPrecio {
  /** Marca de tiempo en milisegundos. */
  t: number
  precio: number
}

export interface PuntoCartera {
  fecha: string
  valor: number
  invertido: number
}

const dia = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Valor de la cartera frente al dinero metido a lo largo del tiempo. */
export function serieCartera(ops: Operacion[], historico: PuntoPrecio[]): PuntoCartera[] {
  const orden = ordenarPorFecha(ops)
  const salida: PuntoCartera[] = []
  for (const p of historico) {
    const f = dia(p.t)
    const hasta = orden.filter((o) => o.fecha <= f)
    if (!hasta.length) continue
    try {
      const r = resumen(hasta, p.precio)
      salida.push({ fecha: f, valor: r.valorHoy, invertido: r.invertido })
    } catch {
      // Datos incoherentes (venta sin saldo): se omite el punto.
    }
  }
  return salida
}

export function invertidoPorMes(ops: Operacion[]): { mes: string; importe: number }[] {
  const m = new Map<string, number>()
  for (const o of ops) if (o.tipo === 'compra') m.set(o.fecha.slice(0, 7), (m.get(o.fecha.slice(0, 7)) ?? 0) + o.cantidad)
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([mes, importe]) => ({ mes, importe }))
}

// ───────────── Informe FIFO anual ─────────────

export function informeFifoAnual(ops: Operacion[], anio: number) {
  const ventas = calcularFifo(ops).ventas.filter((v) => v.fecha.startsWith(String(anio)))
  return {
    ventas,
    totalIngresos: ventas.reduce((s, v) => s + v.ingreso, 0),
    totalCoste: ventas.reduce((s, v) => s + v.coste, 0),
    gananciaTotal: ventas.reduce((s, v) => s + v.ganancia, 0),
  }
}

/** Resumen mensual: lo metido en el mes y variación de precio medio y rentabilidad. */
export function resumenMensual(ops: Operacion[], mes: string, precioActual: number) {
  const hastaAntes = ops.filter((o) => o.fecha.slice(0, 7) < mes)
  const hasta = ops.filter((o) => o.fecha.slice(0, 7) <= mes)
  const antes = resumen(hastaAntes, precioActual)
  const despues = resumen(hasta, precioActual)
  return {
    metido: ops.filter((o) => o.tipo === 'compra' && o.fecha.startsWith(mes)).reduce((s, o) => s + o.cantidad, 0),
    medioAntes: antes.precioMedioReal,
    medioDespues: despues.precioMedioReal,
    rentabilidad: despues.rentabilidad,
  }
}

// ───────────── Estadísticas ampliadas ─────────────

/** Rentabilidad (valor / invertido − 1) en el tiempo, como fracción. */
export const serieRentabilidad = (serie: PuntoCartera[]) =>
  serie.filter((p) => p.invertido > 0).map((p) => ({ fecha: p.fecha, rentabilidad: p.valor / p.invertido - 1 }))

/** Cuánto ha llegado a caer la cartera desde su máximo anterior (fracción negativa o cero). */
export function drawdown(serie: PuntoCartera[]): { fecha: string; caida: number }[] {
  let max = 0
  return serie.map((p) => {
    max = Math.max(max, p.valor)
    return { fecha: p.fecha, caida: max > 0 ? p.valor / max - 1 : 0 }
  })
}

/** Mejor día, peor día y valor máximo. El cambio de cada día descuenta el dinero nuevo que se metió. */
export function hitosCartera(serie: PuntoCartera[]) {
  if (serie.length < 2) return null
  let mejor = { fecha: serie[1].fecha, cambio: -Infinity }
  let peor = { fecha: serie[1].fecha, cambio: Infinity }
  for (let i = 1; i < serie.length; i++) {
    const cambio = serie[i].valor - serie[i - 1].valor - (serie[i].invertido - serie[i - 1].invertido)
    if (cambio > mejor.cambio) mejor = { fecha: serie[i].fecha, cambio }
    if (cambio < peor.cambio) peor = { fecha: serie[i].fecha, cambio }
  }
  const max = serie.reduce((m, p) => (p.valor > m.valor ? p : m), serie[0])
  return { mejor, peor, maximo: { fecha: max.fecha, valor: max.valor } }
}

/** Histograma de a qué precios has comprado y qué % de compras está en ganancias. */
export function histogramaCompras(ops: Operacion[], precioActual: number, grupos = 8) {
  const compras = ops.filter((o) => o.tipo === 'compra')
  if (!compras.length) return { bins: [] as { desde: number; hasta: number; compras: number; importe: number }[], pctEnGanancias: 0 }
  const precios = compras.map((o) => o.precio)
  const min = Math.min(...precios), max = Math.max(...precios)
  const ancho = (max - min) / grupos || 1
  const bins = Array.from({ length: grupos }, (_, i) => ({ desde: min + i * ancho, hasta: min + (i + 1) * ancho, compras: 0, importe: 0 }))
  for (const o of compras) {
    const i = Math.min(grupos - 1, Math.floor((o.precio - min) / ancho))
    bins[i].compras++
    bins[i].importe += o.cantidad
  }
  const enGanancias = compras.filter((o) => filaCompra(o, precioActual).ganancia > 0).length
  return { bins, pctEnGanancias: enGanancias / compras.length }
}

/** BTC acumulado compra a compra (escalonado). */
export function btcAcumulado(ops: Operacion[]): { fecha: string; btc: number }[] {
  let btc = 0
  const orden = ordenarPorFecha(ops)
  const por = new Map<string, number>()
  for (const o of orden) {
    btc += o.tipo === 'compra' ? btcDeCompra(o) : -btcDeVenta(o)
    por.set(o.fecha, btc)
  }
  return [...por.entries()].map(([fecha, b]) => ({ fecha, btc: Math.max(0, b) }))
}

/** Calendario de DCA: una casilla por semana (lunes UTC), con el nº de compras y el importe. */
export function calendarioDca(ops: Operacion[], hasta: string, semanas = 26): { semana: string; compras: number; importe: number }[] {
  const lunesDe = (iso: string) => {
    const t = Date.parse(`${iso}T00:00:00Z`)
    const d = new Date(t)
    const dif = (d.getUTCDay() + 6) % 7
    return new Date(t - dif * 86400000).toISOString().slice(0, 10)
  }
  const fin = Date.parse(`${lunesDe(hasta)}T00:00:00Z`)
  const mapa = new Map<string, { compras: number; importe: number }>()
  for (const o of ops) {
    if (o.tipo !== 'compra') continue
    const k = lunesDe(o.fecha)
    const v = mapa.get(k) ?? { compras: 0, importe: 0 }
    v.compras++
    v.importe += o.cantidad
    mapa.set(k, v)
  }
  return Array.from({ length: semanas }, (_, i) => {
    const semana = new Date(fin - (semanas - 1 - i) * 7 * 86400000).toISOString().slice(0, 10)
    return { semana, ...(mapa.get(semana) ?? { compras: 0, importe: 0 }) }
  })
}

export const SATS_POR_BTC = 100_000_000
export const aSats = (btc: number) => Math.round(btc * SATS_POR_BTC)

/** Compras con comisión por encima del umbral (3 %), de más a menos cara. */
export function comprasConComisionAlta(ops: Operacion[], precioActual: number) {
  return ops
    .filter((o) => o.tipo === 'compra')
    .map((o) => filaCompra(o, precioActual))
    .filter((f) => f.comisionAlta)
    .sort((a, b) => b.pctComision - a.pctComision)
}
