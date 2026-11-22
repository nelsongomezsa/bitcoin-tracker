// Datos públicos de mercado en directo desde Kraken (WebSocket v2, sin clave y sin datos del usuario).
// Excepción explícita a «el cliente no llama a APIs externas»: solo precios públicos. Nada de esto se guarda en Firestore.
// Una sola conexión compartida para toda la app: se abre mientras haya alguien escuchando y la app esté en primer plano.
import { useEffect, useSyncExternalStore } from 'react'
import { fusionarVelas, type Vela } from './velas'

export const WS_URL = 'wss://ws.kraken.com/v2'
export type MonedaKraken = 'EUR' | 'USD'
const simbolo = (m: MonedaKraken) => `BTC/${m}`
const monedaDe = (s: string): MonedaKraken | null => (s === 'BTC/EUR' ? 'EUR' : s === 'BTC/USD' ? 'USD' : null)

export interface Tick { last: number; high: number; low: number; volume: number; cambioPct: number }
export interface EstadoVivo { conectado: boolean; ticks: Partial<Record<MonedaKraken, Tick>>; ts: number }

export type MensajeKraken =
  | { tipo: 'ticker'; moneda: MonedaKraken; tick: Tick }
  | { tipo: 'ohlc'; moneda: MonedaKraken; intervalo: number; velas: Vela[] }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)

/** Convierte un mensaje del WebSocket en un dato útil (o null si no interesa o no es válido). Función pura. */
export function parsearMensaje(m: unknown): MensajeKraken[] {
  const msg = m as { channel?: string; type?: string; data?: Record<string, unknown>[] }
  if (!msg || !Array.isArray(msg.data) || (msg.type !== 'snapshot' && msg.type !== 'update')) return []
  const out: MensajeKraken[] = []
  if (msg.channel === 'ticker') {
    for (const d of msg.data) {
      const moneda = monedaDe(String(d.symbol))
      const last = num(d.last)
      if (!moneda || !(last > 0)) continue
      out.push({ tipo: 'ticker', moneda, tick: { last, high: num(d.high), low: num(d.low), volume: num(d.volume), cambioPct: num(d.change_pct) } })
    }
  } else if (msg.channel === 'ohlc') {
    const porClave = new Map<string, Extract<MensajeKraken, { tipo: 'ohlc' }>>()
    for (const d of msg.data) {
      const moneda = monedaDe(String(d.symbol))
      const t = Date.parse(String(d.interval_begin)) / 1000
      const [open, high, low, close, volume] = [d.open, d.high, d.low, d.close, d.volume].map(num)
      const intervalo = num(d.interval)
      if (!moneda || !Number.isFinite(t) || ![open, high, low, close].every((x) => x > 0) || !(intervalo > 0)) continue
      const k = `${moneda}${intervalo}`
      const g = porClave.get(k) ?? { tipo: 'ohlc' as const, moneda, intervalo, velas: [] }
      g.velas.push({ time: t, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 })
      porClave.set(k, g)
    }
    for (const g of porClave.values()) { g.velas = fusionarVelas([], g.velas); out.push(g) }
  }
  return out
}

/** Espera antes de reconectar: 1, 2, 4, 8, 16 y 30 s como máximo. */
export const esperaReconexion = (intentos: number) => Math.min(30_000, 1000 * 2 ** Math.max(0, intentos))

// ───────────── Gestor de la conexión compartida ─────────────
interface SubOhlc { moneda: MonedaKraken; intervalo: number; cbs: Set<(v: Vela[]) => void> }

let ws: WebSocket | null = null
let consumidoresTicker = 0
const ohlc = new Map<string, SubOhlc>()
let intentos = 0
let temporizadorReconexion: ReturnType<typeof setTimeout> | undefined
let temporizadorFlush: ReturnType<typeof setInterval> | undefined
let estado: EstadoVivo = { conectado: false, ticks: {}, ts: 0 }
let pendiente: EstadoVivo['ticks'] | null = null
const oyentes = new Set<() => void>()
let vigilando = false

const hayConsumidores = () => consumidoresTicker > 0 || ohlc.size > 0
const enPrimerPlano = () => typeof document === 'undefined' || document.visibilityState === 'visible'
const emitir = () => oyentes.forEach((f) => f())
const enviar = (o: unknown) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)) }

function flush() {
  if (!pendiente) return
  estado = { ...estado, ticks: { ...estado.ticks, ...pendiente }, ts: Date.now() }
  pendiente = null
  emitir() // como mucho 1 vez por segundo
}

function abrir() {
  if (ws || !hayConsumidores() || !enPrimerPlano() || typeof WebSocket === 'undefined') return
  try { ws = new WebSocket(WS_URL) } catch { programarReconexion(); return }
  const mio = ws
  mio.onopen = () => {
    intentos = 0
    estado = { ...estado, conectado: true }
    emitir()
    if (consumidoresTicker > 0) enviar({ method: 'subscribe', params: { channel: 'ticker', symbol: [simbolo('EUR'), simbolo('USD')] } })
    for (const s of ohlc.values()) enviar({ method: 'subscribe', params: { channel: 'ohlc', symbol: [simbolo(s.moneda)], interval: s.intervalo } })
    temporizadorFlush ??= setInterval(flush, 1000)
  }
  mio.onmessage = (e) => {
    let datos: unknown
    try { datos = JSON.parse(String(e.data)) } catch { return }
    for (const m of parsearMensaje(datos)) {
      if (m.tipo === 'ticker') pendiente = { ...(pendiente ?? {}), [m.moneda]: m.tick }
      else ohlc.get(`${m.moneda}:${m.intervalo}`)?.cbs.forEach((cb) => cb(m.velas))
    }
  }
  mio.onclose = () => {
    if (ws !== mio) return
    ws = null
    estado = { ...estado, conectado: false }
    emitir()
    if (hayConsumidores() && enPrimerPlano()) programarReconexion()
  }
  mio.onerror = () => mio.close()
}

function programarReconexion() {
  clearTimeout(temporizadorReconexion)
  temporizadorReconexion = setTimeout(abrir, esperaReconexion(intentos++))
}

function cerrar() {
  clearTimeout(temporizadorReconexion)
  clearInterval(temporizadorFlush)
  temporizadorFlush = undefined
  const w = ws
  ws = null
  if (w) { w.onclose = null; w.close() }
  if (estado.conectado) { estado = { ...estado, conectado: false }; emitir() }
}

function vigilar() {
  if (vigilando || typeof document === 'undefined') return
  vigilando = true
  // En segundo plano se cierra; al volver se reabre.
  document.addEventListener('visibilitychange', () => { if (enPrimerPlano()) { intentos = 0; abrir() } else cerrar() })
}

function revisar() {
  if (!hayConsumidores()) cerrar()
  else { vigilar(); abrir() }
}

/** Escucha el ticker (precio en directo de EUR y USD). Devuelve la función para dejar de escuchar. */
export function suscribirTicker(): () => void {
  consumidoresTicker++
  if (ws?.readyState === WebSocket.OPEN && consumidoresTicker === 1) enviar({ method: 'subscribe', params: { channel: 'ticker', symbol: [simbolo('EUR'), simbolo('USD')] } })
  revisar()
  return () => { consumidoresTicker = Math.max(0, consumidoresTicker - 1); revisar() }
}

/** Escucha las velas en directo de 1 o 5 minutos. Los datos llegan como velas (la última es la que está en curso). */
export function suscribirOhlc(moneda: MonedaKraken, intervalo: 1 | 5, cb: (v: Vela[]) => void): () => void {
  const k = `${moneda}:${intervalo}`
  let s = ohlc.get(k)
  if (!s) {
    s = { moneda, intervalo, cbs: new Set() }
    ohlc.set(k, s)
    enviar({ method: 'subscribe', params: { channel: 'ohlc', symbol: [simbolo(moneda)], interval: intervalo } })
  }
  s.cbs.add(cb)
  revisar()
  return () => {
    const x = ohlc.get(k)
    if (!x) return
    x.cbs.delete(cb)
    if (!x.cbs.size) { ohlc.delete(k); enviar({ method: 'unsubscribe', params: { channel: 'ohlc', symbol: [simbolo(moneda)], interval: intervalo } }) }
    revisar()
  }
}

const suscribirse = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f) } }
const instantanea = () => estado

/** Estado del precio en directo. Con `activo` false (modo demo) no abre ninguna conexión. */
export function usePreciosVivos(activo = true): EstadoVivo {
  useEffect(() => (activo ? suscribirTicker() : undefined), [activo])
  return useSyncExternalStore(suscribirse, instantanea, instantanea)
}

/** Solo para los tests. */
export const _reiniciar = () => { cerrar(); consumidoresTicker = 0; ohlc.clear(); intentos = 0; estado = { conectado: false, ticks: {}, ts: 0 }; pendiente = null }
