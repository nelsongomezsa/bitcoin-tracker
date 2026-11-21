// Lógica pura de avisos (sin I/O) para poder probarla. Los avisos son información, nunca recomendaciones.
const fmt = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n)
const fmtPct = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n)

/** Clave válida como nombre de campo de Firestore. */
export const claveSegura = (c) => c.replace(/[^A-Za-z0-9_]/g, '_')

export const COOLDOWN_MS = 24 * 3600 * 1000

/**
 * @param {{prev: number|null, precio: number, cambio24h: number, cambio7d: number, fng: number|null}} m  (precio en EUR; cambios como fracción)
 * @param {{ajustes?: Record<string,{activo:boolean, umbral?:number}>, resumen?: any}} u
 * @returns {{clave: string, titulo: string, texto: string}[]}
 */
export function avisosDeMercado(m, u) {
  const a = u.ajustes ?? {}
  const r = u.resumen
  const out = []
  const on = (k) => a[k]?.activo === true

  if (on('nivelClave') && r?.nivelesPendientes && m.prev != null) {
    for (const n of r.nivelesPendientes) {
      if (m.prev > n && m.precio <= n) {
        out.push({ clave: `nivelClave:${n}`, titulo: 'Nivel clave', texto: `BTC ha tocado ${fmt(n)} €, tu próximo precio clave.` })
      }
    }
  }
  if (on('rentable') && r?.precioMedio > 0 && r.btc > 0 && m.prev != null) {
    if (m.prev < r.precioMedio && m.precio >= r.precioMedio) {
      out.push({ clave: 'rentable:sube', titulo: 'Vuelves a estar en positivo', texto: `Vuelves a estar en positivo: BTC supera tu precio medio de ${fmt(r.precioMedio)} €.` })
    } else if (m.prev >= r.precioMedio && m.precio < r.precioMedio) {
      out.push({ clave: 'rentable:baja', titulo: 'Dejas de estar en positivo', texto: `BTC ha bajado de tu precio medio de ${fmt(r.precioMedio)} €.` })
    }
  }
  if (on('variacion24h')) {
    const u24 = (a.variacion24h.umbral ?? 5) / 100
    if (Math.abs(m.cambio24h) >= u24) out.push({ clave: `variacion24h:${m.cambio24h > 0 ? 'sube' : 'baja'}`, titulo: 'Movimiento en 24 h', texto: `BTC ${m.cambio24h > 0 ? 'sube' : 'baja'} un ${fmtPct(Math.abs(m.cambio24h) * 100)} % en 24 horas.` })
  }
  if (on('variacion7d')) {
    const u7 = (a.variacion7d.umbral ?? 10) / 100
    if (Math.abs(m.cambio7d) >= u7) out.push({ clave: `variacion7d:${m.cambio7d > 0 ? 'sube' : 'baja'}`, titulo: 'Movimiento en 7 días', texto: `BTC ${m.cambio7d > 0 ? 'sube' : 'baja'} un ${fmtPct(Math.abs(m.cambio7d) * 100)} % en 7 días.` })
  }
  if (on('miedoExtremo') && m.fng != null && m.fng <= (a.miedoExtremo.umbral ?? 20)) {
    out.push({ clave: 'miedoExtremo', titulo: 'Miedo extremo', texto: `El índice de miedo y codicia marca ${m.fng} (miedo extremo).` })
  }
  if (on('precioObjetivo') && r?.precioObjetivo > 0 && m.prev != null && m.prev < r.precioObjetivo && m.precio >= r.precioObjetivo) {
    out.push({ clave: 'precioObjetivo', titulo: 'Precio objetivo', texto: `BTC ha alcanzado tu precio de venta objetivo de ${fmt(r.precioObjetivo)} €.` })
  }
  return out
}

/** Avisos programados. `hoy` es una Date en UTC. */
export function avisosDiarios(hoy, u) {
  const a = u.ajustes ?? {}
  const r = u.resumen
  const out = []
  const on = (k) => a[k]?.activo === true
  if (on('dcaSemanal') && hoy.getUTCDay() === 1) {
    out.push({ clave: 'dcaSemanal', titulo: 'Compra semanal', texto: 'Recordatorio: hoy toca tu compra semanal del plan.' })
  }
  if (hoy.getUTCDate() === 1) {
    if (on('resumenMensual') && r?.mesAnterior) {
      const m = r.mesAnterior
      out.push({
        clave: `resumenMensual:${m.mes}`, titulo: 'Resumen del mes',
        texto: `Metiste ${fmt(m.metido)} € el mes pasado. Tu precio medio pasó de ${fmt(m.medioAntes)} € a ${fmt(m.medioDespues)} € y la rentabilidad es ${fmtPct(m.rentabilidad * 100)} %.`,
      })
    }
    if (on('copiaSeguridad')) {
      out.push({ clave: `copiaSeguridad:${hoy.toISOString().slice(0, 7)}`, titulo: 'Copia de seguridad', texto: 'Recordatorio mensual: exporta una copia de tus operaciones desde Ajustes.' })
    }
  }
  return out
}

/** Quita los avisos ya enviados en las últimas 24 h (por tipo y nivel). */
export function filtrarRepetidos(avisos, enviados = {}, ahora = Date.now()) {
  return avisos.filter((x) => !(enviados[claveSegura(x.clave)] && ahora - enviados[claveSegura(x.clave)] < COOLDOWN_MS))
}
