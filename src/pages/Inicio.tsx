import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useVista } from '../state/vista'
import PrecioChart from '../components/PrecioChart'
import OperacionSheet from '../components/OperacionSheet'
import { MONEDAS } from '../lib/schemas'
import { claseSigno, dinero, fechaCorta, flecha, porcentaje, porcentajeConSigno, horaCorta } from '../lib/format'
import { convertir, estadoNiveles, filaCompra, ordenarPorFecha, proximoNivel, type Operacion } from '../lib/calculos'

export default function Inicio() {
  const v = useVista()
  const [hoja, setHoja] = useState<null | { tipo: 'compra' | 'venta'; op?: Operacion }>(null)
  if (v.cargando) return <main className="app"><p className="muted" role="status">Cargando…</p></main>

  const { res, precio, precios, moneda } = v
  const ultimas = ordenarPorFecha(v.ops.filter((o) => o.tipo === 'compra')).slice(-5).reverse()
  const factor = precios ? precios[moneda] / precios.EUR : 1
  const nivel = res ? proximoNivel(v.plan, v.operaciones, v.precios?.EUR ?? 0) : null
  const nivelEnMoneda = nivel ? nivel.precio * factor : undefined
  const ath = v.mercado?.maximoHistorico[moneda]
  const fg = v.mercado?.miedoCodicia
  const comisionAlta = res && res.pctComisiones > 0.03
  const otras = MONEDAS.filter((m) => m !== moneda)
  const sinOps = v.operaciones.length === 0
  const hayNiveles = estadoNiveles(v.plan, v.operaciones).length > 0

  return (
    <main className="app stack">
      <header className="row between wrap">
        <h1>Inicio</h1>
        <div className="row">
          <div className="seg" role="group" aria-label="Moneda">
            {MONEDAS.map((m) => <button key={m} aria-pressed={moneda === m} onClick={() => v.setMoneda(m)}>{m}</button>)}
          </div>
          <button aria-label={v.privado ? 'Mostrar cifras' : 'Ocultar cifras'} aria-pressed={v.privado} onClick={() => void v.togglePrivado()}>{v.privado ? '🙈' : '👁'}</button>
        </div>
      </header>

      {v.errorFifo && <p className="card err" role="alert">Tus operaciones no cuadran: hay ventas con más BTC del que había. Revisa la lista.</p>}

      <section className="card stack" aria-label="Saldo">
        <h3>Valor actual</h3>
        <div className="big">{res ? v.$(res.valorHoy) : '—'}</div>
        <div className="muted num">
          {otras.map((m, i) => (
            <span key={m}>{i > 0 && ' · '}{v.privado ? '••••' : dinero(convertir(res?.valorHoy ?? 0, moneda, m, precios ?? { EUR: 1, USD: 1, AUD: 1 }), m, 0)}</span>
          ))}
        </div>
        {res && (
          <div className={`mid ${claseSigno(res.ganancia)}`}>
            {flecha(res.ganancia)} {v.$s(res.ganancia)} <span className="num" style={{ fontSize: 15 }}>({v.pct(res.rentabilidad)})</span>
          </div>
        )}
        <div className="grid2">
          <div className="stat"><span className="muted">Metido</span><span className="num">{res ? v.$(res.invertido) : '—'}</span></div>
          <div className="stat"><span className="muted">Precio de BTC</span><span className="num">{precio ? dinero(precio, moneda, 0) : '—'}</span></div>
        </div>
        {v.mercado?.actualizado && <p className="notice">Precio actualizado {horaCorta(v.mercado.actualizado)}</p>}
      </section>

      <div className="row">
        <button className="btn-primary btn-big" onClick={() => setHoja({ tipo: 'compra' })}>Añadir compra</button>
        <button className="btn-outline btn-big" onClick={() => setHoja({ tipo: 'venta' })}>Retirar / vender</button>
      </div>

      {sinOps && <p className="card muted">Todavía no has apuntado ninguna operación. Empieza con «Añadir compra».</p>}

      <PrecioChart historico={v.historico} factor={factor} ops={v.ops} precioMedio={res?.precioMedioReal ?? 0} proximoNivel={nivelEnMoneda} />

      <section className="card stack" aria-label="Últimas compras">
        <div className="row between"><h2>Últimas compras</h2><Link to="/operaciones">Ver todas</Link></div>
        {ultimas.length === 0 ? <p className="muted">Sin compras.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Fecha</th><th>Metido</th><th>Vale hoy</th><th>Rentab.</th><th><span className="sr">Editar</span></th></tr></thead>
              <tbody>
                {ultimas.map((o) => {
                  const f = filaCompra(o, precio)
                  return (
                    <tr key={o.id}>
                      <td className="num">{fechaCorta(o.fecha)}</td>
                      <td className="num">{v.$(f.cantidad)}</td>
                      <td className="num">{v.$(f.valorHoy)}</td>
                      <td className={`num ${claseSigno(f.rentabilidad)}`}>{v.privado ? '••••' : `${flecha(f.rentabilidad)} ${porcentajeConSigno(f.rentabilidad, 1)}`}</td>
                      <td><button className="btn-ghost" aria-label={`Editar compra del ${fechaCorta(o.fecha)}`} onClick={() => setHoja({ tipo: 'compra', op: v.operaciones.find((x) => x.id === o.id) })}>✎</button></td>
                    </tr>
                  )
                })}
                {res && (
                  <tr>
                    <td><b>Total</b></td>
                    <td className="num"><b>{v.$(res.invertido)}</b></td>
                    <td className="num"><b>{v.$(res.valorHoy)}</b></td>
                    <td className={`num ${claseSigno(res.rentabilidad)}`}><b>{v.privado ? '••••' : `${flecha(res.rentabilidad)} ${porcentajeConSigno(res.rentabilidad, 1)}`}</b></td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack" aria-label="Hoy en el mercado">
        <h2>Hoy en el mercado</h2>
        {res && res.btc > 0 && (
          <p>Rentable desde <b className="num warn">{v.$(res.precioMedioReal)}</b>
            {res.subidaParaRentable > 0 ? <> · falta una subida del <span className="num">{v.privado ? '••••' : porcentaje(res.subidaParaRentable)}</span></> : <> · <span className="gain">▲ ya por encima</span></>}
          </p>
        )}
        {nivel && <p>Próximo nivel clave: <b className="num key">{dinero(nivel.precio * factor, moneda, 0)}</b> · tendría que bajar un <span className="num">{porcentaje(nivel.bajadaNecesaria)}</span></p>}
        {!hayNiveles && <p className="muted">Aún no has definido niveles clave en el plan.</p>}
        {ath ? <p>Máximo histórico: <span className="num">{dinero(ath, moneda, 0)}</span> · el precio está un <span className="num">{porcentaje(1 - precio / ath)}</span> por debajo</p> : null}
        {fg && <p>Miedo y codicia: <span className="num">{fg.valor}</span> ({fg.clasificacion})</p>}
        {comisionAlta && res && <p className="warn">Has pagado el {porcentaje(res.pctComisiones)} de lo metido en comisiones.</p>}
        <p className="notice">Información de mercado, no una recomendación de inversión.</p>
      </section>

      <Link className="btn" to="/calculadoras">Calculadoras</Link>
      <Link className="btn" to="/plan">Plan y objetivos</Link>

      {hoja && <OperacionSheet tipo={hoja.tipo} inicial={hoja.op} onCerrar={() => setHoja(null)} />}
    </main>
  )
}
