// Cartera 100% ficticia para el modo demo, los tests visuales y las capturas del README.
import type { Operacion, Plan, PuntoPrecio } from '../lib/calculos'
import type { AvisosDoc, Mercado, Objetivos, Perfil } from '../lib/tipos'

const DIA = 24 * 3600 * 1000

/** Serie de precios determinista (sin aleatoriedad): tendencia + ondas. */
export function historicoDemo(hoy = Date.now()): PuntoPrecio[] {
  const puntos: PuntoPrecio[] = []
  for (let i = 365; i >= 0; i--) {
    const t = Math.floor((hoy - i * DIA) / DIA) * DIA
    const k = 365 - i
    const precio = 52000 + k * 18 + Math.sin(k / 17) * 6500 + Math.sin(k / 5) * 1800
    puntos.push({ t, precio: Math.round(precio) })
  }
  return puntos
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

export function operacionesDemo(hoy = Date.now()): Operacion[] {
  const h = historicoDemo(hoy)
  const compra = (n: number, diasAtras: number, cantidad: number, plataforma = 'Exchange demo'): Operacion => {
    const p = h[h.length - 1 - diasAtras]
    return {
      id: `demo-${n}`, tipo: 'compra', fecha: iso(p.t), cantidad, comision: Math.round(cantidad * 0.0125 * 100) / 100,
      precio: p.precio, moneda: 'EUR', plataforma,
    }
  }
  return [
    compra(1, 300, 800), compra(2, 260, 250), compra(3, 220, 500), compra(4, 190, 150), compra(5, 150, 400),
    compra(6, 110, 300), compra(7, 80, 600), compra(8, 50, 100), compra(9, 28, 250), compra(10, 9, 200),
  ]
}

export const PERFIL_DEMO: Perfil = { nombre: 'Demo', monedaPreferida: 'EUR', modoPrivado: false }

export function planDemo(hoy = Date.now()): Plan {
  const precios = historicoDemo(hoy).map((p) => p.precio)
  const ref = precios[precios.length - 1]
  return {
    capital: 5000,
    nivelesClave: [
      { precio: Math.round(ref * 0.95), porcentajeCapital: 15 },
      { precio: Math.round(ref * 0.85), porcentajeCapital: 20 },
      { precio: Math.round(ref * 0.75), porcentajeCapital: 20 },
      { precio: Math.round(ref * 0.65), porcentajeCapital: 20 },
    ],
    dca: { inicio: iso(hoy - 21 * DIA), porcentajeSemanal: 1, semanas: 25 },
  }
}

export const OBJETIVOS_DEMO: Objetivos = { btcMeta: 0.1, dineroMeta: 5000, precioVenta: { modo: 'porcentaje', valor: 30 } }
export const AVISOS_DEMO: AvisosDoc = { ajustes: { nivelClave: { activo: true }, rentable: { activo: true }, variacion24h: { activo: true, umbral: 5 } }, tokens: [] }

export function mercadoDemo(hoy = Date.now()): Mercado {
  const h = historicoDemo(hoy)
  const eur = h[h.length - 1].precio
  const prev = h[h.length - 2].precio
  const sem = h[h.length - 8].precio
  return {
    precios: { EUR: eur, USD: Math.round(eur * 1.08), AUD: Math.round(eur * 1.65) },
    cambio24h: eur / prev - 1,
    cambio7d: eur / sem - 1,
    maximoHistorico: { EUR: Math.round(eur * 1.35), USD: Math.round(eur * 1.35 * 1.08), AUD: Math.round(eur * 1.35 * 1.65) },
    miedoCodicia: { valor: 54, clasificacion: 'Neutral' },
    athFecha: new Date(hoy - 120 * 86400000),
    actualizado: new Date(hoy),
  }
}

// ───── Documentos de mercado de ejemplo (modo demo) ─────
export function velasDemo(hoy = Date.now()) {
  const h = historicoDemo(hoy)
  const diarias = h.slice(-90).map((p, i, a) => {
    const prev = a[i - 1]?.precio ?? p.precio
    const alto = Math.max(prev, p.precio) * 1.012
    const bajo = Math.min(prev, p.precio) * 0.988
    return [p.t, prev, alto, bajo, p.precio]
  })
  const semanales: number[][] = []
  for (let i = 0; i < h.length - 6; i += 7) {
    const g = h.slice(i, i + 7)
    semanales.push([g[0].t, g[0].precio, Math.max(...g.map((x) => x.precio)), Math.min(...g.map((x) => x.precio)), g[g.length - 1].precio])
  }
  return { diarias, semanales: semanales.slice(-53) }
}

export function fngDemo(hoy = Date.now()) {
  const serie = Array.from({ length: 30 }, (_, i) => ({ t: hoy - (29 - i) * 86400000, v: Math.round(50 + Math.sin(i / 4) * 18 + (i - 15) * 0.3) }))
  return { valor: 54, clasificacion: 'Neutral', hace1d: 52, hace7d: 47, serie }
}

export const GLOBAL_DEMO = { dominanciaBtc: 57.4, capitalizacion: { eur: 2.05e12, usd: 2.21e12, aud: 3.38e12 } }
export const RED_DEMO = { altura: 905000, tarifas: { rapida: 6, media: 4, lenta: 2 }, diasHalving: 650, diasDesdeUltimo: 880, proximoBloque: 1050000 }

export function demoExtra(hoy = Date.now()): Record<string, unknown> {
  const h = 3600e3
  return {
    instituciones: {
      empresas: [
        { id: 'demo-a', nombre: 'Empresa Demo A', simbolo: 'DMA', pais: 'US', btc: 210000, valorUsd: 1.5e10, pctSuministro: 1.0 },
        { id: 'demo-b', nombre: 'Empresa Demo B', simbolo: 'DMB', pais: 'US', btc: 52000, valorUsd: 3.7e9, pctSuministro: 0.25 },
        { id: 'demo-c', nombre: 'Empresa Demo C', simbolo: 'DMC', pais: 'CA', btc: 30000, valorUsd: 2.1e9, pctSuministro: 0.14 },
      ],
      gobiernos: [{ id: 'demo-g', nombre: 'Gobierno Demo', simbolo: null, pais: 'XX', btc: 190000, valorUsd: 1.3e10, pctSuministro: 0.9 }],
      movimientos: [
        { entidad: 'Empresa Demo A', tipo: 'compra', btc: 1234, precioUsd: 64000, fecha: hoy - 20 * h },
        { entidad: 'Empresa Demo C', tipo: 'compra', btc: 300, precioUsd: 63500, fecha: hoy - 70 * h },
        { entidad: 'Empresa Demo B', tipo: 'venta', btc: 150, precioUsd: 66000, fecha: hoy - 130 * h },
      ],
      detalles: { 'demo-a': [[hoy - 400 * 86400000, 150000], [hoy - 200 * 86400000, 190000], [hoy, 210000]], 'demo-b': [[hoy - 300 * 86400000, 40000], [hoy, 52000]], 'demo-c': [[hoy - 300 * 86400000, 20000], [hoy, 30000]], 'demo-g': [[hoy - 300 * 86400000, 180000], [hoy, 190000]] },
    },
    ballenas: {
      umbralBtc: 500,
      movimientos: [
        { txid: 'd'.repeat(64), btc: 5200, bloque: 904998, hora: hoy - 0.4 * h },
        { txid: 'e'.repeat(64), btc: 1800, bloque: 904990, hora: hoy - 2 * h },
        { txid: 'f'.repeat(64), btc: 720, bloque: 904977, hora: hoy - 5 * h },
        { txid: '0'.repeat(64), btc: 515, bloque: 904961, hora: hoy - 9 * h },
      ],
    },
    carteras: {
      carteras: { 'demo-1': { nombre: 'Cartera pública de ejemplo', descripcion: 'Dato ficticio del modo demo.', fuente: '', saldoBtc: 12345.67 } },
      cambios: [],
    },
  }
}
