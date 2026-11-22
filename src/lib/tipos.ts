import type { Moneda, Plan, PreciosBtc, PuntoPrecio, Operacion } from './calculos'
import type { Trade, TradeGuardable } from './trading'
import type { ModoVista } from './modoVista'

export interface Perfil {
  nombre: string
  monedaPreferida: Moneda
  modoPrivado: boolean
  /** Muestra el apartado Trading en la barra (por defecto sí). */
  mostrarTrading: boolean
  /** Suma los BTC ganados con trades al total de la cartera de Inicio. */
  sumarTradingACartera: boolean
  /** Vista simple (por defecto) o pro (estilo exchange). Solo cambia la presentación. */
  vista: ModoVista
}

/** Ajuste de un aviso: interruptor, umbral, prioridad, canales y campos propios de cada aviso. */
export interface AjusteAviso {
  activo: boolean
  umbral?: number
  prioridad?: 'normal' | 'urgente'
  canales?: ('push' | 'telegram')[]
  [campo: string]: unknown
}
export type ClaveAviso = string

export interface GeneralAvisos {
  zona: string
  silencioActivo: boolean
  silencioDesde: number
  silencioHasta: number
  limiteDiario: number
  pausadoHasta: number
  moneda: Moneda
  horaResumen: number
}

export interface AlertaMedida {
  id: string
  dir: 'abajo' | 'arriba'
  precio: number
  moneda: Moneda
  repetir: boolean
}

export interface AvisosDoc {
  ajustes: Record<string, AjusteAviso>
  tokens: string[]
  /** Datos mínimos (en EUR) que el cliente deja para que el job evalúe avisos sin leer todas las operaciones. */
  resumen?: ResumenAvisos
  general?: Partial<GeneralAvisos>
  alertas?: AlertaMedida[]
  seguidas?: string[]
  telegram?: { desconectar?: boolean }
  historialLeidoHasta?: Date | null
}

export interface ResumenAvisos {
  precioMedio: number
  btc: number
  invertido: number
  nivelesPendientes: number[]
  precioObjetivo: number | null
  precioInicio: number | null
  btcMeta: number | null
  dineroMeta: number | null
  ultimaCompra: string | null
  anioAnterior: { anio: number; ganancia: number; ventas: number } | null
  /** Trades abiertos (máx. 20) para los avisos de trading: el job calcula el % con el precio del momento. */
  tradesAbiertos?: { id: string; direccion: 'largo' | 'corto'; apalancamiento: number; precioEntrada: number; moneda: Moneda; fechaInicio: string; comisiones?: number }[]
  mesAnterior: { mes: string; metido: number; medioAntes: number; medioDespues: number; rentabilidad: number } | null
}

export interface Objetivos {
  btcMeta?: number
  dineroMeta?: number
  precioVenta?: { modo: 'porcentaje' | 'precio'; valor: number }
}

export interface Mercado {
  precios: PreciosBtc
  cambio24h: number
  cambio7d: number
  maximoHistorico: PreciosBtc
  /** Fecha del máximo histórico (CoinGecko), si el job la ha guardado. */
  athFecha?: Date | null
  miedoCodicia: { valor: number; clasificacion: string } | null
  actualizado: Date | null
}

export type OperacionGuardable = Omit<Operacion, 'id'>

export interface EntradaHistorial {
  id: string
  t: Date
  tipo: string
  titulo: string
  texto: string
}

export interface Datos {
  demo: boolean
  cargando: boolean
  perfil: Perfil
  operaciones: Operacion[]
  trades: Trade[]
  plan: Plan
  objetivos: Objetivos
  avisos: AvisosDoc
  mercado: Mercado | null
  historico: PuntoPrecio[]
  /** ¿Hay un chat de Telegram vinculado? (lo escribe el job en avisos/estado) */
  telegramVinculado: boolean
  guardarOperacion: (o: OperacionGuardable, id?: string) => Promise<void>
  borrarOperacion: (id: string) => Promise<void>
  guardarTrade: (t: TradeGuardable, id?: string) => Promise<void>
  borrarTrade: (id: string) => Promise<void>
  guardarPlan: (p: Plan, objetivos?: Objetivos) => Promise<void>
  guardarAvisos: (a: AvisosDoc) => Promise<void>
  guardarPerfil: (p: Perfil) => Promise<void>
  /** Pide un aviso de prueba (el job lo envía en su siguiente pasada). */
  /** Relee el precio desde el servidor (tirar para refrescar). */
  refrescar: () => Promise<void>
  pedirPrueba: () => Promise<void>
  /** Crea un código de un solo uso para vincular Telegram (válido 15 minutos). */
  crearVinculo: (codigo: string) => Promise<void>
  /** Escucha el historial de avisos (últimos 30 días). Devuelve la función para dejar de escuchar. */
  suscribirHistorial: (cb: (h: EntradaHistorial[]) => void) => () => void
}

export const PLAN_VACIO: Plan = {
  capital: 0,
  nivelesClave: [],
  dca: { inicio: new Date().toISOString().slice(0, 10), porcentajeSemanal: 1, semanas: 25 },
}
export const PERFIL_INICIAL: Perfil = { nombre: '', monedaPreferida: 'EUR', modoPrivado: false, mostrarTrading: true, sumarTradingACartera: false, vista: 'simple' }
export const AVISOS_INICIALES: AvisosDoc = { ajustes: {}, tokens: [] }
