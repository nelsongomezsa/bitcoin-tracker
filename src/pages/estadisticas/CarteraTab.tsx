import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from 'motion/react'
import type { Vista } from '../../state/vista'
import { drawdown, hitosCartera, serieCartera, serieRentabilidad } from '../../lib/calculos'
import { dinero, fechaCorta, porcentajeConSigno } from '../../lib/format'
import { COLORES, EJE, REJILLA, tip } from './comun'
import VelasSerie from '../../components/VelasSerie'
import { velasDeSerie } from '../../lib/velas'
import { btc as fBtc } from '../../lib/format'

function muestrear<T>(a: T[], max = 120): T[] {
  const paso = Math.max(1, Math.floor(a.length / max))
  return a.filter((_, i) => i % paso === 0 || i === a.length - 1)
}

export default function CarteraTab({ v }: { v: Vista }) {
  const reducir = useReducedMotion()
  const [tipoGrafica, setTipoGrafica] = useState<'area' | 'velas'>('area')
  const factor = v.precios ? v.precios[v.moneda] / v.precios.EUR : 1
  const completa = useMemo(() => {
    try { return serieCartera(v.ops, v.historico.map((p) => ({ ...p, precio: p.precio * factor }))) } catch { return [] }
  }, [v.historico, v.ops, factor])
  const serie = useMemo(() => muestrear(completa), [completa])
  const rent = useMemo(() => serieRentabilidad(serie).map((p) => ({ fecha: p.fecha, rent: Number((p.rentabilidad * 100).toFixed(2)) })), [serie])
  const dd = useMemo(() => drawdown(completa), [completa])
  const ddSerie = useMemo(() => muestrear(dd).map((p) => ({ fecha: p.fecha, caida: Number((p.caida * 100).toFixed(2)) })), [dd])
  const maxCaida = dd.length ? Math.min(...dd.map((p) => p.caida)) : 0
  const hitos = useMemo(() => hitosCartera(completa), [completa])
  const velasValor = useMemo(() => velasDeSerie(completa.map((p) => ({ fecha: p.fecha, valor: p.valor }))), [completa])
  const velasRent = useMemo(() => velasDeSerie(serieRentabilidad(completa).map((p) => ({ fecha: p.fecha, valor: p.rentabilidad * 100 }))), [completa])
  const enVelas = v.pro && tipoGrafica === 'velas'

  if (v.privado) return <p className="card notice">Modo privado activo: las gráficas con importes están ocultas.</p>
  if (completa.length < 2) return <p className="card muted">Hace falta histórico de precios y alguna compra para estas gráficas.</p>

  return (
    <>
      {v.pro && (
        <div className="row between wrap" aria-label="Tipo de gráfica">
          <span className="pro-et">Gráficas de valor y rentabilidad</span>
          <div className="seg" role="group" aria-label="Tipo de gráfica">
            <button aria-pressed={tipoGrafica === 'area'} onClick={() => setTipoGrafica('area')}>Área</button>
            <button aria-pressed={tipoGrafica === 'velas'} onClick={() => setTipoGrafica('velas')}>Velas</button>
          </div>
        </div>
      )}
      {v.pro && v.res && (
        <section className="card" aria-label="Cartera en cifras">
          <table className="pro-historial">
            <thead><tr><th scope="col">Concepto</th><th scope="col" className="r">Valor</th></tr></thead>
            <tbody>
              <tr><td>BTC</td><td className="r num">{fBtc(v.res.btc).replace(' BTC', '')}</td></tr>
              <tr><td>Valor</td><td className="r num">{v.$(v.res.valorHoy)}</td></tr>
              <tr><td>Metido</td><td className="r num">{v.$(v.res.invertido)}</td></tr>
              <tr><td>Precio medio</td><td className="r num">{v.res.btc > 0 ? v.$(v.res.precioMedioReal) : '—'}</td></tr>
              <tr><td>PnL</td><td className={`r num ${v.res.ganancia >= 0 ? 'gain' : 'loss'}`}>{v.res.ganancia >= 0 ? '▲' : '▼'} {v.$s(v.res.ganancia)} ({v.pct(v.res.rentabilidad)})</td></tr>
            </tbody>
          </table>
        </section>
      )}
      {enVelas && (
        <>
          <section className="card stack" aria-label="Valor de la cartera en velas">
            <h2>Valor de la cartera</h2>
            <p className="notice">Cada vela es una semana. Verde ▲ si el valor termina la semana por encima de donde empezó.</p>
            <VelasSerie velas={velasValor} etiqueta="Valor de la cartera en velas semanales" />
          </section>
          <section className="card stack" aria-label="Rentabilidad en velas">
            <h2>Rentabilidad</h2>
            <VelasSerie velas={velasRent} etiqueta="Rentabilidad de la cartera en velas semanales (%)" decimales={1} />
          </section>
        </>
      )}
      {!enVelas && <>
      <section className="card stack" aria-label="Valor de la cartera frente a lo invertido">
        <h2>Cartera frente a lo invertido</h2>
        <p className="notice">El hueco entre las dos áreas es tu ganancia o pérdida.</p>
        <div className="chart-box">
          <ResponsiveContainer>
            <AreaChart data={serie}>
              <CartesianGrid stroke={REJILLA} vertical={false} />
              <XAxis dataKey="fecha" {...EJE} tickFormatter={(f: string) => f.slice(5)} minTickGap={36} />
              <YAxis {...EJE} width={52} tickFormatter={(n: number) => `${Math.round(n)}`} />
              <Tooltip {...tip} formatter={(n) => dinero(Number(n), v.moneda)} />
              <Area type="stepAfter" dataKey="invertido" name="Metido" stroke={COLORES.nivel} fill={COLORES.nivel} fillOpacity={0.16} strokeWidth={2} isAnimationActive={!reducir} animationDuration={900} />
              <Area type="monotone" dataKey="valor" name="Valor" stroke={COLORES.acento} fill={COLORES.acento} fillOpacity={0.18} strokeWidth={2} isAnimationActive={!reducir} animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card stack" aria-label="Rentabilidad en el tiempo">
        <h2>Rentabilidad en el tiempo</h2>
        <div className="chart-box">
          <ResponsiveContainer>
            <LineChart data={rent}>
              <CartesianGrid stroke={REJILLA} vertical={false} />
              <XAxis dataKey="fecha" {...EJE} tickFormatter={(f: string) => f.slice(5)} minTickGap={36} />
              <YAxis {...EJE} width={44} unit=" %" />
              <Tooltip {...tip} formatter={(n) => `${n} %`} />
              <Line type="monotone" dataKey="rent" name="Rentabilidad" stroke={COLORES.gana} dot={false} strokeWidth={2} isAnimationActive={!reducir} animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      </>}

      <section className="card stack" aria-label="Drawdown">
        <h2>Drawdown</h2>
        <p className="notice">Cuánto ha llegado a caer tu cartera desde su máximo. Máxima caída: <span className="num loss">{porcentajeConSigno(maxCaida, 1)}</span></p>
        <div className="chart-box" style={{ height: 200 }}>
          <ResponsiveContainer>
            <AreaChart data={ddSerie}>
              <CartesianGrid stroke={REJILLA} vertical={false} />
              <XAxis dataKey="fecha" {...EJE} tickFormatter={(f: string) => f.slice(5)} minTickGap={36} />
              <YAxis {...EJE} width={44} unit=" %" />
              <Tooltip {...tip} formatter={(n) => `${n} %`} />
              <Area type="monotone" dataKey="caida" name="Caída" stroke={COLORES.pierde} fill={COLORES.pierde} fillOpacity={0.2} strokeWidth={2} isAnimationActive={!reducir} animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {hitos && (
        <section className="card stack" aria-label="Hitos">
          <h2>Hitos</h2>
          <p className="num gain">▲ Mejor día: {fechaCorta(hitos.mejor.fecha)} · +{dinero(Math.abs(hitos.mejor.cambio), v.moneda)}</p>
          <p className="num loss">▼ Peor día: {fechaCorta(hitos.peor.fecha)} · −{dinero(Math.abs(hitos.peor.cambio), v.moneda)}</p>
          <p className="num">Máximo valor: {dinero(hitos.maximo.valor, v.moneda)} · {fechaCorta(hitos.maximo.fecha)}</p>
          <p className="notice">El cambio de cada día descuenta el dinero nuevo que metiste.</p>
        </section>
      )}
    </>
  )
}
