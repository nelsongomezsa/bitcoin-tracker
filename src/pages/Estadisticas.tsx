import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useVista } from '../state/vista'
import { comparativaPrimerDia, filaCompra, invertidoPorMes, mejorYPeorCompra, serieCartera } from '../lib/calculos'
import { claseSigno, dinero, fechaCorta, flecha, porcentaje, porcentajeConSigno } from '../lib/format'

const EJE = { stroke: '#8A94A6', fontSize: 11 }
const tip = { contentStyle: { background: '#141922', border: '1px solid #1E2530', borderRadius: 8 }, labelStyle: { color: '#8A94A6' } }

export default function Estadisticas() {
  const v = useVista()
  const factor = v.precios ? v.precios[v.moneda] / v.precios.EUR : 1
  const serie = useMemo(() => {
    const h = v.historico.map((p) => ({ ...p, precio: p.precio * factor }))
    const s = serieCartera(v.ops, h)
    const paso = Math.max(1, Math.floor(s.length / 120))
    return s.filter((_, i) => i % paso === 0 || i === s.length - 1)
  }, [v.historico, v.ops, factor])
  const porMes = useMemo(() => invertidoPorMes(v.ops), [v.ops])
  const compras = v.ops.filter((o) => o.tipo === 'compra')
  const filas = compras.map((o) => filaCompra(o, v.precio))
  const { mejor, peor } = mejorYPeorCompra(v.ops, v.precio)
  const comp = comparativaPrimerDia(v.ops, v.precio)
  const oculto = v.privado

  if (v.cargando) return <main className="app"><p className="muted" role="status">Cargando…</p></main>
  if (!compras.length) return <main className="app stack"><h1>Estadísticas</h1><p className="card muted">Apunta tu primera compra para ver estadísticas.</p></main>

  return (
    <main className="app stack">
      <h1>Estadísticas</h1>
      {oculto && <p className="notice">Modo privado activo: las gráficas con importes están ocultas.</p>}

      {!oculto && (
        <>
          <section className="card stack" aria-label="Valor de la cartera">
            <h2>Cartera frente a lo metido</h2>
            {serie.length < 2 ? <p className="muted">Hace falta histórico de precios para esta gráfica.</p> : (
              <div className="chart-box">
                <ResponsiveContainer>
                  <LineChart data={serie}>
                    <CartesianGrid stroke="#1E2530" />
                    <XAxis dataKey="fecha" {...EJE} tickFormatter={(f: string) => f.slice(5)} minTickGap={30} />
                    <YAxis {...EJE} width={56} tickFormatter={(n: number) => `${Math.round(n)}`} />
                    <Tooltip {...tip} formatter={(n) => dinero(Number(n), v.moneda)} />
                    <Legend />
                    <Line type="monotone" dataKey="valor" name="Valor" stroke="#F7931A" dot={false} strokeWidth={2} />
                    <Line type="stepAfter" dataKey="invertido" name="Metido" stroke="#60A5FA" dot={false} strokeWidth={2} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="card stack" aria-label="Invertido por mes">
            <h2>Invertido por mes</h2>
            <div className="chart-box">
              <ResponsiveContainer>
                <BarChart data={porMes}>
                  <CartesianGrid stroke="#1E2530" vertical={false} />
                  <XAxis dataKey="mes" {...EJE} />
                  <YAxis {...EJE} width={56} />
                  <Tooltip {...tip} formatter={(n) => dinero(Number(n), v.moneda)} />
                  <Bar dataKey="importe" name="Metido" fill="#F7931A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card stack" aria-label="Rentabilidad por compra">
            <h2>Rentabilidad de cada compra</h2>
            <div className="chart-box">
              <ResponsiveContainer>
                <BarChart data={filas.map((f) => ({ fecha: fechaCorta(f.fecha).slice(0, 5), rent: Number((f.rentabilidad * 100).toFixed(1)) }))}>
                  <CartesianGrid stroke="#1E2530" vertical={false} />
                  <XAxis dataKey="fecha" {...EJE} />
                  <YAxis {...EJE} width={44} unit=" %" />
                  <Tooltip {...tip} formatter={(n) => `${n} %`} />
                  <Bar dataKey="rent" name="Rentabilidad">
                    {filas.map((f) => <Cell key={f.id} fill={f.rentabilidad >= 0 ? '#34D399' : '#FF7A7A'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      <section className="card stack" aria-label="Comisiones">
        <h2>Comisiones pagadas</h2>
        {v.res && <p className="num">{v.$(v.res.comisiones)} · {oculto ? '••••' : porcentaje(v.res.pctComisiones)} de lo metido</p>}
      </section>

      <section className="card stack" aria-label="Mejor y peor compra">
        <h2>Mejor y peor compra</h2>
        {[['Mejor', mejor], ['Peor', peor]].map(([l, f]) => f && typeof f !== 'string' && (
          <p key={l as string} className={`num ${claseSigno(f.rentabilidad)}`}>
            {l as string}: {fechaCorta(f.fecha)} · {oculto ? '••••' : `${flecha(f.rentabilidad)} ${porcentajeConSigno(f.rentabilidad, 1)}`}
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
    </main>
  )
}
