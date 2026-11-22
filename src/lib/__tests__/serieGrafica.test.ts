import { describe, expect, it } from 'vitest'
import { prepararMarcas, prepararSerie, type Periodo } from '../serieGrafica'

const DIA = 86400000
// Forma real de mercado/historico: un punto por día a las 00:00 UTC y un último punto con la hora actual (mismo día).
const AHORA = Date.parse('2026-11-22T02:50:50Z')
function historicoReal(dias = 365) {
  const h = []
  for (let i = dias; i >= 0; i--) {
    const t = Date.UTC(2026, 10, 22) - i * DIA // 00:00 UTC
    h.push({ t, precio: 50000 + (dias - i) * 10 })
  }
  h.push({ t: AHORA - 120000, precio: 54184.64 }) // último punto: ya hoy, 2 minutos antes de "ahora"
  return h
}
const serie = (periodo: Periodo, extra: Partial<Parameters<typeof prepararSerie>[0]> = {}) =>
  prepararSerie({ historico: historicoReal(), precioActual: 54200, ahoraMs: AHORA, periodo, ...extra })
const estrictamenteCreciente = (s: { time: number }[]) => s.every((p, i) => i === 0 || p.time > s[i - 1].time)

describe('prepararSerie', () => {
  it('usa segundos (no milisegundos) como tiempo', () => {
    for (const p of serie('Todo')) {
      expect(Number.isInteger(p.time)).toBe(true)
      expect(p.time).toBeLessThan(4_000_000_000) // en ms sería ~1,8e12
      expect(p.time).toBeGreaterThan(1_000_000_000)
    }
  })

  it('el histórico real (último punto el mismo día que el anterior) sale sin repetidos y en orden, en todos los periodos', () => {
    for (const p of ['1D', '1S', '1M', '1A', 'Todo'] as Periodo[]) {
      const s = serie(p)
      expect(estrictamenteCreciente(s)).toBe(true)
      expect(s.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('ordena una entrada desordenada y elimina duplicados exactos (gana el último)', () => {
    const h = [{ t: 3 * DIA, precio: 30 }, { t: 1 * DIA, precio: 10 }, { t: 2 * DIA, precio: 20 }, { t: 2 * DIA, precio: 21 }]
    const s = prepararSerie({ historico: h, ahoraMs: 10 * DIA, periodo: 'Todo' })
    expect(s.map((p) => p.value)).toEqual([10, 21, 30])
    expect(estrictamenteCreciente(s)).toBe(true)
  })

  it('el último punto es el precio actual, en el instante actual', () => {
    const s = serie('Todo')
    expect(s.at(-1)).toEqual({ time: Math.floor(AHORA / 1000), value: 54200 })
    expect(serie('1S').at(-1)!.value).toBe(54200)
  })

  it('sustituye el punto "de hoy" del job por el precio actual y conserva el de las 00:00', () => {
    const s = serie('Todo')
    const hoy = s.filter((p) => p.time >= Date.UTC(2026, 10, 22) / 1000)
    expect(hoy.map((p) => p.time)).toEqual([Date.UTC(2026, 10, 22) / 1000, Math.floor(AHORA / 1000)])
  })

  it('sin precio actual deja el histórico tal cual (sin repetir)', () => {
    const s = serie('Todo', { precioActual: null })
    expect(estrictamenteCreciente(s)).toBe(true)
    expect(s.at(-1)!.value).toBeCloseTo(54184.64, 5)
  })

  it('recorta por periodo con el histórico diario', () => {
    const n = (p: Periodo) => serie(p).length
    expect(n('1D')).toBe(3) // ancla (ayer 00:00) + hoy 00:00 + ahora
    expect(n('1S')).toBeGreaterThanOrEqual(8)
    expect(n('1S')).toBeLessThanOrEqual(10)
    expect(n('1M')).toBeGreaterThanOrEqual(31)
    expect(n('1M')).toBeLessThanOrEqual(33)
    expect(n('1A')).toBeGreaterThanOrEqual(366)
    expect(n('1S')).toBeLessThan(n('1M'))
    expect(n('1M')).toBeLessThan(n('1A'))
  })

  it('Todo usa todo el histórico disponible', () => {
    const h = historicoReal(500)
    const s = prepararSerie({ historico: h, precioActual: 54200, ahoraMs: AHORA, periodo: 'Todo' })
    expect(s[0].time).toBe(Math.floor(h[0].t / 1000))
    expect(s.length).toBe(501 + 1) // 501 días a las 00:00 + el precio actual (el punto del job se sustituye)
  })

  it('el primer punto de cada periodo cubre el inicio del periodo', () => {
    const ahora = Math.floor(AHORA / 1000)
    expect(serie('1S')[0].time).toBeLessThanOrEqual(ahora - 7 * 86400 + 86400) // ancla como mucho a 8 días
    expect(serie('1S')[0].time).toBeGreaterThanOrEqual(ahora - 9 * 86400)
  })

  it('aplica el factor de moneda a todos los puntos', () => {
    const eur = serie('1M')
    const usd = serie('1M', { factor: 1.1 })
    expect(usd.length).toBe(eur.length)
    expect(usd.at(-1)!.value).toBeCloseTo(54200 * 1.1, 6)
    expect(usd[0].value).toBeCloseTo(eur[0].value * 1.1, 6)
  })

  it('ignora valores no válidos y puntos del futuro', () => {
    const h = [{ t: AHORA - 5 * DIA, precio: 100 }, { t: AHORA - 4 * DIA, precio: NaN }, { t: AHORA - 3 * DIA, precio: -1 }, { t: AHORA + 3 * DIA, precio: 999 }, { t: AHORA - 2 * DIA, precio: 120 }]
    const s = prepararSerie({ historico: h, ahoraMs: AHORA, periodo: 'Todo' })
    expect(s.map((p) => p.value)).toEqual([100, 120])
  })

  it('con histórico vacío y precio actual devuelve solo el precio actual', () => {
    expect(prepararSerie({ historico: [], precioActual: 50000, ahoraMs: AHORA, periodo: '1A' })).toEqual([{ time: Math.floor(AHORA / 1000), value: 50000 }])
  })
})

describe('prepararMarcas', () => {
  const s = serie('1A')
  const tiempoDelDia = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000

  it('cada compra cae en el punto de su día', () => {
    const m = prepararMarcas([{ fecha: '2026-11-10', tipo: 'compra' }, { fecha: '2026-06-01', tipo: 'venta' }], s)
    expect(m).toEqual([{ time: tiempoDelDia('2026-06-01'), tipo: 'venta' }, { time: tiempoDelDia('2026-11-10'), tipo: 'compra' }])
  })

  it('todas las marcas coinciden con un tiempo existente de la serie y salen en orden', () => {
    const ops = [{ fecha: '2026-11-22', tipo: 'compra' as const }, { fecha: '2026-03-03', tipo: 'compra' as const }, { fecha: '2026-11-22', tipo: 'compra' as const }]
    const m = prepararMarcas(ops, s)
    const tiempos = new Set(s.map((p) => p.time))
    expect(m.every((x) => tiempos.has(x.time))).toBe(true)
    expect(m.map((x) => x.time)).toEqual([...m.map((x) => x.time)].sort((a, b) => a - b))
    expect(m).toHaveLength(3) // dos el mismo día: ambas marcas se conservan
  })

  it('una compra de hoy se pega al punto de las 00:00 de hoy', () => {
    expect(prepararMarcas([{ fecha: '2026-11-22', tipo: 'compra' }], s)[0].time).toBe(tiempoDelDia('2026-11-22'))
  })

  it('omite las compras fuera del rango visible', () => {
    const s1s = serie('1S')
    const m = prepararMarcas([{ fecha: '2026-01-05', tipo: 'compra' }, { fecha: '2026-11-20', tipo: 'compra' }, { fecha: '2027-01-01', tipo: 'compra' }], s1s)
    expect(m.map((x) => x.time)).toEqual([tiempoDelDia('2026-11-20')])
  })

  it('si el día no tiene punto propio usa el anterior más cercano', () => {
    const rala = [{ time: tiempoDelDia('2026-11-01'), value: 1 }, { time: tiempoDelDia('2026-11-05'), value: 2 }]
    expect(prepararMarcas([{ fecha: '2026-11-03', tipo: 'compra' }], rala)).toEqual([{ time: tiempoDelDia('2026-11-01'), tipo: 'compra' }])
  })

  it('serie vacía: sin marcas', () => {
    expect(prepararMarcas([{ fecha: '2026-11-03', tipo: 'compra' }], [])).toEqual([])
  })
})
