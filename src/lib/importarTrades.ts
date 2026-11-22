// Importación de trades desde Excel/CSV. Todo ocurre en el navegador.
import { aFecha, aNumero, leerArchivoCon, MAX_FILAS, norm } from './importar'
import { tradeSchema, type TradeInput } from './schemas'
import { movimiento } from './trading'
import type { Moneda } from './calculos'

export interface ResultadoTrades {
  trades: TradeInput[]
  errores: { fila: number; motivo: string }[]
  /** Apalancamiento leído de la cabecera o de la columna (null si no aparece). */
  apalancamiento: number | null
}

/** «x5», «5x», «×10» → 5, 5, 10. */
export function leerApalancamiento(v: unknown): number | null {
  const m = /(?:^|[^a-z0-9])[x×]\s?(\d{1,3}(?:[.,]\d+)?)(?![a-z0-9])|(?:^|[^a-z0-9.,])(\d{1,3}(?:[.,]\d+)?)\s?[x×](?![a-z])/i.exec(String(v ?? ''))
  if (!m) return null
  const n = Number((m[1] ?? m[2]).replace(',', '.'))
  return n >= 1 && n <= 125 ? n : null
}

interface Opciones {
  /** «Total ganado (BTC)» es un acumulado: cada trade vale la diferencia con el anterior. */
  acumulado?: boolean
}

export function filasATrades(filas: unknown[][], moneda: Moneda, { acumulado = false }: Opciones = {}): ResultadoTrades {
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
  // El apalancamiento puede venir en cualquier cabecera («Trade x5») o en la columna Trade de cada fila.
  const levCab = filas[h].map(leerApalancamiento).find((n) => n != null) ?? null

  const trades: TradeInput[] = []
  const errores: ResultadoTrades['errores'] = []
  let previo = 0
  let levFila: number | null = null
  for (let i = h + 1; i < filas.length; i++) {
    const f = filas[i]
    if (!f || f[iIni] == null || f[iIni] === '') break // fin de la tabla
    if (trades.length + errores.length >= MAX_FILAS) {
      errores.push({ fila: i + 1, motivo: `Máximo ${MAX_FILAS} filas por importación` })
      break
    }
    const lev = (iTrade >= 0 ? leerApalancamiento(f[iTrade]) : null) ?? levCab ?? 1
    levFila = levFila ?? (iTrade >= 0 ? leerApalancamiento(f[iTrade]) : null)
    const entrada = aNumero(f[iEnt])
    const salida = iSal >= 0 && f[iSal] != null && f[iSal] !== '' ? aNumero(f[iSal]) : NaN
    const fin = iFin >= 0 ? aFecha(f[iFin]) : null
    const cerrado = Number.isFinite(salida) && fin != null
    // Dirección: si el % del Excel tiene el signo contrario al movimiento del precio, es un corto.
    let direccion: 'largo' | 'corto' = 'largo'
    if (cerrado && iPct >= 0) {
      const pct = aNumero(f[iPct])
      const mov = movimiento(entrada, salida, 'largo')
      if (Number.isFinite(pct) && pct !== 0 && mov !== 0 && Math.sign(pct) !== Math.sign(mov)) direccion = 'corto'
    }
    let btc: number | undefined
    if (iBtc >= 0 && f[iBtc] != null && f[iBtc] !== '') {
      const n = aNumero(f[iBtc])
      if (Number.isFinite(n)) {
        btc = acumulado ? Math.round((n - previo) * 1e10) / 1e10 : n
        previo = n
      }
    }
    const r = tradeSchema.safeParse({
      estado: cerrado ? 'cerrado' : 'abierto', direccion, fechaInicio: aFecha(f[iIni]) ?? '', ...(cerrado ? { fechaCierre: fin, precioSalida: salida } : {}),
      precioEntrada: entrada, moneda, apalancamiento: lev, ...(btc != null ? { btcGanadoManual: btc } : {}),
    })
    if (r.success) trades.push(r.data)
    else errores.push({ fila: i + 1, motivo: r.error.issues[0].message })
  }
  return { trades, errores, apalancamiento: levCab ?? levFila }
}

export const leerArchivoTrades = (buf: ArrayBuffer, moneda: Moneda, op?: Opciones): ResultadoTrades => leerArchivoCon(buf, (filas) => filasATrades(filas, moneda, op))
