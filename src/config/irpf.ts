// Tramos del IRPF del ahorro (base del ahorro, ganancias patrimoniales) en España.
// Orientativo: revísalo cada año con la normativa vigente. No es asesoramiento fiscal.
export interface TramoIrpf {
  /** Límite superior del tramo en euros (Infinity para el último). */
  hasta: number
  tipo: number
}

export const TRAMOS_IRPF_AHORRO: TramoIrpf[] = [
  { hasta: 6000, tipo: 0.19 },
  { hasta: 50000, tipo: 0.21 },
  { hasta: 200000, tipo: 0.23 },
  { hasta: 300000, tipo: 0.27 },
  { hasta: Infinity, tipo: 0.3 },
]

export const UMBRAL_COMISION_ALTA = 0.03
export const TOLERANCIA_NIVEL = 0.005
