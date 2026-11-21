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
    actualizado: new Date(hoy),
  }
}
