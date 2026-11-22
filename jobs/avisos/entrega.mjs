// Decide qué se envía y cuándo: pausa, horas de silencio, prioridad, límite diario, repetidos y agrupación.
import { general } from '../../src/shared/avisosCatalogo.mjs'
import { enSilencio, local } from './tiempo.mjs'

export const COOLDOWN_DEFECTO_MS = 24 * 3600 * 1000
const MAX_PENDIENTES = 50
const MAX_TEXTO = 400

/**
 * @param {{avisos: any[], estado: any, general: any, ahora: number, canales: {push: boolean, telegram: boolean}}} p
 * El `estado` se modifica (enviados, pendientes, contador, limiteAvisado).
 * @returns {{push: any|null, telegram: any|null, enviados: any[], descartados: number, avisoLimite: boolean, pausado: boolean}}
 */
export function planificarEntrega({ avisos, estado, general: gen, ahora, canales }) {
  const g = general(gen)
  const vacio = { push: null, telegram: null, enviados: [], descartados: 0, avisoLimite: false, pausado: false }

  // Limpia el registro de enviados (más de 48 h) para que el documento no crezca.
  for (const [k, t] of Object.entries(estado.enviados)) if (ahora - t > 48 * 3600 * 1000) delete estado.enviados[k]

  if (g.pausadoHasta > ahora) return { ...vacio, pausado: true, descartados: avisos.length }

  const fecha = local(ahora, g.zona).fecha
  if (estado.contador.fecha !== fecha) estado.contador = { fecha, n: 0 }

  // 1. Repetidos: como mucho uno por clave y periodo de espera.
  const vistos = new Set()
  const nuevos = avisos.filter((a) => {
    const t = estado.enviados[a.clave]
    if (t && ahora - t < (a.cooldownMs ?? COOLDOWN_DEFECTO_MS)) return false
    if (vistos.has(a.clave)) return false
    vistos.add(a.clave)
    return !estado.pendientes.some((p) => p.clave === a.clave)
  })

  const urgentes = nuevos.filter((a) => a.prioridad === 'urgente')
  let normales = nuevos.filter((a) => a.prioridad !== 'urgente')

  // 2. Horas de silencio: lo normal se acumula; lo urgente salta siempre.
  if (enSilencio(g, ahora)) {
    estado.pendientes = [...estado.pendientes, ...normales].slice(-MAX_PENDIENTES)
    normales = []
  } else {
    normales = [...estado.pendientes, ...normales]
    estado.pendientes = []
  }

  // 3. Límite diario: primero lo urgente.
  const hueco = Math.max(0, g.limiteDiario - estado.contador.n)
  const candidatos = [...urgentes, ...normales]
  const enviar = candidatos.slice(0, hueco)
  const descartados = candidatos.length - enviar.length
  estado.contador.n += enviar.length
  for (const a of enviar) estado.enviados[a.clave] = ahora

  let avisoLimite = false
  if (estado.contador.n >= g.limiteDiario && (descartados > 0 || enviar.length > 0) && estado.limiteAvisado !== fecha && g.limiteDiario > 0) {
    estado.limiteAvisado = fecha
    avisoLimite = true
  }

  // 4. Agrupación: un único mensaje por canal.
  const para = (canal) => enviar.filter((a) => (a.canales ?? ['push', 'telegram']).includes(canal))
  const mensaje = (lista) => {
    if (!lista.length) return null
    if (lista.length === 1) return { titulo: lista[0].titulo, texto: lista[0].texto.slice(0, MAX_TEXTO), url: lista[0].url ?? '/avisos' }
    return { titulo: `${lista.length} avisos`, texto: lista.map((a) => a.texto).join(' · ').slice(0, MAX_TEXTO), url: '/avisos' }
  }
  const limite = avisoLimite ? { titulo: 'Límite de avisos', texto: 'Has alcanzado tu límite de avisos de hoy.', url: '/avisos' } : null
  let push = canales.push ? mensaje(para('push')) : null
  let telegram = canales.telegram ? mensaje(para('telegram')) : null
  if (limite) {
    if (canales.push && !push) push = limite
    if (canales.telegram && !telegram) telegram = limite
  }
  return { push, telegram, enviados: enviar, descartados, avisoLimite, pausado: false }
}
