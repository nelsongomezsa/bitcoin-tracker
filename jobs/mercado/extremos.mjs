// Máximos y mínimos del mes y del año en curso (en EUR). El job diario los inicializa con el histórico.
const mesDe = (ms) => new Date(ms).toISOString().slice(0, 7)
const anioDe = (ms) => new Date(ms).toISOString().slice(0, 4)

/** Devuelve { cambiado, datos } con los extremos actualizados con el precio actual. */
export function actualizarExtremos(estad, precio, ahora) {
  const ex = estad?.extremos ?? {}
  const mes = ex.mes?.clave === mesDe(ahora) ? { ...ex.mes } : { clave: mesDe(ahora), max: precio, min: precio }
  const anio = ex.anio?.clave === anioDe(ahora) ? { ...ex.anio } : { clave: anioDe(ahora), max: precio, min: precio }
  let cambiado = !estad?.extremos || ex.mes?.clave !== mes.clave || ex.anio?.clave !== anio.clave
  for (const p of [mes, anio]) {
    if (precio > p.max) { p.max = precio; cambiado = true }
    if (precio < p.min) { p.min = precio; cambiado = true }
  }
  return { cambiado, datos: { extremos: { mes, anio } } }
}

/** Extremos calculados con el histórico diario [[t, precio], ...]. */
export function extremosDeHistorico(puntos, ahora) {
  const calc = (filtro) => {
    const v = puntos.filter(([t]) => filtro(t)).map(([, p]) => p)
    return v.length ? { max: Math.max(...v), min: Math.min(...v) } : { max: 0, min: 0 }
  }
  return {
    mes: { clave: mesDe(ahora), ...calc((t) => mesDe(t) === mesDe(ahora)) },
    anio: { clave: anioDe(ahora), ...calc((t) => anioDe(t) === anioDe(ahora)) },
  }
}

/** Precio de referencia hace `dias` días (el punto diario más cercano). */
export function precioHace(puntos, dias, ahora) {
  if (!puntos.length) return null
  const objetivo = ahora - dias * 24 * 3600 * 1000
  return puntos.reduce((mejor, p) => (Math.abs(p[0] - objetivo) < Math.abs(mejor[0] - objetivo) ? p : mejor))[1]
}
