// Trading: registro de entradas y salidas. Funciones puras; nada de red ni de Firestore.
import { convertir, type Moneda, type PreciosBtc } from './calculos'

export type Direccion = 'largo' | 'corto'
export type EstadoTrade = 'abierto' | 'cerrado'

export interface Trade {
  id: string
  estado: EstadoTrade
  direccion: Direccion
  fechaInicio: string
  fechaCierre?: string
  precioEntrada: number
  precioSalida?: number
  moneda: Moneda
  apalancamiento: number
  /** BTC que pone en el trade. */
  margenBTC?: number
  /** Comisiones en % del tamaño (0,4 = 0,4 %). */
  comisiones?: number
  /** Si existe, manda sobre el cálculo. */
  btcGanadoManual?: number
  plataforma?: string
  nota?: string
}

export type TradeGuardable = Omit<Trade, 'id'>

/** Movimiento del precio (fracción). En corto se invierte el signo. */
export function movimiento(entrada: number, salida: number, direccion: Direccion): number {
  const m = (salida - entrada) / entrada
  return direccion === 'corto' ? -m : m
}

/** % de ganancia (fracción) = movimiento × apalancamiento − comisiones. */
export function pctGanancia(mov: number, apalancamiento: number, comisionesPct = 0): number {
  return mov * apalancamiento - comisionesPct / 100
}

export interface CalculoTrade {
  /** ¿Sin cerrar? (el cálculo usa el precio actual) */
  abierto: boolean
  /** Precio de salida real o, si está abierto, el precio actual en la moneda del trade. */
  precioReferencia: number
  movimiento: number
  pct: number
  /** BTC ganados (o perdidos). null si no hay margen ni valor manual. */
  btc: number | null
  manual: boolean
}

/** `precioActual` está en la moneda del trade. */
export function calcularTrade(t: Trade, precioActual: number): CalculoTrade {
  const abierto = t.estado === 'abierto' || t.precioSalida == null
  const ref = abierto ? precioActual : (t.precioSalida as number)
  const mov = movimiento(t.precioEntrada, ref, t.direccion)
  const pct = pctGanancia(mov, t.apalancamiento, t.comisiones ?? 0)
  const manual = t.btcGanadoManual != null
  const btc = manual ? (t.btcGanadoManual as number) : t.margenBTC != null ? t.margenBTC * pct : null
  return { abierto, precioReferencia: ref, movimiento: mov, pct, btc, manual }
}

const f = (n: number, d: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
const signo = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '')
const pctTxt = (n: number, d = 2) => `${signo(Math.round(n * 10 ** (d + 2)) / 10 ** (d + 2))}${f(Math.abs(n) * 100, d)}%`

/** «Movimiento +3,15% × 5 − comisiones 0,4% = +15,35% → +0,0089 BTC» */
export function pasoAPaso(t: Trade, c: CalculoTrade): string {
  const com = t.comisiones ?? 0
  let s = `Movimiento ${pctTxt(c.movimiento)} × ${f(t.apalancamiento, Number.isInteger(t.apalancamiento) ? 0 : 1)}`
  if (com) s += ` − comisiones ${f(com, 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1')}%`
  s += ` = ${pctTxt(c.pct)}`
  if (c.manual) s += ` · BTC escritos a mano: ${signo(c.btc!)}${f(Math.abs(c.btc!), 4)} BTC`
  else if (c.btc != null) s += ` → ${signo(c.btc)}${f(Math.abs(c.btc), 4)} BTC`
  else s += ' → sin margen: no suma BTC'
  return s
}

const MS_DIA = 86_400_000
const aMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
export const diasEntre = (a: string, b: string) => Math.round((aMs(b) - aMs(a)) / MS_DIA)

export interface FilaTrade {
  trade: Trade
  calculo: CalculoTrade
  /** BTC ganados con su signo (0 si no hay dato; ver calculo.btc). */
  btc: number
  /** Los BTC × precio actual, en la moneda de la vista. null si no hay BTC. */
  valeHoy: number | null
  /** Los BTC × precio de salida, en la moneda de la vista (solo cerrados). */
  valiaAlCerrar: number | null
  /** BTC acumulados tras este trade (solo cerrados; los abiertos no entran). */
  acumulado: number | null
}

/** Cerrados por fecha de cierre (desempata por inicio y por orden); luego los abiertos por inicio. */
export function ordenarTrades(trades: Trade[]): Trade[] {
  const idx = new Map(trades.map((t, i) => [t, i]))
  const cerr = (t: Trade) => t.estado === 'cerrado' && t.precioSalida != null
  const cierre = (t: Trade) => t.fechaCierre ?? t.fechaInicio
  return [...trades].sort((a, b) => {
    if (cerr(a) !== cerr(b)) return cerr(a) ? -1 : 1
    const ka = cerr(a) ? cierre(a) : a.fechaInicio
    const kb = cerr(b) ? cierre(b) : b.fechaInicio
    return ka < kb ? -1 : ka > kb ? 1 : a.fechaInicio < b.fechaInicio ? -1 : a.fechaInicio > b.fechaInicio ? 1 : idx.get(a)! - idx.get(b)!
  })
}

export function filasTrades(trades: Trade[], precios: PreciosBtc, vista: Moneda): FilaTrade[] {
  let acum = 0
  return ordenarTrades(trades).map((t) => {
    const c = calcularTrade(t, precios[t.moneda])
    const btc = c.btc ?? 0
    if (!c.abierto) acum += btc
    return {
      trade: t, calculo: c, btc,
      valeHoy: c.btc == null ? null : c.btc * precios[vista],
      valiaAlCerrar: c.abierto || c.btc == null ? null : convertir(c.btc * (t.precioSalida as number), t.moneda, vista, precios),
      acumulado: c.abierto ? null : acum,
    }
  })
}

export interface TotalesTrading {
  nCerrados: number
  nAbiertos: number
  ganado: number
  /** Valor absoluto de la suma de los negativos. */
  perdido: number
  /** Ganado − Perdido. */
  neto: number
  netoValor: number
  /** BTC de los trades abiertos (aparte, no suman al neto). */
  abiertos: number
  abiertosValor: number
  pctGanadores: number
  gananciaMedia: number
  mejor: FilaTrade | null
  peor: FilaTrade | null
  /** Racha actual: >0 ganadores seguidos, <0 perdedores seguidos. */
  racha: number
  duracionMediaDias: number
  /** Acumulado tras cada trade cerrado (para la curva). */
  curva: { fecha: string; acumulado: number; pct: number }[]
}

export function totalesTrading(trades: Trade[], precios: PreciosBtc, vista: Moneda): TotalesTrading {
  const filas = filasTrades(trades, precios, vista)
  const cerr = filas.filter((x) => !x.calculo.abierto)
  const abi = filas.filter((x) => x.calculo.abierto)
  const ganado = cerr.reduce((s, x) => s + (x.btc > 0 ? x.btc : 0), 0)
  const perdido = cerr.reduce((s, x) => s + (x.btc < 0 ? -x.btc : 0), 0)
  const neto = ganado - perdido
  const abiertos = abi.reduce((s, x) => s + x.btc, 0)
  const n = cerr.length
  const pcts = cerr.map((x) => x.calculo.pct)
  let racha = 0
  for (let i = n - 1; i >= 0; i--) {
    const g = pcts[i] > 0 ? 1 : pcts[i] < 0 ? -1 : 0
    if (g === 0) break
    if (racha === 0) racha = g
    else if (Math.sign(racha) !== g) break
    else racha += g
  }
  const sorted = [...cerr].sort((a, b) => b.calculo.pct - a.calculo.pct)
  let corrido = 0
  return {
    nCerrados: n, nAbiertos: abi.length, ganado, perdido, neto, netoValor: neto * precios[vista], abiertos, abiertosValor: abiertos * precios[vista],
    pctGanadores: n ? pcts.filter((p) => p > 0).length / n : 0,
    gananciaMedia: n ? pcts.reduce((s, p) => s + p, 0) / n : 0,
    mejor: sorted[0] ?? null,
    peor: sorted.length ? sorted[sorted.length - 1] : null,
    racha,
    duracionMediaDias: n ? cerr.reduce((s, x) => s + diasEntre(x.trade.fechaInicio, x.trade.fechaCierre ?? x.trade.fechaInicio), 0) / n : 0,
    curva: cerr.map((x) => ({ fecha: x.trade.fechaCierre ?? x.trade.fechaInicio, acumulado: (corrido += x.btc), pct: x.calculo.pct })),
  }
}

/** Ganancia o pérdida (BTC) de los trades cerrados en el año, en EUR con el precio de BTC del día de cierre. */
export function informeTradingAnual(
  trades: Trade[], anio: number, precioEurDelDia: (fecha: string) => number | null,
): { filas: { fecha: string; btc: number; eur: number | null }[]; totalBtc: number; totalEur: number; sinPrecio: number } {
  const filas = ordenarTrades(trades)
    .filter((t) => t.estado === 'cerrado' && t.precioSalida != null && (t.fechaCierre ?? '').startsWith(`${anio}-`))
    .filter((t) => calcularTrade(t, t.precioSalida as number).btc != null)
    .map((t) => {
      const btc = calcularTrade(t, t.precioSalida as number).btc as number
      const fecha = t.fechaCierre as string
      const p = precioEurDelDia(fecha)
      return { fecha, btc, eur: p == null ? null : btc * p }
    })
  return { filas, totalBtc: filas.reduce((s, x) => s + x.btc, 0), totalEur: filas.reduce((s, x) => s + (x.eur ?? 0), 0), sinPrecio: filas.filter((x) => x.eur == null).length }
}

/** Avisos de trades abiertos: días abierto y % actual. */
export function tradeAbiertoSuperaDias(t: Trade, hoy: string, dias: number): boolean {
  return t.estado === 'abierto' && diasEntre(t.fechaInicio, hoy) > dias
}

/** Precio de BTC en EUR el día `fecha` con el histórico diario guardado [{t en ms, precio}]. null si no hay un punto a menos de 2 días. */
export function precioEurEnFecha(historico: { t: number; precio: number }[], fecha: string, actualEur?: number | null, hoy?: string): number | null {
  if (actualEur && hoy && fecha === hoy) return actualEur
  const objetivo = aMs(fecha) + MS_DIA / 2
  let mejor: { t: number; precio: number } | null = null
  for (const p of historico) if (!mejor || Math.abs(p.t - objetivo) < Math.abs(mejor.t - objetivo)) mejor = p
  return mejor && Math.abs(mejor.t - objetivo) <= 2 * MS_DIA ? mejor.precio : null
}

/**
 * % total del trading = neto / capital inicial (fracción). Preparado pero sin usar en pantalla hasta confirmarlo con el Excel real:
 * mientras tanto el resumen enseña el neto en BTC y su valor. null si no hay un capital inicial válido.
 */
export function pctTotalSobreCapital(netoBtc: number, capitalInicialBtc: number | null | undefined): number | null {
  return capitalInicialBtc != null && capitalInicialBtc > 0 ? netoBtc / capitalInicialBtc : null
}
