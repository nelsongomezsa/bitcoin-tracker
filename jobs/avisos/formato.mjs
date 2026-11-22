const SIMBOLO = { EUR: '€', USD: '$', AUD: 'A$' }
const n0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const n1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

export const dinero = (n, m = 'EUR') => `${n0.format(n)} ${SIMBOLO[m] ?? m}`
export const pct = (fraccion) => `${n1.format(Math.abs(fraccion) * 100)} %`
export const pctSigno = (fraccion) => `${fraccion >= 0 ? '+' : '−'}${pct(fraccion)}`
export const num = (n) => n0.format(n)

/** Convierte un importe en EUR a otra moneda usando el cociente de precios de BTC. */
export function aMoneda(eur, moneda, precios) {
  return moneda === 'EUR' || !precios?.EUR ? eur : (eur * precios[moneda]) / precios.EUR
}
export function deMoneda(importe, moneda, precios) {
  return moneda === 'EUR' || !precios?.[moneda] ? importe : (importe * precios.EUR) / precios[moneda]
}
