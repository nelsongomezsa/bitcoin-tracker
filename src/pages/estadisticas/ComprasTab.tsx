import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from 'motion/react'
import type { Vista } from '../../state/vista'
import {
  aSats, btcAcumulado, calendarioDca, comparativaPrimerDia, comprasConComisionAlta, filaCompra, histogramaCompras, invertidoPorMes, mejorYPeorCompra,
} from '../../lib/calculos'
import { comisionPorPlataforma } from '../../lib/plataformas'
import { claseSigno, dinero, fechaCorta, flecha, hoyISO, porcentaje, porcentajeConSigno } from '../../lib/format'
import { COLORES, EJE, REJILLA, tip } from './comun'

const num = new Intl.NumberFormat('es-ES')

export default function ComprasTab({ v }: { v: Vista }) {
  const reducir = useReducedMotion()
  const compras = v.ops.filter((o) => o.tipo === 'compra')
  const hist = useMemo(() => histogramaCompras(v.ops, v.precio, 8), [v.ops, v.precio])
  const porMes = useMemo(() => invertidoPorMes(v.ops), [v.ops])
  const acum = useMemo(() => btcAcumulado(v.ops).map((p) => ({ ...p, sats: aSats(p.btc) })), [v.ops])
  const cal = useMemo(() => calendarioDca(v.ops, hoyISO(), 26), [v.ops])
  const filas = compras.map((o) => filaCompra(o, v.precio))
  const { mejor, peor } = mejorYPeorCompra(v.ops, v.precio)
  const comp = comparativaPrimerDia(v.ops, v.precio)
  const altas = comprasConComisionAlta(v.ops, v.precio)
  const porPlat = useMemo(() => comisionPorPlataforma(v.ops), [v.ops])
  const oculto = v.privado
  const maxImp = Math.max(1, ...cal.map((s) => s.importe))
  const sats = v.res ? aSats(v.res.btc) : 0

  return (
    <>
      <section className="card stack" aria-label="Sats">
        <h3>Satoshis acumulados</h3>
        <p className="big" style={{ fontSize: 30 }}>{oculto ? '••••' : num.format(sats)} <span className="muted" style={{ fontSize: 14 }}>sats</span></p>
        <p className="notice">1 BTC = 100.000.000 sats.</p>
      </section>

      {!oculto && (
        <>
          <section className="card stack" aria-label="Mapa de compras">
            <h2>Mapa de compras</h2>
            <p className="notice">A qué precios has comprado (nº de compras por tramo). La línea naranja es el precio actual.</p>
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={hist.bins.map((b) => ({ tramo: Math.round((b.desde + b.hasta) / 2), compras: b.compras }))}>
                  <CartesianGrid stroke={REJILLA} vertical={false} />
                  <XAxis dataKey="tramo" {...EJE} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(n: number) => `${Math.round(n / 1000)}k`} />
                  <YAxis {...EJE} width={28} allowDecimals={false} />
                  <Tooltip {...tip} formatter={(n) => `${n} compra(s)`} labelFormatter={(l) => `≈ ${dinero(Number(l), v.moneda, 0)}`} />
                  <Bar dataKey="compras" fill={COLORES.nivel} radius={[4, 4, 0, 0]} isAnimationActive={!reducir} animationDuration={800} />
                  <ReferenceLine x={Math.round(v.precio)} stroke={COLORES.acento} strokeDasharray="4 3" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="num">El {porcentaje(hist.pctEnGanancias, 0)} de tus compras están en ganancias.</p>
          </section>

          <section className="card stack" aria-label="Invertido por mes">
            <h2>Invertido por mes</h2>
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={porMes}>
                  <CartesianGrid stroke={REJILLA} vertical={false} />
                  <XAxis dataKey="mes" {...EJE} />
                  <YAxis {...EJE} width={52} />
                  <Tooltip {...tip} formatter={(n) => dinero(Number(n), v.moneda)} />
                  <Bar dataKey="importe" name="Metido" fill={COLORES.acento} radius={[4, 4, 0, 0]} isAnimationActive={!reducir} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card stack" aria-label="BTC acumulado">
            <h2>BTC acumulado</h2>
            <div className="chart-box" style={{ height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={acum}>
                  <CartesianGrid stroke={REJILLA} vertical={false} />
                  <XAxis dataKey="fecha" {...EJE} tickFormatter={(f: string) => f.slice(5)} minTickGap={30} />
                  <YAxis {...EJE} width={64} tickFormatter={(n: number) => n.toFixed(3)} />
                  <Tooltip {...tip} formatter={(n) => `${Number(n).toFixed(8)} BTC`} />
                  <Line type="stepAfter" dataKey="btc" name="BTC" stroke={COLORES.acento} dot={false} strokeWidth={2} isAnimationActive={!reducir} animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card stack" aria-label="Rentabilidad de cada compra">
            <h2>Rentabilidad de cada compra</h2>
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={filas.map((f) => ({ fecha: fechaCorta(f.fecha).slice(0, 5), rent: Number((f.rentabilidad * 100).toFixed(1)) }))}>
                  <CartesianGrid stroke={REJILLA} vertical={false} />
                  <XAxis dataKey="fecha" {...EJE} />
                  <YAxis {...EJE} width={44} unit=" %" />
                  <Tooltip {...tip} formatter={(n) => `${n} %`} />
                  <Bar dataKey="rent" name="Rentabilidad" isAnimationActive={!reducir} animationDuration={800}>
                    {filas.map((f) => <Cell key={f.id} fill={f.rentabilidad >= 0 ? COLORES.gana : COLORES.pierde} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      <section className="card stack" aria-label="Calendario de DCA">
        <h2>Calendario de DCA</h2>
        <p className="notice">Cada casilla es una semana (las últimas 26). Más naranja, más metido esa semana; las vacías son semanas sin compra.</p>
        <div role="img" aria-label="Calendario de semanas con compra" style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 4 }}>
          {cal.map((s) => (
            <div key={s.semana} title={`Semana del ${fechaCorta(s.semana)}: ${s.compras} compra(s)`}
              style={{ aspectRatio: '1', borderRadius: 4, background: s.compras ? `rgba(247,147,26,${0.25 + 0.75 * (s.importe / maxImp)})` : 'rgba(255,255,255,0.05)', border: s.compras ? 'none' : '1px solid rgba(255,255,255,0.06)' }} />
          ))}
        </div>
        <p className="num">{cal.filter((s) => s.compras).length} de {cal.length} semanas con compra.</p>
      </section>

      <section className="card stack" aria-label="Comisiones">
        <h2>Comisiones</h2>
        {v.res && <p className="num">{v.$(v.res.comisiones)} pagadas · {oculto ? '••••' : porcentaje(v.res.pctComisiones)} de lo metido</p>}
        {porPlat.length > 0 && (
          <>
            <h3>Comisión media por plataforma</h3>
            <table>
              <thead><tr><th>Plataforma</th><th>Compras</th><th>Comisión</th><th>Media</th></tr></thead>
              <tbody>{porPlat.map((p, i) => (
                <tr key={p.plataforma}><td>{p.plataforma}</td><td className="num">{p.compras}</td><td className="num">{v.$(p.comision)}</td>
                  <td className={`num ${i === 0 && porPlat.length > 1 ? 'gain' : ''}`}>{oculto ? '••••' : porcentaje(p.pct)}</td></tr>
              ))}</tbody>
            </table>
            <p className="notice">Sirve para ver dónde te sale más barato comprar. La más barata aparece arriba.</p>
          </>
        )}
        {altas.length > 0 ? (
          <>
            <h3>Compras con más del 3 % de comisión</h3>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {altas.map((f) => <li key={f.id} className="num warn">{fechaCorta(f.fecha)} · {v.$(f.cantidad)} · {oculto ? '••••' : porcentaje(f.pctComision)}</li>)}
            </ul>
            <p className="notice">Las compras pequeñas pagan proporcionalmente más comisión: juntar varias en una sola suele salir más barato.</p>
          </>
        ) : <p className="gain">▲ Ninguna compra supera el 3 % de comisión.</p>}
      </section>

      <section className="card stack" aria-label="Mejor y peor compra">
        <h2>Mejor y peor compra</h2>
        {([['Mejor', mejor], ['Peor', peor]] as const).map(([l, f]) => f && (
          <p key={l} className={`num ${claseSigno(f.rentabilidad)}`}>
            {l}: {fechaCorta(f.fecha)} · {oculto ? '••••' : `${flecha(f.rentabilidad)} ${porcentajeConSigno(f.rentabilidad, 1)}`}
          </p>
        ))}
      </section>

      {comp && (
        <section className="card stack" aria-label="Si lo hubieras metido todo el primer día">
          <h2>Si lo hubieras metido todo el primer día</h2>
          <p className="muted">Con lo mismo que has metido en total ({v.$(comp.metido)}), comprado en tu primera compra:</p>
          <p className="num">Valdría {v.$(comp.valorPrimerDia)} ({v.$s(comp.gananciaPrimerDia)})</p>
          <p className="num">Tu cartera real vale {v.$(comp.valorReal)} ({v.$s(comp.gananciaReal)})</p>
          <p className="notice">Es una comparación con datos pasados, no una recomendación.</p>
        </section>
      )}
    </>
  )
}
