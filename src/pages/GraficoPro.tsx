import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useVista } from '../state/vista'
import { TEMPORALIDADES, type Temporalidad } from '../lib/velas'
import { claseSigno, dinero, flecha, porcentajeConSigno } from '../lib/format'
import PrecioVivo from '../components/PrecioVivo'
import OperacionSheet from '../components/OperacionSheet'
import ErrorBoundary from '../components/ErrorBoundary'
import GraficoVelas from '../components/GraficoVelas'
import FilaRendimiento from '../components/FilaRendimiento'
import { useStats24h } from '../hooks/useStats24h'

const GAIN = '#1FBF8A', LOSS = '#F0465A'

function Grafico() {
  const v = useVista()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const inicial = TEMPORALIDADES.includes(params.get('tf') as Temporalidad) ? (params.get('tf') as Temporalidad) : '1D'
  const [hoja, setHoja] = useState<null | 'compra' | 'venta'>(null)
  const { moneda, precios, res } = v
  const monedaKraken: 'EUR' | 'USD' = moneda === 'USD' ? 'USD' : 'EUR'

  const precio = precios?.[moneda] ?? 0
  const stats = useStats24h(moneda)
  const tick = v.ticks24h[monedaKraken]
  const cambio24 = tick && Number.isFinite(tick.cambioPct) ? tick.cambioPct / 100 : (v.mercado?.cambio24h ?? 0)
  const dato = (k: string, val: string) => <div className="stat"><span className="muted" style={{ fontSize: 11 }}>{k}</span><span className="num" style={{ fontSize: 13 }}>{val}</span></div>

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
            {dato('Máx. 24h', stats ? dinero(stats.high, moneda, 0) : '—')}
            {dato('Mín. 24h', stats ? dinero(stats.low, moneda, 0) : '—')}
            {dato('Vol. 24h', stats ? `${Math.round(stats.volume).toLocaleString('es-ES')} BTC` : '—')}
            {dato('Tu media', res && res.btc > 0 ? v.$(res.precioMedioReal) : '—')}
          </div>
        </div>
      </section>

      <GraficoVelas tfInicial={inicial} tradeDestacado={params.get('trade') ?? undefined} />

      <section className="card stack" aria-label="Rendimiento por periodos">
        <h2>Rendimiento</h2>
        <FilaRendimiento cambio24h={cambio24} />
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
