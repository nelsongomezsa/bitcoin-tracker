import { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts'
import type { Vela } from '../lib/velas'

/** Velas simples de una serie propia (valor o rentabilidad de la cartera). Pellizcar para zoom y arrastrar para moverse. */
export default function VelasSerie({ velas, etiqueta, decimales = 0, alto = 220 }: { velas: Vela[]; etiqueta: string; decimales?: number; alto?: number }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!el.current || !velas.length) return
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0D1117' }, textColor: '#8A94A6', fontFamily: 'JetBrains Mono, monospace', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
    })
    const s = c.addSeries(CandlestickSeries, {
      upColor: '#2EE6A6', downColor: '#FF5C6C', borderUpColor: '#2EE6A6', borderDownColor: '#FF5C6C', wickUpColor: '#2EE6A6', wickDownColor: '#FF5C6C',
      priceFormat: { type: 'price', precision: decimales, minMove: 1 / 10 ** decimales },
    })
    s.setData(velas.map((x) => ({ time: x.time as UTCTimestamp, open: x.open, high: x.high, low: x.low, close: x.close })))
    c.timeScale().fitContent()
    return () => c.remove()
  }, [velas, decimales])
  return <div ref={el} style={{ height: alto }} role="img" aria-label={etiqueta} />
}
