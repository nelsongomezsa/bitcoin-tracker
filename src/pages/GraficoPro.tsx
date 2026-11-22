import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type Time, type UTCTimestamp,
} from 'lightweight-charts'
import { ArrowLeft } from 'lucide-react'
import { useVista } from '../state/vista'
import { useMercadoDoc } from '../state/data'
import { suscribirOhlc } from '../lib/kraken'
import { aVelas, DOC_VELAS, factorDesdeEur, fusionarVelas, mediaMovil, PERIODOS, rendimiento, TEMPORALIDADES, type FilaVela, type Temporalidad, type Vela } from '../lib/velas'
import { construirMarcas, type Marca } from '../lib/marcas'
import { velasSinteticas } from '../state/demoData'
import { proximoNivel } from '../lib/calculos'
import { claseSigno, dinero, flecha, porcentajeConSigno } from '../lib/format'
import PrecioVivo from '../components/PrecioVivo'
import OperacionSheet from '../components/OperacionSheet'
import ErrorBoundary from '../components/ErrorBoundary'

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

interface TarjetaMarca { titulo: string; detalles: string[] }

function Grafico() {
  const v = useVista()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const inicial = TEMPORALIDADES.includes(params.get('tf') as Temporalidad) ? (params.get('tf') as Temporalidad) : '1D'
  const [tf, setTf] = useState<Temporalidad>(inicial)
  const [ind, setInd] = useState(leerInd)
  const [hoja, setHoja] = useState<null | 'compra' | 'venta'>(null)
  const [seleccion, setSeleccion] = useState<TarjetaMarca | null>(null)
  const { moneda, precios, res } = v
  const monedaKraken: 'EUR' | 'USD' = moneda === 'USD' ? 'USD' : 'EUR'
  const factor = moneda === 'AUD' ? factorDesdeEur('AUD', precios) : 1

  // Velas: 1m y 5m en directo (Kraken); el resto, de los documentos que guarda el job.
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
      setSeleccion(cerca.length ? { titulo: 'Tus marcas', detalles: cerca.map((m) => m.detalle) } : null)
    }
    c.subscribeClick(clic)
    return () => { c.unsubscribeClick(clic); c.remove(); chart.current = null; velaSerie.current = null; volSerie.current = null; maSeries.current = {}; lineasTrade.current = []; lineasPrecio.current = [] }
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

  const precio = precios?.[moneda] ?? 0
  const tick = v.ticks24h[monedaKraken]
  const cambio24 = tick && Number.isFinite(tick.cambioPct) ? tick.cambioPct / 100 : (v.mercado?.cambio24h ?? 0)
  const factorK = moneda === 'AUD' ? factor : 1
  const dato = (k: string, val: string) => <div className="stat"><span className="muted" style={{ fontSize: 11 }}>{k}</span><span className="num" style={{ fontSize: 13 }}>{val}</span></div>
  const rends = useMemo(() => PERIODOS.map(([l, d]) => [l, d === 1 ? cambio24 : rendimiento(v.historico, precios?.EUR ?? 0, d)] as const), [v.historico, precios, cambio24])

  return (
    <main className="app stack" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
      <header className="row between">
        <button className="btn-ghost" aria-label="Volver" onClick={() => nav(-1)}><ArrowLeft size={22} strokeWidth={1.75} /></button>
        <h1 style={{ fontSize: 17 }}>BTC/{moneda}</h1>
        <div className="seg" role="group" aria-label="Moneda">
          {(['EUR', 'USD', 'AUD'] as const).map((m) => <button key={m} aria-pressed={moneda === m} onClick={() => v.setMoneda(m)}>{m}</button>)}
        </div>
      </header>

      <section className="card stack" aria-label="Precio">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: 2 }}>
            <div className="big" style={{ fontSize: 28 }}>{precio ? <PrecioVivo valor={precio} texto={dinero(precio, moneda, 0)} /> : '—'}</div>
            <div className={`num ${claseSigno(cambio24)}`}>{flecha(cambio24)} {porcentajeConSigno(cambio24)} <span className="muted" style={{ fontSize: 12 }}>hoy</span></div>
          </div>
          <div className="grid2" style={{ gap: 6, textAlign: 'right' }}>
            {dato('Máx. 24h', tick && Number.isFinite(tick.high) ? dinero(tick.high * factorK, moneda, 0) : '—')}
            {dato('Mín. 24h', tick && Number.isFinite(tick.low) ? dinero(tick.low * factorK, moneda, 0) : '—')}
            {dato('Vol. 24h', tick && Number.isFinite(tick.volume) ? `${Math.round(tick.volume).toLocaleString('es-ES')} BTC` : '—')}
            {dato('Tu media', res && res.btc > 0 ? v.$(res.precioMedioReal) : '—')}
          </div>
        </div>
      </section>

      <div className="seg" role="group" aria-label="Temporalidad" style={{ alignSelf: 'stretch', justifyContent: 'space-between' }}>
        {TEMPORALIDADES.map((t) => <button key={t} aria-pressed={tf === t} onClick={() => setTf(t)} style={{ padding: '0 9px', flex: 1 }}>{t}</button>)}
      </div>
      {esDirecto && <p className="notice" role="status">{directo.estado === 'directo' ? 'En directo' : directo.estado === 'cargando' ? 'Cargando velas…' : v.demo ? 'Velas de ejemplo (modo demo)' : 'Sin directo · últimas velas guardadas'}</p>}

      <div className="chips" aria-label="Indicadores">
        {IND.map(([k, l]) => <button key={k} type="button" className="opt" aria-pressed={ind[k]} onClick={() => guardarInd(k)}>{l}</button>)}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div ref={caja} style={{ height: 420, touchAction: 'pan-y' }} role="img" aria-label={`Gráfico de velas de BTC en ${moneda}, temporalidad ${tf}`} />
        {!velas.length && <p className="muted" style={{ padding: 16 }}>{esDirecto ? 'Cargando velas…' : 'Las velas de esta temporalidad aparecerán tras la próxima actualización del servidor.'}</p>}
      </div>
      {seleccion && (
        <section className="card stack" aria-live="polite" aria-label="Detalle de la marca">
          <div className="row between"><h3>{seleccion.titulo}</h3><button className="btn-ghost" onClick={() => setSeleccion(null)}>Cerrar</button></div>
          {seleccion.detalles.map((d, i) => <p key={i} className="num" style={{ fontSize: 13 }}>{d}</p>)}
        </section>
      )}

      <section className="card stack" aria-label="Rendimiento por periodos">
        <h2>Rendimiento</h2>
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {rends.map(([l, r]) => (
            <div key={l} className="stat"><span className="muted" style={{ fontSize: 12 }}>{l}</span>
              <span className={`num ${r == null ? '' : claseSigno(r)}`}>{r == null ? '—' : `${flecha(r)} ${porcentajeConSigno(r, 1)}`}</span></div>
          ))}
        </div>
      </section>

      <section className="card stack" aria-label="Tu posición">
        <h2>Tu posición</h2>
        {res && res.btc > 0 ? (
          <div className="grid2">
            <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Tus BTC</span><span className="num">{v.btcF(res.btc)}</span></div>
            <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Valen</span><span className="num">{v.$(res.valorHoy)}</span></div>
            <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Tu resultado</span><span className={`num ${claseSigno(res.ganancia)}`}>{flecha(res.ganancia)} {v.$s(res.ganancia)}</span></div>
            <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Rentabilidad</span><span className={`num ${claseSigno(res.rentabilidad)}`}>{v.pct(res.rentabilidad)}</span></div>
          </div>
        ) : <p className="muted">Todavía no tienes BTC apuntados.</p>}
      </section>
      <p className="notice">La app no opera ni se conecta a ningún exchange: solo registra. Información de mercado, no una recomendación de inversión.</p>

      <div className="row" style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(10px + env(safe-area-inset-bottom))', maxWidth: 736, margin: '0 auto', zIndex: 30 }}>
        <button className="btn-big" style={{ flex: 1, background: GAIN, color: '#04140d', border: 'none', fontWeight: 700 }} onClick={() => setHoja('compra')}>Apuntar compra</button>
        <button className="btn-big" style={{ flex: 1, background: LOSS, color: '#1a0508', border: 'none', fontWeight: 700 }} onClick={() => setHoja('venta')}>Apuntar venta</button>
      </div>
      {hoja && <OperacionSheet tipo={hoja} onCerrar={() => setHoja(null)} />}
    </main>
  )
}

export default function GraficoPro() {
  return <ErrorBoundary><Grafico /></ErrorBoundary>
}
