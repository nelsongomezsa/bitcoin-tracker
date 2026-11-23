// Velas OHLC de la API pública de Kraken (sin clave). Las descarga el job; el cliente las lee de mercado/velas_*.
// Formato guardado: [tiempo en SEGUNDOS, apertura, máximo, mínimo, cierre, volumen], ordenado y sin tiempos repetidos.
export const INTERVALOS = { '15m': 15, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 }
export const PARES = { EUR: 'XBTEUR', USD: 'XBTUSD' }
export const MAX_VELAS = 300

export const urlOhlc = (par, intervalo) => `https://api.kraken.com/0/public/OHLC?pair=${par}&interval=${intervalo}`

/** Limpia las filas de Kraken: números, tiempos en segundos, ordenadas, sin repetidos ni filas imposibles; como mucho `max` últimas. */
export function limpiarVelas(filas, max = MAX_VELAS) {
  const porTiempo = new Map()
  for (const f of filas ?? []) {
    if (!Array.isArray(f) || f.length < 5) continue
    let t = Number(f[0])
    const [o, h, l, c] = [f[1], f[2], f[3], f[4]].map(Number)
    const vol = Number(f[6] ?? f[5] ?? 0) // Kraken: [t, o, h, l, c, vwap, volumen, nº]; ya limpias: [t, o, h, l, c, volumen]
    if (![t, o, h, l, c].every(Number.isFinite)) continue
    if (t > 1e11) t = Math.floor(t / 1000) // milisegundos → segundos
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0 || h < l || o > h || o < l || c > h || c < l) continue
    porTiempo.set(t, [t, o, h, l, c, Number.isFinite(vol) ? vol : 0]) // un tiempo repetido se queda con la última
  }
  return [...porTiempo.values()].sort((a, b) => a[0] - b[0]).slice(-max)
}

/** Primera serie de la respuesta de Kraken (la clave del par cambia: XXBTZEUR…). */
export function filasDeRespuesta(r) {
  if (r?.error?.length) throw new Error(`Kraken: ${String(r.error[0]).slice(0, 60)}`)
  const clave = Object.keys(r?.result ?? {}).find((k) => k !== 'last')
  if (!clave) throw new Error('Kraken: respuesta sin velas')
  return r.result[clave]
}

export async function descargarVelas(getJson, par, intervalo) {
  return limpiarVelas(filasDeRespuesta(await getJson(urlOhlc(par, intervalo))))
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** Antigüedad máxima (ms) de cada documento antes de volver a pedirlo. El cron de GitHub se retrasa y se salta pasadas: se mide por antigüedad, no por la hora del reloj. */
export const EDAD_MAXIMA = { '15m': 0, '1h': 50 * 60e3, '4h': 3 * 3600e3, '1d': 3 * 3600e3, '1w': 3 * 3600e3 }
export const DOC_ESTADO = 'mercado/velas_estado'

/** Qué temporalidades toca refrescar: las que no tienen marca de actualización o tienen más años de la cuenta; `forzar` las pide todas. */
export function clavesPendientes(ahora, estado = {}, { forzar = false } = {}) {
  return Object.keys(INTERVALOS).filter((k) => forzar || !Number.isFinite(estado?.[k]) || ahora - estado[k] >= EDAD_MAXIMA[k])
}

/** Una petición a Kraken; ante el límite de peticiones (EGeneral:Too many requests) espera y reintenta una vez. */
async function descargarConReintento(getJson, par, intervalo, pausa) {
  try {
    return await descargarVelas(getJson, par, intervalo)
  } catch (e) {
    if (!/too many|rate|limit|EGeneral|429/i.test(String(e.message))) throw e
    await pausa(4000)
    return descargarVelas(getJson, par, intervalo)
  }
}

/**
 * Guarda mercado/velas_<clave> ({EUR:[…], USD:[…]}) de las temporalidades que toque y deja en mercado/velas_estado cuándo se guardó cada una.
 * Pausa entre peticiones (Kraken limita las públicas) y un fallo no impide guardar el resto.
 */
export async function guardarVelas({ db, FieldValue, getJson, ahora = Date.now(), forzar = false, pausaMs = 1100, pausa = dormir, claves }) {
  const estado = (await db.doc(DOC_ESTADO).get()).data?.() ?? {}
  const pendientes = claves ?? clavesPendientes(ahora, estado, { forzar })
  let peticiones = 0
  for (const clave of pendientes) {
    try {
      const doc = {}
      for (const [moneda, par] of Object.entries(PARES)) {
        if (peticiones++) await pausa(pausaMs)
        doc[moneda] = await descargarConReintento(getJson, par, INTERVALOS[clave], pausa)
      }
      await db.doc(`mercado/velas_${clave}`).set({ ...doc, intervalo: INTERVALOS[clave], actualizado: FieldValue.serverTimestamp() })
      await db.doc(DOC_ESTADO).set({ [clave]: ahora }, { merge: true })
      console.log(`Velas ${clave} guardadas: ${doc.EUR.length} EUR y ${doc.USD.length} USD`)
    } catch (e) {
      console.warn(`Velas ${clave} no actualizadas:`, String(e.message).slice(0, 80))
    }
  }
  return pendientes
}
