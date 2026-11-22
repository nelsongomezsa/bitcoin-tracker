// Velas OHLC a partir de series de precios [[t, precio], ...].
const DIA = 24 * 3600 * 1000

function agrupar(puntos, claveDe) {
  const grupos = new Map()
  for (const [t, p] of [...puntos].sort((a, b) => a[0] - b[0])) {
    const k = claveDe(t)
    const g = grupos.get(k)
    if (!g) grupos.set(k, { t: k, o: p, h: p, l: p, c: p })
    else {
      g.h = Math.max(g.h, p)
      g.l = Math.min(g.l, p)
      g.c = p
    }
  }
  return [...grupos.values()].map((g) => [g.t, g.o, g.h, g.l, g.c])
}

/** Velas diarias (inicio del día UTC en ms) a partir de puntos horarios. */
export const velasDiarias = (puntos) => agrupar(puntos, (t) => Math.floor(t / DIA) * DIA)

/** Velas semanales (semanas que empiezan en lunes UTC) a partir de puntos diarios. */
export const velasSemanales = (puntos) =>
  agrupar(puntos, (t) => {
    const d = Math.floor(t / DIA)
    const lunes = d - ((d + 3) % 7) // el día 0 (1-1-1970) fue jueves
    return lunes * DIA
  })
