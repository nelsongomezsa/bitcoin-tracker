import { useEffect, useRef, useState } from 'react'
import { ColorType, LineStyle, LineSeries, createChart, createSeriesMarkers, type Time } from 'lightweight-charts'
import type { Operacion, PuntoPrecio } from '../lib/calculos'

const RANGOS = [['1D', 2], ['1S', 8], ['1M', 31], ['1A', 366], ['Todo', Infinity]] as const

interface Props {
  historico: PuntoPrecio[]
  /** Factor para expresar los precios (EUR) en la moneda elegida. */
  factor: number
  ops: Operacion[]
  precioMedio: number
  proximoNivel?: number
}

export default function PrecioChart({ historico, factor, ops, precioMedio, proximoNivel }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const [rango, setRango] = useState<(typeof RANGOS)[number][0]>('1A')

  useEffect(() => {
    if (!el.current || !historico.length) return
    const n = RANGOS.find((r) => r[0] === rango)![1]
    const pts = historico.slice(-n)
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#141922' }, textColor: '#8A94A6', fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: '#1E2530' }, horzLines: { color: '#1E2530' } },
      rightPriceScale: { borderColor: '#1E2530' },
      timeScale: { borderColor: '#1E2530' },
    })
    const serie = chart.addSeries(LineSeries, { color: '#E8ECF2', lineWidth: 2 })
    const dia = (t: number) => new Date(t).toISOString().slice(0, 10)
    serie.setData(pts.map((p) => ({ time: dia(p.t) as Time, value: p.precio * factor })))
    const primero = dia(pts[0].t)
    const marcas = ops
      .filter((o) => o.fecha >= primero)
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      .map((o) => ({
        time: o.fecha as Time,
        position: o.tipo === 'compra' ? ('belowBar' as const) : ('aboveBar' as const),
        shape: 'circle' as const,
        color: o.tipo === 'compra' ? '#34D399' : '#FF7A7A',
      }))
    createSeriesMarkers(serie, marcas)
    if (precioMedio > 0) serie.createPriceLine({ price: precioMedio, color: '#F7931A', lineStyle: LineStyle.Dashed, lineWidth: 2, title: 'Media' })
    if (proximoNivel) serie.createPriceLine({ price: proximoNivel, color: '#60A5FA', lineStyle: LineStyle.Dotted, lineWidth: 2, title: 'Nivel' })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [historico, factor, ops, precioMedio, proximoNivel, rango])

  return (
    <section className="card stack" aria-label="Gráfica del precio">
      <div className="row between wrap">
        <h2>Precio de BTC</h2>
        <div className="seg" role="group" aria-label="Rango">
          {RANGOS.map(([r]) => (
            <button key={r} aria-pressed={rango === r} onClick={() => setRango(r)}>{r}</button>
          ))}
        </div>
      </div>
      {historico.length ? <div className="chart-box" ref={el} role="img" aria-label="Gráfica del precio de bitcoin con tus compras y ventas" /> : <p className="muted">Aún no hay histórico de precios.</p>}
      <p className="notice"><span className="warn">- - -</span> precio medio · <span className="key">· · ·</span> próximo nivel clave · <span className="gain">●</span> compra · <span className="loss">●</span> venta</p>
    </section>
  )
}
