import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type Time, type UTCTimestamp,
} from 'lightweight-charts'
import { useVista } from '../state/vista'
import { useMercadoDoc } from '../state/data'
import { suscribirOhlc } from '../lib/kraken'
import { aVelas, DOC_VELAS, factorDesdeEur, fusionarVelas, mediaMovil, TEMPORALIDADES, type FilaVela, type Temporalidad, type Vela } from '../lib/velas'
import { construirMarcas, type Marca } from '../lib/marcas'
import { velasSinteticas } from '../state/demoData'
import { proximoNivel } from '../lib/calculos'
import OperacionSheet from './OperacionSheet'
import TradeSheet from './TradeSheet'

const IND = [['ma7', 'MA(7)'], ['ma25', 'MA(25)'], ['ma99', 'MA(99)'], ['compras', 'Mis compras'], ['trades', 'Mis trades'], ['media', 'Precio medio'], ['volumen', 'Volumen']] as const
type Clave = (typeof IND)[number][0]
const IND_INICIAL: Record<Clave, boolean> = { ma7: true, ma25: true, ma99: false, compras: true, trades: true, media: true, volumen: true }
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

/** Velas de 1 y 5 minutos: carga inicial por REST (API pública de Kraken) y luego la vela en curso en directo por WebSocket. */
function useVelasDirecto(activo: boolean, moneda: 'EUR' | 'USD', intervalo: 1 | 5, demo: boolean) {
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
        if (!vivo) return
        // Mientras la pantalla está abierta: la vela en curso en directo. Se desconecta al salir o al pasar a segundo plano.
        baja = suscribirOhlc(moneda, intervalo, (nuevas) => { setVelas((prev) => fusionarVelas(prev, nuevas)); setEstado('directo') })
      })
    return () => { vivo = false; baja?.() }
  }, [activo, moneda, intervalo, demo])
  useEffect(() => { if (activo && velas.length && estado === 'directo') guardarCache(moneda, intervalo, velas) }, [activo, velas, estado, moneda, intervalo])
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
}

/** Gráfico de velas con volumen, medias móviles, marcas C/V/E/S y niveles. Lo usan el Gráfico pro y el Inicio pro. */
export default function GraficoVelas({ tfInicial = '1D', temporalidades = TEMPORALIDADES, alto = 420 }: Props) {
  const v = useVista()
  const [tf, setTf] = useState<Temporalidad>(temporalidades.includes(tfInicial) ? tfInicial : temporalidades[0])
  const [ind, setInd] = useState(leerInd)
  const [seleccion, setSeleccion] = useState<Marca[] | null>(null)
  const [edicion, setEdicion] = useState<null | { tipo: 'operacion' | 'trade'; id: string }>(null)
  const [leyenda, setLeyenda] = useState<Leyenda | null>(null)
  const { moneda, precios, res } = v
  const monedaKraken: 'EUR' | 'USD' = moneda === 'USD' ? 'USD' : 'EUR'
  const factor = moneda === 'AUD' ? factorDesdeEur('AUD', precios) : 1

  const esDirecto = tf === '1m' || tf === '5m'
  const doc = useMercadoDoc<{ EUR?: FilaVela[]; USD?: FilaVela[] }>(esDirecto ? '' : DOC_VELAS[tf]!)
  const directo = useVelasDirecto(esDirecto, monedaKraken, tf === '1m' ? 1 : 5, v.demo)
  const velas: Vela[] = useMemo(() => {
    if (esDirecto) return directo.velas.map((x) => ({ ...x, open: x.open * factor, high: x.high * factor, low: x.low * factor, close: x.close * factor }))
    return aVelas(doc?.[monedaKraken] ?? [], factor)
  }, [esDirecto, directo.velas, doc, monedaKraken, factor])

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
      handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: true }, // pellizcar para hacer zoom
      handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, // arrastrar para moverse por el tiempo
    })
    chart.current = c
    const vs = c.addSeries(CandlestickSeries, {
      upColor: GAIN, downColor: LOSS, borderUpColor: GAIN, borderDownColor: LOSS, wickUpColor: GAIN, wickDownColor: LOSS,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })
    velaSerie.current = vs
    marcasApi.current = createSeriesMarkers(vs, [])
    volSerie.current = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1)
    c.panes()[1]?.setStretchFactor(0.28)
    const clic = (p: { time?: Time }) => {
      if (p.time == null) return setSeleccion(null)
      const t = Number(p.time)
      const cerca = marcasActuales.current.filter((m) => Math.abs(m.time - t) <= pasoVela.current / 2)
      setSeleccion(cerca.length ? cerca : null)
    }
    c.subscribeClick(clic)
    // Al mantener pulsado (o con el ratón encima), la cruz enseña apertura, máximo, mínimo, cierre y volumen.
    const mover = (p: { time?: Time; seriesData: Map<unknown, unknown> }) => {
      const k = p.seriesData.get(vs) as { open: number; high: number; low: number; close: number } | undefined
      const vv = p.seriesData.get(volSerie.current) as { value: number } | undefined
      setLeyenda(p.time != null && k ? { time: Number(p.time), o: k.open, h: k.high, l: k.low, c: k.close, v: vv?.value ?? 0 } : null)
    }
    c.subscribeCrosshairMove(mover as never)
    return () => { c.unsubscribeClick(clic); c.unsubscribeCrosshairMove(mover as never); c.remove(); chart.current = null; velaSerie.current = null; volSerie.current = null; maSeries.current = {}; lineasTrade.current = []; lineasPrecio.current = [] }
  }, [])

  // Al cambiar de temporalidad o de moneda se vuelve a encuadrar; con las velas en directo no (así no se pierde el zoom).
  useEffect(() => { reencuadrar.current = true }, [tf, moneda])

  // ── Datos, medias móviles y volumen ──
  useEffect(() => {
    const c = chart.current, vs = velaSerie.current, vol = volSerie.current
    if (!c || !vs || !vol) return
    if (velas.length > 1) pasoVela.current = Math.max(1, velas[velas.length - 1].time - velas[velas.length - 2].time)
    vs.setData(velas.map((x) => ({ time: x.time as UTCTimestamp, open: x.open, high: x.high, low: x.low, close: x.close })))
    vol.setData(velas.map((x) => ({ time: x.time as UTCTimestamp, value: x.volume, color: x.close >= x.open ? 'rgba(46,230,166,0.45)' : 'rgba(255,92,108,0.45)' })))
    vol.applyOptions({ visible: ind.volumen })
    for (const [k, n, color] of [['ma7', 7, '#FFD166'], ['ma25', 25, '#C792EA'], ['ma99', 99, '#FFFFFF']] as const) {
      let s = maSeries.current[k]
      if (!ind[k]) { if (s) { c.removeSeries(s); delete maSeries.current[k] } continue }
      s ??= maSeries.current[k] = c.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      s.setData(mediaMovil(velas, n).map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
    }
    if (reencuadrar.current && velas.length) {
      c.timeScale().fitContent()
      c.timeScale().applyOptions({ rightOffset: 4 })
      reencuadrar.current = false
    }
  }, [velas, ind])

  // ── Marcas (C/V/E/S), líneas de trade y niveles horizontales ──
  const nivel = useMemo(() => (precios && res ? proximoNivel(v.plan, v.operaciones, precios.EUR, precios) : null), [precios, res, v.plan, v.operaciones])
  useEffect(() => {
    const c = chart.current, vs = velaSerie.current
    if (!c || !vs) return
    const { marcas, lineas } = construirMarcas({ velas, ops: v.ops, trades: v.trades, moneda, precios, verCompras: ind.compras, verTrades: ind.trades })
    marcasActuales.current = marcas
    marcasApi.current?.setMarkers(marcas.map((m) => ({
      time: m.time as UTCTimestamp, text: m.texto, size: 1,
      position: m.tipo === 'venta' || m.tipo === 'salida' ? ('aboveBar' as const) : ('belowBar' as const),
      shape: m.tipo === 'compra' ? ('arrowUp' as const) : m.tipo === 'venta' ? ('arrowDown' as const) : ('circle' as const),
      color: m.tipo === 'compra' ? GAIN : m.tipo === 'venta' ? LOSS : KEY,
    })))
    lineasTrade.current.forEach((s) => c.removeSeries(s))
    lineasTrade.current = lineas.map((l) => {
      const s = c.addSeries(LineSeries, { color: KEY, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      s.setData([{ time: l.desde.time as UTCTimestamp, value: l.desde.precio }, { time: l.hasta.time as UTCTimestamp, value: l.hasta.precio }])
      return s
    })
    lineasPrecio.current.forEach((l) => vs.removePriceLine(l))
    lineasPrecio.current = []
    if (ind.media && res && res.btc > 0) lineasPrecio.current.push(vs.createPriceLine({ price: res.precioMedioReal, color: ACCENT, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Tu media' }))
    if (nivel && precios) lineasPrecio.current.push(vs.createPriceLine({ price: nivel.precio * (precios[moneda] / precios.EUR), color: KEY, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Próximo nivel' }))
  }, [velas, v.ops, v.trades, moneda, precios, ind.compras, ind.trades, ind.media, res, nivel])


  const abrirEdicion = edicion
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="seg" role="group" aria-label="Temporalidad" style={{ alignSelf: 'stretch', justifyContent: 'space-between' }}>
        {temporalidades.map((t) => <button key={t} aria-pressed={tf === t} onClick={() => setTf(t)} style={{ padding: '0 9px', flex: 1 }}>{t}</button>)}
      </div>
      {esDirecto && <p className="notice" role="status">{directo.estado === 'directo' ? 'En directo' : directo.estado === 'cargando' ? 'Cargando velas…' : v.demo ? 'Velas de ejemplo (modo demo)' : 'Sin directo · últimas velas guardadas'}</p>}
      <div className="chips" aria-label="Indicadores">
        {IND.map(([k, l]) => <button key={k} type="button" className="opt" aria-pressed={ind[k]} onClick={() => guardarInd(k)}>{l}</button>)}
      </div>
      <div className="card velas-caja" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {leyenda && (
          <div className="velas-leyenda num" aria-live="off">
            {new Date(leyenda.time * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {' · A '}{dec(leyenda.o)}{' · M '}{dec(leyenda.h)}{' · m '}{dec(leyenda.l)}{' · C '}{dec(leyenda.c)}{' · Vol '}{vol(leyenda.v)}
          </div>
        )}
        <div ref={caja} style={{ height: alto, touchAction: 'pan-y' }} role="img" aria-label={`Gráfico de velas de BTC en ${moneda}, temporalidad ${tf}`} />
        {!velas.length && <p className="muted" style={{ padding: 16 }}>{esDirecto ? 'Cargando velas…' : 'Las velas de esta temporalidad aparecerán tras la próxima actualización del servidor.'}</p>}
      </div>
      {seleccion && (
        <section className="card stack" aria-live="polite" aria-label="Detalle de la marca">
          <div className="row between"><h3>Tus marcas</h3><button className="btn-ghost" onClick={() => setSeleccion(null)}>Cerrar</button></div>
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
