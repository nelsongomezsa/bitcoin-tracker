// Importación de trades desde Excel/CSV. Todo ocurre en el navegador.
// Calibrado con una hoja real: «Total ganado (BTC)» es el de cada trade, «Total histórico» es la suma acumulada (se usa para comprobar),
// y el % y los BTC de cada trade son los escritos en la hoja (mandan sobre cualquier cálculo).
import { aFecha, aNumero, leerArchivoCon, MAX_FILAS, norm } from './importar'
import { tradeSchema, type TradeInput } from './schemas'
import { movimiento } from './trading'
import type { Moneda } from './calculos'

export interface Desajuste { fila: number; historico: number; calculado: number }
export interface ResultadoTrades {
  trades: TradeInput[]
  errores: { fila: number; motivo: string }[]
  /** Apalancamiento leído de la cabecera o de la columna (null si no aparece: es opcional). */
  apalancamiento: number | null
  /** Cuántos trades traen apalancamiento propio (p. ej. «1. x5» en la columna Trade). */
  conApalancamiento: number
  /** ¿La hoja trae «Total histórico»? */
  hayHistorico: boolean
  /** Filas donde la suma acumulada de «Total ganado» no coincide con «Total histórico». */
  desajustes: Desajuste[]
}

/** «x5», «5x», «×10» → 5, 5, 10. */
export function leerApalancamiento(v: unknown): number | null {
  const m = /(?:^|[^a-z0-9])[x×]\s?(\d{1,3}(?:[.,]\d+)?)(?![a-z0-9])|(?:^|[^a-z0-9.,])(\d{1,3}(?:[.,]\d+)?)\s?[x×](?![a-z])/i.exec(String(v ?? ''))
  if (!m) return null
  const n = Number((m[1] ?? m[2]).replace(',', '.'))
  return n >= 1 && n <= 125 ? n : null
}

/** Tolerancia al comparar la suma acumulada con «Total histórico» (la hoja suele redondear a 7 decimales). */
export const TOLERANCIA_HISTORICO = 1e-7

export function filasATrades(filas: unknown[][], moneda: Moneda): ResultadoTrades {
  const h = filas.findIndex((f) => f.some((c) => norm(c).includes('entrada')) && f.some((c) => norm(c).includes('fecha')))
  if (h < 0) throw new Error('cabecera')
  const cab = filas[h].map(norm)
  const col = (...ks: string[]) => cab.findIndex((c) => ks.every((k) => c.includes(k)))
  const iTrade = col('trade')
  const iIni = col('fecha', 'inicio') >= 0 ? col('fecha', 'inicio') : col('fecha')
  const iFin = col('fecha', 'cierre') >= 0 ? col('fecha', 'cierre') : col('fecha', 'fin')
  const iEnt = col('precio', 'entrada') >= 0 ? col('precio', 'entrada') : col('entrada')
  const iSal = col('precio', 'salida') >= 0 ? col('precio', 'salida') : col('salida')
  const iPct = col('%')
  const iBtc = col('total', 'ganado') >= 0 ? col('total', 'ganado') : col('btc')
  const iHist = col('historico')
  const levCab = filas[h].map(leerApalancamiento).find((n) => n != null) ?? null

  // Filas de la tabla (termina en la primera sin fecha de inicio).
  const cuerpo: { n: number; f: unknown[] }[] = []
  for (let i = h + 1; i < filas.length; i++) {
    const f = filas[i]
    if (!f || f[iIni] == null || f[iIni] === '') break
    cuerpo.push({ n: i + 1, f })
  }
  // El % puede venir como 15,35 (puntos porcentuales), como 0,1535 (celda con formato %) o como «15,35%».
  const numPct = cuerpo
    .map(({ f }) => (iPct < 0 || f[iPct] == null || (typeof f[iPct] === 'string' && (f[iPct] as string).includes('%')) ? NaN : Math.abs(aNumero(f[iPct]))))
    .filter((x) => Number.isFinite(x))
  const comoFraccion = numPct.length > 0 && Math.max(...numPct) <= 2
  const leerPct = (v: unknown): number | null => {
    if (v == null || v === '') return null
    if (typeof v === 'number') return Number.isFinite(v) ? (comoFraccion ? v * 100 : v) : null
    const n = aNumero(String(v).replace('%', ''))
    return Number.isFinite(n) ? n : null
  }

  const trades: TradeInput[] = []
  const errores: ResultadoTrades['errores'] = []
  const desajustes: Desajuste[] = []
  let acumulado = 0
  for (const { n, f } of cuerpo) {
    if (trades.length + errores.length >= MAX_FILAS) {
      errores.push({ fila: n, motivo: `Máximo ${MAX_FILAS} filas por importación` })
      break
    }
    const levF = iTrade >= 0 ? leerApalancamiento(f[iTrade]) : null
    const lev = levF ?? levCab ?? undefined
    const entrada = aNumero(f[iEnt])
    const salida = iSal >= 0 && f[iSal] != null && f[iSal] !== '' ? aNumero(f[iSal]) : NaN
    const fin = iFin >= 0 ? aFecha(f[iFin]) : null
    const cerrado = Number.isFinite(salida) && fin != null
    const pct = cerrado ? leerPct(iPct >= 0 ? f[iPct] : null) : null
    // Dirección: si el % de la hoja tiene el signo contrario al movimiento del precio, es un corto.
    let direccion: 'largo' | 'corto' = 'largo'
    if (cerrado && pct != null && pct !== 0) {
      const mov = movimiento(entrada, salida, 'largo')
      if (mov !== 0 && Math.sign(pct) !== Math.sign(mov)) direccion = 'corto'
    }
    let btc: number | undefined
    if (iBtc >= 0 && f[iBtc] != null && f[iBtc] !== '') {
      const v = aNumero(f[iBtc])
      if (Number.isFinite(v)) btc = v
    }
    acumulado += btc ?? 0
    if (iHist >= 0 && f[iHist] != null && f[iHist] !== '') {
      const hist = aNumero(f[iHist])
      if (Number.isFinite(hist) && Math.abs(hist - acumulado) > TOLERANCIA_HISTORICO) desajustes.push({ fila: n, historico: hist, calculado: acumulado })
    }
    const r = tradeSchema.safeParse({
      estado: cerrado ? 'cerrado' : 'abierto', direccion, fechaInicio: aFecha(f[iIni]) ?? '', ...(cerrado ? { fechaCierre: fin, precioSalida: salida } : {}),
      precioEntrada: entrada, moneda, ...(lev != null ? { apalancamiento: lev } : {}),
      ...(pct != null ? { pctManual: Math.round(pct * 1e6) / 1e6 } : {}), ...(btc != null ? { btcGanadoManual: btc } : {}),
    })
    if (r.success) trades.push(r.data)
    else errores.push({ fila: n, motivo: r.error.issues[0].message })
  }
  return { trades, errores, apalancamiento: levCab, conApalancamiento: trades.filter((t) => t.apalancamiento != null).length, hayHistorico: iHist >= 0, desajustes }
}

export const leerArchivoTrades = (buf: ArrayBuffer, moneda: Moneda): ResultadoTrades => leerArchivoCon(buf, (filas) => filasATrades(filas, moneda))
