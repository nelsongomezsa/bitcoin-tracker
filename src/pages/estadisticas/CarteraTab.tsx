import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from 'motion/react'
import type { Vista } from '../../state/vista'
import { drawdown, hitosCartera, serieCartera, serieRentabilidad } from '../../lib/calculos'
import { dinero, fechaCorta, porcentajeConSigno } from '../../lib/format'
import { COLORES, EJE, REJILLA, tip } from './comun'

function muestrear<T>(a: T[], max = 120): T[] {
  const paso = Math.max(1, Math.floor(a.length / max))
  return a.filter((_, i) => i % paso === 0 || i === a.length - 1)
}

export default function CarteraTab({ v }: { v: Vista }) {
  const reducir = useReducedMotion()
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

  if (v.privado) return <p className="card notice">Modo privado activo: las gráficas con importes están ocultas.</p>
  if (completa.length < 2) return <p className="card muted">Hace falta histórico de precios y alguna compra para estas gráficas.</p>

  return (
    <>
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
