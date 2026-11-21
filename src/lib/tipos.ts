import type { Moneda, Plan, PreciosBtc, PuntoPrecio, Operacion } from './calculos'

export interface Perfil {
  nombre: string
  monedaPreferida: Moneda
  modoPrivado: boolean
}

/** Cada aviso: interruptor y umbral opcional. */
export interface AjusteAviso {
  activo: boolean
  umbral?: number
}
export type ClaveAviso =
  | 'nivelClave' | 'rentable' | 'variacion24h' | 'variacion7d' | 'dcaSemanal' | 'miedoExtremo'
  | 'comisionAlta' | 'precioObjetivo' | 'resumenMensual' | 'copiaSeguridad'

export interface AvisosDoc {
  ajustes: Partial<Record<ClaveAviso, AjusteAviso>>
  tokens: string[]
  /** Datos mínimos (en EUR) que el cliente deja para que el job evalúe avisos sin leer todas las operaciones. */
  resumen?: ResumenAvisos
}

export interface ResumenAvisos {
  precioMedio: number
  btc: number
  nivelesPendientes: number[]
  precioObjetivo: number | null
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
  miedoCodicia: { valor: number; clasificacion: string } | null
  actualizado: Date | null
}

export type OperacionGuardable = Omit<Operacion, 'id'>

export interface Datos {
  demo: boolean
  cargando: boolean
  perfil: Perfil
  operaciones: Operacion[]
  plan: Plan
  objetivos: Objetivos
  avisos: AvisosDoc
  mercado: Mercado | null
  historico: PuntoPrecio[]
  guardarOperacion: (o: OperacionGuardable, id?: string) => Promise<void>
  borrarOperacion: (id: string) => Promise<void>
  guardarPlan: (p: Plan, objetivos?: Objetivos) => Promise<void>
  guardarAvisos: (a: AvisosDoc) => Promise<void>
  guardarPerfil: (p: Perfil) => Promise<void>
}

export const PLAN_VACIO: Plan = {
  capital: 0,
  nivelesClave: [],
  dca: { inicio: new Date().toISOString().slice(0, 10), porcentajeSemanal: 1, semanas: 25 },
}
export const PERFIL_INICIAL: Perfil = { nombre: '', monedaPreferida: 'EUR', modoPrivado: false }
export const AVISOS_INICIALES: AvisosDoc = { ajustes: {}, tokens: [] }
