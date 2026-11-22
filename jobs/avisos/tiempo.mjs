/** Fecha y hora locales de una zona horaria. Si la zona no es válida, usa Europe/Madrid. */
export function local(ms, zona) {
  let z = zona
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: z })
  } catch {
    z = 'Europe/Madrid'
  }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  )
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    anio: Number(p.year), mes: Number(p.month), dia: Number(p.day),
    hora: Number(p.hour), minuto: Number(p.minute),
    diaSemana: dias[p.weekday],
  }
}

/** ¿Está `hora` dentro del tramo de silencio [desde, hasta)? Admite tramos que cruzan la medianoche. */
export function enSilencio(g, ahora) {
  if (!g.silencioActivo) return false
  const h = local(ahora, g.zona).hora
  const { silencioDesde: d, silencioHasta: a } = g
  if (d === a) return false
  return d < a ? h >= d && h < a : h >= d || h < a
}
