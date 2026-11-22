import type { Operacion } from './calculos'

export const PLATAFORMAS = ['Revolut', 'Binance', 'Coinbase', 'Kraken', 'Bit2Me'] as const
const CLAVE = 'btc.ultimaPlataforma'

export function ultimaPlataforma(): string {
  try { return localStorage.getItem(CLAVE) ?? '' } catch { return '' }
}
export function recordarPlataforma(p: string): void {
  try { localStorage.setItem(CLAVE, p) } catch { /* sin almacenamiento */ }
}

/** Comisión habitual en una plataforma: media (en %) de sus últimas 5 compras. */
export function comisionHabitualPct(ops: Operacion[], plataforma: string): number | null {
  const r = ops
    .filter((o) => o.tipo === 'compra' && o.plataforma === plataforma && o.cantidad > 0)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, 5)
  if (!r.length) return null
  return r.reduce((s, o) => s + o.comision / o.cantidad, 0) / r.length
}

/** Comisión media por plataforma (en % de lo metido), con el nº de compras. */
export function comisionPorPlataforma(ops: Operacion[]) {
  const m = new Map<string, { n: number; cantidad: number; comision: number }>()
  for (const o of ops) {
    if (o.tipo !== 'compra') continue
    const k = o.plataforma || 'Sin indicar'
    const v = m.get(k) ?? { n: 0, cantidad: 0, comision: 0 }
    v.n++; v.cantidad += o.cantidad; v.comision += o.comision
    m.set(k, v)
  }
  return [...m.entries()].map(([plataforma, v]) => ({ plataforma, compras: v.n, comision: v.comision, pct: v.cantidad > 0 ? v.comision / v.cantidad : 0 })).sort((a, b) => a.pct - b.pct)
}
