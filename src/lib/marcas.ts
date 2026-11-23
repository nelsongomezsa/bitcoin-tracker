// Marcas sobre las velas: compras (C), ventas (V), entradas y salidas de trades (E / S) y la línea que une cada trade.
import { convertir, type Moneda, type Operacion, type PreciosBtc } from './calculos'
import { calcularTrade, etiquetaTrade, type Trade } from './trading'
import { diaASegundos, velaDe, type Vela } from './velas'
import { btc as fBtc, dinero, fechaCorta, porcentajeConSigno } from './format'

export interface Marca {
  /** Tiempo de la vela donde se pinta (segundos). */
  time: number
  tipo: 'compra' | 'venta' | 'entrada' | 'salida'
  texto: 'C' | 'V' | 'E' | 'S'
  /** Texto que se muestra al tocar la marca: fecha, precio, cantidad y resultado. */
  detalle: string
  precio: number
  /** Qué se edita al tocar «Editar» en la ficha de la marca. */
  ref: { tipo: 'operacion' | 'trade'; id: string }
}
export interface LineaTrade { id: string; desde: { time: number; precio: number }; hasta: { time: number; precio: number }; gana: boolean }

export interface EntradaMarcas {
  velas: Pick<Vela, 'time'>[]
  /** Operaciones ya expresadas en `moneda`. */
  ops: Operacion[]
  trades: Trade[]
  moneda: Moneda
  precios: PreciosBtc | null
  verCompras: boolean
  verTrades: boolean
}

export function construirMarcas({ velas, ops, trades, moneda, precios, verCompras, verTrades }: EntradaMarcas): { marcas: Marca[]; lineas: LineaTrade[] } {
  const marcas: Marca[] = []
  const lineas: LineaTrade[] = []
  if (!velas.length) return { marcas, lineas }
  const aMoneda = (p: number, de: Moneda) => (precios ? convertir(p, de, moneda, precios) : p)

  if (verCompras) {
    for (const o of ops) {
      const time = velaDe(velas, diaASegundos(o.fecha))
      if (time == null) continue
      const esCompra = o.tipo === 'compra'
      marcas.push({
        time, tipo: o.tipo, texto: esCompra ? 'C' : 'V', precio: o.precio, ref: { tipo: 'operacion', id: o.id },
        detalle: `${esCompra ? 'Compra' : 'Venta'} · ${fechaCorta(o.fecha)} · precio ${dinero(o.precio, moneda, 0)} · ${esCompra ? 'metido' : 'recibido'} ${dinero(o.cantidad, moneda)} (${fBtc(esCompra ? (o.cantidad - o.comision) / o.precio : (o.cantidad + o.comision) / o.precio)})`,
      })
    }
  }
  if (verTrades) {
    for (const t of trades) {
      const ent = velaDe(velas, diaASegundos(t.fechaInicio))
      const pEnt = aMoneda(t.precioEntrada, t.moneda)
      const dir = etiquetaTrade(t)
      const c = calcularTrade(t, precios?.[t.moneda] ?? t.precioEntrada)
      const res = `${porcentajeConSigno(c.pct)}${c.btc != null ? ` · ${c.btc >= 0 ? '+' : '−'}${fBtc(Math.abs(c.btc))}` : ''}`
      if (ent != null) marcas.push({ time: ent, tipo: 'entrada', texto: 'E', precio: pEnt, ref: { tipo: 'trade', id: t.id }, detalle: `Entrada ${dir} · ${fechaCorta(t.fechaInicio)} · precio ${dinero(pEnt, moneda, 0)}${t.margenBTC != null ? ` · margen ${fBtc(t.margenBTC)}` : ''}${c.abierto ? ` · sin cerrar: ${res}` : ''}` })
      if (t.estado === 'cerrado' && t.fechaCierre && t.precioSalida != null) {
        const sal = velaDe(velas, diaASegundos(t.fechaCierre))
        const pSal = aMoneda(t.precioSalida, t.moneda)
        if (sal != null) marcas.push({ time: sal, tipo: 'salida', texto: 'S', precio: pSal, ref: { tipo: 'trade', id: t.id }, detalle: `Salida ${dir} · ${fechaCorta(t.fechaCierre)} · precio ${dinero(pSal, moneda, 0)} · resultado ${res}` })
        if (ent != null && sal != null && sal > ent) lineas.push({ id: t.id, desde: { time: ent, precio: pEnt }, hasta: { time: sal, precio: pSal }, gana: c.pct >= 0 })
      }
    }
  }
  marcas.sort((a, b) => a.time - b.time)
  return { marcas, lineas }
}

export interface GrupoMarcas {
  /** Vela donde se pinta el marcador del grupo (la de su primera marca). */
  time: number
  marcas: Marca[]
}

/**
 * Agrupa marcas que se solaparían en pantalla: las que están a menos de `distanciaPx` de la primera marca del grupo (la posición en píxeles
 * la da `xDe`; null si no se puede calcular, y entonces la marca va sola). Un grupo de varias se pinta como un solo marcador con el número.
 * Las marcas deben venir ordenadas por tiempo; los grupos salen en ese mismo orden.
 */
export function agruparMarcas(marcas: Marca[], xDe: (time: number) => number | null, distanciaPx = 18): GrupoMarcas[] {
  const grupos: (GrupoMarcas & { x: number | null })[] = []
  for (const m of marcas) {
    const x = xDe(m.time)
    const ultimo = grupos.at(-1)
    if (ultimo && x != null && ultimo.x != null && Math.abs(x - ultimo.x) < distanciaPx) ultimo.marcas.push(m)
    else grupos.push({ time: m.time, marcas: [m], x })
  }
  return grupos.map(({ time, marcas: ms }) => ({ time, marcas: ms }))
}
