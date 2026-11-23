import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type Time, type UTCTimestamp,
} from 'lightweight-charts'
import { useVista } from '../state/vista'
import { useMercadoDoc } from '../state/data'
import { suscribirOhlc } from '../lib/kraken'
import { aVelas, DOC_VELAS, factorDesdeEur, fusionarVelas, mediaMovil, MINUTOS, soloCambiaLaUltima, TEMPORALIDADES, velasCrecientes, type FilaVela, type Temporalidad, type Vela } from '../lib/velas'
import { agruparMarcas, construirMarcas, type GrupoMarcas, type Marca } from '../lib/marcas'
import { velasSinteticas } from '../state/demoData'
import { proximoNivel } from '../lib/calculos'
import OperacionSheet from './OperacionSheet'
import { fijarPrueba, registrarPrueba } from '../lib/pruebas'
import TradeSheet from './TradeSheet'

const IND = [['ma7', 'MA(7)'], ['ma25', 'MA(25)'], ['ma99', 'MA(99)'], ['compras', 'Mis compras'], ['trades', 'Mis trades'], ['media', 'Precio medio'], ['volumen', 'Volumen']] as const
// «Mis trades» se recuerda por separado para 1D/1S (donde por defecto va oculto, porque se amontonan) y para el resto de temporalidades.
type Clave = (typeof IND)[number][0] | 'tradesLargo'
const IND_INICIAL: Record<Clave, boolean> = { ma7: true, ma25: true, ma99: false, compras: true, trades: true, tradesLargo: false, media: true, volumen: true }
const CLAVE_LS = 'grafico-indicadores'

function leerInd(): Record<Clave, boolean> {
  try { return { ...IND_INICIAL, ...JSON.parse(localStorage.getItem(CLAVE_LS) ?? '{}') } } catch { return IND_INICIAL }
}

const GAIN = '#2EE6A6', LOSS = '#FF5C6C', ACCENT = '#F7931A', KEY = '#7CC4FF'

/** Últimas velas guardadas en este dispositivo, por si no hay red («sin directo»). */
const cacheKey = (m: string, i: number) => `velas-cache:${m}:${i}`
function leerCache(m: string, i: number): Vela[] {
  try { return JSON.parse(localStorage.getItem(cacheKey(m, i)) ?? '[]') as Vela[] } catch { return [] }
}
function guardarCache(m: string, i: number, v: Vela[]) {
  try { localStorage.setItem(cacheKey(m, i), JSON.stringify(v.slice(-300))) } catch { /* sin espacio o sin permiso */ }
}

/**
 * Velas por REST (API pública de Kraken) y, si `enVivo` (solo 1m y 5m), la vela en curso en directo por WebSocket.
 * También sirve de respaldo para las temporalidades que el servidor aún no ha guardado.
 */
function useVelasDirecto(activo: boolean, moneda: 'EUR' | 'USD', intervalo: number, demo: boolean, enVivo = true) {
  const [velas, setVelas] = useState<Vela[]>([])
  const [estado, setEstado] = useState<'cargando' | 'directo' | 'sin-directo'>('cargando')
  useEffect(() => {
    if (!activo) return
    let vivo = true
    setVelas([]); setEstado('cargando')
    if (demo) {
      setVelas(aVelas(velasSinteticas(intervalo)[moneda])); setEstado('sin-directo')
      return
    }
    const cache = leerCache(moneda, intervalo)
    if (cache.length) setVelas(cache)
    let baja: (() => void) | undefined
    fetch(`https://api.kraken.com/0/public/OHLC?pair=XBT${moneda}&interval=${intervalo}`)
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json() })
      .then((j: { error?: unknown[]; result?: Record<string, unknown[][]> }) => {
        if (!vivo) return
        const clave = Object.keys(j.result ?? {}).find((k) => k !== 'last')
        if (j.error?.length || !clave) throw new Error('kraken')
        const filas = (j.result![clave] as unknown[][]).map((f) => [Number(f[0]), Number(f[1]), Number(f[2]), Number(f[3]), Number(f[4]), Number(f[6])] as FilaVela)
        setVelas(fusionarVelas([], aVelas(filas.filter((f) => f.every(Number.isFinite)))))
        setEstado('directo')
      })
      .catch(() => { if (vivo) setEstado('sin-directo') })
      .finally(() => {
        if (!vivo || !enVivo || (intervalo !== 1 && intervalo !== 5)) return
        // Mientras la pantalla está abierta: la vela en curso en directo. Se desconecta al salir o al pasar a segundo plano.
        baja = suscribirOhlc(moneda, intervalo as 1 | 5, (nuevas) => { setVelas((prev) => fusionarVelas(prev, nuevas)); setEstado('directo') })
      })
    return () => { vivo = false; baja?.() }
  }, [activo, moneda, intervalo, demo, enVivo])
  // La caché local se escribe como mucho cada 15 s (no en cada mensaje del directo).
  const ultimaCache = useRef(0)
  useEffect(() => {
    if (!activo || !velas.length || estado !== 'directo' || Date.now() - ultimaCache.current < 15_000) return
    ultimaCache.current = Date.now()
    guardarCache(moneda, intervalo, velas)
  }, [activo, velas, estado, moneda, intervalo])
  return { velas, estado }
}


const dec = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n)
const vol = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n)

interface Leyenda { time: number; o: number; h: number; l: number; c: number; v: number }
interface Props {
  tfInicial?: Temporalidad
  /** Temporalidades que se ofrecen (por defecto, todas). */
  temporalidades?: readonly Temporalidad[]
  alto?: number
  /** Trade seleccionado al abrir (su entrada, su salida y la línea que las une). */
  tradeDestacado?: string
}

/** Gráfico de velas con volumen, medias móviles, marcas C/V/E/S y niveles. Lo usan el Gráfico pro y el Inicio pro. */
export default function GraficoVelas({ tfInicial = '1D', temporalidades = TEMPORALIDADES, alto = 420, tradeDestacado }: Props) {
  const v = useVista()
  const [tf, setTf] = useState<Temporalidad>(temporalidades.includes(tfInicial) ? tfInicial : temporalidades[0])
  const [ind, setInd] = useState(leerInd)
  const [seleccion, setSeleccion] = useState<Marca[] | null>(null)
  const [tradeSel, setTradeSel] = useState<string[]>(tradeDestacado ? [tradeDestacado] : [])
  const [edicion, setEdicion] = useState<null | { tipo: 'operacion' | 'trade'; id: string }>(null)
  const [leyenda, setLeyenda] = useState<Leyenda | null>(null)
  const { moneda, res } = v
  const monedaKraken: 'EUR' | 'USD' = moneda === 'USD' ? 'USD' : 'EUR'
  // Los precios del servidor (cada 15 min) fijan el cambio a AUD y la conversión de las marcas: con el precio en vivo no cambian cada segundo.
  const base = v.mercado?.precios ?? null
  const factor = moneda === 'AUD' ? factorDesdeEur('AUD', base) : 1

  const esDirecto = tf === '1m' || tf === '5m'
  const doc = useMercadoDoc<{ EUR?: FilaVela[]; USD?: FilaVela[] }>(esDirecto ? '' : DOC_VELAS[tf]!)
  const filasDoc = doc?.[monedaKraken]
  const hayDoc = Boolean(filasDoc?.length)
  // Si el servidor aún no ha guardado esta temporalidad (pasado un momento sin documento), las pide el cliente a Kraken (REST) en vez de dejar el gráfico vacío.
  const [esperado, setEsperado] = useState(false)
  useEffect(() => {
    setEsperado(false)
    if (esDirecto || hayDoc) return
    const t = setTimeout(() => setEsperado(true), 1500)
    return () => clearTimeout(t)
  }, [tf, hayDoc, esDirecto, monedaKraken])
  const usarRest = !esDirecto && !hayDoc && esperado
  const directo = useVelasDirecto(esDirecto || usarRest, monedaKraken, MINUTOS[tf], v.demo, esDirecto)
  const velas: Vela[] = useMemo(() => {
    if (esDirecto || (usarRest && !hayDoc)) return directo.velas.map((x) => ({ ...x, open: x.open * factor, high: x.high * factor, low: x.low * factor, close: x.close * factor }))
    return aVelas(filasDoc ?? [], factor)
  }, [esDirecto, usarRest, hayDoc, directo.velas, filasDoc, factor])

  const guardarInd = (k: Clave) => setInd((s) => {
    const n = { ...s, [k]: !s[k] }
    try { localStorage.setItem(CLAVE_LS, JSON.stringify(n)) } catch { /* sin permiso */ }
    return n
  })

  // ── Gráfico (se crea una vez) ──
  const caja = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const velaSerie = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volSerie = useRef<ISeriesApi<'Histogram'> | null>(null)
  const maSeries = useRef<Record<string, ISeriesApi<'Line'>>>({})
  const marcasApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const lineasTrade = useRef<ISeriesApi<'Line'>[]>([])
  const lineasPrecio = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([])
  const marcasActuales = useRef<Marca[]>([])
  const gruposRef = useRef<GrupoMarcas[]>([])
  const marcadoRef = useRef<ReturnType<typeof construirMarcas>>({ marcas: [], lineas: [] })
  /** Pinta las marcas agrupando las que se solapan en pantalla (un marcador con el número). Se repite al hacer zoom o desplazarse. */
  const pintarMarcas = useCallback(() => {
    const c = chart.current, api = marcasApi.current
    if (!c || !api) return
    const ts = c.timeScale()
    const { marcas } = marcadoRef.current
    const grupos = agruparMarcas(marcas, (t) => ts.timeToCoordinate(t as UTCTimestamp), 18)
    gruposRef.current = grupos
    marcasActuales.current = marcas
    api.setMarkers(grupos.map((g) => {
      if (g.marcas.length > 1) return { time: g.time as UTCTimestamp, text: String(g.marcas.length), size: 2, position: 'aboveBar' as const, shape: 'circle' as const, color: '#E8ECF2' }
      const m = g.marcas[0]
      return {
        time: m.time as UTCTimestamp, text: m.texto, size: 1,
        position: m.tipo === 'venta' || m.tipo === 'salida' ? ('aboveBar' as const) : ('belowBar' as const),
        shape: m.tipo === 'compra' ? ('arrowUp' as const) : m.tipo === 'venta' ? ('arrowDown' as const) : ('circle' as const),
        color: m.tipo === 'compra' ? GAIN : m.tipo === 'venta' ? LOSS : KEY,
      }
    }))
    fijarPrueba('velas:marcas', marcas.length)
    fijarPrueba('velas:marcadores', grupos.length)
    fijarPrueba('velas:marcas-trade', marcas.filter((m) => m.tipo === 'entrada' || m.tipo === 'salida').length)
  }, [])
  const reencuadrar = useRef(true)
  const pasoVela = useRef(60)

  useEffect(() => {
    if (!caja.current) return
    const c = createChart(caja.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0D1117' }, textColor: '#8A94A6', fontFamily: 'JetBrains Mono, monospace', attributionLogo: false, panes: { separatorColor: 'rgba(255,255,255,0.08)' } },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal }, // la cruz marca precio y fecha al tocar
      handleScale: { pinch: true, mouseWheel: false, axisPressedMouseMove: true }, // pellizcar para hacer zoom
      handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, // arrastrar para moverse por el tiempo
    })
    registrarPrueba('velas:grafico-creado')
    chart.current = c
    const vs = c.addSeries(CandlestickSeries, {
      upColor: GAIN, downColor: LOSS, borderUpColor: GAIN, borderDownColor: LOSS, wickUpColor: GAIN, wickDownColor: LOSS,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })
    velaSerie.current = vs
    marcasApi.current = createSeriesMarkers(vs, [])
    volSerie.current = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1)
    c.panes()[1]?.setStretchFactor(0.28)
    const clic = (p: { time?: Time; point?: { x: number; y: number } }) => {
      if (p.time == null) { setSeleccion(null); setTradeSel([]); return }
      let g: GrupoMarcas | undefined
      if (p.point) {
        let mejor = 22 // píxeles
        for (const gr of gruposRef.current) {
          const x = c.timeScale().timeToCoordinate(gr.time as UTCTimestamp)
          if (x != null && Math.abs(x - p.point.x) < mejor) { mejor = Math.abs(x - p.point.x); g = gr }
        }
      } else {
        const t = Number(p.time)
        g = gruposRef.current.find((gr) => Math.abs(gr.time - t) <= pasoVela.current / 2)
      }
      setSeleccion(g ? g.marcas : null)
      // La línea entrada-salida solo se ve para el trade seleccionado.
      setTradeSel(g ? [...new Set(g.marcas.filter((m) => m.ref.tipo === 'trade').map((m) => m.ref.id))] : [])
    }
    c.subscribeClick(clic)
    // Al hacer zoom o desplazarse cambian las distancias en pantalla: se vuelven a agrupar las marcas (como mucho una vez por fotograma).
    let pendiente = false
    const reagrupar = () => { if (pendiente) return; pendiente = true; requestAnimationFrame(() => { pendiente = false; pintarMarcas() }) }
    c.timeScale().subscribeVisibleLogicalRangeChange(reagrupar)
    // Al mantener pulsado (o con el ratón encima), la cruz enseña apertura, máximo, mínimo, cierre y volumen.
    const mover = (p: { time?: Time; seriesData: Map<unknown, unknown> }) => {
      const k = p.seriesData.get(vs) as { open: number; high: number; low: number; close: number } | undefined
      const vv = p.seriesData.get(volSerie.current) as { value: number } | undefined
      setLeyenda(p.time != null && k ? { time: Number(p.time), o: k.open, h: k.high, l: k.low, c: k.close, v: vv?.value ?? 0 } : null)
    }
    c.subscribeCrosshairMove(mover as never)
    return () => { c.timeScale().unsubscribeVisibleLogicalRangeChange(reagrupar); c.unsubscribeClick(clic); c.unsubscribeCrosshairMove(mover as never); c.remove(); chart.current = null; velaSerie.current = null; volSerie.current = null; maSeries.current = {}; lineasTrade.current = []; lineasPrecio.current = [] }
  }, [pintarMarcas])

  // Al cambiar de temporalidad o de moneda se vuelve a encuadrar; con las velas en directo no (así no se pierde el zoom).
  useEffect(() => { reencuadrar.current = true }, [tf, moneda])

  // ── Datos, medias móviles y volumen ──
  // Si solo cambia la última vela (el directo), se actualiza esa vela con update(); setData() solo con datos nuevos de verdad.
  const previas = useRef<{ velas: Vela[]; ind: typeof ind } | null>(null)
  useEffect(() => {
    const c = chart.current, vs = velaSerie.current, vol = volSerie.current
    if (!c || !vs || !vol) return
    // Tiempos estrictamente crecientes y sin repetidos (lo exige el gráfico); las velas guardadas y las del directo pueden coincidir.
    const lista = velasCrecientes(velas)
    const prev = previas.current
    previas.current = { velas: lista, ind }
    if (lista.length > 1) pasoVela.current = Math.max(1, lista[lista.length - 1].time - lista[lista.length - 2].time)
    const velaD = (x: Vela) => ({ time: x.time as UTCTimestamp, open: x.open, high: x.high, low: x.low, close: x.close })
    const volD = (x: Vela) => ({ time: x.time as UTCTimestamp, value: x.volume, color: x.close >= x.open ? 'rgba(46,230,166,0.45)' : 'rgba(255,92,108,0.45)' })
    if (prev && prev.ind === ind && soloCambiaLaUltima(prev.velas, lista)) {
      registrarPrueba('velas:update')
      for (let i = prev.velas.length - 1; i < lista.length; i++) { vs.update(velaD(lista[i])); vol.update(volD(lista[i])) }
      for (const [k, n] of [['ma7', 7], ['ma25', 25], ['ma99', 99]] as const) {
        const ultima = mediaMovil(lista, n).at(-1)
        if (maSeries.current[k] && ultima) maSeries.current[k].update({ time: ultima.time as UTCTimestamp, value: ultima.value })
      }
      return
    }
    registrarPrueba('velas:setData')
    vs.setData(lista.map(velaD))
    vol.setData(lista.map(volD))
    if (!lista.length) { // sin velas: se limpian las series y se reinicia la escala (no se queda la de la temporalidad anterior)
      for (const s of Object.values(maSeries.current)) s.setData([])
      c.priceScale('right').applyOptions({ autoScale: true })
      c.timeScale().resetTimeScale()
      reencuadrar.current = true
      return
    }
    vol.applyOptions({ visible: ind.volumen })
    for (const [k, n, color] of [['ma7', 7, '#FFD166'], ['ma25', 25, '#C792EA'], ['ma99', 99, '#FFFFFF']] as const) {
      let s = maSeries.current[k]
      if (!ind[k]) { if (s) { c.removeSeries(s); delete maSeries.current[k] } continue }
      s ??= maSeries.current[k] = c.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      s.setData(mediaMovil(lista, n).map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
    }
    if (reencuadrar.current && lista.length) {
      c.timeScale().fitContent()
      c.timeScale().applyOptions({ rightOffset: 4 })
      reencuadrar.current = false
    }
  }, [velas, ind])

  // ── Marcas (C/V/E/S), líneas de trade y niveles horizontales ──
  const nivel = useMemo(() => (base && res ? proximoNivel(v.plan, v.operaciones, base.EUR, base) : null), [base, res, v.plan, v.operaciones])
  const nivelPrecio = nivel && base ? nivel.precio * (base[moneda] / base.EUR) : null
  const mediaPrecio = res && res.btc > 0 ? res.precioMedioReal : null
  // Marcas y líneas de trade: se calculan con los precios del servidor y solo se redibujan si su contenido cambia (no en cada precio en vivo).
  // «Mis trades» va oculto por defecto en 1D y 1S (se amontonan); un trade seleccionado se ve siempre, con su línea entrada-salida.
  const tfLargo = tf === '1D' || tf === '1S'
  const verTrades = tfLargo ? ind.tradesLargo : ind.trades
  const tradesMarcar = useMemo(() => (verTrades ? v.trades : v.trades.filter((t) => tradeSel.includes(t.id))), [verTrades, v.trades, tradeSel])
  const marcado = useMemo(() => {
    const r = construirMarcas({ velas, ops: v.ops, trades: tradesMarcar, moneda, precios: base, verCompras: ind.compras, verTrades: tradesMarcar.length > 0 })
    return { marcas: r.marcas, lineas: r.lineas.filter((l) => tradeSel.includes(l.id)) } // las líneas punteadas, solo del trade seleccionado
  }, [velas, v.ops, tradesMarcar, tradeSel, moneda, base, ind.compras])
  const marcadoClave = useMemo(() => JSON.stringify(marcado), [marcado])
  marcadoRef.current = marcado
  useEffect(() => {
    const c = chart.current
    if (!c) return
    registrarPrueba('velas:marcas-redibujadas')
    const { lineas } = marcadoRef.current
    pintarMarcas()
    fijarPrueba('velas:lineas', lineas.length)
    lineasTrade.current.forEach((s) => c.removeSeries(s))
    lineasTrade.current = lineas.map((l) => {
      const s = c.addSeries(LineSeries, { color: KEY, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      s.setData([{ time: l.desde.time as UTCTimestamp, value: l.desde.precio }, { time: l.hasta.time as UTCTimestamp, value: l.hasta.precio }])
      return s
    })
  }, [marcadoClave, pintarMarcas])
  // Líneas horizontales: solo si cambian sus valores.
  useEffect(() => {
    const vs = velaSerie.current
    if (!vs) return
    registrarPrueba('velas:lineas-redibujadas')
    lineasPrecio.current.forEach((l) => vs.removePriceLine(l))
    lineasPrecio.current = []
    if (ind.media && mediaPrecio != null) lineasPrecio.current.push(vs.createPriceLine({ price: mediaPrecio, color: ACCENT, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Tu media' }))
    if (nivelPrecio != null) lineasPrecio.current.push(vs.createPriceLine({ price: nivelPrecio, color: KEY, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Próximo nivel' }))
  }, [ind.media, mediaPrecio, nivelPrecio])

  const abrirEdicion = edicion
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="seg" role="group" aria-label="Temporalidad" style={{ alignSelf: 'stretch', justifyContent: 'space-between' }}>
        {temporalidades.map((t) => <button key={t} aria-pressed={tf === t} onClick={() => setTf(t)} style={{ padding: '0 9px', flex: 1 }}>{t}</button>)}
      </div>
      {usarRest && !hayDoc && <p className="notice" role="status">{directo.velas.length ? 'Velas de Kraken: el servidor aún no ha guardado esta temporalidad.' : directo.estado === 'cargando' ? 'Cargando velas…' : 'No se han podido cargar las velas de esta temporalidad.'}</p>}
      {esDirecto && <p className="notice" role="status">{directo.estado === 'directo' ? 'En directo' : directo.estado === 'cargando' ? 'Cargando velas…' : v.demo ? 'Velas de ejemplo (modo demo)' : 'Sin directo · últimas velas guardadas'}</p>}
      <div className="chips" aria-label="Indicadores">
        {IND.map(([k, l]) => {
          const clave: Clave = k === 'trades' && tfLargo ? 'tradesLargo' : k
          return <button key={k} type="button" className="opt" aria-pressed={ind[clave]} onClick={() => guardarInd(clave)}>{l}</button>
        })}
      </div>
      <div className="card velas-caja" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {leyenda && (
          <div className="velas-leyenda num" aria-live="off">
            {new Date(leyenda.time * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {' · A '}{dec(leyenda.o)}{' · M '}{dec(leyenda.h)}{' · m '}{dec(leyenda.l)}{' · C '}{dec(leyenda.c)}{' · Vol '}{vol(leyenda.v)}
          </div>
        )}
        <div ref={caja} data-velas={velas.length} data-tf={tf} data-origen={esDirecto ? 'directo' : hayDoc ? 'servidor' : usarRest ? 'kraken' : 'esperando'} style={{ height: alto, touchAction: 'pan-y' }} role="img" aria-label={`Gráfico de velas de BTC en ${moneda}, temporalidad ${tf}`} />
        {!velas.length && <p className="muted" style={{ padding: 16 }}>{esDirecto ? 'Cargando velas…' : 'Las velas de esta temporalidad aparecerán tras la próxima actualización del servidor.'}</p>}
      </div>
      {seleccion && (
        <section className="card stack" aria-live="polite" aria-label="Detalle de la marca">
          <div className="row between"><h3>Tus marcas</h3><button className="btn-ghost" onClick={() => { setSeleccion(null); setTradeSel([]) }}>Cerrar</button></div>
          {seleccion.map((m, i) => (
            <div key={i} className="stack" style={{ gap: 4 }}>
              <p className="num" style={{ fontSize: 13 }}>{m.detalle}</p>
              <button className="btn-ghost" style={{ alignSelf: 'flex-start', padding: 0, minHeight: 28 }} onClick={() => setEdicion(m.ref)}>Editar</button>
            </div>
          ))}
        </section>
      )}
      {abrirEdicion?.tipo === 'operacion' && (() => {
        const o = v.operaciones.find((x) => x.id === abrirEdicion.id)
        return o ? <OperacionSheet tipo={o.tipo} inicial={o} onCerrar={() => setEdicion(null)} /> : null
      })()}
      {abrirEdicion?.tipo === 'trade' && (() => {
        const t = v.trades.find((x) => x.id === abrirEdicion.id)
        return t ? <TradeSheet inicial={t} onCerrar={() => setEdicion(null)} /> : null
      })()}
    </div>
  )
}
