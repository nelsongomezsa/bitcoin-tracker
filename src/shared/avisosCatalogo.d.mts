export interface CampoExtra {
  nombre: string
  tipo: 'numero' | 'select'
  etiqueta: string
  min?: number
  max?: number
  opciones?: [string | number, string][]
}
export interface DefAviso {
  clave: string
  seccion: string
  titulo: string
  desc: string
  defecto: Record<string, unknown> & { activo: boolean }
  umbral?: { etiqueta: string; min: number; max: number; paso: number }
  campos?: CampoExtra[]
  soloApp?: boolean
}
export interface General {
  zona: string
  silencioDesde: number
  silencioHasta: number
  silencioActivo: boolean
  limiteDiario: number
  pausadoHasta: number
  moneda: 'EUR' | 'USD' | 'AUD'
  horaResumen: number
}
export const SECCIONES: [string, string][]
export const CATALOGO: DefAviso[]
export const POR_CLAVE: Record<string, DefAviso>
export const GENERAL_DEFECTO: General
export function ajuste(ajustes: Record<string, unknown> | undefined, clave: string): Record<string, any>
export function general(g?: Partial<General> | null): General
export const ZONAS: { id: number; nombre: string; hasta: number }[]
export function zonaDe(v: number): { id: number; nombre: string; hasta: number }
export const UMBRAL_BALLENA_DEFECTO: number
