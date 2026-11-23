import { useEffect, useMemo, useState } from 'react'
import { useVista } from '../state/vista'
import { useMercadoDoc } from '../state/data'
import { aVelas, factorDesdeEur, type FilaVela } from '../lib/velas'
import { elegirStats, parsearTickerRest, statsDeVelas, URL_TICKER, type Stats24h } from '../lib/stats24h'
import type { Moneda } from '../lib/calculos'

/**
 * Máx., mín. y volumen de 24 h de BTC en la moneda elegida:
 * 1) ticker en directo (WebSocket de Kraken, EUR y USD); 2) REST /Ticker de Kraken (también AUD), cada minuto mientras la pantalla está abierta;
 * 3) las velas de 1 hora (si falla lo anterior). Igual en el modo demo.
 */
export function useStats24h(moneda: Moneda): Stats24h | null {
  const v = useVista()
  const [rest, setRest] = useState<Partial<Record<Moneda, Stats24h>>>({})
  useEffect(() => {
    let vivo = true
    const pedir = () => {
      fetch(URL_TICKER)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (vivo && j) setRest({ EUR: parsearTickerRest(j, 'EUR') ?? undefined, USD: parsearTickerRest(j, 'USD') ?? undefined, AUD: parsearTickerRest(j, 'AUD') ?? undefined }) })
        .catch(() => { /* sin red: quedan las velas */ })
    }
    pedir()
    const t = setInterval(() => { if (document.visibilityState === 'visible') pedir() }, 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  const horarias = useMercadoDoc<{ EUR?: FilaVela[]; USD?: FilaVela[] }>('velas_1h')
  const base = v.mercado?.precios ?? null
  const tick = v.ticks24h[moneda === 'USD' ? 'USD' : 'EUR']
  const k = moneda === 'AUD' ? factorDesdeEur('AUD', base) : 1
  return useMemo(() => {
    // En directo solo EUR y USD; AUD se obtiene del REST (o de las velas).
    const directo = moneda !== 'AUD' && tick ? { high: tick.high, low: tick.low, volume: tick.volume } : null
    const filas = horarias?.[moneda === 'USD' ? 'USD' : 'EUR']
    const velas = filas ? statsDeVelas(aVelas(filas, k), (filas.at(-1)?.[0] ?? 0) + 3600) : null // 24 h hasta la última vela guardada
    return elegirStats(directo, rest[moneda], velas)
  }, [tick, rest, horarias, moneda, k])
}
