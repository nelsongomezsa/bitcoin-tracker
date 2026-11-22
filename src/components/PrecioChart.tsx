import { useEffect, useMemo, useRef, useState } from 'react'
import { ColorType, LineStyle, LineSeries, createChart, createSeriesMarkers, type AutoscaleInfo, type UTCTimestamp } from 'lightweight-charts'
import { useReducedMotion } from 'motion/react'
import type { Operacion, PuntoPrecio } from '../lib/calculos'
import { PERIODOS, prepararMarcas, prepararSerie, type Periodo } from '../lib/serieGrafica'
import ErrorBoundary from './ErrorBoundary'

interface Props {
  /** Histórico diario en EUR, con el tiempo en milisegundos (mercado/historico). */
  historico: PuntoPrecio[]
  /** Precio actual en EUR (mercado/precio): es el último punto de la serie. */
  precioActualEur?: number | null
  /** Factor para expresar los precios (EUR) en la moneda elegida. */
  factor: number
  ops: Operacion[]
  precioMedio: number
  proximoNivel?: number
}

function Grafica({ historico, precioActualEur, factor, ops, precioMedio, proximoNivel }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const [periodo, setPeriodo] = useState<Periodo>('1A')
  const reducir = useReducedMotion()
  // La hora de referencia cambia cuando llega un precio nuevo, no en cada render.
  const ahoraMs = useMemo(() => Date.now(), [historico, precioActualEur]) // eslint-disable-line react-hooks/exhaustive-deps

  const serie = useMemo(() => prepararSerie({ historico, precioActual: precioActualEur, ahoraMs, periodo, factor }), [historico, precioActualEur, ahoraMs, periodo, factor])
  const marcas = useMemo(() => prepararMarcas(ops, serie), [ops, serie])

  useEffect(() => {
    if (!el.current || serie.length < 2) return
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0D1117' }, textColor: '#8A94A6', fontFamily: 'JetBrains Mono, monospace', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: periodo === '1D', secondsVisible: false },
    })
    // La escala vertical incluye el precio medio y el próximo nivel, para que sus líneas se vean en todos los periodos.
    const extras = [precioMedio, proximoNivel].filter((n): n is number => typeof n === 'number' && n > 0)
    const incluirLineas = (orig: () => AutoscaleInfo | null): AutoscaleInfo | null => {
      const r = orig()
      if (!r || !r.priceRange || !extras.length) return r
      return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...extras), maxValue: Math.max(r.priceRange.maxValue, ...extras) } }
    }
    const linea = chart.addSeries(LineSeries, {
      color: '#E8ECF2', lineWidth: 2, priceLineVisible: false, priceFormat: { type: 'price', precision: 0, minMove: 1 }, autoscaleInfoProvider: incluirLineas,
    })
    const datos = serie.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    const marcasGrafica = marcas.map((m) => ({
      time: m.time as UTCTimestamp,
      position: m.tipo === 'compra' ? ('belowBar' as const) : ('aboveBar' as const),
      shape: 'circle' as const,
      color: m.tipo === 'compra' ? '#2EE6A6' : '#FF5C6C',
    }))
    const plugin = createSeriesMarkers(linea, reducir ? marcasGrafica : [])
    if (precioMedio > 0) linea.createPriceLine({ price: precioMedio, color: '#F7931A', lineStyle: LineStyle.Dashed, lineWidth: 2, title: 'Media' })
    if (proximoNivel) linea.createPriceLine({ price: proximoNivel, color: '#7CC4FF', lineStyle: LineStyle.Dotted, lineWidth: 2, title: 'Nivel' })

    const timers: ReturnType<typeof setTimeout>[] = []
    const terminar = () => {
      linea.setData(datos)
      chart.timeScale().fitContent()
      marcasGrafica.forEach((_, i) => timers.push(setTimeout(() => plugin.setMarkers(marcasGrafica.slice(0, i + 1)), i * 60)))
    }
    if (reducir) {
      linea.setData(datos)
      chart.timeScale().fitContent()
    } else {
      // La línea se dibuja de izquierda a derecha. Se usan temporizadores y un cierre garantizado:
      // si el navegador frena la animación, la gráfica aparece completa igualmente.
      const inicio = Date.now()
      const dur = 900
      const paso = () => {
        const k = Math.ceil(Math.min(1, (Date.now() - inicio) / dur) * datos.length)
        if (k >= datos.length) return terminar()
        linea.setData(datos.slice(0, Math.max(2, k)))
        chart.timeScale().fitContent()
        timers.push(setTimeout(paso, 40))
      }
      paso()
      timers.push(setTimeout(terminar, dur + 150))
    }
    return () => { timers.forEach(clearTimeout); chart.remove() }
  }, [serie, marcas, precioMedio, proximoNivel, periodo, reducir])

  return (
    <section className="card stack" aria-label="Gráfica del precio">
      <div className="row between wrap">
        <h2>Precio de BTC</h2>
        <div className="seg" role="group" aria-label="Rango">
          {PERIODOS.map((r) => (
            <button key={r} aria-pressed={periodo === r} onClick={() => setPeriodo(r)}>{r}</button>
          ))}
        </div>
      </div>
      {serie.length >= 2 ? <div
          className="chart-box" ref={el} role="img" aria-label="Gráfica del precio de bitcoin con tus compras y ventas"
          // Datos de la gráfica en el DOM (no se ven): permiten comprobar puntos, marcas y líneas en la auditoría automática.
          data-periodo={periodo} data-puntos={serie.length} data-primero={serie[0].time} data-ultimo-tiempo={serie[serie.length - 1].time} data-ultimo-valor={serie[serie.length - 1].value}
          data-marcas={JSON.stringify(marcas.map((m) => [new Date(m.time * 1000).toISOString().slice(0, 10), m.tipo]))} data-media={precioMedio > 0 ? precioMedio : ''} data-nivel={proximoNivel ?? ''}
        /> : <p className="muted">Aún no hay histórico de precios.</p>}
      <p className="notice"><span className="warn">- - -</span> precio medio · <span className="key">· · ·</span> próximo nivel clave · <span className="gain">●</span> compra · <span className="loss">●</span> venta</p>
    </section>
  )
}

export default function PrecioChart(props: Props) {
  return <ErrorBoundary etiqueta="La gráfica"><Grafica {...props} /></ErrorBoundary>
}
