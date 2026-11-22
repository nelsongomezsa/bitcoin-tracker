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

/** Guarda mercado/velas_<clave> ({EUR:[…], USD:[…]}) para cada clave pedida. Un fallo no impide guardar el resto. */
export async function guardarVelas({ db, FieldValue, getJson, claves }) {
  for (const clave of claves) {
    try {
      const doc = {}
      for (const [moneda, par] of Object.entries(PARES)) doc[moneda] = await descargarVelas(getJson, par, INTERVALOS[clave])
      await db.doc(`mercado/velas_${clave}`).set({ ...doc, intervalo: INTERVALOS[clave], actualizado: FieldValue.serverTimestamp() })
    } catch (e) {
      console.warn(`Velas ${clave} no actualizadas:`, String(e.message).slice(0, 80))
    }
  }
}

/** Qué temporalidades toca refrescar: 15m y 1h siempre; 4h, 1d y 1w cuando empieza una franja de 4 h (UTC). */
export function clavesPendientes(ahora, { diario = false } = {}) {
  const d = new Date(ahora)
  const franja = d.getUTCHours() % 4 === 0 && d.getUTCMinutes() < 15
  return diario || franja ? ['15m', '1h', '4h', '1d', '1w'] : ['15m', '1h']
}
