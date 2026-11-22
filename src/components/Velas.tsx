import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, type Time } from 'lightweight-charts'

const RANGOS = [['1S', 'd', 7], ['1M', 'd', 30], ['1A', 's', 53]] as const

interface Props {
  velas: { diarias?: number[][]; semanales?: number[][] } | null
  factor: number
}

/** Gráfica de velas OHLC. 1S y 1M usan velas diarias; 1A usa velas semanales (las calcula el job). */
export default function Velas({ velas, factor }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const [rango, setRango] = useState<(typeof RANGOS)[number][0]>('1M')

  useEffect(() => {
    if (!el.current || !velas) return
    const [, tipo, n] = RANGOS.find((r) => r[0] === rango)!
    const datos = ((tipo === 'd' ? velas.diarias : velas.semanales) ?? []).slice(-n)
    if (!datos.length) return
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0D1117' }, textColor: '#8A94A6', fontFamily: 'JetBrains Mono, monospace', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
    })
    const s = chart.addSeries(CandlestickSeries, {
      upColor: '#2EE6A6', downColor: '#FF5C6C', borderUpColor: '#2EE6A6', borderDownColor: '#FF5C6C', wickUpColor: '#2EE6A6', wickDownColor: '#FF5C6C',
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })
    s.setData(datos.map(([t, o, h, l, c]) => ({ time: new Date(t).toISOString().slice(0, 10) as Time, open: o * factor, high: h * factor, low: l * factor, close: c * factor })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [velas, factor, rango])

  return (
    <section className="card stack" aria-label="Velas">
      <div className="row between wrap">
        <h2>Velas de BTC</h2>
        <div className="seg" role="group" aria-label="Rango de las velas">
          {RANGOS.map(([r]) => <button key={r} aria-pressed={rango === r} onClick={() => setRango(r)}>{r}</button>)}
        </div>
      </div>
      {velas ? <div className="chart-box" ref={el} role="img" aria-label="Gráfica de velas del precio de bitcoin" /> : <p className="muted">Las velas aparecerán tras la próxima actualización diaria.</p>}
      <p className="notice">{rango === '1A' ? 'Cada vela es una semana.' : 'Cada vela es un día.'} Verde: cierra por encima de la apertura.</p>
    </section>
  )
}
