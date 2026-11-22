import { useEffect, useMemo, useRef, useState } from 'react'
import { ColorType, LineStyle, LineSeries, createChart, createSeriesMarkers, type AutoscaleInfo, type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type Time, type UTCTimestamp } from 'lightweight-charts'
import { useReducedMotion } from 'motion/react'
import type { Operacion, PuntoPrecio } from '../lib/calculos'
import { PERIODOS, prepararMarcas, prepararSerie, type Periodo } from '../lib/serieGrafica'
import ErrorBoundary from './ErrorBoundary'
import { registrarPrueba } from '../lib/pruebas'

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
  // La hora de referencia NO depende del precio: así el último punto conserva su tiempo y cada precio nuevo lo actualiza en su sitio
  // (antes cambiaba con cada precio en vivo y obligaba a rehacer el gráfico entero cada segundo). Se renueva cada 5 minutos.
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  useEffect(() => { setAhoraMs(Date.now()) }, [historico])
  useEffect(() => { const t = setInterval(() => setAhoraMs(Date.now()), 5 * 60_000); return () => clearInterval(t) }, [])

  const serie = useMemo(() => prepararSerie({ historico, precioActual: precioActualEur, ahoraMs, periodo, factor }), [historico, precioActualEur, ahoraMs, periodo, factor])
  const marcas = useMemo(() => prepararMarcas(ops, serie), [ops, serie])
  // Las marcas se comparan por contenido: con el precio en vivo `ops` se recalcula cada segundo, pero las marcas son las mismas.
  const marcasClave = useMemo(() => JSON.stringify(marcas), [marcas])
  const hayGrafica = serie.length >= 2

  const chartRef = useRef<IChartApi | null>(null)
  const lineaRef = useRef<ISeriesApi<'Line'> | null>(null)
  const pluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const lineasPrecio = useRef<IPriceLine[]>([])
  const extras = useRef<number[]>([])
  const previa = useRef<{ periodo: Periodo; datos: { time: number; value: number }[] } | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const limpiarTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  // 1) El gráfico y su serie se crean UNA sola vez; al desmontar se destruyen.
  useEffect(() => {
    if (!hayGrafica || !el.current) return
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0D1117' }, textColor: '#8A94A6', fontFamily: 'JetBrains Mono, monospace', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', secondsVisible: false },
      // En el móvil, el scroll vertical mueve la página y el gráfico solo se desplaza en horizontal (o con pellizco).
      handleScroll: { horzTouchDrag: true, vertTouchDrag: false, pressedMouseMove: true, mouseWheel: false },
      handleScale: { pinch: true, mouseWheel: false, axisPressedMouseMove: false, axisDoubleClickReset: true },
    })
    // La escala vertical incluye el precio medio y el próximo nivel, para que sus líneas se vean en todos los periodos.
    const incluirLineas = (orig: () => AutoscaleInfo | null): AutoscaleInfo | null => {
      const r = orig()
      const ex = extras.current
      if (!r || !r.priceRange || !ex.length) return r
      return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...ex), maxValue: Math.max(r.priceRange.maxValue, ...ex) } }
    }
    const linea = chart.addSeries(LineSeries, {
      color: '#E8ECF2', lineWidth: 2, priceLineVisible: false, priceFormat: { type: 'price', precision: 0, minMove: 1 }, autoscaleInfoProvider: incluirLineas,
    })
    registrarPrueba('precio:grafico-creado')
    chartRef.current = chart
    lineaRef.current = linea
    pluginRef.current = createSeriesMarkers(linea, [])
    previa.current = null
    return () => {
      limpiarTimers()
      chart.remove()
      chartRef.current = null; lineaRef.current = null; pluginRef.current = null; lineasPrecio.current = []; previa.current = null
    }
  }, [hayGrafica])

  // 2) Los datos: precio en vivo = actualizar solo el último punto; otro periodo = dibujado animado; otro cambio = setData sin animar.
  useEffect(() => {
    const chart = chartRef.current, linea = lineaRef.current
    if (!chart || !linea || !hayGrafica) return
    const datos = serie.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    chart.timeScale().applyOptions({ timeVisible: periodo === '1D' })
    const prev = previa.current
    previa.current = { periodo, datos }
    const mismaForma = prev && prev.periodo === periodo && prev.datos.length === datos.length && prev.datos.every((p, i) => i === datos.length - 1 || (p.time === datos[i].time && p.value === datos[i].value))
    if (mismaForma && prev!.datos[datos.length - 1].time === datos[datos.length - 1].time) {
      registrarPrueba('precio:update')
      linea.update(datos[datos.length - 1])
      return
    }
    limpiarTimers()
    if (prev && prev.periodo === periodo) { // los datos cambian pero es el mismo periodo: sin animación
      registrarPrueba('precio:setData')
      linea.setData(datos)
      return
    }
    if (reducir) {
      linea.setData(datos)
      chart.timeScale().fitContent()
      return
    }
    // La línea se dibuja de izquierda a derecha al entrar o al cambiar de periodo. Con temporizadores y un cierre garantizado.
    const inicio = Date.now()
    const dur = 900
    const terminar = () => { linea.setData(datos); chart.timeScale().fitContent() }
    const paso = () => {
      const k = Math.ceil(Math.min(1, (Date.now() - inicio) / dur) * datos.length)
      if (k >= datos.length) return terminar()
      linea.setData(datos.slice(0, Math.max(2, k)))
      chart.timeScale().fitContent()
      timers.current.push(setTimeout(paso, 40))
    }
    paso()
    timers.current.push(setTimeout(terminar, dur + 150))
  }, [serie, periodo, reducir, hayGrafica])

  // 3) Marcas de compras y ventas (solo cuando cambian de verdad).
  useEffect(() => {
    const plugin = pluginRef.current
    if (!plugin || !hayGrafica) return
    const lista = (JSON.parse(marcasClave) as { time: number; tipo: 'compra' | 'venta' }[]).map((m) => ({
      time: m.time as UTCTimestamp,
      position: m.tipo === 'compra' ? ('belowBar' as const) : ('aboveBar' as const),
      shape: 'circle' as const,
      color: m.tipo === 'compra' ? '#2EE6A6' : '#FF5C6C',
    }))
    if (reducir) { plugin.setMarkers(lista); return }
    plugin.setMarkers([])
    const t = lista.map((_, i) => setTimeout(() => plugin.setMarkers(lista.slice(0, i + 1)), 900 + i * 60))
    return () => t.forEach(clearTimeout)
  }, [marcasClave, reducir, hayGrafica, periodo])

  // 4) Líneas del precio medio y del próximo nivel (solo cuando cambian sus valores).
  useEffect(() => {
    const linea = lineaRef.current
    if (!linea || !hayGrafica) return
    lineasPrecio.current.forEach((l) => linea.removePriceLine(l))
    lineasPrecio.current = []
    extras.current = [precioMedio, proximoNivel].filter((n): n is number => typeof n === 'number' && n > 0)
    if (precioMedio > 0) lineasPrecio.current.push(linea.createPriceLine({ price: precioMedio, color: '#F7931A', lineStyle: LineStyle.Dashed, lineWidth: 2, title: 'Media' }))
    if (proximoNivel) lineasPrecio.current.push(linea.createPriceLine({ price: proximoNivel, color: '#7CC4FF', lineStyle: LineStyle.Dotted, lineWidth: 2, title: 'Nivel' }))
  }, [precioMedio, proximoNivel, hayGrafica])

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
          className="chart-box" ref={el} style={{ touchAction: 'pan-y' }} role="img" aria-label="Gráfica del precio de bitcoin con tus compras y ventas"
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
