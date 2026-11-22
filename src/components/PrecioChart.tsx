import { useEffect, useRef, useState } from 'react'
import { ColorType, LineStyle, LineSeries, createChart, createSeriesMarkers, type Time } from 'lightweight-charts'
import { useReducedMotion } from 'motion/react'
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
  const reducir = useReducedMotion()

  useEffect(() => {
    if (!el.current || !historico.length) return
    const n = RANGOS.find((r) => r[0] === rango)![1]
    const pts = historico.slice(-n)
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0D1117' }, textColor: '#8A94A6', fontFamily: 'JetBrains Mono, monospace', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
    })
    const serie = chart.addSeries(LineSeries, { color: '#E8ECF2', lineWidth: 2, priceLineVisible: false, priceFormat: { type: 'price', precision: 0, minMove: 1 } })
    const dia = (t: number) => new Date(t).toISOString().slice(0, 10)
    const datos = pts.map((p) => ({ time: dia(p.t) as Time, value: p.precio * factor }))
    const primero = dia(pts[0].t)
    const marcas = ops
      .filter((o) => o.fecha >= primero)
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      .map((o) => ({
        time: o.fecha as Time,
        position: o.tipo === 'compra' ? ('belowBar' as const) : ('aboveBar' as const),
        shape: 'circle' as const,
        color: o.tipo === 'compra' ? '#2EE6A6' : '#FF5C6C',
      }))
    const plugin = createSeriesMarkers(serie, reducir ? marcas : [])
    if (precioMedio > 0) serie.createPriceLine({ price: precioMedio, color: '#F7931A', lineStyle: LineStyle.Dashed, lineWidth: 2, title: 'Media' })
    if (proximoNivel) serie.createPriceLine({ price: proximoNivel, color: '#7CC4FF', lineStyle: LineStyle.Dotted, lineWidth: 2, title: 'Nivel' })

    const timers: ReturnType<typeof setTimeout>[] = []
    if (reducir) {
      serie.setData(datos)
      chart.timeScale().fitContent()
    } else {
      // La línea se dibuja de izquierda a derecha y los puntos de compra aparecen escalonados.
      // Se usan temporizadores (no requestAnimationFrame) y un cierre garantizado: si el navegador
      // frena la animación, la gráfica aparece completa igualmente.
      const inicio = Date.now()
      const dur = 900
      const terminar = () => {
        serie.setData(datos)
        chart.timeScale().fitContent()
        marcas.forEach((_, i) => timers.push(setTimeout(() => plugin.setMarkers(marcas.slice(0, i + 1)), i * 60)))
      }
      const paso = () => {
        const k = Math.ceil(Math.min(1, (Date.now() - inicio) / dur) * datos.length)
        if (k >= datos.length) return terminar()
        serie.setData(datos.slice(0, Math.max(2, k)))
        chart.timeScale().fitContent()
        timers.push(setTimeout(paso, 40))
      }
      paso()
      timers.push(setTimeout(terminar, dur + 150))
    }
    return () => { timers.forEach(clearTimeout); chart.remove() }
  }, [historico, factor, ops, precioMedio, proximoNivel, rango, reducir])

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
