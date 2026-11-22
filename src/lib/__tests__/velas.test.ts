import { describe, expect, it } from 'vitest'
import { aVelas, diaASegundos, factorDesdeEur, fusionarVelas, mediaMovil, rendimiento, velaDe, type Vela } from '../velas'

const v = (time: number, close: number): Vela => ({ time, open: close, high: close, low: close, close, volume: 1 })

describe('media móvil', () => {
  it('MA(3) de 1..5 = 2,3,4 y empieza en la 3.ª vela', () => {
    const r = mediaMovil([1, 2, 3, 4, 5].map((c, i) => v(i, c)), 3)
    expect(r).toEqual([{ time: 2, value: 2 }, { time: 3, value: 3 }, { time: 4, value: 4 }])
  })
  it('MA(1) = cierre; sin datos suficientes o n inválido = vacío', () => {
    expect(mediaMovil([v(0, 5), v(1, 7)], 1).map((x) => x.value)).toEqual([5, 7])
    expect(mediaMovil([v(0, 5)], 7)).toEqual([])
    expect(mediaMovil([v(0, 5)], 0)).toEqual([])
    expect(mediaMovil([v(0, 5)], 1.5)).toEqual([])
  })
  it('coincide con el cálculo directo (MA 7, 25 y 99)', () => {
    const velas = Array.from({ length: 150 }, (_, i) => v(i * 60, 50000 + Math.sin(i / 7) * 1500 + i * 3))
    for (const n of [7, 25, 99]) {
      const r = mediaMovil(velas, n)
      expect(r).toHaveLength(150 - n + 1)
      r.forEach((p, k) => {
        const directo = velas.slice(k, k + n).reduce((s, x) => s + x.close, 0) / n
        expect(p.value).toBeCloseTo(directo, 6)
      })
    }
  })
})

describe('velas', () => {
  it('fusionar: las nuevas sustituyen, orden y sin repetidos', () => {
    const r = fusionarVelas([v(1, 1), v(2, 2), v(3, 3)], [v(3, 30), v(4, 4)])
    expect(r.map((x) => [x.time, x.close])).toEqual([[1, 1], [2, 2], [3, 30], [4, 4]])
    expect(fusionarVelas([v(1, 1), v(2, 2), v(3, 3)], [], 2).map((x) => x.time)).toEqual([2, 3])
  })
  it('vela que contiene un instante', () => {
    const velas = [v(100, 1), v(200, 1), v(300, 1)]
    expect(velaDe(velas, 250)).toBe(200)
    expect(velaDe(velas, 300)).toBe(300)
    expect(velaDe(velas, 99)).toBeNull()
    expect(velaDe(velas, 9999)).toBe(300)
    expect(velaDe([], 5)).toBeNull()
  })
  it('conversión de moneda y filas', () => {
    expect(aVelas([[1, 10, 12, 9, 11, 3]], 2)[0]).toEqual({ time: 1, open: 20, high: 24, low: 18, close: 22, volume: 3 })
    expect(factorDesdeEur('AUD', { EUR: 100, USD: 110, AUD: 165 })).toBeCloseTo(1.65)
    expect(factorDesdeEur('EUR', null)).toBe(1)
    expect(diaASegundos('2025-03-01')).toBe(Date.parse('2025-03-01T12:00:00Z') / 1000)
  })
})

describe('rendimiento por periodos', () => {
  const ahora = Date.parse('2025-06-30T12:00:00Z')
  const hist = Array.from({ length: 366 }, (_, i) => ({ t: ahora - (365 - i) * 86_400_000, precio: 50000 + i * 100 }))
  it('compara con el precio de hace N días', () => {
    const actual = hist.at(-1)!.precio
    expect(rendimiento(hist, actual, 7, ahora)).toBeCloseTo(actual / hist[365 - 7].precio - 1, 10)
    expect(rendimiento(hist, actual, 365, ahora)).toBeCloseTo(actual / hist[0].precio - 1, 10)
  })
  it('null si no hay dato cercano o precio no válido', () => {
    expect(rendimiento([], 1, 7, ahora)).toBeNull()
    expect(rendimiento(hist.slice(-3), 1, 365, ahora)).toBeNull()
    expect(rendimiento(hist, 0, 7, ahora)).toBeNull()
  })
})

import { velasDeSerie } from '../velas'
describe('velas de una serie', () => {
  it('agrupa por días: apertura, máximo, mínimo y cierre', () => {
    const p = [10, 14, 9, 12, 20, 18, 5, 7].map((valor, i) => ({ fecha: `2025-03-${String(i + 1).padStart(2, '0')}`, valor }))
    const r = velasDeSerie(p, 7)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ open: 10, high: 20, low: 5, close: 5 })
    expect(r[0].time).toBe(Date.parse('2025-03-01T00:00:00Z') / 1000)
    expect(r[1]).toMatchObject({ open: 7, high: 7, low: 7, close: 7 })
    expect(velasDeSerie([], 7)).toEqual([])
  })
})
