import type { Moneda } from './calculos'

const nf = (min: number, max: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: min, maximumFractionDigits: max })
const SIMBOLO: Record<Moneda, string> = { EUR: '€', USD: '$', AUD: 'A$' }

export function dinero(n: number, m: Moneda = 'EUR', decimales = 2): string {
  return `${nf(decimales, decimales).format(n)} ${SIMBOLO[m]}`
}
/** Un importe que se redondea a cero no lleva signo (evita «−0,00 €»). */
const sinSigno = (n: number, decimales: number) => Math.abs(n) < 0.5 * 10 ** -decimales
export const dineroConSigno = (n: number, m: Moneda = 'EUR') => `${n > 0 && !sinSigno(n, 2) ? '+' : n < 0 && !sinSigno(n, 2) ? '−' : ''}${dinero(Math.abs(n), m)}`
export const btc = (n: number) => `${nf(0, 8).format(n)} BTC`
export const porcentaje = (n: number, dec = 2) => `${nf(dec, dec).format(n * 100)} %`
export const porcentajeConSigno = (n: number, dec = 2) => `${n > 0 && !sinSigno(n * 100, dec) ? '+' : n < 0 && !sinSigno(n * 100, dec) ? '−' : ''}${porcentaje(Math.abs(n), dec)}`
export const flecha = (n: number) => (n > 0 ? '▲' : n < 0 ? '▼' : '■')
export const claseSigno = (n: number) => (n > 0 ? 'gain' : n < 0 ? 'loss' : '')
export const OCULTO = '••••'

export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
export const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function horaCorta(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
}
/** BTC con signo explícito (+0,0089 BTC / −0,002 BTC). */
export const btcConSigno = (n: number) => `${n > 0 && Math.abs(n) >= 5e-9 ? '+' : n < 0 && Math.abs(n) >= 5e-9 ? '−' : ''}${nf(0, 8).format(Math.abs(n))} BTC`
