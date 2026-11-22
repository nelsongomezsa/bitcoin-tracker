import { describe, expect, it } from 'vitest'
import { planificarEntrega } from '../avisos/entrega.mjs'
import { estadoInicial } from '../avisos/evaluadores.mjs'
import { enSilencio, local } from '../avisos/tiempo.mjs'

const A = (clave, extra = {}) => ({ clave, titulo: `T ${clave}`, texto: `texto ${clave}`, prioridad: 'normal', ...extra })
const base = { push: true, telegram: false }
const g = (o = {}) => ({ zona: 'Europe/Madrid', limiteDiario: 10, silencioActivo: false, silencioDesde: 22, silencioHasta: 8, ...o })
const T = (iso) => Date.parse(iso)

describe('zona horaria y silencio', () => {
  it('hora local y tramo que cruza la medianoche', () => {
    expect(local(T('2025-06-02T21:30:00Z'), 'Europe/Madrid').hora).toBe(23)
    expect(local(T('2025-06-02T21:30:00Z'), 'America/Mexico_City').hora).toBe(15)
    const s = g({ silencioActivo: true })
    expect(enSilencio(s, T('2025-06-02T21:30:00Z'))).toBe(true) // 23:30 Madrid
    expect(enSilencio(s, T('2025-06-03T05:00:00Z'))).toBe(true) // 07:00
    expect(enSilencio(s, T('2025-06-03T06:30:00Z'))).toBe(false) // 08:30
    expect(enSilencio(g(), T('2025-06-02T21:30:00Z'))).toBe(false) // desactivado
  })
  it('zona inválida: usa Madrid', () => {
    expect(local(T('2025-06-02T10:00:00Z'), 'No/Existe').hora).toBe(12)
  })
})

describe('entrega', () => {
  it('agrupa varios avisos en un solo mensaje', () => {
    const est = estadoInicial()
    const r = planificarEntrega({ avisos: [A('a'), A('b'), A('c')], estado: est, general: g(), ahora: T('2025-06-02T10:00:00Z'), canales: base })
    expect(r.push.titulo).toBe('3 avisos')
    expect(r.push.texto).toContain('texto a · texto b')
    expect(planificarEntrega({ avisos: [A('x')], estado: estadoInicial(), general: g(), ahora: T('2025-06-02T10:00:00Z'), canales: base }).push.titulo).toBe('T x')
  })
  it('no repite dentro del periodo de espera', () => {
    const est = estadoInicial()
    const ahora = T('2025-06-02T10:00:00Z')
    planificarEntrega({ avisos: [A('a')], estado: est, general: g(), ahora, canales: base })
    expect(planificarEntrega({ avisos: [A('a')], estado: est, general: g(), ahora: ahora + 3600e3, canales: base }).push).toBeNull()
    expect(planificarEntrega({ avisos: [A('a')], estado: est, general: g(), ahora: ahora + 25 * 3600e3, canales: base }).push).not.toBeNull()
  })
  it('silencio: lo normal se acumula y sale en un resumen al terminar; lo urgente salta', () => {
    const est = estadoInicial()
    const s = g({ silencioActivo: true })
    const noche = T('2025-06-02T21:30:00Z')
    const r1 = planificarEntrega({ avisos: [A('n1'), A('n2'), A('u', { prioridad: 'urgente' })], estado: est, general: s, ahora: noche, canales: base })
    expect(r1.push.titulo).toBe('T u')
    expect(est.pendientes).toHaveLength(2)
    const r2 = planificarEntrega({ avisos: [], estado: est, general: s, ahora: T('2025-06-03T06:30:00Z'), canales: base })
    expect(r2.push.titulo).toBe('2 avisos')
    expect(est.pendientes).toHaveLength(0)
  })
  it('pausa: no se envía nada, ni urgente', () => {
    const est = estadoInicial()
    const ahora = T('2025-06-02T10:00:00Z')
    const r = planificarEntrega({ avisos: [A('a', { prioridad: 'urgente' })], estado: est, general: g({ pausadoHasta: ahora + 3600e3 }), ahora, canales: base })
    expect(r.pausado).toBe(true)
    expect(r.push).toBeNull()
  })
  it('límite diario: recorta y avisa una sola vez; se reinicia al día siguiente', () => {
    const est = estadoInicial()
    const gen = g({ limiteDiario: 2 })
    const ahora = T('2025-06-02T10:00:00Z')
    const r = planificarEntrega({ avisos: [A('a'), A('b'), A('c')], estado: est, general: gen, ahora, canales: base })
    expect(r.enviados).toHaveLength(2)
    expect(r.descartados).toBe(1)
    expect(r.avisoLimite).toBe(true)
    const r2 = planificarEntrega({ avisos: [A('d')], estado: est, general: gen, ahora: ahora + 3600e3, canales: base })
    expect(r2.enviados).toHaveLength(0)
    expect(r2.avisoLimite).toBe(false)
    expect(r2.push).toBeNull()
    const r3 = planificarEntrega({ avisos: [A('e')], estado: est, general: gen, ahora: ahora + 24 * 3600e3, canales: base })
    expect(r3.enviados).toHaveLength(1)
  })
  it('lo urgente entra antes que lo normal al aplicar el límite', () => {
    const r = planificarEntrega({ avisos: [A('n'), A('u', { prioridad: 'urgente' })], estado: estadoInicial(), general: g({ limiteDiario: 1 }), ahora: T('2025-06-02T10:00:00Z'), canales: base })
    expect(r.enviados.map((a) => a.clave)).toEqual(['u'])
  })
  it('canales: cada aviso va solo a los canales elegidos', () => {
    const r = planificarEntrega({ avisos: [A('p', { canales: ['push'] }), A('t', { canales: ['telegram'] })], estado: estadoInicial(), general: g(), ahora: T('2025-06-02T10:00:00Z'), canales: { push: true, telegram: true } })
    expect(r.push.titulo).toBe('T p')
    expect(r.telegram.titulo).toBe('T t')
  })
})
