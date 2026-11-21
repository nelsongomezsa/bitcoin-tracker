import { describe, expect, it } from 'vitest'
import { avisosDeMercado, avisosDiarios, filtrarRepetidos } from '../alertas.mjs'

const u = (ajustes, resumen = { precioMedio: 50000, btc: 0.1, nivelesPendientes: [40000, 30000], precioObjetivo: 70000 }) => ({ ajustes, resumen })
const base = { prev: 45000, precio: 45000, cambio24h: 0, cambio7d: 0, fng: 50 }

describe('avisos de mercado', () => {
  it('nivel clave: solo al cruzar hacia abajo', () => {
    const a = avisosDeMercado({ ...base, prev: 40500, precio: 39900 }, u({ nivelClave: { activo: true } }))
    expect(a.map((x) => x.clave)).toEqual(['nivelClave:40000'])
    expect(a[0].texto).toContain('40.000')
    expect(avisosDeMercado({ ...base, prev: 39000, precio: 39500 }, u({ nivelClave: { activo: true } }))).toHaveLength(0)
  })
  it('rentable al cruzar el precio medio en ambos sentidos', () => {
    expect(avisosDeMercado({ ...base, prev: 49000, precio: 50100 }, u({ rentable: { activo: true } }))[0].clave).toBe('rentable:sube')
    expect(avisosDeMercado({ ...base, prev: 50100, precio: 49000 }, u({ rentable: { activo: true } }))[0].clave).toBe('rentable:baja')
  })
  it('variación con umbral configurable', () => {
    expect(avisosDeMercado({ ...base, cambio24h: -0.06 }, u({ variacion24h: { activo: true, umbral: 5 } }))).toHaveLength(1)
    expect(avisosDeMercado({ ...base, cambio24h: -0.06 }, u({ variacion24h: { activo: true, umbral: 8 } }))).toHaveLength(0)
  })
  it('miedo extremo y precio objetivo', () => {
    expect(avisosDeMercado({ ...base, fng: 15 }, u({ miedoExtremo: { activo: true } }))).toHaveLength(1)
    expect(avisosDeMercado({ ...base, prev: 69000, precio: 70500 }, u({ precioObjetivo: { activo: true } }))).toHaveLength(1)
  })
  it('sin interruptores activos no hay avisos', () => {
    expect(avisosDeMercado({ ...base, prev: 40500, precio: 39000, cambio24h: -0.2, fng: 5 }, u({}))).toHaveLength(0)
  })
})

describe('avisos diarios', () => {
  it('DCA los lunes', () => {
    expect(avisosDiarios(new Date('2025-06-02T08:00:00Z'), u({ dcaSemanal: { activo: true } }))).toHaveLength(1)
    expect(avisosDiarios(new Date('2025-06-03T08:00:00Z'), u({ dcaSemanal: { activo: true } }))).toHaveLength(0)
  })
  it('resumen mensual y copia el día 1', () => {
    const r = { precioMedio: 1, btc: 1, nivelesPendientes: [], precioObjetivo: null, mesAnterior: { mes: '2025-05', metido: 300, medioAntes: 50000, medioDespues: 48000, rentabilidad: 0.05 } }
    const a = avisosDiarios(new Date('2025-06-01T08:00:00Z'), u({ resumenMensual: { activo: true }, copiaSeguridad: { activo: true } }, r))
    expect(a).toHaveLength(2)
    expect(avisosDiarios(new Date('2025-06-02T08:00:00Z'), u({ resumenMensual: { activo: true } }, r))).toHaveLength(0)
  })
})

describe('no repetir', () => {
  it('máximo uno por tipo y nivel cada 24 h', () => {
    const av = [{ clave: 'nivelClave:40000' }, { clave: 'nivelClave:30000' }]
    const ahora = Date.now()
    expect(filtrarRepetidos(av, { nivelClave_40000: ahora - 3600_000 }, ahora)).toEqual([{ clave: 'nivelClave:30000' }])
    expect(filtrarRepetidos(av, { nivelClave_40000: ahora - 25 * 3600_000 }, ahora)).toHaveLength(2)
  })
})
