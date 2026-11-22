import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from 'motion/react'
import type { Vista } from '../../state/vista'
import { useMercadoDoc } from '../../state/data'
import Velas from '../../components/Velas'
import Medidor from '../../components/Medidor'
import { dinero, porcentaje } from '../../lib/format'
import { COLORES, EJE, REJILLA, tip } from './comun'

interface Fng { valor: number; clasificacion?: string; serie?: { t: number; v: number }[] }
interface Global { dominanciaBtc?: number | null; capitalizacion?: Record<string, number> | null }
interface Red { altura?: number; tarifas?: { rapida: number; media: number; lenta: number }; diasHalving?: number; diasDesdeUltimo?: number; bloquesRestantes?: number }

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

export default function MercadoTab({ v }: { v: Vista }) {
  const reducir = useReducedMotion()
  const velas = useMercadoDoc<{ diarias?: number[][]; semanales?: number[][] }>('velas')
  const fng = useMercadoDoc<Fng>('fng')
  const glob = useMercadoDoc<Global>('global')
  const red = useMercadoDoc<Red>('red')
  const factor = v.precios ? v.precios[v.moneda] / v.precios.EUR : 1
  const ath = v.mercado?.maximoHistorico[v.moneda]
  const athFecha = v.mercado?.athFecha ?? (v.historico.length ? new Date(v.historico.reduce((m, p) => (p.precio > m.precio ? p : m)).t) : null)
  const diasAth = athFecha ? Math.max(0, Math.floor((Date.now() - athFecha.getTime()) / 86400000)) : null
  const cap = glob?.capitalizacion?.[v.moneda.toLowerCase()]

  return (
    <>
      <Velas velas={velas} factor={factor} />

      <section className="card stack" aria-label="Miedo y codicia">
        <h2>Miedo y codicia</h2>
        {fng ? (
          <>
            <div className="row" style={{ justifyContent: 'center' }}><Medidor valor={fng.valor} clasificacion={fng.clasificacion} /></div>
            <p style={{ textAlign: 'center' }}>{fng.clasificacion}</p>
            {fng.serie && fng.serie.length > 1 && (
              <div className="chart-box" style={{ height: 160 }}>
                <ResponsiveContainer>
                  <LineChart data={fng.serie.map((p) => ({ fecha: new Date(p.t).toISOString().slice(5, 10), v: p.v }))}>
                    <CartesianGrid stroke={REJILLA} vertical={false} />
                    <XAxis dataKey="fecha" {...EJE} minTickGap={28} />
                    <YAxis {...EJE} width={28} domain={[0, 100]} />
                    <Tooltip {...tip} />
                    <Line type="monotone" dataKey="v" name="Índice" stroke={COLORES.acento} dot={false} strokeWidth={2} isAnimationActive={!reducir} animationDuration={800} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="notice">Evolución de 30 días. Fuente: alternative.me (se actualiza una vez al día).</p>
          </>
        ) : <p className="muted">Sin datos todavía.</p>}
      </section>

      <section className="card stack" aria-label="Mercado global">
        <h2>Dominancia y capitalización</h2>
        {glob?.dominanciaBtc != null ? <p className="num">Dominancia de BTC: {nf.format(glob.dominanciaBtc)} %</p> : <p className="muted">Sin datos todavía.</p>}
        {cap != null && <p className="num">Capitalización total: {dinero(cap / 1e9, v.moneda, 0)} mil millones</p>}
        <p className="notice">Fuente: CoinGecko.</p>
      </section>

      <section className="card stack" aria-label="Máximo histórico">
        <h2>Máximo histórico</h2>
        {ath ? (
          <>
            <p className="num">{dinero(ath, v.moneda, 0)} · el precio está un <span className="loss">▼ {porcentaje(Math.max(0, 1 - v.precio / ath))}</span> por debajo</p>
            {diasAth != null && <p className="muted num">Hace {diasAth} días{athFecha ? ` (${athFecha.toLocaleDateString('es-ES')})` : ''}.</p>}
          </>
        ) : <p className="muted">Sin datos todavía.</p>}
      </section>

      <section className="card stack" aria-label="Halving">
        <h2>Ciclo del halving</h2>
        {red?.diasHalving != null && red.diasDesdeUltimo != null ? (
          <>
            <div role="progressbar" aria-label="Progreso del ciclo" aria-valuenow={Math.round((red.diasDesdeUltimo / (red.diasDesdeUltimo + red.diasHalving)) * 100)} aria-valuemin={0} aria-valuemax={100} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 10, overflow: 'hidden' }}>
              <div style={{ width: `${(red.diasDesdeUltimo / (red.diasDesdeUltimo + red.diasHalving)) * 100}%`, background: 'var(--accent)', height: '100%' }} />
            </div>
            <p className="num">{Math.round(red.diasDesdeUltimo)} días desde el último halving · faltan ≈ {Math.round(red.diasHalving)} para el próximo</p>
            {red.bloquesRestantes != null && <p className="muted num">{new Intl.NumberFormat('es-ES').format(red.bloquesRestantes)} bloques restantes (estimación: 10 min por bloque).</p>}
          </>
        ) : <p className="muted">Sin datos todavía.</p>}
        <p className="notice">Fuente: mempool.space. Es una estimación, no una fecha exacta.</p>
      </section>

      <section className="card stack" aria-label="Comisiones de la red">
        <h2>Comisiones de la red</h2>
        {red?.tarifas ? (
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {([['Rápida', red.tarifas.rapida], ['Media', red.tarifas.media], ['Lenta', red.tarifas.lenta]] as const).map(([k, n]) => (
              <div className="stat" key={k}><span className="muted" style={{ fontSize: 12 }}>{k}</span><span className="num">{n} <span className="muted" style={{ fontSize: 11 }}>sat/vB</span></span></div>
            ))}
          </div>
        ) : <p className="muted">Sin datos todavía.</p>}
        <p className="notice">Fuente: mempool.space.</p>
      </section>
      <p className="notice" role="note">Datos de mercado a título informativo. No son una recomendación de inversión.</p>
    </>
  )
}
